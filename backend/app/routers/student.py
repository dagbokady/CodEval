"""Parcours apprenant : accès à l'épreuve, sauvegarde automatique, soumission."""

from __future__ import annotations

import json

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError

from ..audit import log
from ..deps import DbSession, StudentUser
from ..models import (
    Appreciation,
    Classroom,
    CorrectionResult,
    CorrectionRun,
    Evaluation,
    EvaluationStatus,
    Exercise,
    Participation,
    RunStatus,
    Subject,
    Submission,
    TestKind,
    utcnow,
)
from ..schemas import (
    AutosavePayload,
    IncidentPayload,
    OfflineIncidentBatch,
    ExercisePublicOut,
    StudentCopyExercise,
    StudentCopyOut,
    StudentEvaluationOut,
    StudentExamOut,
    StudentResultOut,
    ScoreLineOut,
)
from ..config import settings
from ..grading import matching
from ..grading.questions import questions_of
from ..grading.languages import default_starter
from ..services import (
    close_if_expired,
    notify,
    participant_scores,
    participation_breakdown,
    seconds_left,
    start_if_due,
)

router = APIRouter(prefix="/api/me", tags=["apprenant"])


def _joined_part_starters(exercise: Exercise) -> str:
    """Concatène le code de départ de chaque sous-question, en séparant par un
    en-tête « // 1) énoncé » pour que l'apprenant s'y retrouve. Retourne une
    chaîne vide si aucune sous-question ne fournit de starter."""
    parts = (exercise.settings or {}).get("parts") or []
    if not isinstance(parts, list):
        return ""
    prefix = "#" if exercise.language == "python" else "//"
    chunks: list[str] = []
    any_filled = False
    for part in parts:
        starter = (part.get("starter_code") or "").strip()
        if starter:
            any_filled = True
        label = str(part.get("label") or "").strip()
        statement = str(part.get("statement") or "").strip()
        header = f"{prefix} {label}) {statement}".rstrip()
        body = starter or f"{prefix} (à compléter)"
        chunks.append(f"{header}\n{body}")
    return "\n\n".join(chunks) if any_filled else ""

# Le corrigé rédigé par l'enseignant, rangé dans `Exercise.settings`.
_SOLUTION_KEYS = ("solution", "solution_notes")

_VISIBLE = (
    EvaluationStatus.SCHEDULED,
    EvaluationStatus.RUNNING,
    EvaluationStatus.CLOSED,
    EvaluationStatus.CORRECTING,
    EvaluationStatus.CORRECTED,
    EvaluationStatus.VALIDATED,
)


def _announced(evaluation: Evaluation) -> bool:
    """L'épreuve programmée est-elle annoncée à la classe avant son ouverture ?"""
    return (evaluation.rules or {}).get("announce_to_students", True) is not False


def _participation(db, evaluation_id: int, student_id: int) -> Participation:
    participation = db.scalar(
        select(Participation).where(
            Participation.evaluation_id == evaluation_id,
            Participation.student_id == student_id,
        )
    )
    if participation is None:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Vous n'êtes pas inscrit à cette évaluation")
    return participation


def _hide_qcm(question: dict) -> dict:
    """QCM : le choix est publié, le drapeau « correct » non."""
    choices = [c for c in question.get("choices", []) if isinstance(c, dict)]
    return {
        **question,
        "choices": [{k: v for k, v in choice.items() if k != "correct"} for choice in choices],
    }


def _hide_short(question: dict) -> dict:
    """Question-réponse : le corrigé reste au serveur."""
    return {k: v for k, v in question.items() if k != "accepted"}


def _hide_matching(question: dict, exercise: Exercise, rank: int) -> dict:
    """Correspondance : le rang d'une paire *est* sa réponse.

    On n'envoie que les éléments de gauche et une liste mélangée des éléments de
    droite désignés par un jeton opaque, que seul le serveur sait rattacher à un
    rang. Chaque grille reçoit son propre mélange.
    """
    pairs = [p for p in question.get("pairs", []) if isinstance(p, dict)]
    salt = matching.salt_of(exercise)
    return {
        **question,
        "pairs": [{"left": p.get("left", "")} for p in pairs],
        "right_options": [
            {"token": matching.token_for(salt, i, rank), "text": pairs[i].get("right", "")}
            for i in matching.shuffled_order(len(pairs), (exercise.id or 1) * 31 + rank)
        ],
    }


