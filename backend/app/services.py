"""Logique métier partagée entre les routes (accès, cycle de vie, scores)."""

from __future__ import annotations

from datetime import timedelta

from fastapi import HTTPException, status
from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

from .audit import log
from .config import settings
from .models import (
    Classroom,
    CorrectionResult,
    CorrectionRun,
    Enrollment,
    Evaluation,
    EvaluationStatus,
    Exercise,
    Notification,
    Participation,
    Role,
    RunStatus,
    ScoreAdjustment,
    Subject,
    User,
    utcnow,
)


def get_evaluation(db: Session, evaluation_id: int, user: User) -> Evaluation:
    """Récupère une évaluation en garantissant l'isolation par établissement."""
    evaluation = db.get(Evaluation, evaluation_id)
    if evaluation is None or evaluation.organization_id != user.organization_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Évaluation introuvable")
    if user.role is Role.TEACHER and evaluation.teacher_id != user.id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Évaluation d'un autre enseignant")
    return evaluation


def require_status(evaluation: Evaluation, *allowed: EvaluationStatus) -> None:
    if evaluation.status not in allowed:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            f"Action impossible depuis l'état « {evaluation.status.value} »",
        )


def seconds_left(evaluation: Evaluation) -> int:
    if evaluation.ends_at is None:
        return 0
    return max(0, int((evaluation.ends_at - utcnow()).total_seconds()))


def close_if_expired(db: Session, evaluation: Evaluation) -> Evaluation:
    """Clôture automatique à l'expiration du temps imparti (CDC V.4)."""
    if evaluation.status is EvaluationStatus.RUNNING and seconds_left(evaluation) == 0:
        # La clôture date de l'échéance, pas de la première requête qui la
        # constate : sans cela, la fenêtre de tolérance de l'envoi final
        # dépendrait du moment où quelqu'un a interrogé le serveur.
        freeze(db, evaluation, reason="expiration", at=evaluation.ends_at)
    return evaluation


def notify(db: Session, user_id: int, title: str, body: str = "", link: str = "") -> None:
    db.add(Notification(user_id=user_id, title=title, body=body, link=link))


def freeze(db: Session, evaluation: Evaluation, reason: str, at=None) -> None:
    now = min(at, utcnow()) if at is not None else utcnow()
    evaluation.status = EvaluationStatus.CLOSED
    evaluation.closed_at = now
    # Mise à jour ORM : les participations déjà chargées par la requête en cours
    # voient leur gel. Sans cela, l'envoi final qui constate lui-même la fin du
    # temps lisait une participation « non figée » sur une épreuve close, et
    # était refusé : le travail de l'apprenant était perdu.
    db.execute(
        update(Participation)
        .where(Participation.evaluation_id == evaluation.id, Participation.frozen_at.is_(None))
        .values(frozen_at=now)
        .execution_options(synchronize_session="evaluate")
    )
    log(db, None, evaluation.organization_id, "session.closed", "evaluation", evaluation.id,
        reason=reason)
    total = db.scalar(
        select(func.count(Participation.id)).where(Participation.evaluation_id == evaluation.id)
    ) or 0
    submitted = db.scalar(
        select(func.count(Participation.id)).where(
            Participation.evaluation_id == evaluation.id,
            Participation.submitted_at.isnot(None),
        )
    ) or 0
    label = "Temps écoulé" if reason == "expiration" else "Clôturée manuellement"
    notify(
        db, evaluation.teacher_id,
        f"Épreuve terminée : {evaluation.title}",
        f"{label}. {submitted}/{total} productions soumises.",
        f"/evaluations/{evaluation.id}/resultats",
    )
    db.commit()


