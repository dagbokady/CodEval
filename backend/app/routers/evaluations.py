"""Parcours enseignant : création, exercices, jeux de tests, affectation, session."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.orm import selectinload

from ..audit import log
from ..deps import DbSession, TeacherUser
from ..grading.languages import LANGUAGES, enabled_languages
from ..grading.matching import SALT_KEY, ensure_salt as ensure_matching_salt
from ..models import (
    AuditLog,
    Classroom,
    CorrectionResult,
    CorrectionRun,
    Evaluation,
    EvaluationStatus,
    Exercise,
    Participation,
    Role,
    RunStatus,
    Subject,
    TestCase,
    User,
    utcnow,
)
from ..schemas import (
    EvaluationCreate,
    EvaluationDetailOut,
    EvaluationOut,
    EvaluationUpdate,
    ExerciseIn,
    ExerciseOut,
    ExtendPayload,
    IncidentOut,
    Page,
    SessionMonitorOut,
    SessionParticipant,
)
from ..services import (
    close_if_expired,
    freeze,
    get_evaluation,
    require_status,
    resolve_names,
    seconds_left,
    start_session,
    sync_participants,
)

router = APIRouter(prefix="/api/evaluations", tags=["évaluations"])

_STATUS_GROUPS = {
    "running": [EvaluationStatus.RUNNING],
    "scheduled": [EvaluationStatus.DRAFT, EvaluationStatus.SCHEDULED],
    "corrected": [
        EvaluationStatus.CLOSED,
        EvaluationStatus.CORRECTING,
        EvaluationStatus.CORRECTED,
        EvaluationStatus.VALIDATED,
    ],
}


@router.get("/languages")
def languages() -> list[dict]:
    return [
        {
            "key": l.key,
            "label": l.label,
            "mode": l.editor_mode,
            "starter_code": l.starter_code,
        }
        for l in enabled_languages()
    ]


def _to_out(db, evaluation: Evaluation, counts: dict, exercises: dict, rates: dict) -> EvaluationOut:
    classroom_name, subject_name = resolve_names(db, evaluation)
    return EvaluationOut(
        **{
            **EvaluationOut.model_validate(evaluation).model_dump(),
            "classroom_name": classroom_name,
            "subject_name": subject_name,
            "participants_count": counts.get(evaluation.id, 0),
            "exercises_count": exercises.get(evaluation.id, 0),
            "success_rate": rates.get(evaluation.id),
        }
    )


@router.get("", response_model=Page)
def list_evaluations(
    user: TeacherUser,
    db: DbSession,
    group: str | None = Query(default=None, pattern="^(running|scheduled|corrected)$"),
    subject_id: int | None = None,
    classroom_id: int | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
) -> Page:
    filters = [
        Evaluation.organization_id == user.organization_id,
        Evaluation.is_template.isnot(True),
    ]
    if user.role is Role.TEACHER:
        filters.append(Evaluation.teacher_id == user.id)
    if group:
        filters.append(Evaluation.status.in_(_STATUS_GROUPS[group]))
    if subject_id:
        filters.append(Evaluation.subject_id == subject_id)
    if classroom_id:
        filters.append(Evaluation.classroom_id == classroom_id)

    total = db.scalar(select(func.count(Evaluation.id)).where(*filters)) or 0
    rows = list(
        db.scalars(
            select(Evaluation)
            .where(*filters)
            .order_by(Evaluation.created_at.desc())
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
    )
    for evaluation in rows:
        close_if_expired(db, evaluation)
    ids = [e.id for e in rows]
    counts = exercises = rates = {}
    if ids:
        counts = dict(
            db.execute(
                select(Participation.evaluation_id, func.count(Participation.id))
                .where(Participation.evaluation_id.in_(ids))
                .group_by(Participation.evaluation_id)
            ).all()
        )
        exercises = dict(
            db.execute(
                select(Exercise.evaluation_id, func.count(Exercise.id))
                .where(Exercise.evaluation_id.in_(ids))
                .group_by(Exercise.evaluation_id)
            ).all()
        )
        rate_rows = db.execute(
            select(
                CorrectionRun.evaluation_id,
                func.sum(CorrectionResult.auto_score),
                func.sum(CorrectionResult.max_score),
            )
            .join(CorrectionResult, CorrectionResult.run_id == CorrectionRun.id)
            .where(CorrectionRun.evaluation_id.in_(ids), CorrectionRun.status == RunStatus.DONE)
            .group_by(CorrectionRun.evaluation_id)
        ).all()
        rates = {
            eid: round((auto or 0) / mx * 100, 1) for eid, auto, mx in rate_rows if mx
        }
    return Page(
        items=[_to_out(db, e, counts, exercises, rates).model_dump() for e in rows],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.post("", response_model=EvaluationDetailOut, status_code=status.HTTP_201_CREATED)
def create_evaluation(
    payload: EvaluationCreate, user: TeacherUser, db: DbSession
) -> EvaluationDetailOut:
    _check_refs(db, user, payload.classroom_id, payload.subject_id)
    evaluation = Evaluation(
        organization_id=user.organization_id,
        teacher_id=user.id,
        **payload.model_dump(),
    )
    db.add(evaluation)
    log(db, user, user.organization_id, "evaluation.created", "evaluation", None,
        title=payload.title)
    db.commit()
    db.refresh(evaluation)
    return _detail(db, evaluation)


def _check_refs(db, user: User, classroom_id: int | None, subject_id: int | None) -> None:
    if classroom_id is not None:
        classroom = db.get(Classroom, classroom_id)
        if classroom is None or classroom.organization_id != user.organization_id:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Classe inconnue")
    if subject_id is not None:
        subject = db.get(Subject, subject_id)
        if subject is None or subject.organization_id != user.organization_id:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Matière inconnue")


def _detail(db, evaluation: Evaluation) -> EvaluationDetailOut:
    classroom_name, subject_name = resolve_names(db, evaluation)
    exercises = db.scalars(
        select(Exercise)
        .where(Exercise.evaluation_id == evaluation.id)
        .options(selectinload(Exercise.tests))
        .order_by(Exercise.position)
    )
    participants = (
        db.scalar(
            select(func.count(Participation.id)).where(
                Participation.evaluation_id == evaluation.id
            )
        )
        or 0
    )
    items = [ExerciseOut.model_validate(e) for e in exercises]
    return EvaluationDetailOut(
        **{
            **EvaluationOut.model_validate(evaluation).model_dump(),
            "classroom_name": classroom_name,
            "subject_name": subject_name,
            "participants_count": participants,
            "exercises_count": len(items),
            "exercises": items,
        }
    )


def _clone(
    db,
    source: Evaluation,
    user: User,
    *,
    is_template: bool,
    title: str | None = None,
    classroom_id: int | None = None,
    scheduled_start=None,
) -> Evaluation:
    """Recopie une épreuve entière — énoncés, jeux de tests, barèmes — dans une
    nouvelle épreuve indépendante. La copie repart toujours en brouillon : rien
    de la session d'origine (dates, participants, corrections) ne la suit."""
    copy = Evaluation(
        organization_id=source.organization_id,
        teacher_id=user.id,
        subject_id=source.subject_id,
        classroom_id=classroom_id,
        title=title or source.title,
        kind=source.kind,
        description=source.description,
        instructions=source.instructions,
        language=source.language,
        duration_minutes=source.duration_minutes,
        scheduled_start=scheduled_start,
        status=EvaluationStatus.DRAFT,
        total_points=source.total_points,
        rules=dict(source.rules or {}),
        is_template=is_template,
    )
    db.add(copy)
    db.flush()
    originals = db.scalars(
        select(Exercise)
        .where(Exercise.evaluation_id == source.id)
        .options(selectinload(Exercise.tests))
        .order_by(Exercise.position)
    )
    for exercise in originals:
        # Le sel d'une correspondance appartient à l'épreuve où il a été tiré :
        # la copie en tirera le sien à la première correction.
        settings = {k: v for k, v in (exercise.settings or {}).items() if k != SALT_KEY}
        clone = Exercise(
            evaluation_id=copy.id,
            position=exercise.position,
            title=exercise.title,
            statement=exercise.statement,
            language=exercise.language,
            points=exercise.points,
            starter_code=exercise.starter_code,
            kind=exercise.kind,
            settings=settings,
        )
        db.add(clone)
        db.flush()
        for test in exercise.tests:
            db.add(
                TestCase(
                    exercise_id=clone.id,
                    position=test.position,
                    name=test.name,
                    kind=test.kind,
                    stdin=test.stdin,
                    expected_stdout=test.expected_stdout,
                    comparison=test.comparison,
                    points=test.points,
                    timeout_ms=test.timeout_ms,
                    target_id=test.target_id,
                    input_types=list(test.input_types or []),
                    expected_type=test.expected_type,
                    args=list(test.args or []),
                )
            )
    return copy


