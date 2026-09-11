"""Correction automatique, résultats, réajustement, validation et export."""

from __future__ import annotations

import csv
import io

from fastapi import APIRouter, HTTPException, Query, status
from fastapi.responses import StreamingResponse
from sqlalchemy import func, select

from ..audit import log
from ..deps import DbSession, TeacherUser
from ..models import (
    Appreciation,
    CorrectionResult,
    CorrectionRun,
    EvaluationStatus,
    Exercise,
    Participation,
    ScoreAdjustment,
    Submission,
    User,
    utcnow,
)
from ..schemas import (
    AdjustPayload,
    AppreciationPayload,
    ExerciseResultOut,
    ParticipantResultOut,
    ResultsOut,
    ScoreLineOut,
    RunOut,
    SubmissionDetailOut,
)
from ..exports import build_results_workbook, slugify
from ..grading import matching
from ..services import (
    get_evaluation,
    launch_correction,
    latest_run,
    notify,
    participant_scores,
    participation_breakdown,
)

router = APIRouter(prefix="/api/evaluations/{evaluation_id}", tags=["correction"])


def _run_out(db, run: CorrectionRun | None) -> RunOut | None:
    if run is None:
        return None
    author = db.get(User, run.triggered_by)
    return RunOut(
        **RunOut.model_validate(run).model_dump(exclude={"triggered_by_name"}),
        triggered_by_name=author.full_name if author else None,
    )


@router.post("/corrections", response_model=RunOut, status_code=status.HTTP_202_ACCEPTED)
def launch(evaluation_id: int, user: TeacherUser, db: DbSession) -> RunOut:
    evaluation = get_evaluation(db, evaluation_id, user)
    run = launch_correction(db, evaluation, user)
    return _run_out(db, run)


@router.get("/corrections", response_model=list[RunOut])
def list_runs(evaluation_id: int, user: TeacherUser, db: DbSession) -> list[RunOut]:
    get_evaluation(db, evaluation_id, user)
    runs = db.scalars(
        select(CorrectionRun)
        .where(CorrectionRun.evaluation_id == evaluation_id)
        .order_by(CorrectionRun.number.desc())
    )
    return [_run_out(db, r) for r in runs]


def _score_lines(exercises: list[Exercise], breakdown: dict) -> list[ScoreLineOut]:
    """Le relevé d'une copie, exercice par exercice, dans l'ordre du sujet.

    Un exercice que la correction n'a pas atteint garde sa place et son barème :
    la ligne existe, la note manque — c'est ce que dit une copie non corrigée.
    """
    lines = []
    for rank, exercise in enumerate(exercises, start=1):
        entry = (breakdown.get("exercises") or {}).get(exercise.id)
        lines.append(
            ScoreLineOut(
                label=f"Exercice {rank}",
                title=exercise.title,
                score=entry["final"] if entry else None,
                max_score=round(entry["max"] if entry else (exercise.points or 0), 2),
            )
        )
    return lines


def _collect_results(db, evaluation_id: int, run: CorrectionRun | None) -> list[ParticipantResultOut]:
    if run is None:
        return []
    breakdowns = participation_breakdown(db, run.id)
    scores = participant_scores(db, run.id)
    exercises = list(
        db.scalars(
            select(Exercise)
            .where(Exercise.evaluation_id == evaluation_id)
            .order_by(Exercise.position)
        )
    )
    tests = dict(
        db.execute(
            select(CorrectionResult.participation_id, func.count(CorrectionResult.id))
            .where(CorrectionResult.run_id == run.id)
            .group_by(CorrectionResult.participation_id)
        ).all()
    )
    rows = db.execute(
        select(Participation, User)
        .join(User, User.id == Participation.student_id)
        .where(Participation.evaluation_id == evaluation_id)
        .order_by(User.full_name)
    ).all()
    results = []
    for participation, student in rows:
        entry = scores.get(participation.id)
        if entry is None:
            continue
        passed = total = 0
        for result in db.scalars(
            select(CorrectionResult).where(
                CorrectionResult.run_id == run.id,
                CorrectionResult.participation_id == participation.id,
            )
        ):
            official = [t for t in result.tests if t.get("kind") == "official"]
            total += len(official)
            passed += sum(1 for t in official if t.get("passed"))
        spent = None
        if participation.started_at:
            end = participation.submitted_at or participation.frozen_at or utcnow()
            spent = max(0, int((end - participation.started_at).total_seconds()))
        ratio = entry["final"] / entry["max"] if entry["max"] else 0
        results.append(
            ParticipantResultOut(
                participation_id=participation.id,
                student_id=student.id,
                full_name=student.full_name,
                matricule=student.matricule,
                auto_score=entry["auto"],
                final_score=entry["final"],
                max_score=entry["max"],
                adjusted=entry["adjusted"],
                tests_passed=passed,
                tests_total=total or tests.get(participation.id, 0),
                time_spent_seconds=spent,
                status="Réussi" if ratio >= 0.5 else "Échoué",
                lines=_score_lines(exercises, breakdowns.get(participation.id, {})),
            )
        )
    return results