def _public_settings(exercise: Exercise, reveal: bool) -> dict:
    """Le corrigé ne quitte le serveur qu'une fois les résultats publiés.

    Les exercices à plusieurs questions (QCM, correspondance, question-réponse)
    sont republiés question par question, chacune amputée de sa réponse ; le
    Vrai/Faux perd la véracité de ses affirmations.
    """
    settings = dict(exercise.settings or {})
    settings.pop(matching.SALT_KEY, None)  # secret de présentation, jamais publié
    # Le corrigé rédigé voyage à part (`StudentCopyExercise.solution`) : jamais
    # dans les réglages, qui sont envoyés tels quels pendant l'épreuve.
    for key in _SOLUTION_KEYS:
        settings.pop(key, None)
    if reveal or exercise.kind not in ("qcm", "matching", "truefalse", "short"):
        return settings

    if isinstance(settings.get("statements"), list):
        # Vrai/Faux : l'affirmation est publiée, sa véracité non.
        settings["statements"] = [
            {k: v for k, v in statement.items() if k != "answer"}
            for statement in settings["statements"]
            if isinstance(statement, dict)
        ]

    questions = questions_of(exercise.kind, settings)
    if questions:
        if exercise.kind == "qcm":
            settings["questions"] = [_hide_qcm(q) for q in questions]
        elif exercise.kind == "short":
            settings["questions"] = [_hide_short(q) for q in questions]
        else:
            settings["questions"] = [
                _hide_matching(q, exercise, rank) for rank, q in enumerate(questions)
            ]
        # Les réglages à plat des exercices d'autrefois ont été repliés dans la
        # liste : les laisser publierait le corrigé qu'on vient d'en ôter.
        for field in ("choices", "multiple", "pairs", "accepted", "keywords_mode", "rows"):
            settings.pop(field, None)
    return settings


def _solutions_shown(evaluation: Evaluation) -> bool:
    """L'enseignant propose-t-il le corrigé avec les notes ? Oui, sauf refus."""
    return (evaluation.rules or {}).get("show_solutions", True) is not False


def _readable_value(value) -> str:
    return json.dumps(value, ensure_ascii=False)


def _expected_tests(exercise: Exercise) -> list[dict]:
    """Ce que le programme devait produire, test officiel par test officiel.

    Le détail de correction ne dit que « réussi » ou « échoué » ; une fois les
    notes publiées, l'apprenant lit ce qui était attendu, et voit où son
    programme s'en écartait. Les tests de diagnostic restent à l'enseignant.
    """
    if exercise.kind not in ("code", "algo"):
        return []
    functions = {
        str(c.get("id")): str(c.get("name") or "").strip()
        for c in (exercise.settings or {}).get("criteria") or []
        if isinstance(c, dict)
    }
    expected = []
    for test in exercise.tests:
        if test.kind is not TestKind.OFFICIAL:
            continue
        if test.target_id:
            name = functions.get(test.target_id) or "fonction"
            given = f"{name}({', '.join(_readable_value(a) for a in test.args or [])})"
        else:
            given = test.stdin or ""
        expected.append(
            {
                "test_id": test.id,
                "name": test.name,
                "call": bool(test.target_id),
                "input": given,
                "expected": test.expected_stdout or "",
            }
        )
    return expected


def _public_exercise(exercise: Exercise) -> ExercisePublicOut:
    """Vue apprenant pendant l'épreuve : ni jeux de tests, ni corrigé."""
    return ExercisePublicOut(
        **{
            **ExercisePublicOut.model_validate(exercise).model_dump(),
            "settings": _public_settings(exercise, reveal=False),
        }
    )


def _not_open_reason(evaluation: Evaluation) -> str:
    """Message explicite : l'apprenant doit savoir s'il attend ou si c'est fini."""
    if evaluation.status in (EvaluationStatus.DRAFT, EvaluationStatus.SCHEDULED):
        return "La session n'est pas encore ouverte par l'enseignant"
    return "La session est close : votre production est figée"