def _template(db, template_id: int, user: User) -> Evaluation:
    template = db.get(Evaluation, template_id)
    if (
        template is None
        or not template.is_template
        or template.organization_id != user.organization_id
    ):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Modèle introuvable")
    return template


@router.get("/templates", response_model=Page)
def list_templates(
    user: TeacherUser,
    db: DbSession,
    subject_id: int | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
) -> Page:
    """La banque d'évaluations : les épreuves mises de côté pour resservir.

    Un modèle est partagé avec toute l'organisation — un enseignant en tire une
    copie sans jamais toucher à l'original."""
    filters = [
        Evaluation.organization_id == user.organization_id,
        Evaluation.is_template.is_(True),
    ]
    if subject_id:
        filters.append(Evaluation.subject_id == subject_id)
    total = db.scalar(select(func.count(Evaluation.id)).where(*filters)) or 0
    rows = list(
        db.scalars(
            select(Evaluation)
            .where(*filters)
            .order_by(Evaluation.created_at.desc())
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
    )
    ids = [e.id for e in rows]
    exercises = {}
    if ids:
        exercises = dict(
            db.execute(
                select(Exercise.evaluation_id, func.count(Exercise.id))
                .where(Exercise.evaluation_id.in_(ids))
                .group_by(Exercise.evaluation_id)
            ).all()
        )
    items = []
    for evaluation in rows:
        item = _to_out(db, evaluation, {}, exercises, {})
        item.is_owner = evaluation.teacher_id == user.id
        items.append(item.model_dump())
    return Page(
        items=items,
        total=total,
        page=page,
        page_size=page_size,
    )


@router.post(
    "/{evaluation_id}/save-as-template",
    response_model=EvaluationDetailOut,
    status_code=status.HTTP_201_CREATED,
)
def save_as_template(
    evaluation_id: int, user: TeacherUser, db: DbSession
) -> EvaluationDetailOut:
    """Mettre une épreuve existante en banque, telle qu'elle est aujourd'hui."""
    source = get_evaluation(db, evaluation_id, user)
    template = _clone(db, source, user, is_template=True, title=source.title)
    log(db, user, user.organization_id, "template.saved", "evaluation", source.id,
        title=source.title)
    db.commit()
    db.refresh(template)
    return _detail(db, template)


@router.post(
    "/templates/{template_id}/use",
    response_model=EvaluationDetailOut,
    status_code=status.HTTP_201_CREATED,
)
def use_template(
    template_id: int, payload: EvaluationUpdate, user: TeacherUser, db: DbSession
) -> EvaluationDetailOut:
    """Tirer une épreuve d'un modèle. La copie est un brouillon : l'enseignant
    lui donne sa classe et sa date avant de la publier."""
    template = _template(db, template_id, user)
    _check_refs(db, user, payload.classroom_id, None)
    evaluation = _clone(
        db,
        template,
        user,
        is_template=False,
        title=payload.title or template.title,
        classroom_id=payload.classroom_id,
        scheduled_start=payload.scheduled_start,
    )
    log(db, user, user.organization_id, "template.used", "evaluation", template.id,
        title=evaluation.title)
    db.commit()
    db.refresh(evaluation)
    return _detail(db, evaluation)


@router.get("/{evaluation_id}", response_model=EvaluationDetailOut)
def get_detail(evaluation_id: int, user: TeacherUser, db: DbSession) -> EvaluationDetailOut:
    evaluation = close_if_expired(db, get_evaluation(db, evaluation_id, user))
    return _detail(db, evaluation)


@router.patch("/{evaluation_id}", response_model=EvaluationDetailOut)
def update_evaluation(
    evaluation_id: int, payload: EvaluationUpdate, user: TeacherUser, db: DbSession
) -> EvaluationDetailOut:
    evaluation = get_evaluation(db, evaluation_id, user)
    require_status(evaluation, EvaluationStatus.DRAFT, EvaluationStatus.SCHEDULED)
    data = payload.model_dump(exclude_unset=True)
    _check_refs(db, user, data.get("classroom_id"), data.get("subject_id"))
    for field, value in data.items():
        setattr(evaluation, field, value)
    log(db, user, user.organization_id, "evaluation.updated", "evaluation", evaluation.id,
        fields=list(data))
    db.commit()
    db.refresh(evaluation)
    return _detail(db, evaluation)


# ----- Exercices & jeux de tests -----
@router.put("/{evaluation_id}/exercises", response_model=EvaluationDetailOut)
def replace_exercises(
    evaluation_id: int, payload: list[ExerciseIn], user: TeacherUser, db: DbSession
) -> EvaluationDetailOut:
    """Enregistre en une passe les exercices et leurs jeux de tests (étapes 2 & 3)."""
    evaluation = get_evaluation(db, evaluation_id, user)
    if evaluation.status not in (
        EvaluationStatus.DRAFT,
        EvaluationStatus.SCHEDULED,
        EvaluationStatus.CLOSED,
        EvaluationStatus.CORRECTED,
    ):
        raise HTTPException(
            status.HTTP_409_CONFLICT, "Les exercices ne sont pas modifiables dans cet état"
        )
    frozen = evaluation.status in (EvaluationStatus.CLOSED, EvaluationStatus.CORRECTED)

    existing = {
        e.id: e
        for e in db.scalars(select(Exercise).where(Exercise.evaluation_id == evaluation_id))
    }
    kept: set[int] = set()
    for position, item in enumerate(payload, start=1):
        exercise = existing.get(item.id) if item.id else None
        if exercise is None:
            if frozen:
                raise HTTPException(
                    status.HTTP_409_CONFLICT,
                    "Après la clôture, seuls les jeux de tests et barèmes sont modifiables",
                )
            exercise = Exercise(evaluation_id=evaluation_id)
            db.add(exercise)
        if not frozen:
            exercise.title = item.title
            exercise.statement = item.statement
            exercise.language = item.language
            exercise.starter_code = item.starter_code
            exercise.kind = item.kind
        exercise.settings = (
            ensure_matching_salt({**item.settings, **_kept_salt(exercise)})
            if item.kind == "matching"
            else item.settings
        )
        exercise.points = item.points
        exercise.position = position
        db.flush()
        kept.add(exercise.id)
        _sync_tests(db, exercise, item.tests)

    for exercise_id, exercise in existing.items():
        if exercise_id not in kept:
            if frozen:
                raise HTTPException(
                    status.HTTP_409_CONFLICT, "Suppression d'exercice impossible après la clôture"
                )
            db.delete(exercise)

    action = "correction.params_updated" if frozen else "evaluation.exercises_updated"
    log(db, user, user.organization_id, action, "evaluation", evaluation_id, count=len(payload))
    db.commit()
    db.refresh(evaluation)
    return _detail(db, evaluation)


def _kept_salt(exercise: Exercise) -> dict:
    """Le sel d'une correspondance appartient au serveur : le client ne peut ni
    l'imposer, ni le perdre en réenregistrant l'exercice."""
    existing = (exercise.settings or {}).get(SALT_KEY)
    return {SALT_KEY: existing} if existing else {}


def _sync_tests(db, exercise: Exercise, items) -> None:
    existing = {t.id: t for t in db.scalars(select(TestCase).where(TestCase.exercise_id == exercise.id))}
    kept: set[int] = set()
    for position, item in enumerate(items, start=1):
        test = existing.get(item.id) if item.id else None
        if test is None:
            test = TestCase(exercise_id=exercise.id)
            db.add(test)
        for field, value in item.model_dump(exclude={"id"}).items():
            setattr(test, field, value)
        test.position = position
        db.flush()
        kept.add(test.id)
    for test_id, test in existing.items():
        if test_id not in kept:
            db.delete(test)


# ----- Affectation & cycle de vie -----
@router.delete("/{evaluation_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_evaluation(evaluation_id: int, user: TeacherUser, db: DbSession) -> None:
    evaluation = get_evaluation(db, evaluation_id, user)
    require_status(evaluation, EvaluationStatus.DRAFT, EvaluationStatus.SCHEDULED)
    log(db, user, user.organization_id, "evaluation.deleted", "evaluation", evaluation.id,
        title=evaluation.title)
    db.execute(CorrectionRun.__table__.delete().where(CorrectionRun.evaluation_id == evaluation.id))
    db.execute(Participation.__table__.delete().where(Participation.evaluation_id == evaluation.id))
    db.execute(AuditLog.__table__.delete().where(
        AuditLog.target_type == "evaluation", AuditLog.target_id == evaluation.id))
    db.delete(evaluation)
    db.commit()


@router.post("/{evaluation_id}/publish", response_model=EvaluationDetailOut)
def publish(evaluation_id: int, user: TeacherUser, db: DbSession) -> EvaluationDetailOut:
    evaluation = get_evaluation(db, evaluation_id, user)
    require_status(evaluation, EvaluationStatus.DRAFT, EvaluationStatus.SCHEDULED)
    if evaluation.classroom_id is None:
        raise HTTPException(status.HTTP_409_CONFLICT, "Affectez une classe avant de publier")
    if not db.scalar(select(func.count(Exercise.id)).where(Exercise.evaluation_id == evaluation.id)):
        raise HTTPException(status.HTTP_409_CONFLICT, "Ajoutez au moins un exercice")
    created = sync_participants(db, evaluation)
    evaluation.status = EvaluationStatus.SCHEDULED
    log(db, user, user.organization_id, "evaluation.published", "evaluation", evaluation.id,
        participants=created)
    db.commit()
    db.refresh(evaluation)
    return _detail(db, evaluation)


@router.post("/{evaluation_id}/start", response_model=EvaluationDetailOut)
def start(evaluation_id: int, user: TeacherUser, db: DbSession) -> EvaluationDetailOut:
    evaluation = get_evaluation(db, evaluation_id, user)
    start_session(db, evaluation, user)
    db.refresh(evaluation)
    return _detail(db, evaluation)


@router.post("/{evaluation_id}/extend", response_model=EvaluationDetailOut)
def extend(
    evaluation_id: int, payload: ExtendPayload, user: TeacherUser, db: DbSession
) -> EvaluationDetailOut:
    evaluation = get_evaluation(db, evaluation_id, user)
    require_status(evaluation, EvaluationStatus.RUNNING)
    from datetime import timedelta

    evaluation.ends_at = (evaluation.ends_at or utcnow()) + timedelta(minutes=payload.extra_minutes)
    evaluation.duration_minutes += payload.extra_minutes
    log(db, user, user.organization_id, "session.extended", "evaluation", evaluation.id,
        minutes=payload.extra_minutes)
    db.commit()
    db.refresh(evaluation)
    return _detail(db, evaluation)


@router.post("/{evaluation_id}/close", response_model=EvaluationDetailOut)
def close(evaluation_id: int, user: TeacherUser, db: DbSession) -> EvaluationDetailOut:
    evaluation = get_evaluation(db, evaluation_id, user)
    require_status(evaluation, EvaluationStatus.RUNNING)
    freeze(db, evaluation, reason="manuelle")
    db.refresh(evaluation)
    return _detail(db, evaluation)


@router.get("/{evaluation_id}/session", response_model=SessionMonitorOut)
def monitor(evaluation_id: int, user: TeacherUser, db: DbSession) -> SessionMonitorOut:
    evaluation = close_if_expired(db, get_evaluation(db, evaluation_id, user))
    rows = db.execute(
        select(Participation, User)
        .join(User, User.id == Participation.student_id)
        .where(Participation.evaluation_id == evaluation_id)
        .order_by(User.full_name)
    ).all()
    from ..models import Submission

    done = dict(
        db.execute(
            select(Submission.participation_id, func.count(Submission.id))
            .join(Participation, Participation.id == Submission.participation_id)
            .where(Participation.evaluation_id == evaluation_id, Submission.code != "")
            .group_by(Submission.participation_id)
        ).all()
    )
    now = utcnow()
    participants, connected, submitted, last_save = [], 0, 0, None
    for participation, student in rows:
        is_connected = bool(
            participation.last_seen_at
            and (now - participation.last_seen_at).total_seconds() < 60
            and evaluation.status is EvaluationStatus.RUNNING
        )
        connected += is_connected
        submitted += participation.submitted_at is not None
        if participation.last_saved_at and (last_save is None or participation.last_saved_at > last_save):
            last_save = participation.last_saved_at
        participants.append(
            SessionParticipant(
                participation_id=participation.id,
                student_id=student.id,
                full_name=student.full_name,
                matricule=student.matricule,
                connected=is_connected,
                exercises_done=done.get(participation.id, 0),
                last_saved_at=participation.last_saved_at,
                submitted_at=participation.submitted_at,
                incidents=participation.incidents or 0,
            )
        )
    return SessionMonitorOut(
        status=evaluation.status,
        ends_at=evaluation.ends_at,
        seconds_left=seconds_left(evaluation) if evaluation.status is EvaluationStatus.RUNNING else None,
        connected=connected,
        submitted=submitted,
        total=len(participants),
        last_save=last_save,
        incidents=sum(p.incidents for p in participants),
        participants=participants,
    )


@router.get("/{evaluation_id}/incidents", response_model=list[IncidentOut])
def incidents(
    evaluation_id: int, user: TeacherUser, db: DbSession, limit: int = Query(50, ge=1, le=200)
) -> list[IncidentOut]:
    """Journal des sorties d'épreuve détectées (aide à la décision, pas une preuve)."""
    get_evaluation(db, evaluation_id, user)
    names = dict(
        db.execute(
            select(Participation.id, User.full_name)
            .join(User, User.id == Participation.student_id)
            .where(Participation.evaluation_id == evaluation_id)
        ).all()
    )
    rows = db.scalars(
        select(AuditLog)
        .where(
            AuditLog.organization_id == user.organization_id,
            AuditLog.action == "integrity.incident",
            AuditLog.target_type == "participation",
            AuditLog.target_id.in_(names.keys() or [0]),
        )
        .order_by(AuditLog.created_at.desc())
        .limit(limit)
    )
    return [
        IncidentOut(
            participation_id=row.target_id,
            full_name=names.get(row.target_id, ""),
            type=(row.meta or {}).get("type", "inconnu"),
            created_at=row.created_at,
        )
        for row in rows
    ]