@router.get("/results", response_model=ResultsOut)
def results(
    evaluation_id: int,
    user: TeacherUser,
    db: DbSession,
    run_id: int | None = Query(default=None),
) -> ResultsOut:
    evaluation = get_evaluation(db, evaluation_id, user)
    runs = list(
        db.scalars(
            select(CorrectionRun)
            .where(CorrectionRun.evaluation_id == evaluation_id)
            .order_by(CorrectionRun.number.desc())
        )
    )
    run = next((r for r in runs if r.id == run_id), None) if run_id else (runs[0] if runs else None)
    if run_id and run is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Campagne introuvable")
    participants = _collect_results(db, evaluation_id, run)
    scored = [p for p in participants if p.max_score]
    average = (
        round(sum(p.final_score for p in scored) / len(scored), 2) if scored else None
    )
    success = (
        round(sum(1 for p in scored if p.status == "Réussi") / len(scored) * 100, 1)
        if scored
        else None
    )
    best = max((p.final_score for p in scored), default=None)
    return ResultsOut(
        run=_run_out(db, run),
        runs=[_run_out(db, r) for r in runs],
        participants=participants,
        average=average,
        success_rate=success,
        best_score=best,
        total_points=scored[0].max_score if scored else evaluation.total_points,
    )


def appreciations_for(db, participation_id: int) -> dict[int | None, str]:
    """Appréciations d'une copie, indexées par exercice (clé None : générale)."""
    return {
        a.exercise_id: a.text
        for a in db.scalars(
            select(Appreciation).where(Appreciation.participation_id == participation_id)
        )
    }


@router.get("/results/{participation_id}", response_model=SubmissionDetailOut)
def submission_detail(
    evaluation_id: int,
    participation_id: int,
    user: TeacherUser,
    db: DbSession,
    run_id: int | None = None,
) -> SubmissionDetailOut:
    get_evaluation(db, evaluation_id, user)
    run = (
        db.get(CorrectionRun, run_id)
        if run_id
        else latest_run(db, evaluation_id)
    )
    if run is None or run.evaluation_id != evaluation_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Aucune campagne de correction")
    participation = db.get(Participation, participation_id)
    if participation is None or participation.evaluation_id != evaluation_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Participation introuvable")
    student = db.get(User, participation.student_id)
    exercise_rows = {
        e.id: e
        for e in db.scalars(select(Exercise).where(Exercise.evaluation_id == evaluation_id))
    }
    comments = appreciations_for(db, participation_id)
    submissions = {
        s.exercise_id: s.code
        for s in db.scalars(
            select(Submission).where(Submission.participation_id == participation_id)
        )
    }
    breakdown = participation_breakdown(db, run.id).get(
        participation_id, {"final": 0.0, "max": 0.0, "exercises": {}}
    )
    par_exercice = breakdown.get("exercises", {})
    exercises = [
        ExerciseResultOut(
            exercise_id=r.exercise_id,
            exercise_title=getattr(exercise_rows.get(r.exercise_id), "title", ""),
            kind=getattr(exercise_rows.get(r.exercise_id), "kind", "code"),
            statement=getattr(exercise_rows.get(r.exercise_id), "statement", ""),
            settings=getattr(exercise_rows.get(r.exercise_id), "settings", None) or {},
            language=getattr(exercise_rows.get(r.exercise_id), "language", "") or "",
            starter_code=getattr(exercise_rows.get(r.exercise_id), "starter_code", "") or "",
            points=getattr(exercise_rows.get(r.exercise_id), "points", 0) or 0,
            matches=(
                matching.readable_matches(
                    exercise_rows[r.exercise_id],
                    submissions.get(r.exercise_id, ""),
                    published=True,
                )
                if r.exercise_id in exercise_rows
                else []
            ),
            status=r.status,
            auto_score=r.auto_score,
            final_score=par_exercice.get(r.exercise_id, {}).get("final", r.auto_score),
            adjusted=par_exercice.get(r.exercise_id, {}).get("adjusted", False),
            max_score=r.max_score,
            compile_log=r.compile_log,
            code=submissions.get(r.exercise_id, ""),
            tests=r.tests,
            appreciation=comments.get(r.exercise_id, ""),
        )
        for r in db.scalars(
            select(CorrectionResult)
            .where(
                CorrectionResult.run_id == run.id,
                CorrectionResult.participation_id == participation_id,
            )
            .order_by(CorrectionResult.exercise_id)
        )
    ]
    scores = breakdown
    adjustments = [
        {
            "id": a.id,
            "exercise_id": a.exercise_id,
            "exercise_title": getattr(exercise_rows.get(a.exercise_id), "title", None),
            "previous_score": a.previous_score,
            "new_score": a.new_score,
            "reason": a.reason,
            "created_at": a.created_at.isoformat(),
            "teacher": (db.get(User, a.teacher_id).full_name if db.get(User, a.teacher_id) else ""),
        }
        for a in db.scalars(
            select(ScoreAdjustment)
            .where(
                ScoreAdjustment.run_id == run.id,
                ScoreAdjustment.participation_id == participation_id,
            )
            .order_by(ScoreAdjustment.created_at.desc())
        )
    ]
    return SubmissionDetailOut(
        participation_id=participation_id,
        full_name=student.full_name if student else "",
        matricule=student.matricule if student else None,
        final_score=scores["final"],
        max_score=scores["max"],
        exercises=exercises,
        adjustments=adjustments,
        appreciation=comments.get(None, ""),
    )