@router.get("/evaluations", response_model=list[StudentEvaluationOut])
def my_evaluations(user: StudentUser, db: DbSession) -> list[StudentEvaluationOut]:
    rows = db.execute(
        select(Evaluation, Participation)
        .join(Participation, Participation.evaluation_id == Evaluation.id)
        .where(
            Participation.student_id == user.id,
            Evaluation.organization_id == user.organization_id,
            Evaluation.status.in_(_VISIBLE),
        )
        .order_by(Evaluation.scheduled_start.desc().nullslast(), Evaluation.id.desc())
    ).all()
    out = []
    for evaluation, participation in rows:
        # L'heure de début est passée : on ouvre la session sans attendre le
        # prochain tour du planificateur, sinon le bouton « Commencer » échoue.
        start_if_due(db, evaluation)
        close_if_expired(db, evaluation)
        # Une épreuve peut être préparée sans être annoncée : l'enseignant
        # choisit si sa classe sait qu'une interrogation l'attend. Tant qu'elle
        # n'est pas ouverte, elle reste alors invisible : une fois la session
        # lancée, l'apprenant doit évidemment la voir pour composer.
        if evaluation.status is EvaluationStatus.SCHEDULED and not _announced(evaluation):
            continue
        classroom = db.get(Classroom, evaluation.classroom_id) if evaluation.classroom_id else None
        subject = db.get(Subject, evaluation.subject_id) if evaluation.subject_id else None
        exercises_count = db.scalar(
            select(func.count(Exercise.id)).where(Exercise.evaluation_id == evaluation.id)
        ) or 0
        # La progression n'a de sens que pendant l'épreuve : même règle que les
        # exercices « enregistrés » de l'éditeur, une production non vide.
        answered_count = 0
        if evaluation.status is EvaluationStatus.RUNNING:
            answered_count = db.scalar(
                select(func.count(Submission.id)).where(
                    Submission.participation_id == participation.id,
                    func.trim(Submission.code) != "",
                )
            ) or 0
        score, total = _published_score(db, evaluation, participation)
        out.append(
            StudentEvaluationOut(
                **{
                    **StudentEvaluationOut.model_validate(evaluation).model_dump(),
                    "classroom_name": classroom.name if classroom else None,
                    "subject_name": subject.name if subject else None,
                    "submitted_at": participation.submitted_at,
                    "exercises_count": exercises_count,
                    "answered_count": answered_count,
                    "score": score,
                    "total_points": total or evaluation.total_points,
                    "published": evaluation.status is EvaluationStatus.VALIDATED,
                    "solutions_available": evaluation.status is EvaluationStatus.VALIDATED
                    and _solutions_shown(evaluation),
                    "status_label": _CORRECTION_LABELS.get(evaluation.status, ""),
                }
            )
        )
    return out


@router.get("/evaluations/{evaluation_id}", response_model=StudentExamOut)
def open_exam(evaluation_id: int, user: StudentUser, db: DbSession) -> StudentExamOut:
    """L'épreuve n'est accessible que si la session est ouverte (CDC VII)."""
    evaluation = db.get(Evaluation, evaluation_id)
    if evaluation is None or evaluation.organization_id != user.organization_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Évaluation introuvable")
    participation = _participation(db, evaluation_id, user.id)
    start_if_due(db, evaluation)
    close_if_expired(db, evaluation)
    if evaluation.status is not EvaluationStatus.RUNNING:
        raise HTTPException(status.HTTP_403_FORBIDDEN, _not_open_reason(evaluation))

    now = utcnow()
    if participation.started_at is None:
        participation.started_at = now
        log(db, user, user.organization_id, "session.student_access", "evaluation", evaluation_id)
    participation.last_seen_at = now
    db.commit()

    exercises = list(
        db.scalars(
            select(Exercise)
            .where(Exercise.evaluation_id == evaluation_id)
            .order_by(Exercise.position)
        )
    )
    saved = {
        s.exercise_id: s.code
        for s in db.scalars(
            select(Submission).where(Submission.participation_id == participation.id)
        )
    }
    drafts = dict(saved)
    for exercise in exercises:
        # Rien de saisi pour l'instant : on pose le code de départ de l'enseignant,
        # ou à défaut le squelette du langage (main / return 0 en C).
        if not (drafts.get(exercise.id) or "").strip():
            drafts[exercise.id] = (
                exercise.starter_code
                or _joined_part_starters(exercise)
                or default_starter(exercise.language, exercise.kind)
            )
    classroom = db.get(Classroom, evaluation.classroom_id) if evaluation.classroom_id else None
    subject = db.get(Subject, evaluation.subject_id) if evaluation.subject_id else None
    return StudentExamOut(
        evaluation=StudentEvaluationOut(
            **{
                **StudentEvaluationOut.model_validate(evaluation).model_dump(),
                "classroom_name": classroom.name if classroom else None,
                "subject_name": subject.name if subject else None,
                "submitted_at": participation.submitted_at,
            }
        ),
        instructions=evaluation.instructions,
        rules=evaluation.rules or {},
        seconds_left=seconds_left(evaluation),
        server_time=utcnow(),
        exercises=[_public_exercise(e) for e in exercises],
        drafts=drafts,
        saved_exercise_ids=[eid for eid, code in saved.items() if code.strip()],
        incidents=participation.incidents or 0,
        max_incidents=int((evaluation.rules or {}).get("max_incidents") or 0),
        submitted_at=participation.submitted_at,
    )


