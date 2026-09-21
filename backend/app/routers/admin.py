"""Backoffice de l'administration : langages ouverts, supervision, journal."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import func, or_, select

from ..audit import log
from ..deps import AdminUser, DbSession
from ..grading.languages import ALGO, DISCIPLINES, enabled_keys, set_enabled
from ..models import (
    AuditLog,
    Classroom,
    Evaluation,
    EvaluationKind,
    EvaluationStatus,
    Participation,
    Subject,
    User,
)
from ..schemas import (
    AdminEvaluationOut,
    AuditEntryOut,
    DisciplineOut,
    DisciplineToggle,
    Page,
)

router = APIRouter(prefix="/api/admin", tags=["administration"])


def _disciplines(enabled: list[str]) -> list[DisciplineOut]:
    return [
        DisciplineOut(
            key=key,
            label=label,
            kind="algo" if key == ALGO else "code",
            enabled=key in enabled,
        )
        for key, label in DISCIPLINES.items()
    ]


@router.get("/languages", response_model=list[DisciplineOut])
def list_languages(admin: AdminUser, db: DbSession) -> list[DisciplineOut]:
    return _disciplines(enabled_keys(db))


@router.put("/languages/{key}", response_model=list[DisciplineOut])
def toggle_language(
    key: str, payload: DisciplineToggle, admin: AdminUser, db: DbSession
) -> list[DisciplineOut]:
    """Ouvre ou ferme un langage pour tous les enseignants. Le fermer ne touche
    pas aux épreuves existantes : il empêche seulement d'en créer de nouvelles."""
    if key not in DISCIPLINES:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Langage inconnu")
    enabled = set_enabled(db, key, payload.enabled)
    log(db, admin, admin.organization_id,
        "language.enabled" if payload.enabled else "language.disabled", "language", None,
        language=key)
    db.commit()
    return _disciplines(enabled)


@router.get("/evaluations", response_model=Page)
def list_evaluations(
    admin: AdminUser,
    db: DbSession,
    status: EvaluationStatus | None = None,
    kind: EvaluationKind | None = None,
    teacher_id: int | None = None,
    classroom_id: int | None = None,
    q: str | None = Query(default=None, max_length=100),
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=100),
) -> Page:
    """Toutes les épreuves de l'établissement, en lecture : l'administration
    supervise, elle ne conçoit ni ne corrige."""
    filters = [
        Evaluation.organization_id == admin.organization_id,
        Evaluation.is_template.is_(False),
    ]
    if status is not None:
        filters.append(Evaluation.status == status)
    if kind is not None:
        filters.append(Evaluation.kind == kind)
    if teacher_id is not None:
        filters.append(Evaluation.teacher_id == teacher_id)
    if classroom_id is not None:
        filters.append(Evaluation.classroom_id == classroom_id)
    if q:
        filters.append(func.lower(Evaluation.title).like(f"%{q.lower()}%"))

    total = db.scalar(select(func.count(Evaluation.id)).where(*filters)) or 0
    participants = (
        select(Participation.evaluation_id, func.count(Participation.id).label("n"))
        .group_by(Participation.evaluation_id)
        .subquery()
    )
    rows = db.execute(
        select(
            Evaluation,
            User.full_name,
            Classroom.name,
            Subject.name,
            func.coalesce(participants.c.n, 0),
        )
        .join(User, User.id == Evaluation.teacher_id)
        .outerjoin(Classroom, Classroom.id == Evaluation.classroom_id)
        .outerjoin(Subject, Subject.id == Evaluation.subject_id)
        .outerjoin(participants, participants.c.evaluation_id == Evaluation.id)
        .where(*filters)
        .order_by(Evaluation.scheduled_start.desc().nullslast(), Evaluation.id.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    items = [
        AdminEvaluationOut(
            id=ev.id,
            title=ev.title,
            kind=ev.kind,
            status=ev.status,
            teacher_name=teacher,
            classroom_name=classroom,
            subject_name=subject,
            scheduled_start=ev.scheduled_start,
            duration_minutes=ev.duration_minutes,
            participants_count=count,
            created_at=ev.created_at,
        ).model_dump(mode="json")
        for ev, teacher, classroom, subject, count in rows
    ]
    return Page(items=items, total=total, page=page, page_size=page_size)


@router.get("/audit", response_model=Page)
def audit_log(
    admin: AdminUser,
    db: DbSession,
    action: str | None = Query(default=None, max_length=200),
    actor_id: int | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
) -> Page:
    filters = [AuditLog.organization_id == admin.organization_id]
    if action:
        # « user » couvre user.created, user.updated… ; « user.created » est
        # exact ; « session,integrity » réunit deux familles.
        conditions = [
            AuditLog.action == part if "." in part else AuditLog.action.like(f"{part}.%")
            for part in (p.strip() for p in action.split(","))
            if part
        ]
        if conditions:
            filters.append(or_(*conditions))
    if actor_id is not None:
        filters.append(AuditLog.actor_id == actor_id)
    total = db.scalar(select(func.count(AuditLog.id)).where(*filters)) or 0
    rows = db.execute(
        select(AuditLog, User.full_name)
        .outerjoin(User, User.id == AuditLog.actor_id)
        .where(*filters)
        .order_by(AuditLog.created_at.desc(), AuditLog.id.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    items = [
        AuditEntryOut(
            id=entry.id,
            action=entry.action,
            target_type=entry.target_type,
            target_id=entry.target_id,
            actor_id=entry.actor_id,
            actor_name=name,
            meta=entry.meta or {},
            created_at=entry.created_at,
        ).model_dump(mode="json")
        for entry, name in rows
    ]
    return Page(items=items, total=total, page=page, page_size=page_size)