@router.post("/results/{participation_id}/adjust", response_model=SubmissionDetailOut)
def adjust_score(
    evaluation_id: int,
    participation_id: int,
    payload: AdjustPayload,
    user: TeacherUser,
    db: DbSession,
) -> SubmissionDetailOut:
    """Réajustement manuel : la production originale n'est jamais modifiée (CDC VI)."""
    evaluation = get_evaluation(db, evaluation_id, user)
    if evaluation.status is EvaluationStatus.VALIDATED:
        raise HTTPException(status.HTTP_409_CONFLICT, "Résultats déjà validés")
    run = latest_run(db, evaluation_id)
    if run is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Aucune campagne de correction")
    current = participation_breakdown(db, run.id).get(participation_id)
    if current is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Aucun résultat pour cet apprenant")
    # Un ajustement d'exercice se mesure au barème de cet exercice, pas à celui
    # de la copie : sans quoi on pourrait poser 18 sur un exercice qui vaut 5.
    cible = current
    if payload.exercise_id is not None:
        cible = current["exercises"].get(payload.exercise_id)
        if cible is None:
            raise HTTPException(
                status.HTTP_404_NOT_FOUND, "Aucun résultat pour cet exercice"
            )
    if payload.new_score > cible["max"]:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Note supérieure au barème")
    db.add(
        ScoreAdjustment(
            run_id=run.id,
            participation_id=participation_id,
            exercise_id=payload.exercise_id,
            teacher_id=user.id,
            previous_score=cible["final"],
            new_score=payload.new_score,
            reason=payload.reason,
        )
    )
    log(db, user, user.organization_id, "score.adjusted", "participation", participation_id,
        previous=cible["final"], new=payload.new_score, run=run.number,
        exercise_id=payload.exercise_id)
    db.commit()
    return submission_detail(evaluation_id, participation_id, user, db, run.id)


