"""Banque d'exercices : création, réutilisation et partage entre enseignants.

Un exercice de la banque est indépendant des évaluations. L'importer dans une
évaluation en produit une copie : modifier la banque ensuite ne touche ni une
évaluation en cours, ni une production déjà corrigée.

« Ma banque » réunit les exercices de l'enseignant et ses sujets (les modèles
d'épreuve) ; leur partage passe par la communauté (voir `sharing`).
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import func, or_, select
from sqlalchemy.orm import selectinload

from ..db import soft_delete
from ..audit import log
from ..deps import DbSession, TeacherUser
from ..grading.matching import SALT_KEY, ensure_salt as ensure_matching_salt
from ..models import BankExercise, BankTestCase, Evaluation, Exercise, Subject, User
from ..schemas import BankExerciseIn, BankExerciseOut, Page
from ..sharing import BANK_EXERCISE, TEMPLATE, drop_shares, refresh_shares, share_states

router = APIRouter(prefix="/api/bank/exercises", tags=["banque d'exercices"])
library = APIRouter(prefix="/api/bank", tags=["banque d'exercices"])


def _visible(user: User):
    """Ses propres exercices, plus ceux partagés dans l'établissement."""
    return (
        BankExercise.organization_id == user.organization_id,
        or_(BankExercise.author_id == user.id, BankExercise.is_shared.is_(True)),
    )


def _out(db, exercise: BankExercise, share: str | None = None) -> BankExerciseOut:
    author = db.get(User, exercise.author_id)
    subject = db.get(Subject, exercise.subject_id) if exercise.subject_id else None
    if share is None:
        share = share_states(db, BANK_EXERCISE, [exercise.id]).get(exercise.id, "none")
    return BankExerciseOut(
        **{
            **BankExerciseOut.model_validate(exercise).model_dump(
                exclude={"author_name", "subject_name", "share"}
            ),
            "author_name": author.full_name if author else None,
            "subject_name": subject.name if subject else None,
            "share": share,
        }
    )


def _load(db, exercise_id: int, user: User, *, for_write: bool = False) -> BankExercise:
    exercise = db.scalar(
        select(BankExercise)
        .where(BankExercise.id == exercise_id, *_visible(user))
        .options(selectinload(BankExercise.tests))
    )
    if exercise is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Exercice introuvable")
    if for_write and exercise.author_id != user.id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Exercice appartenant à un autre enseignant")
    return exercise