@router.put("/evaluations/{evaluation_id}/exercises/{exercise_id}")
def autosave(
    evaluation_id: int,
    exercise_id: int,
    payload: AutosavePayload,
    user: StudentUser,
    db: DbSession,
) -> dict:
    """Sauvegarde automatique. Refusée dès que la production est figée."""
    evaluation = db.get(Evaluation, evaluation_id)
    if evaluation is None or evaluation.organization_id != user.organization_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Évaluation introuvable")
    participation = _participation(db, evaluation_id, user.id)
    close_if_expired(db, evaluation)
    if participation.submitted_at is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, "Travail déjà soumis")
    if participation.frozen_at is not None:
        # L'envoi final part au moment où la session se ferme : on l'accepte
        # pendant une courte fenêtre pour ne pas perdre le travail de l'apprenant.
        late = (utcnow() - participation.frozen_at).total_seconds()
        if late > settings.autosave_grace_seconds:
            raise HTTPException(status.HTTP_409_CONFLICT, "Épreuve close : production figée")
    elif evaluation.status is not EvaluationStatus.RUNNING:
        raise HTTPException(status.HTTP_409_CONFLICT, "Épreuve close : production figée")
    exercise = db.get(Exercise, exercise_id)
    if exercise is None or exercise.evaluation_id != evaluation_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Exercice introuvable")

    now = utcnow()

    def _upsert():
        submission = db.scalar(
            select(Submission).where(
                Submission.participation_id == participation.id,
                Submission.exercise_id == exercise_id,
            )
        )
        if submission is None:
            submission = Submission(participation_id=participation.id, exercise_id=exercise_id)
            db.add(submission)
        elif payload.version and payload.version < submission.version:
            return {
                "version": submission.version,
                "saved_at": submission.updated_at,
                "stale": True,
                "seconds_left": seconds_left(evaluation),
            }
        submission.code = payload.code
        submission.version = (submission.version or 0) + 1
        submission.updated_at = now
        participation.last_saved_at = now
        participation.last_seen_at = now
        db.commit()
        return submission

    try:
        result = _upsert()
    except IntegrityError:
        db.rollback()
        result = _upsert()

    if isinstance(result, dict):
        return result
    submission = result
    return {
        "version": submission.version,
        "saved_at": submission.updated_at,
        "stale": False,
        "seconds_left": seconds_left(evaluation),
    }


