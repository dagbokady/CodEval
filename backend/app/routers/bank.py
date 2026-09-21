"""Banque d'exercices : création, réutilisation et partage entre enseignants.

Un exercice de la banque est indépendant des évaluations. L'importer dans une
évaluation en produit une copie : modifier la banque ensuite ne touche ni une
évaluation en cours, ni une production déjà corrigée.
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import func, or_, select
from sqlalchemy.orm import selectinload

from ..db import soft_delete
from ..audit import log
from ..deps import DbSession, TeacherUser
from ..grading.matching import SALT_KEY, ensure_salt as ensure_matching_salt
from ..models import BankExercise, BankTestCase, Subject, User
from ..schemas import BankExerciseIn, BankExerciseOut, Page

router = APIRouter(prefix="/api/bank/exercises", tags=["banque d'exercices"])


def _visible(user: User):
    """Ses propres exercices, plus ceux partagés dans l'établissement."""
    return (
        BankExercise.organization_id == user.organization_id,
        or_(BankExercise.author_id == user.id, BankExercise.is_shared.is_(True)),
    )


def _out(db, exercise: BankExercise) -> BankExerciseOut:
    author = db.get(User, exercise.author_id)
    subject = db.get(Subject, exercise.subject_id) if exercise.subject_id else None
    return BankExerciseOut(
        **{
            **BankExerciseOut.model_validate(exercise).model_dump(
                exclude={"author_name", "subject_name"}
            ),
            "author_name": author.full_name if author else None,
            "subject_name": subject.name if subject else None,
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
    rows = db.scalars(
        select(BankExercise)
        .where(*filters)
        .options(selectinload(BankExercise.tests))
        .order_by(BankExercise.updated_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    return Page(
        items=[_out(db, e).model_dump() for e in rows],
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
    log(db, user, user.organization_id, "bank.updated", "bank_exercise", exercise.id)
    db.commit()
    db.refresh(exercise)
    return _out(db, exercise)


@router.delete("/{exercise_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_exercise(exercise_id: int, user: TeacherUser, db: DbSession) -> None:
    exercise = _load(db, exercise_id, user, for_write=True)
    soft_delete(exercise)
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