@router.get("", response_model=Page)
def list_exercises(
    user: TeacherUser,
    db: DbSession,
    q: str | None = Query(default=None, max_length=120),
    language: str | None = None,
    subject_id: int | None = None,
    kind: str | None = Query(default=None, max_length=20),
    scope: str = Query("all", pattern="^(all|mine|shared)$"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
) -> Page:
    filters = list(_visible(user))
    if scope == "mine":
        filters.append(BankExercise.author_id == user.id)
    elif scope == "shared":
        filters.append(BankExercise.is_shared.is_(True))
    if language:
        filters.append(BankExercise.language == language)
    if subject_id:
        filters.append(BankExercise.subject_id == subject_id)
    if kind:
        filters.append(BankExercise.kind == kind)
    if q:
        pattern = f"%{q.lower()}%"
        filters.append(
            or_(
                func.lower(BankExercise.title).like(pattern),
                func.lower(BankExercise.statement).like(pattern),
            )
        )

    total = db.scalar(select(func.count(BankExercise.id)).where(*filters)) or 0
    rows = list(db.scalars(
        select(BankExercise)
        .where(*filters)
        .options(selectinload(BankExercise.tests))
        .order_by(BankExercise.updated_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    ))
    shares = share_states(db, BANK_EXERCISE, [e.id for e in rows])
    return Page(
        items=[_out(db, e, shares.get(e.id, "none")).model_dump() for e in rows],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.post("", response_model=BankExerciseOut, status_code=status.HTTP_201_CREATED)
def create_exercise(payload: BankExerciseIn, user: TeacherUser, db: DbSession) -> BankExerciseOut:
    data = payload.model_dump(exclude={"tests"})
    if data["kind"] == "matching":
        data["settings"] = ensure_matching_salt(dict(data["settings"]))
    exercise = BankExercise(
        organization_id=user.organization_id,
        author_id=user.id,
        **data,
    )
    db.add(exercise)
    db.flush()
    _sync_tests(db, exercise, payload.tests)
    log(db, user, user.organization_id, "bank.created", "bank_exercise", exercise.id,
        title=payload.title)
    db.commit()
    db.refresh(exercise)
    return _out(db, exercise)


@router.get("/{exercise_id}", response_model=BankExerciseOut)
def get_exercise(exercise_id: int, user: TeacherUser, db: DbSession) -> BankExerciseOut:
    return _out(db, _load(db, exercise_id, user))


@router.put("/{exercise_id}", response_model=BankExerciseOut)
def update_exercise(
    exercise_id: int, payload: BankExerciseIn, user: TeacherUser, db: DbSession
) -> BankExerciseOut:
    exercise = _load(db, exercise_id, user, for_write=True)
    data = payload.model_dump(exclude={"tests"})
    if data["kind"] == "matching":
        kept = (exercise.settings or {}).get(SALT_KEY)
        settings = dict(data["settings"])
        if kept:
            settings[SALT_KEY] = kept
        data["settings"] = ensure_matching_salt(settings)
    for field, value in data.items():
        setattr(exercise, field, value)
    _sync_tests(db, exercise, payload.tests)
    # Les jeux de tests viennent d'être réécrits : on les relit avant d'en
    # actualiser le partage.
    db.expire(exercise, ["tests"])
    refresh_shares(db, BANK_EXERCISE, exercise)
    log(db, user, user.organization_id, "bank.updated", "bank_exercise", exercise.id)
    db.commit()
    db.refresh(exercise)
    return _out(db, exercise)


@router.delete("/{exercise_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_exercise(exercise_id: int, user: TeacherUser, db: DbSession) -> None:
    exercise = _load(db, exercise_id, user, for_write=True)
    soft_delete(exercise)
    drop_shares(db, BANK_EXERCISE, exercise_id)
    log(db, user, user.organization_id, "bank.deleted", "bank_exercise", exercise_id)
    db.commit()


@router.post("/{exercise_id}/used", response_model=BankExerciseOut)
def mark_used(exercise_id: int, user: TeacherUser, db: DbSession) -> BankExerciseOut:
    """Comptabilise une réutilisation dans une évaluation."""
    exercise = _load(db, exercise_id, user)
    exercise.uses = (exercise.uses or 0) + 1
    db.commit()
    db.refresh(exercise)
    return _out(db, exercise)


def _sync_tests(db, exercise: BankExercise, items) -> None:
    for test in list(exercise.tests):
        db.delete(test)
    db.flush()
    for position, item in enumerate(items, start=1):
        db.add(
            BankTestCase(
                bank_exercise_id=exercise.id,
                position=position,
                **item.model_dump(exclude={"id"}),
            )
        )
    db.flush()


# ----- Ma banque -----
@library.get("/library", response_model=Page)
def my_library(
    user: TeacherUser,
    db: DbSession,
    q: str | None = Query(default=None, max_length=120),
    # Type d'exercice (« qcm », « algo »…), ou « subject » pour les sujets seuls.
    kind: str | None = Query(default=None, max_length=20),
    page: int = Query(1, ge=1),
    page_size: int = Query(30, ge=1, le=100),
) -> Page:
    """Ma banque : ses exercices et ses sujets, les derniers retouchés d'abord.

    Un exercice arrive complet (énoncé, réglages, jeux de tests) : l'aperçu
    s'affiche sans autre requête. Un sujet donne son résumé ; son contenu se lit
    comme celui de toute épreuve."""
    pattern = f"%{q.lower()}%" if q else None
    entries: list[tuple[str, int, object]] = []
    if kind != "subject":
        filters = [
            BankExercise.organization_id == user.organization_id,
            BankExercise.author_id == user.id,
            BankExercise.deleted_at.is_(None),
        ]
        if kind:
            filters.append(BankExercise.kind == kind)
        if pattern:
            filters.append(or_(
                func.lower(BankExercise.title).like(pattern),
                func.lower(BankExercise.statement).like(pattern),
            ))
        entries += [
            ("exercise", id_, date)
            for id_, date in db.execute(
                select(BankExercise.id, BankExercise.updated_at).where(*filters)
            )
        ]
    if not kind or kind == "subject":
        filters = [
            Evaluation.teacher_id == user.id,
            Evaluation.is_template.is_(True),
            Evaluation.deleted_at.is_(None),
        ]
        if pattern:
            filters.append(or_(
                func.lower(Evaluation.title).like(pattern),
                func.lower(Evaluation.description).like(pattern),
            ))
        entries += [
            ("subject", id_, date)
            for id_, date in db.execute(
                select(Evaluation.id, Evaluation.created_at).where(*filters)
            )
        ]
    entries.sort(key=lambda entry: (entry[2], entry[1]), reverse=True)
    window = entries[(page - 1) * page_size : page * page_size]

    exercise_ids = [id_ for source, id_, _ in window if source == "exercise"]
    template_ids = [id_ for source, id_, _ in window if source == "subject"]
    exercises = {
        e.id: e
        for e in db.scalars(
            select(BankExercise)
            .where(BankExercise.id.in_(exercise_ids))
            .options(selectinload(BankExercise.tests))
        )
    } if exercise_ids else {}
    templates = {
        t.id: t for t in db.scalars(select(Evaluation).where(Evaluation.id.in_(template_ids)))
    } if template_ids else {}
    counts = dict(
        db.execute(
            select(Exercise.evaluation_id, func.count(Exercise.id))
            .where(Exercise.evaluation_id.in_(template_ids), Exercise.deleted_at.is_(None))
            .group_by(Exercise.evaluation_id)
        ).all()
    ) if template_ids else {}
    exercise_shares = share_states(db, BANK_EXERCISE, exercise_ids)
    template_shares = share_states(db, TEMPLATE, template_ids)

    items = []
    for source, id_, _ in window:
        if source == "exercise":
            exercise = exercises[id_]
            items.append({
                **_out(db, exercise, exercise_shares.get(id_, "none")).model_dump(),
                "source": "exercise",
            })
        else:
            template = templates[id_]
            subject = db.get(Subject, template.subject_id) if template.subject_id else None
            items.append({
                "source": "subject",
                "id": template.id,
                "title": template.title,
                "evaluation_kind": template.kind.value,
                "language": template.language,
                "subject_name": subject.name if subject else None,
                "duration_minutes": template.duration_minutes,
                "total_points": template.total_points,
                "exercises_count": counts.get(id_, 0),
                "created_at": template.created_at,
                "share": template_shares.get(id_, "none"),
            })
    return Page(items=items, total=len(entries), page=page, page_size=page_size)