@router.post("/evaluations/{evaluation_id}/incidents")
def report_incident(
    evaluation_id: int, payload: IncidentPayload, user: StudentUser, db: DbSession
) -> dict:
    """Signale une sortie d'épreuve. Le décompte et le verrouillage sont serveur :
    un client modifié ne peut qu'omettre des incidents, jamais en effacer."""
    evaluation = db.get(Evaluation, evaluation_id)
    if evaluation is None or evaluation.organization_id != user.organization_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Évaluation introuvable")
    participation = _participation(db, evaluation_id, user.id)
    close_if_expired(db, evaluation)
    if evaluation.status is not EvaluationStatus.RUNNING or participation.frozen_at is not None:
        return {"incidents": participation.incidents or 0, "locked": True}

    participation.incidents = (participation.incidents or 0) + 1
    log(db, user, user.organization_id, "integrity.incident", "participation", participation.id,
        evaluation_id=evaluation_id, type=payload.type)

    limit = int((evaluation.rules or {}).get("max_incidents") or 0)
    locked = False
    if limit and participation.incidents >= limit:
        # On gèle la production sans la marquer « soumise » : l'apprenant n'a pas
        # rendu sa copie, et l'envoi final du client reste accepté pendant la
        # fenêtre de tolérance : sinon le travail en cours serait perdu.
        participation.frozen_at = utcnow()
        locked = True
        log(db, user, user.organization_id, "integrity.locked", "participation", participation.id,
            evaluation_id=evaluation_id, incidents=participation.incidents)
    db.commit()
    return {"incidents": participation.incidents, "max_incidents": limit, "locked": locked}


@router.post("/evaluations/{evaluation_id}/incidents/batch")
def report_incidents_batch(
    evaluation_id: int, payload: OfflineIncidentBatch, user: StudentUser, db: DbSession
) -> dict:
    """Incidents accumulés hors ligne, envoyés au retour de la connexion."""
    evaluation = db.get(Evaluation, evaluation_id)
    if evaluation is None or evaluation.organization_id != user.organization_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Évaluation introuvable")
    participation = _participation(db, evaluation_id, user.id)
    close_if_expired(db, evaluation)
    if participation.frozen_at is not None:
        return {"incidents": participation.incidents or 0, "locked": True}

    count = len(payload.incidents)
    if count == 0:
        return {"incidents": participation.incidents or 0, "locked": False}

    participation.incidents = (participation.incidents or 0) + count
    for item in payload.incidents:
        log(db, user, user.organization_id, "integrity.incident", "participation",
            participation.id, evaluation_id=evaluation_id, type=item.type, offline_at=item.at)

    limit = int((evaluation.rules or {}).get("max_incidents") or 0)
    locked = False
    if limit and participation.incidents >= limit:
        participation.frozen_at = utcnow()
        locked = True
        log(db, user, user.organization_id, "integrity.locked", "participation",
            participation.id, evaluation_id=evaluation_id, incidents=participation.incidents)
    db.commit()
    return {"incidents": participation.incidents, "max_incidents": limit, "locked": locked}


@router.post("/evaluations/{evaluation_id}/submit")
def submit(evaluation_id: int, user: StudentUser, db: DbSession) -> dict:
    evaluation = db.get(Evaluation, evaluation_id)
    if evaluation is None or evaluation.organization_id != user.organization_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Évaluation introuvable")
    participation = _participation(db, evaluation_id, user.id)
    close_if_expired(db, evaluation)
    if participation.submitted_at is not None:
        return {"submitted_at": participation.submitted_at}
    if evaluation.status is not EvaluationStatus.RUNNING:
        raise HTTPException(status.HTTP_409_CONFLICT, "La session est close")
    if (evaluation.rules or {}).get("allow_early_submit") is False:
        raise HTTPException(
            status.HTTP_403_FORBIDDEN, "La soumission anticipée n'est pas autorisée"
        )
    now = utcnow()
    participation.submitted_at = now
    participation.frozen_at = now
    log(db, user, user.organization_id, "submission.submitted", "evaluation", evaluation_id)
    db.commit()

    from sqlalchemy import func
    total = db.scalar(
        func.count(Participation.id).select().where(Participation.evaluation_id == evaluation_id)
    ) or 0
    submitted = db.scalar(
        func.count(Participation.id).select().where(
            Participation.evaluation_id == evaluation_id,
            Participation.submitted_at.isnot(None),
        )
    ) or 0
    if total > 0 and submitted == total:
        notify(
            db, evaluation.teacher_id,
            f"Tous les étudiants ont soumis : {evaluation.title}",
            f"{submitted}/{total} productions reçues. Vous pouvez lancer la correction.",
            f"/evaluations/{evaluation_id}/resultats",
        )
        db.commit()

    return {"submitted_at": now}


