"""Communauté : exercices et sujets complets partagés entre tous les établissements.

Enseignants et administrateurs y publient ce qu'ils ont déjà fait (un exercice
de la banque, une épreuve donnée ou mise en modèle). Un enseignant en tire une
copie : dans sa banque (exercice ou modèle d'épreuve), ou directement en
évaluation brouillon. Publier et récupérer passent toujours par une copie : ni
l'original ni les copies déjà tirées ne se touchent entre eux.
"""

from __future__ import annotations

import json
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import String, cast, func, or_, select
from sqlalchemy.orm import selectinload

from ..audit import log
from ..deps import DbSession, TeacherUser, require_roles
from ..grading.matching import SALT_KEY, ensure_salt as ensure_matching_salt
from ..models import (
    BankExercise,
    BankTestCase,
    CommunityItem,
    Evaluation,
    EvaluationKind,
    EvaluationStatus,
    Exercise,
    Organization,
    Role,
    Subject,
    TestCase,
    TestKind,
    User,
)
from ..schemas import CommunityItemOut, CommunityPublishIn, CommunityUseIn, Page
from .evaluations import _check_refs

router = APIRouter(prefix="/api/community", tags=["communauté"])

MemberUser = Annotated[User, Depends(require_roles(Role.TEACHER, Role.ADMIN))]

_TEST_FIELDS = (
    "name", "stdin", "expected_stdout", "comparison", "points", "timeout_ms",
    "target_id", "expected_type",
)
_EXERCISE_FIELDS = ("title", "statement", "language", "points", "starter_code", "kind")


# ----- Instantanés -----
def _snapshot_exercise(exercise: Exercise | BankExercise) -> dict:
    # Le sel d'une correspondance appartient à l'exercice où il a été tiré.
    settings = {k: v for k, v in (exercise.settings or {}).items() if k != SALT_KEY}
    return {
        **{field: getattr(exercise, field) for field in _EXERCISE_FIELDS},
        "settings": settings,
        "tests": [
            {
                **{field: getattr(test, field) for field in _TEST_FIELDS},
                "kind": test.kind.value,
                "input_types": list(test.input_types or []),
                "args": list(test.args or []),
            }
            for test in exercise.tests
        ],
    }


def _test_values(data: dict) -> dict:
    values = {field: data.get(field) for field in _TEST_FIELDS if field in data}
    values["kind"] = TestKind(data.get("kind", TestKind.OFFICIAL.value))
    values["input_types"] = list(data.get("input_types") or [])
    values["args"] = list(data.get("args") or [])
    return values


def _exercise_values(data: dict) -> dict:
    return {field: data[field] for field in _EXERCISE_FIELDS if field in data} | {
        "settings": dict(data.get("settings") or {}),
    }


def _subject_for(db, user: User, name: str | None) -> int | None:
    """Retrouve la matière du même nom dans l'établissement de l'utilisateur."""
    if not name:
        return None
    return db.scalar(
        select(Subject.id).where(
            Subject.organization_id == user.organization_id,
            func.lower(Subject.name) == name.lower(),
        )
    )


def _subject_name(db, subject_id: int | None) -> str | None:
    subject = db.get(Subject, subject_id) if subject_id else None
    return subject.name if subject else None


# ----- Lecture -----
def _can_delete(item: CommunityItem, user: User) -> bool:
    return item.author_id == user.id or (
        user.role is Role.ADMIN and item.organization_id == user.organization_id
    )


def _out(db, item: CommunityItem, user: User, *, with_content: bool = False) -> CommunityItemOut:
    author = db.get(User, item.author_id)
    organization = db.get(Organization, item.organization_id)
    return CommunityItemOut(
        id=item.id,
        item_type=item.item_type,
        title=item.title,
        description=item.description,
        language=item.language,
        subject_name=item.subject_name,
        tags=list(item.tags or []),
        exercises_count=item.exercises_count,
        total_points=item.total_points,
        uses=item.uses,
        created_at=item.created_at,
        author_id=item.author_id,
        author_name=author.full_name if author else None,
        organization_name=organization.name if organization else None,
        can_delete=_can_delete(item, user),
        exercise_kind=(item.content or {}).get("exercise", {}).get("kind")
        if item.item_type == "exercise"
        else None,
        content=item.content if with_content else None,
    )


def _load(db, item_id: int) -> CommunityItem:
    item = db.get(CommunityItem, item_id)
    if item is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Publication introuvable")
    return item


