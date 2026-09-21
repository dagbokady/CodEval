from __future__ import annotations

import os
import re
from datetime import timedelta

from fastapi import APIRouter, HTTPException, Request, status
from sqlalchemy import func, select

from ..audit import log
from ..config import settings
from ..deps import CurrentUser, DbSession
from ..email_verification import check_code, send_code
from ..mail import send_email
from ..models import Organization, PasswordResetToken, Role, User, utcnow
from ..rate_limit import limiter
from ..schemas import (
    EmailCodeRequest,
    ForgotPasswordPayload,
    LoginPayload,
    PhotoUpdate,
    RegisterTeacher,
    ResetPasswordPayload,
    SheetHeaderSettings,
    TokenOut,
    UserOut,
)
from ..security import create_access_token, hash_password, verify_password
from ..workspace import create_personal_space, email_taken

router = APIRouter(prefix="/api/auth", tags=["auth"])


def _slugify(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")[:60] or "etablissement"


def client_ip(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def _rate_limit_key(request: Request, email: str) -> str:
    return f"{client_ip(request)}:{email.lower()}"


def token_out(user: User, org: Organization) -> TokenOut:
    return TokenOut(
        access_token=create_access_token(user.id, org.id, user.role.value),
        user=UserOut.model_validate(user),
        organization=org.name,
        organization_kind=org.kind,
    )


@router.post("/email-code")
def request_email_code(payload: EmailCodeRequest, request: Request, db: DbSession) -> dict:
    """Premier temps de l'inscription : envoie un code à l'adresse saisie."""
    if email_taken(db, payload.email):
        raise HTTPException(
            status.HTTP_409_CONFLICT, "Un compte existe déjà avec cet e-mail : connectez-vous."
        )
    send_code(db, payload.email, client_ip(request))
    return {
        "ok": True,
        "expires_in": settings.email_code_minutes * 60,
        "resend_in": settings.email_code_resend_seconds,
    }


@router.post("/register-teacher", response_model=TokenOut, status_code=status.HTTP_201_CREATED)
def register_teacher(payload: RegisterTeacher, db: DbSession) -> TokenOut:
    """Inscription d'un enseignant seul : un espace personnel est créé pour lui,
    sur l'offre gratuite."""
    if email_taken(db, payload.email):
        raise HTTPException(status.HTTP_409_CONFLICT, "Cet e-mail est déjà utilisé")
    check_code(db, payload.email, payload.email_code)
    org = create_personal_space(db, payload.full_name.strip())
    user = User(
        organization_id=org.id,
        email=payload.email.lower(),
        password_hash=hash_password(payload.password),
        full_name=payload.full_name.strip(),
        role=Role.TEACHER,
        photo=payload.photo,
        gender=payload.gender,
    )
    db.add(user)
    db.flush()
    log(db, user, org.id, "auth.teacher_registered", "user", user.id)
    db.commit()
    db.refresh(user)
    return token_out(user, org)


@router.post("/login", response_model=TokenOut)
def login(payload: LoginPayload, request: Request, db: DbSession) -> TokenOut:
    key = _rate_limit_key(request, payload.email)

    if limiter.is_locked(key):
        raise HTTPException(
            status.HTTP_429_TOO_MANY_REQUESTS,
            f"Trop de tentatives. Réessayez dans {settings.login_lockout_minutes} minutes.",
        )

    email = payload.email.lower()
    user = db.scalar(select(User).where(func.lower(User.email) == email))
    if user is None or not verify_password(payload.password, user.password_hash):
        limiter.record_failure(key)
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Identifiants invalides")
    if not user.is_active:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Compte désactivé")

    limiter.reset(key)
    org = db.get(Organization, user.organization_id)
    log(db, user, org.id, "auth.login", "user", user.id)
    db.commit()
    return token_out(user, org)


@router.post("/forgot-password")
def forgot_password(payload: ForgotPasswordPayload, db: DbSession) -> dict:
    """Envoie un e-mail de réinitialisation. Répond toujours 200 pour ne pas
    révéler l'existence d'un compte."""
    user = db.scalar(select(User).where(func.lower(User.email) == payload.email.lower()))
    if user is None or not user.is_active:
        return {"ok": True}

    token_str = os.urandom(32).hex()
    expires = utcnow() + timedelta(minutes=settings.reset_token_minutes)
    db.add(PasswordResetToken(user_id=user.id, token=token_str, expires_at=expires))
    db.commit()

    link = f"{settings.frontend_url}/reset-password?token={token_str}"
    send_email(
        user.email,
        "CodEval - Réinitialisation de votre mot de passe",
        f"""<p>Bonjour {user.full_name},</p>
<p>Cliquez sur le lien ci-dessous pour réinitialiser votre mot de passe :</p>
<p><a href="{link}">{link}</a></p>
<p>Ce lien est valable {settings.reset_token_minutes} minutes.</p>
<p>Si vous n'avez pas demandé cette réinitialisation, ignorez cet e-mail.</p>""",
    )
    return {"ok": True}


@router.post("/reset-password")
def reset_password(payload: ResetPasswordPayload, db: DbSession) -> dict:
    """Réinitialise le mot de passe via un jeton reçu par e-mail."""
    now = utcnow()
    reset = db.scalar(
        select(PasswordResetToken).where(
            PasswordResetToken.token == payload.token,
            PasswordResetToken.used_at.is_(None),
            PasswordResetToken.expires_at > now,
        )
    )
    if reset is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Lien invalide ou expiré")

    user = db.get(User, reset.user_id)
    if user is None or not user.is_active:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Lien invalide ou expiré")

    user.password_hash = hash_password(payload.password)
    reset.used_at = now
    db.commit()
    return {"ok": True}


@router.get("/me", response_model=TokenOut)
def me(user: CurrentUser, db: DbSession) -> TokenOut:
    org = db.get(Organization, user.organization_id)
    return TokenOut(
        access_token="",
        user=UserOut.model_validate(user),
        organization=org.name,
        organization_kind=org.kind,
    )


@router.put("/me/photo", response_model=UserOut)
def update_photo(payload: PhotoUpdate, user: CurrentUser, db: DbSession) -> UserOut:
    """L'enseignant et l'étudiant changent eux-mêmes leur photo de profil."""
    if user.role not in (Role.TEACHER, Role.STUDENT):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Accès non autorisé pour ce rôle")
    user.photo = payload.photo
    log(db, user, user.organization_id, "user.photo_updated", "user", user.id)
    db.commit()
    db.refresh(user)
    return UserOut.model_validate(user)


@router.put("/me/sheet-header", response_model=UserOut)
def update_sheet_header(
    payload: SheetHeaderSettings, user: CurrentUser, db: DbSession
) -> UserOut:
    """L'enseignant règle l'en-tête de ses feuilles : il vaut pour toutes ses
    épreuves, passées comme à venir."""
    if user.role is not Role.TEACHER:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Accès réservé aux enseignants")
    user.sheet_header = payload.model_dump()
    log(db, user, user.organization_id, "user.sheet_header_updated", "user", user.id)
    db.commit()
    db.refresh(user)
    return UserOut.model_validate(user)