def final_uploads_pending(db: Session, evaluation: Evaluation) -> int:
    """Secondes pendant lesquelles un envoi final peut encore arriver.

    À la clôture, le navigateur de chaque apprenant pousse son dernier état.
    Corriger avant la fin de cette fenêtre noterait une copie incomplète ; si
    toutes les copies ont été rendues, rien n'est plus attendu.
    """
    if evaluation.closed_at is None:
        return 0
    left = settings.autosave_grace_seconds - (utcnow() - evaluation.closed_at).total_seconds()
    if left <= 0:
        return 0
    unsubmitted = db.scalar(
        select(func.count(Participation.id)).where(
            Participation.evaluation_id == evaluation.id,
            Participation.submitted_at.is_(None),
        )
    ) or 0
    return int(left) + 1 if unsubmitted else 0


def sync_participants(db: Session, evaluation: Evaluation) -> int:
    """Crée les participations manquantes pour la classe affectée."""
    if evaluation.classroom_id is None:
        return 0
    student_ids = set(
        db.scalars(
            select(Enrollment.student_id).where(Enrollment.classroom_id == evaluation.classroom_id)
        )
    )
    existing = set(
        db.scalars(
            select(Participation.student_id).where(Participation.evaluation_id == evaluation.id)
        )
    )
    created = 0
    for student_id in student_ids - existing:
        db.add(Participation(evaluation_id=evaluation.id, student_id=student_id))
        created += 1
    db.flush()
    return created


def start_session(db: Session, evaluation: Evaluation, actor: User) -> None:
    require_status(evaluation, EvaluationStatus.SCHEDULED, EvaluationStatus.DRAFT)
    if not db.scalar(select(func.count(Exercise.id)).where(Exercise.evaluation_id == evaluation.id)):
        raise HTTPException(status.HTTP_409_CONFLICT, "L'évaluation ne contient aucun exercice")
    if evaluation.classroom_id is None:
        raise HTTPException(status.HTTP_409_CONFLICT, "Aucune classe affectée à l'évaluation")
    now = utcnow()
    sync_participants(db, evaluation)
    # Épreuve lancée sur place, sans programmation : c'est l'heure du lancement
    # qui fait date. Sans cela, la feuille et les listes resteraient sans date.
    if evaluation.scheduled_start is None:
        evaluation.scheduled_start = now
    evaluation.status = EvaluationStatus.RUNNING
    evaluation.started_at = now
    evaluation.ends_at = now + timedelta(minutes=evaluation.duration_minutes)
    log(db, actor, evaluation.organization_id, "session.started", "evaluation", evaluation.id)
    db.commit()


def start_if_due(db: Session, evaluation: Evaluation) -> Evaluation:
    """Ouvre une session programmée dont l'heure est arrivée.

    Le planificateur de fond ne tourne que toutes les 30 secondes : sans ce
    rattrapage, l'apprenant qui clique sur « Commencer l'épreuve » à l'heure dite
    se voit refuser l'accès parce que la session est encore « programmée ».
    """
    if (
        evaluation.status is EvaluationStatus.SCHEDULED
        and evaluation.scheduled_start is not None
        and evaluation.scheduled_start <= utcnow()
    ):
        actor = db.get(User, evaluation.teacher_id)
        try:
            start_session(db, evaluation, actor)
        except HTTPException:
            # Évaluation incomplète (ni classe, ni exercice) : elle reste programmée
            # et l'enseignant la corrigera. On ne bloque pas la requête en cours.
            db.rollback()
    return evaluation


def latest_run(db: Session, evaluation_id: int) -> CorrectionRun | None:
    return db.scalar(
        select(CorrectionRun)
        .where(CorrectionRun.evaluation_id == evaluation_id)
        .order_by(CorrectionRun.number.desc())
        .limit(1)
    )


