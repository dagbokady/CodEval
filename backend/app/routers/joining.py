"""Entrée des apprenants dans une classe par son code d'accès.

Un apprenant ne s'inscrit jamais seul sur la plateforme : il entre par le code
que son enseignant lui donne. La première fois, le code crée son compte ; il
se connecte ensuite normalement. Un apprenant déjà inscrit s'en sert pour
rejoindre une autre classe du même établissement.
"""

from __future__ import annotations

from datetime import timedelta

from fastapi import APIRouter, HTTPException, Request, status
from sqlalchemy import select

from ..audit import log
from ..config import settings
from ..deps import CurrentUser, DbSession, StudentUser
from ..models import Classroom, Enrollment, Organization, Role, User, utcnow
from ..plans import normalize_code
from ..rate_limit import limiter
from ..schemas import (
    ClassroomOut,
    JoinClassPayload,
    JoinClassPreview,
    JoinClassSignup,
    JoinCodeOut,
    JoinCodePayload,
    JoinLinkOut,
    JoinLinkPayload,
    TokenOut,
)
from ..security import create_join_token, decode_join_token, hash_password
from ..workspace import email_taken, unique_code
from .auth import client_ip, token_out

router = APIRouter(prefix="/api", tags=["inscription des apprenants"])

# Douze caractères, lus par groupes de quatre : 9E5G-97CJ-34DD.
JOIN_CODE_LENGTH = 12


def _staff_classroom(db, user: User, classroom_id: int) -> Classroom:
    """L'administration et les enseignants de l'établissement gèrent le code."""
    if user.role is Role.STUDENT:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Accès non autorisé pour ce rôle")
    classroom = db.get(Classroom, classroom_id)
    if classroom is None or classroom.organization_id != user.organization_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Classe introuvable")
    return classroom


def _classroom_by_code(db, request: Request, code: str) -> Classroom:
    """Classe désignée par un code ouvert. Les essais ratés comptent comme des
    échecs de connexion : on ne devine pas un code à force d'essais."""
    key = f"{client_ip(request)}:join"
    if limiter.is_locked(key):
        raise HTTPException(
            status.HTTP_429_TOO_MANY_REQUESTS,
            f"Trop de tentatives. Réessayez dans {settings.login_lockout_minutes} minutes.",
        )
    classroom = db.scalar(select(Classroom).where(Classroom.join_code == normalize_code(code)))
    expired = (
        classroom is not None
        and classroom.join_code_expires_at is not None
        and classroom.join_code_expires_at <= utcnow()
    )
    if classroom is None or expired:
        limiter.record_failure(key)
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Code de classe inconnu ou expiré")
    return classroom


def _classroom_by_token(db, request: Request, token: str) -> Classroom:
    """Classe désignée par un lien d'invitation. Le lien meurt à son échéance,
    ou dès que le code qu'il porte est changé ou fermé."""
    payload = decode_join_token(token)
    classroom = db.get(Classroom, payload["cls"]) if payload else None
    if classroom is None or classroom.join_code != payload["code"]:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Ce lien d'invitation a expiré")
    return _classroom_by_code(db, request, payload["code"])


def _classroom_for(db, request: Request, payload: JoinClassPayload) -> Classroom:
    if payload.token:
        return _classroom_by_token(db, request, payload.token)
    return _classroom_by_code(db, request, payload.code)


# ----- Côté enseignant : ouvrir, changer, fermer le code -----
@router.post("/classrooms/{classroom_id}/join-code", response_model=JoinCodeOut)
def open_join_code(
    classroom_id: int, payload: JoinCodePayload, user: CurrentUser, db: DbSession
) -> JoinCodeOut:
    """Crée un nouveau code. L'ancien cesse aussitôt de fonctionner ; les
    apprenants déjà inscrits restent dans la classe."""
    classroom = _staff_classroom(db, user, classroom_id)
    classroom.join_code = unique_code(db, Classroom.join_code, JOIN_CODE_LENGTH)
    classroom.join_code_expires_at = (
        utcnow() + timedelta(days=payload.expires_in_days) if payload.expires_in_days else None
    )
    log(db, user, user.organization_id, "classroom.join_code_opened", "classroom", classroom.id,
        expires_in_days=payload.expires_in_days)
    db.commit()
    return JoinCodeOut(
        join_code=classroom.join_code, join_code_expires_at=classroom.join_code_expires_at
    )