@router.get("", response_model=Page)
def list_items(
    user: MemberUser,
    db: DbSession,
    q: str | None = Query(default=None, max_length=120),
    item_type: str | None = Query(default=None, pattern="^(exercise|subject)$"),
    language: str | None = None,
    scope: str = Query("all", pattern="^(all|mine|organization)$"),
    sort: str = Query("recent", pattern="^(recent|popular)$"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
) -> Page:
    filters = []
    if item_type:
        filters.append(CommunityItem.item_type == item_type)
    if language:
        filters.append(CommunityItem.language == language)
    if scope == "mine":
        filters.append(CommunityItem.author_id == user.id)
    elif scope == "organization":
        filters.append(CommunityItem.organization_id == user.organization_id)
    if q:
        pattern = f"%{q.lower()}%"
        filters.append(
            or_(
                func.lower(CommunityItem.title).like(pattern),
                func.lower(CommunityItem.description).like(pattern),
                func.lower(CommunityItem.subject_name).like(pattern),
                # Les mots-clés sont stockés en JSON : un accent y est échappé.
                func.lower(cast(CommunityItem.tags, String)).like(pattern),
                func.lower(cast(CommunityItem.tags, String)).like(
                    f"%{json.dumps(q.lower())[1:-1]}%"
                ),
            )
        )
    total = db.scalar(select(func.count(CommunityItem.id)).where(*filters)) or 0
    rows = db.scalars(
        select(CommunityItem)
        .where(*filters)
        .order_by(
            *((CommunityItem.uses.desc(),) if sort == "popular" else ()),
            CommunityItem.created_at.desc(),
            CommunityItem.id.desc(),
        )
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    return Page(
        items=[_out(db, item, user).model_dump() for item in rows],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get("/sources")
def publishable_sources(user: MemberUser, db: DbSession) -> dict:
    """Ce que l'utilisateur peut publier : ce qu'il a rangé dans la banque
    d'exercices et dans la banque d'évaluations (les modèles), tout
    l'établissement pour l'administration. Une épreuve en cours d'usage ne se
    publie pas directement : on la met d'abord en banque."""
    bank_filters = [BankExercise.organization_id == user.organization_id]
    eval_filters = [
        Evaluation.organization_id == user.organization_id,
        Evaluation.is_template.is_(True),
    ]
    if user.role is Role.TEACHER:
        bank_filters.append(BankExercise.author_id == user.id)
        eval_filters.append(Evaluation.teacher_id == user.id)

    exercises = db.scalars(
        select(BankExercise).where(*bank_filters).order_by(BankExercise.updated_at.desc())
    )
    evaluations = list(
        db.scalars(select(Evaluation).where(*eval_filters).order_by(Evaluation.created_at.desc()))
    )
    counts = {}
    if evaluations:
        counts = dict(
            db.execute(
                select(Exercise.evaluation_id, func.count(Exercise.id))
                .where(Exercise.evaluation_id.in_([e.id for e in evaluations]))
                .group_by(Exercise.evaluation_id)
            ).all()
        )
    return {
        "exercises": [
            {"id": e.id, "title": e.title, "kind": e.kind, "language": e.language}
            for e in exercises
        ],
        "evaluations": [
            {
                "id": e.id,
                "title": e.title,
                "kind": e.kind.value,
                "exercises_count": counts.get(e.id, 0),
            }
            for e in evaluations
            if counts.get(e.id, 0) > 0
        ],
    }


@router.get("/{item_id}", response_model=CommunityItemOut)
def get_item(item_id: int, user: MemberUser, db: DbSession) -> CommunityItemOut:
    return _out(db, _load(db, item_id), user, with_content=True)


# ----- Publication -----
@router.post("", response_model=CommunityItemOut, status_code=status.HTTP_201_CREATED)
def publish(payload: CommunityPublishIn, user: MemberUser, db: DbSession) -> CommunityItemOut:
    if payload.source_type == "bank_exercise":
        source = db.scalar(
            select(BankExercise)
            .where(
                BankExercise.id == payload.source_id,
                BankExercise.organization_id == user.organization_id,
            )
            .options(selectinload(BankExercise.tests))
        )
        if source is None or (user.role is Role.TEACHER and source.author_id != user.id):
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Exercice introuvable")
        item = CommunityItem(
            item_type="exercise",
            title=payload.title or source.title,
            language=source.language,
            subject_name=_subject_name(db, source.subject_id),
            tags=payload.tags or list(source.tags or []),
            content={"exercise": _snapshot_exercise(source)},
            exercises_count=1,
            total_points=source.points,
        )
    else:
        source = db.get(Evaluation, payload.source_id)
        if (
            source is None
            or source.organization_id != user.organization_id
            or not source.is_template
            or (user.role is Role.TEACHER and source.teacher_id != user.id)
        ):
            raise HTTPException(
                status.HTTP_404_NOT_FOUND, "Évaluation introuvable dans la banque d'évaluations"
            )
        exercises = list(
            db.scalars(
                select(Exercise)
                .where(Exercise.evaluation_id == source.id)
                .options(selectinload(Exercise.tests))
                .order_by(Exercise.position)
            )
        )
        if not exercises:
            raise HTTPException(
                status.HTTP_422_UNPROCESSABLE_ENTITY, "Cette évaluation ne contient aucun exercice"
            )
        item = CommunityItem(
            item_type="subject",
            title=payload.title or source.title,
            language=source.language,
            subject_name=_subject_name(db, source.subject_id),
            tags=payload.tags,
            content={
                "evaluation": {
                    "kind": source.kind.value,
                    "description": source.description,
                    "instructions": source.instructions,
                    "language": source.language,
                    "duration_minutes": source.duration_minutes,
                    "total_points": source.total_points,
                    "rules": dict(source.rules or {}),
                },
                "exercises": [_snapshot_exercise(e) for e in exercises],
            },
            exercises_count=len(exercises),
            total_points=source.total_points,
        )
    item.organization_id = user.organization_id
    item.author_id = user.id
    item.description = payload.description
    db.add(item)
    db.flush()
    log(db, user, user.organization_id, "community.published", "community_item", item.id,
        title=item.title, item_type=item.item_type)
    db.commit()
    db.refresh(item)
    return _out(db, item, user, with_content=True)


@router.delete("/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
def unpublish(item_id: int, user: MemberUser, db: DbSession) -> None:
    item = _load(db, item_id)
    if not _can_delete(item, user):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Publication d'un autre auteur")
    log(db, user, user.organization_id, "community.removed", "community_item", item.id,
        title=item.title)
    db.delete(item)
    db.commit()


# ----- Récupération -----
def _add_exercise(db, evaluation_id: int, position: int, data: dict) -> None:
    exercise = Exercise(evaluation_id=evaluation_id, position=position, **_exercise_values(data))
    db.add(exercise)
    db.flush()
    for index, test in enumerate(data.get("tests") or [], start=1):
        db.add(TestCase(exercise_id=exercise.id, position=index, **_test_values(test)))


def _new_evaluation(
    db, item: CommunityItem, user: User, *, is_template: bool,
    title: str | None = None, classroom_id: int | None = None,
) -> Evaluation:
    """Une épreuve brouillon (ou un modèle) tirée d'une publication."""
    if item.item_type == "subject":
        meta = item.content.get("evaluation") or {}
        exercises = item.content.get("exercises") or []
    else:
        exercise = item.content.get("exercise") or {}
        meta = {"language": exercise.get("language", item.language),
                "total_points": exercise.get("points") or 20}
        exercises = [exercise]
    evaluation = Evaluation(
        organization_id=user.organization_id,
        teacher_id=user.id,
        subject_id=_subject_for(db, user, item.subject_name),
        classroom_id=classroom_id,
        title=title or item.title,
        kind=EvaluationKind(meta.get("kind", EvaluationKind.DEVOIR.value)),
        description=meta.get("description", item.description),
        instructions=meta.get("instructions", ""),
        language=meta.get("language", item.language),
        duration_minutes=meta.get("duration_minutes", 90),
        total_points=meta.get("total_points") or 20,
        rules=dict(meta.get("rules") or {}),
        status=EvaluationStatus.DRAFT,
        is_template=is_template,
    )
    db.add(evaluation)
    db.flush()
    for position, data in enumerate(exercises, start=1):
        _add_exercise(db, evaluation.id, position, data)
    return evaluation


@router.post("/{item_id}/to-bank", status_code=status.HTTP_201_CREATED)
def add_to_bank(item_id: int, user: TeacherUser, db: DbSession) -> dict:
    """Un exercice rejoint la banque d'exercices ; un sujet, la banque
    d'évaluations (comme modèle)."""
    item = _load(db, item_id)
    if item.item_type == "subject":
        template = _new_evaluation(db, item, user, is_template=True)
        target = {"target": "template", "id": template.id}
    else:
        data = item.content.get("exercise") or {}
        values = _exercise_values(data)
        if values.get("kind") == "matching":
            values["settings"] = ensure_matching_salt(values["settings"])
        exercise = BankExercise(
            organization_id=user.organization_id,
            author_id=user.id,
            subject_id=_subject_for(db, user, item.subject_name),
            tags=list(item.tags or []),
            **values,
        )
        db.add(exercise)
        db.flush()
        for position, test in enumerate(data.get("tests") or [], start=1):
            db.add(BankTestCase(bank_exercise_id=exercise.id, position=position,
                                **_test_values(test)))
        target = {"target": "bank_exercise", "id": exercise.id}
    item.uses = (item.uses or 0) + 1
    log(db, user, user.organization_id, "community.saved", "community_item", item.id,
        title=item.title, **target)
    db.commit()
    return target


@router.post("/{item_id}/use", status_code=status.HTTP_201_CREATED)
def use_item(item_id: int, payload: CommunityUseIn, user: TeacherUser, db: DbSession) -> dict:
    """Tirer directement une évaluation brouillon d'une publication."""
    item = _load(db, item_id)
    _check_refs(db, user, payload.classroom_id, None)
    evaluation = _new_evaluation(
        db, item, user, is_template=False, title=payload.title, classroom_id=payload.classroom_id
    )
    item.uses = (item.uses or 0) + 1
    log(db, user, user.organization_id, "community.used", "community_item", item.id,
        title=item.title, evaluation_id=evaluation.id)
    db.commit()
    return {"evaluation_id": evaluation.id}