def launch_correction(db: Session, evaluation: Evaluation, actor: User) -> CorrectionRun:
    require_status(
        evaluation,
        EvaluationStatus.CLOSED,
        EvaluationStatus.CORRECTED,
        EvaluationStatus.CORRECTING,
    )
    pending = db.scalar(
        select(CorrectionRun).where(
            CorrectionRun.evaluation_id == evaluation.id,
            CorrectionRun.status.in_([RunStatus.PENDING, RunStatus.RUNNING]),
        )
    )
    if pending is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, "Une correction est déjà en cours")
    wait = final_uploads_pending(db, evaluation)
    if wait:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            f"Les derniers envois des étudiants peuvent encore arriver : "
            f"relancez la correction dans {wait} s",
        )
    last = latest_run(db, evaluation.id)
    run = CorrectionRun(
        evaluation_id=evaluation.id,
        number=(last.number + 1) if last else 1,
        triggered_by=actor.id,
    )
    db.add(run)
    evaluation.status = EvaluationStatus.CORRECTING
    log(db, actor, evaluation.organization_id, "correction.launched", "evaluation", evaluation.id,
        run_number=run.number)
    db.commit()
    db.refresh(run)
    return run


def participation_breakdown(db: Session, run_id: int) -> dict[int, dict]:
    """Notes d'une campagne, exercice par exercice puis en total.

    Un ajustement porte soit sur un exercice, soit sur la copie entière. Les
    deux cohabitent, et c'est l'ordre qui tranche : ajuster un exercice après
    avoir posé une note globale reprend le calcul par exercices, poser une note
    globale ensuite la fige à nouveau. Sans cela, un enseignant qui corrige un
    exercice après coup verrait son geste ignoré sans rien pour l'expliquer.
    """
    scores: dict[int, dict] = {}
    for pid, eid, auto, mx in db.execute(
        select(
            CorrectionResult.participation_id,
            CorrectionResult.exercise_id,
            CorrectionResult.auto_score,
            CorrectionResult.max_score,
        ).where(CorrectionResult.run_id == run_id)
    ).all():
        entry = scores.setdefault(pid, {"exercises": {}, "override": None})
        entry["exercises"][eid] = {
            "auto": round(auto or 0, 2),
            "max": round(mx or 0, 2),
            "final": round(auto or 0, 2),
            "adjusted": False,
        }

    for adj in db.scalars(
        select(ScoreAdjustment)
        .where(ScoreAdjustment.run_id == run_id)
        .order_by(ScoreAdjustment.created_at, ScoreAdjustment.id)
    ):
        entry = scores.setdefault(adj.participation_id, {"exercises": {}, "override": None})
        exercise = entry["exercises"].get(adj.exercise_id) if adj.exercise_id else None
        if exercise is not None:
            exercise["final"] = round(adj.new_score, 2)
            exercise["adjusted"] = True
            entry["override"] = None
        elif adj.exercise_id is None:
            entry["override"] = round(adj.new_score, 2)

    for entry in scores.values():
        exercises = entry["exercises"].values()
        entry["auto"] = round(sum(e["auto"] for e in exercises), 2)
        entry["max"] = round(sum(e["max"] for e in exercises), 2)
        summed = round(sum(e["final"] for e in exercises), 2)
        entry["final"] = entry["override"] if entry["override"] is not None else summed
        entry["adjusted"] = entry["override"] is not None or any(
            e["adjusted"] for e in exercises
        )
    return scores


def participant_scores(db: Session, run_id: int) -> dict[int, dict]:
    """Score automatique + note retenue par participation (sans le détail)."""
    return {
        pid: {k: entry[k] for k in ("auto", "max", "final", "adjusted")}
        for pid, entry in participation_breakdown(db, run_id).items()
    }


def resolve_names(db: Session, evaluation: Evaluation) -> tuple[str | None, str | None]:
    classroom = db.get(Classroom, evaluation.classroom_id) if evaluation.classroom_id else None
    subject = db.get(Subject, evaluation.subject_id) if evaluation.subject_id else None
    return (classroom.name if classroom else None, subject.name if subject else None)


def sheet_header_of(db: Session, evaluation: Evaluation) -> dict | None:
    """L'en-tête de feuille réglé par l'auteur de l'épreuve, s'il en a posé un."""
    teacher = db.get(User, evaluation.teacher_id)
    return teacher.sheet_header if teacher else None
