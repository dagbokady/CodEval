"""Suppression d'un compte, par son titulaire ou par l'administration."""

from __future__ import annotations

import secrets

from fastapi import HTTPException, status
from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from .models import (
    ClassroomShare,
    Enrollment,
    Notification,
    PasswordResetToken,
    Role,
    TeacherAssignment,
    User,
    utcnow,
)
from .security import hash_password

DELETED_NAME = "Compte supprimé"


def ensure_not_last_admin(db: Session, user: User) -> None:
    """Un établissement ne reste jamais sans personne pour le gérer."""
    if user.role is not Role.ADMIN:
        return
    others = db.scalar(
        select(func.count(User.id)).where(
            User.organization_id == user.organization_id,
            User.role == Role.ADMIN,
            User.is_active.is_(True),
            User.id != user.id,
        )
    )
    if not others:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "Vous êtes le seul administrateur de l'établissement : nommez-en un autre "
            "avant de supprimer ce compte.",
        )


def delete_account(db: Session, user: User) -> None:
    """Efface ce qui identifie la personne et ferme l'accès.

    La ligne reste : copies, notes, appréciations et épreuves déjà passées
    gardent leur auteur, devenu « Compte supprimé ». L'adresse e-mail est
    libérée : on peut recréer un compte avec elle.
    """
    user.deleted_at = utcnow()
    user.is_active = False
    user.email = f"supprime-{user.id}-{secrets.token_hex(4)}@codeval.invalid"
    user.full_name = DELETED_NAME
    user.matricule = None
    user.photo = None
    user.gender = None
    user.sheet_header = None
    user.password_hash = hash_password(secrets.token_urlsafe(32))

    db.execute(delete(Enrollment).where(Enrollment.student_id == user.id))
    db.execute(delete(TeacherAssignment).where(TeacherAssignment.teacher_id == user.id))
    db.execute(delete(ClassroomShare).where(ClassroomShare.teacher_id == user.id))
    db.execute(delete(PasswordResetToken).where(PasswordResetToken.user_id == user.id))
    db.execute(delete(Notification).where(Notification.user_id == user.id))