@router.get("/results", response_model=list[StudentResultOut])
def my_results(user: StudentUser, db: DbSession) -> list[StudentResultOut]:
    """Toutes les copies rendues. La note n'apparaît qu'une fois les résultats publiés."""
    rows = db.execute(
        select(Evaluation, Participation)
        .join(Participation, Participation.evaluation_id == Evaluation.id)
        .where(
            Participation.student_id == user.id,
            Evaluation.organization_id == user.organization_id,
            Evaluation.status.in_(
                [
                    EvaluationStatus.CLOSED,
                    EvaluationStatus.CORRECTING,
                    EvaluationStatus.CORRECTED,
                    EvaluationStatus.VALIDATED,
                ]
            ),
        )
        .order_by(Evaluation.id.desc())
    ).all()
    out = []
    for evaluation, participation in rows:
        score, total = _published_score(db, evaluation, participation)
        subject = db.get(Subject, evaluation.subject_id) if evaluation.subject_id else None
        published = evaluation.status is EvaluationStatus.VALIDATED
        out.append(
            StudentResultOut(
                evaluation_id=evaluation.id,
                title=evaluation.title,
                subject_name=subject.name if subject else None,
                date=evaluation.started_at or evaluation.scheduled_start,
                score=score,
                total_points=total or evaluation.total_points,
                status="Publié" if published else _CORRECTION_LABELS[evaluation.status],
                published=published,
                lines=_result_lines(db, evaluation, participation) if published else [],
            )
        )
    return out


_CORRECTION_LABELS = {
    EvaluationStatus.CLOSED: "Copie rendue : correction à venir",
    EvaluationStatus.CORRECTING: "Correction en cours",
    EvaluationStatus.CORRECTED: "En attente de validation",
    EvaluationStatus.VALIDATED: "Publié",
}


def _latest_run(db, evaluation_id: int) -> CorrectionRun | None:
    return db.scalar(
        select(CorrectionRun)
        .where(
            CorrectionRun.evaluation_id == evaluation_id,
            CorrectionRun.status.in_([RunStatus.DONE, RunStatus.PARTIAL]),
        )
        .order_by(CorrectionRun.number.desc())
        .limit(1)
    )


def _published_score(db, evaluation: Evaluation, participation: Participation):
    """Note finale, uniquement si l'enseignant a validé et publié les résultats."""
    if evaluation.status is not EvaluationStatus.VALIDATED:
        return None, evaluation.total_points
    run = _latest_run(db, evaluation.id)
    if run is None:
        return None, evaluation.total_points
    entry = participant_scores(db, run.id).get(participation.id)
    if not entry:
        return None, evaluation.total_points
    return entry["final"], entry["max"] or evaluation.total_points


def _result_lines(db, evaluation: Evaluation, participation: Participation) -> list[ScoreLineOut]:
    """Le relevé de la copie, exercice par exercice : « Exercice 1 : 0/4 ».

    C'est ce que l'apprenant cherche d'abord : non pas seulement combien il a,
    mais où il l'a perdu. La ligne existe même sans note automatique, avec son
    barème, pour que le sujet reste lisible dans son entier.
    """
    run = _latest_run(db, evaluation.id)
    retenues = {}
    if run is not None:
        retenues = (
            participation_breakdown(db, run.id)
            .get(participation.id, {})
            .get("exercises", {})
        )
    exercises = db.scalars(
        select(Exercise)
        .where(Exercise.evaluation_id == evaluation.id)
        .order_by(Exercise.position)
    )
    lines = []
    for rank, exercise in enumerate(exercises, start=1):
        entry = retenues.get(exercise.id)
        lines.append(
            ScoreLineOut(
                label=f"Exercice {rank}",
                title=exercise.title,
                score=entry["final"] if entry else None,
                max_score=round(entry["max"] if entry else (exercise.points or 0), 2),
            )
        )
    return lines


