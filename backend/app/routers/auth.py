from __future__ import annotations

import html
import logging
import os
import re
from datetime import timedelta

from fastapi import APIRouter, HTTPException, Request, status
from sqlalchemy import func, select

from ..accounts import delete_account, ensure_not_last_admin
from ..audit import log
from ..config import settings
from ..deps import CurrentUser, DbSession
from ..email_verification import check_code, check_signup_code, send_code
from ..mail import button, mail_configured, send_email
from ..models import Organization, PasswordResetToken, Role, User, utcnow
from ..rate_limit import limiter
from ..schemas import (
    AccountDeletion,
    EmailChangeConfirm,
    EmailChangeRequest,
    EmailCodeRequest,
    ForgotPasswordPayload,
    LoginPayload,
    PasswordChange,
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
logger = logging.getLogger("codeval.mail")


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
    if not settings.email_verification:
        # Développement : pas de code, le formulaire crée le compte aussitôt.
        return {"ok": True, "required": False}
    send_code(db, payload.email, client_ip(request))
    return {
        "ok": True,
        "required": True,
        "expires_in": settings.email_code_minutes * 60,
        "resend_in": settings.email_code_resend_seconds,
    }


@router.post("/register-teacher", response_model=TokenOut, status_code=status.HTTP_201_CREATED)
def register_teacher(payload: RegisterTeacher, db: DbSession) -> TokenOut:
    """Inscription d'un enseignant seul : un espace personnel est créé pour lui,
    sur l'offre gratuite."""
    if email_taken(db, payload.email):
        raise HTTPException(status.HTTP_409_CONFLICT, "Cet e-mail est déjà utilisé")
    check_signup_code(db, payload.email, payload.email_code)
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
def forgot_password(payload: ForgotPasswordPayload, request: Request, db: DbSession) -> dict:
    """Envoie un e-mail de réinitialisation. Répond toujours 200 pour ne pas
    révéler l'existence d'un compte."""
    key = f"reset:{_rate_limit_key(request, payload.email)}"
    if limiter.is_locked(key):
        raise HTTPException(
            status.HTTP_429_TOO_MANY_REQUESTS,
            f"Trop de demandes. Réessayez dans {settings.login_lockout_minutes} minutes.",
        )
    limiter.record_failure(key)

    user = db.scalar(select(User).where(func.lower(User.email) == payload.email.lower()))
    if user is None or not user.is_active:
        return {"ok": True}

    token_str = os.urandom(32).hex()
    expires = utcnow() + timedelta(minutes=settings.reset_token_minutes)
    db.add(PasswordResetToken(user_id=user.id, token=token_str, expires_at=expires))
    db.commit()

    link = f"{settings.frontend_url}/reset-password?token={token_str}"
    if not mail_configured():
        # Développement : sans service d'envoi, le lien se lit dans les journaux.
        logger.warning("Lien de réinitialisation pour %s : %s", user.email, link)
        return {"ok": True}
    send_email(
        user.email,
        "CodEval - Réinitialisation de votre mot de passe",
        f"""<p style="margin:0 0 12px">Bonjour {html.escape(user.full_name)},</p>
<p style="margin:0">Vous avez demandé à réinitialiser votre mot de passe CodEval. Choisissez-en un nouveau :</p>
{button(link, "Choisir un nouveau mot de passe")}
<p style="margin:0 0 12px">Ce lien est valable {settings.reset_token_minutes} minutes. S'il ne s'ouvre pas, copiez cette adresse dans votre navigateur :</p>
<p style="margin:0 0 16px;font-size:13px;word-break:break-all"><a href="{html.escape(link, quote=True)}" style="color:#2458d3">{html.escape(link)}</a></p>
<p style="margin:0;color:#62626b;font-size:13px">Si vous n'avez pas demandé cette réinitialisation, ignorez cet e-mail : votre mot de passe reste le même.</p>""",
        f"Bonjour {user.full_name},\n\nPour réinitialiser votre mot de passe CodEval, ouvrez ce lien :\n"
        f"{link}\n\nIl est valable {settings.reset_token_minutes} minutes.\n"
        "Si vous n'avez pas demandé cette réinitialisation, ignorez cet e-mail.\n\nCodEval",
        preheader=f"Lien valable {settings.reset_token_minutes} minutes.",
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
    # Le lien utilisé et ceux demandés avant lui ne servent plus.
    for pending in db.scalars(
        select(PasswordResetToken).where(
            PasswordResetToken.user_id == user.id, PasswordResetToken.used_at.is_(None)
        )
    ):
        pending.used_at = now
    log(db, user, user.organization_id, "auth.password_reset", "user", user.id)
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


def _check_current_password(request: Request, user: User, password: str) -> None:
    """Redemande le mot de passe avant de toucher aux identifiants du compte :
    une session laissée ouverte ne suffit pas à les changer."""
    key = f"me:{_rate_limit_key(request, user.email)}"
    if limiter.is_locked(key):
        raise HTTPException(
            status.HTTP_429_TOO_MANY_REQUESTS,
            f"Trop de tentatives. Réessayez dans {settings.login_lockout_minutes} minutes.",
        )
    if not verify_password(password, user.password_hash):
        limiter.record_failure(key)
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Mot de passe actuel incorrect")
    limiter.reset(key)


@router.put("/me/password")
def change_password(
    payload: PasswordChange, request: Request, user: CurrentUser, db: DbSession
) -> dict:
    """Chacun change son mot de passe en donnant l'actuel."""
    _check_current_password(request, user, payload.current_password)
    user.password_hash = hash_password(payload.new_password)
    log(db, user, user.organization_id, "user.password_changed", "user", user.id)
    db.commit()
    return {"ok": True}


@router.post("/me/email-code")
def request_email_change(
    payload: EmailChangeRequest, request: Request, user: CurrentUser, db: DbSession
) -> dict:
    """Premier temps du changement d'adresse : un code part à la nouvelle."""
    _check_current_password(request, user, payload.current_password)
    if payload.email.lower() == user.email.lower():
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "C'est déjà votre adresse actuelle.")
    if email_taken(db, payload.email):
        raise HTTPException(status.HTTP_409_CONFLICT, "Cet e-mail est déjà utilisé")
    send_code(db, payload.email, client_ip(request), change=True)
    return {
        "ok": True,
        "expires_in": settings.email_code_minutes * 60,
        "resend_in": settings.email_code_resend_seconds,
    }


@router.put("/me/email", response_model=UserOut)
def confirm_email_change(payload: EmailChangeConfirm, user: CurrentUser, db: DbSession) -> UserOut:
    """Second temps : le code reçu prouve que la nouvelle adresse est bien à lui."""
    if email_taken(db, payload.email):
        raise HTTPException(status.HTTP_409_CONFLICT, "Cet e-mail est déjà utilisé")
    check_code(db, payload.email, payload.code)
    old = user.email
    user.email = payload.email.lower()
    log(db, user, user.organization_id, "user.email_changed", "user", user.id, previous=old)
    db.commit()
    db.refresh(user)
    return UserOut.model_validate(user)


@router.post("/me/delete")
def delete_my_account(
    payload: AccountDeletion, request: Request, user: CurrentUser, db: DbSession
) -> dict:
    """Chacun supprime son propre compte, en redonnant son mot de passe."""
    _check_current_password(request, user, payload.current_password)
    ensure_not_last_admin(db, user)
    log(db, user, user.organization_id, "user.deleted_self", "user", user.id)
    delete_account(db, user)
    db.commit()
    return {"ok": True}