@router.post("/results/{participation_id}/appreciation", response_model=SubmissionDetailOut)
def write_appreciation(
    evaluation_id: int,
    participation_id: int,
    payload: AppreciationPayload,
    user: TeacherUser,
    db: DbSession,
) -> SubmissionDetailOut:
    """Appréciation générale ou par exercice, visible par l'apprenant à la publication."""
    get_evaluation(db, evaluation_id, user)
    participation = db.get(Participation, participation_id)
    if participation is None or participation.evaluation_id != evaluation_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Participation introuvable")
    # La réponse est le détail de la copie : sans campagne de correction, on refuse
    # avant d'écrire plutôt que d'enregistrer puis d'échouer à répondre.
    if latest_run(db, evaluation_id) is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Aucune campagne de correction")
    if payload.exercise_id is not None:
        exercise = db.get(Exercise, payload.exercise_id)
        if exercise is None or exercise.evaluation_id != evaluation_id:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Exercice introuvable")

    existing = db.scalar(
        select(Appreciation).where(
            Appreciation.participation_id == participation_id,
            Appreciation.exercise_id.is_(None)
            if payload.exercise_id is None
            else Appreciation.exercise_id == payload.exercise_id,
        )
    )
    text = payload.text.strip()
    if existing is None:
        if text:
            db.add(
                Appreciation(
                    participation_id=participation_id,
                    exercise_id=payload.exercise_id,
                    teacher_id=user.id,
                    text=text,
                )
            )
    elif text:
        existing.text = text
        existing.teacher_id = user.id
        existing.updated_at = utcnow()
    else:
        db.delete(existing)

    log(db, user, user.organization_id, "appreciation.written", "participation", participation_id,
        exercise_id=payload.exercise_id)
    db.commit()
    return submission_detail(evaluation_id, participation_id, user, db, None)


@router.post("/validate", response_model=RunOut)
def validate_results(evaluation_id: int, user: TeacherUser, db: DbSession) -> RunOut:
    evaluation = get_evaluation(db, evaluation_id, user)
    run = latest_run(db, evaluation_id)
    if run is None or run.status.value in {"pending", "running"}:
        raise HTTPException(status.HTTP_409_CONFLICT, "Correction non terminée")
    evaluation.status = EvaluationStatus.VALIDATED
    evaluation.validated_at = utcnow()
    log(db, user, user.organization_id, "results.validated", "evaluation", evaluation_id,
        run=run.number)
    # Publication : chaque apprenant est prévenu que sa copie annotée est consultable.
    for student_id in db.scalars(
        select(Participation.student_id).where(Participation.evaluation_id == evaluation_id)
    ):
        notify(
            db, student_id,
            f"Résultats publiés — {evaluation.title}",
            "Votre copie corrigée, votre note et les appréciations sont consultables.",
            f"/mes-resultats/{evaluation_id}",
        )
    db.commit()
    return _run_out(db, run)


@router.get("/export.xlsx")
def export_xlsx(
    evaluation_id: int, user: TeacherUser, db: DbSession, run_id: int | None = None
) -> StreamingResponse:
    """Classeur complet : synthèse, notes par exercice, détail des tests,
    ajustements et incidents. Inclut les inscrits sans production."""
    evaluation = get_evaluation(db, evaluation_id, user)
    run = db.get(CorrectionRun, run_id) if run_id else latest_run(db, evaluation_id)
    if run is not None and run.evaluation_id != evaluation_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Campagne introuvable")
    stream = build_results_workbook(db, evaluation, run)
    log(db, user, user.organization_id, "results.exported", "evaluation", evaluation_id,
        format="xlsx", run=run.number if run else None)
    db.commit()
    suffix = f"-campagne-{run.number}" if run else ""
    filename = f"resultats-{slugify(evaluation.title)}{suffix}.xlsx"
    return StreamingResponse(
        stream,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/export.csv")
def export_csv(evaluation_id: int, user: TeacherUser, db: DbSession) -> StreamingResponse:
    evaluation = get_evaluation(db, evaluation_id, user)
    run = latest_run(db, evaluation_id)
    participants = _collect_results(db, evaluation_id, run)
    buffer = io.StringIO()
    writer = csv.writer(buffer, delimiter=";")
    writer.writerow(
        ["Étudiant", "Matricule", "Note", "Barème", "Tests réussis", "Tests", "Statut", "Ajustée"]
    )
    for p in participants:
        writer.writerow(
            [
                p.full_name,
                p.matricule or "",
                f"{p.final_score:.2f}".replace(".", ","),
                f"{p.max_score:.2f}".replace(".", ","),
                p.tests_passed,
                p.tests_total,
                p.status,
                "oui" if p.adjusted else "non",
            ]
        )
    log(db, user, user.organization_id, "results.exported", "evaluation", evaluation_id)
    db.commit()
    buffer.seek(0)
    filename = f"resultats-{evaluation.id}.csv"
    return StreamingResponse(
        iter([buffer.getvalue()]),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
