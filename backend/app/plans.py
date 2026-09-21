"""Offres et quotas.

Un enseignant inscrit seul démarre sur l'offre gratuite, bornée à deux classes.
Les établissements existants restent sans limite.
"""

from __future__ import annotations

import secrets

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .models import Classroom, Organization, Plan

FREE_LIMITS = {"classrooms": 2}

# Sans 0/O ni 1/I/L : le code se lit au tableau et se recopie à la main.
_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"


def new_code(length: int = 8) -> str:
    return "".join(secrets.choice(_CODE_ALPHABET) for _ in range(length))


def normalize_code(value: str) -> str:
    """« algo-7k2p » et « ALGO 7K2P » désignent le même code."""
    return "".join(c for c in value.upper() if c.isalnum())


def limits(org: Organization) -> dict | None:
    """Les bornes de l'offre. Nul : aucune limite."""
    return None if org.plan == Plan.PRO.value else dict(FREE_LIMITS)


def classrooms_count(db: Session, org_id: int) -> int:
    return db.scalar(select(func.count(Classroom.id)).where(Classroom.organization_id == org_id)) or 0


def usage(db: Session, org: Organization) -> dict:
    return {"classrooms": classrooms_count(db, org.id)}


def check_classroom_quota(db: Session, org: Organization) -> None:
    bounds = limits(org)
    if bounds and classrooms_count(db, org.id) >= bounds["classrooms"]:
        raise HTTPException(
            status.HTTP_402_PAYMENT_REQUIRED,
            f"L'offre gratuite est limitée à {bounds['classrooms']} classes.",
        )