@router.get("/results/{evaluation_id}", response_model=StudentCopyOut)
def my_copy(evaluation_id: int, user: StudentUser, db: DbSession) -> StudentCopyOut:
    """La copie de l'apprenant : énoncés et productions, annotés une fois publiés."""
    evaluation = db.get(Evaluation, evaluation_id)
    if evaluation is None or evaluation.organization_id != user.organization_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Évaluation introuvable")
    participation = _participation(db, evaluation_id, user.id)
    close_if_expired(db, evaluation)
    if evaluation.status in (EvaluationStatus.DRAFT, EvaluationStatus.SCHEDULED,
                             EvaluationStatus.RUNNING):
        raise HTTPException(
            status.HTTP_403_FORBIDDEN, "La copie sera consultable après la clôture de l'épreuve"
        )
    if evaluation.status is EvaluationStatus.CANCELLED:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Cette évaluation a été annulée")

    published = evaluation.status is EvaluationStatus.VALIDATED
    show_solutions = published and _solutions_shown(evaluation)
    exercises = list(
        db.scalars(
            select(Exercise)
            .where(Exercise.evaluation_id == evaluation_id)
            .order_by(Exercise.position)
        )
    )
    answers = {
        s.exercise_id: s.code
        for s in db.scalars(
            select(Submission).where(Submission.participation_id == participation.id)
        )
    }
    run = _latest_run(db, evaluation_id)
    results = {}
    # Les notes retenues par exercice : l'automatique, sauf là où l'enseignant a
    # ajusté avant de publier. L'apprenant doit lire la même note que son maître.
    retenues = {}
    if run is not None:
        retenues = (
            participation_breakdown(db, run.id)
            .get(participation.id, {})
            .get("exercises", {})
        )
        results = {
            r.exercise_id: r
            for r in db.scalars(
                select(CorrectionResult).where(
                    CorrectionResult.run_id == run.id,
                    CorrectionResult.participation_id == participation.id,
                )
            )
        }
    comments = {}
    if published:
        comments = {
            a.exercise_id: a.text
            for a in db.scalars(
                select(Appreciation).where(Appreciation.participation_id == participation.id)
            )
        }

    sheets = []
    for exercise in exercises:
        result = results.get(exercise.id) if published else None
        sheets.append(
            StudentCopyExercise(
                exercise_id=exercise.id,
                position=exercise.position,
                title=exercise.title,
                statement=exercise.statement,
                language=exercise.language,
                kind=exercise.kind,
                points=exercise.points,
                settings=_public_settings(exercise, reveal=published),
                starter_code=exercise.starter_code,
                answer=answers.get(exercise.id, ""),
                matches=matching.readable_matches(exercise, answers.get(exercise.id, ""), published),
                score=(
                    retenues.get(exercise.id, {}).get("final", result.auto_score)
                    if result
                    else None
                ),
                max_score=result.max_score if result else None,
                status=result.status if result else None,
                compile_log=result.compile_log if result else "",
                tests=[t for t in (result.tests or []) if t.get("kind") != "diagnostic"]
                if result
                else [],
                appreciation=comments.get(exercise.id, ""),
                solution=str((exercise.settings or {}).get("solution") or "")
                if show_solutions
                else "",
                solution_notes=str((exercise.settings or {}).get("solution_notes") or "")
                if show_solutions
                else "",
                expected_tests=_expected_tests(exercise) if show_solutions else [],
            )
        )

    score, total = _published_score(db, evaluation, participation)
    subject = db.get(Subject, evaluation.subject_id) if evaluation.subject_id else None
    classroom = db.get(Classroom, evaluation.classroom_id) if evaluation.classroom_id else None
    return StudentCopyOut(
        evaluation_id=evaluation.id,
        title=evaluation.title,
        subject_name=subject.name if subject else None,
        classroom_name=classroom.name if classroom else None,
        instructions=evaluation.instructions,
        date=evaluation.started_at or evaluation.scheduled_start,
        duration_minutes=evaluation.duration_minutes,
        submitted_at=participation.submitted_at,
        published=published,
        corrected=run is not None,
        status_label=_CORRECTION_LABELS.get(evaluation.status, ""),
        score=score,
        total_points=total or evaluation.total_points,
        appreciation=comments.get(None, ""),
        solutions_available=show_solutions,
        exercises=sheets,
    )