@router.post("/classrooms/{classroom_id}/join-link", response_model=JoinLinkOut)
def create_join_link(
    classroom_id: int, payload: JoinLinkPayload, user: CurrentUser, db: DbSession
) -> JoinLinkOut:
    """Un lien d'invitation à durée de vie courte, adossé au code ouvert : il
    n'expire jamais après le code lui-même."""
    classroom = _staff_classroom(db, user, classroom_id)
    now = utcnow()
    if not classroom.join_code or (
        classroom.join_code_expires_at and classroom.join_code_expires_at <= now
    ):
        raise HTTPException(status.HTTP_409_CONFLICT, "Ouvrez d'abord un code d'accès")
    expires_at = now + timedelta(hours=payload.expires_in_hours)
    if classroom.join_code_expires_at:
        expires_at = min(expires_at, classroom.join_code_expires_at)
    log(db, user, user.organization_id, "classroom.join_link_created", "classroom", classroom.id,
        expires_in_hours=payload.expires_in_hours)
    db.commit()
    return JoinLinkOut(
        token=create_join_token(classroom.id, classroom.join_code, expires_at),
        expires_at=expires_at,
    )


@router.delete("/classrooms/{classroom_id}/join-code", status_code=status.HTTP_204_NO_CONTENT)
def close_join_code(classroom_id: int, user: CurrentUser, db: DbSession) -> None:
    classroom = _staff_classroom(db, user, classroom_id)
    classroom.join_code = None
    classroom.join_code_expires_at = None
    log(db, user, user.organization_id, "classroom.join_code_closed", "classroom", classroom.id)
    db.commit()


# ----- Côté apprenant -----
@router.get("/join/link/{token}", response_model=JoinClassPreview)
def preview_link(token: str, request: Request, db: DbSession) -> JoinClassPreview:
    classroom = _classroom_by_token(db, request, token)
    org = db.get(Organization, classroom.organization_id)
    return JoinClassPreview(
        classroom_name=classroom.name, level=classroom.level, organization_name=org.name
    )


@router.get("/join/{code}", response_model=JoinClassPreview)
def preview(code: str, request: Request, db: DbSession) -> JoinClassPreview:
    """Ce que l'apprenant s'apprête à rejoindre, pour qu'il vérifie avant."""
    classroom = _classroom_by_code(db, request, code)
    org = db.get(Organization, classroom.organization_id)
    return JoinClassPreview(
        classroom_name=classroom.name, level=classroom.level, organization_name=org.name
    )


@router.post("/join", response_model=TokenOut, status_code=status.HTTP_201_CREATED)
def join_with_new_account(payload: JoinClassSignup, request: Request, db: DbSession) -> TokenOut:
    classroom = _classroom_for(db, request, payload)
    if email_taken(db, payload.email):
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "Un compte existe déjà avec cet e-mail : connectez-vous, puis rejoignez la classe "
            "depuis votre espace.",
        )
    org = db.get(Organization, classroom.organization_id)
    student = User(
        organization_id=org.id,
        email=payload.email.lower(),
        password_hash=hash_password(payload.password),
        full_name=payload.full_name.strip(),
        role=Role.STUDENT,
        matricule=payload.matricule,
        photo=payload.photo,
        gender=payload.gender,
    )
    db.add(student)
    db.flush()
    db.add(Enrollment(classroom_id=classroom.id, student_id=student.id))
    log(db, student, org.id, "classroom.joined", "classroom", classroom.id, new_account=True)
    db.commit()
    db.refresh(student)
    return token_out(student, org)


@router.post("/me/classrooms/join", response_model=ClassroomOut)
def join_as_student(
    payload: JoinClassPayload, request: Request, user: StudentUser, db: DbSession
) -> ClassroomOut:
    classroom = _classroom_for(db, request, payload)
    if classroom.organization_id != user.organization_id:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "Cette classe appartient à un autre établissement que le vôtre. "
            "Demandez à votre enseignant de vous y inscrire.",
        )
    already = db.scalar(
        select(Enrollment).where(
            Enrollment.classroom_id == classroom.id, Enrollment.student_id == user.id
        )
    )
    if already is None:
        db.add(Enrollment(classroom_id=classroom.id, student_id=user.id))
        log(db, user, user.organization_id, "classroom.joined", "classroom", classroom.id,
            new_account=False)
        db.commit()
    return ClassroomOut(id=classroom.id, name=classroom.name, level=classroom.level)


@router.get("/me/classrooms", response_model=list[ClassroomOut])
def my_classrooms(user: StudentUser, db: DbSession) -> list[ClassroomOut]:
    rows = db.scalars(
        select(Classroom)
        .join(Enrollment, Enrollment.classroom_id == Classroom.id)
        .where(Enrollment.student_id == user.id)
        .order_by(Classroom.name)
    )
    return [ClassroomOut(id=c.id, name=c.name, level=c.level) for c in rows]
