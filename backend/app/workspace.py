"""Espace personnel d'un enseignant inscrit seul."""

from __future__ import annotations

import secrets

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .models import Organization, OrganizationKind, Plan, User
from .plans import new_code


def email_taken(db: Session, email: str) -> bool:
    """La connexion retrouve le compte par son seul e-mail : il est unique sur
    toute la plateforme."""
    return db.scalar(select(User.id).where(func.lower(User.email) == email.lower())) is not None


def unique_code(db: Session, column, length: int = 8) -> str:
    """Un code libre dans la colonne donnée (collision improbable, mais vérifiée)."""
    while True:
        code = new_code(length)
        if db.scalar(select(func.count()).where(column == code)) == 0:
            return code


def create_personal_space(db: Session, owner_name: str) -> Organization:
    org = Organization(
        name=f"Espace de {owner_name}"[:160],
        slug=f"perso-{secrets.token_hex(5)}",
        settings={},
        kind=OrganizationKind.PERSONAL.value,
        plan=Plan.FREE.value,
    )
    db.add(org)
    db.flush()
    return org
