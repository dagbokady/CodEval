from __future__ import annotations

import re

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import func, select

from ..audit import log
from ..deps import CurrentUser, DbSession
from ..models import Organization, Role, User
from ..schemas import LoginPayload, RegisterOrg, TokenOut, UserOut
from ..security import create_access_token, hash_password, verify_password

router = APIRouter(prefix="/api/auth", tags=["auth"])


def _slugify(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")[:60] or "etablissement"


@router.post("/register", response_model=TokenOut, status_code=status.HTTP_201_CREATED)
def register_organization(payload: RegisterOrg, db: DbSession) -> TokenOut:
    """Crée un établissement et son compte administrateur."""
    slug = _slugify(payload.organization_name)
    if db.scalar(select(Organization).where(Organization.slug == slug)):
        raise HTTPException(status.HTTP_409_CONFLICT, "Un établissement porte déjà ce nom")

    org = Organization(name=payload.organization_name, slug=slug, settings={})
    db.add(org)
    db.flush()
    user = User(
        organization_id=org.id,
        email=payload.email.lower(),
        password_hash=hash_password(payload.password),
        full_name=payload.full_name,
        role=Role.TEACHER,
    )
    db.add(user)
    log(db, user, org.id, "organization.created", "organization", org.id)
    db.commit()
    db.refresh(user)
    return TokenOut(
        access_token=create_access_token(user.id, org.id, user.role.value),
        user=UserOut.model_validate(user),
        organization=org.name,
    )


@router.post("/login", response_model=TokenOut)
def login(payload: LoginPayload, db: DbSession) -> TokenOut:
    email = payload.email.lower()
    user = db.scalar(select(User).where(func.lower(User.email) == email))
    if user is None or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Identifiants invalides")
    if not user.is_active:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Compte désactivé")
    org = db.get(Organization, user.organization_id)
    log(db, user, org.id, "auth.login", "user", user.id)
    db.commit()
    return TokenOut(
        access_token=create_access_token(user.id, org.id, user.role.value),
        user=UserOut.model_validate(user),
        organization=org.name,
    )


@router.get("/me", response_model=TokenOut)
def me(user: CurrentUser, db: DbSession) -> TokenOut:
    org = db.get(Organization, user.organization_id)
    return TokenOut(
        access_token="",
        user=UserOut.model_validate(user),
        organization=org.name,
    )
