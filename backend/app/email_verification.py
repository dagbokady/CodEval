"""Confirmation de l'adresse e-mail avant la création d'un compte.

L'inscription se fait en deux temps : le formulaire demande un code à six
chiffres, envoyé à l'adresse saisie, puis le renvoie avec le reste. Aucun
compte ni espace n'existe tant que le code n'a pas été vérifié.
"""

from __future__ import annotations

import hashlib
import hmac
import logging
import secrets
from datetime import timedelta

from fastapi import HTTPException, status
from sqlalchemy import delete, func, select

from .config import settings
from .mail import mail_configured, send_email
from .models import EmailVerification, utcnow

logger = logging.getLogger("codeval.mail")


def _hash(email: str, code: str) -> str:
    return hmac.new(
        settings.secret_key.encode(), f"{email}:{code}".encode(), hashlib.sha256
    ).hexdigest()


def _latest(db, email: str) -> EmailVerification | None:
    return db.scalar(
        select(EmailVerification)
        .where(EmailVerification.email == email)
        .order_by(EmailVerification.created_at.desc(), EmailVerification.id.desc())
        .limit(1)
    )


def send_code(db, email: str, ip: str, change: bool = False) -> None:
    """Tire un nouveau code pour `email` et l'envoie. Le précédent ne vaut plus.
    `change` : l'adresse remplacera celle d'un compte existant, pas une inscription."""
    email = email.lower()
    now = utcnow()
    db.execute(delete(EmailVerification).where(EmailVerification.created_at < now - timedelta(days=1)))

    last = _latest(db, email)
    if last is not None:
        wait = settings.email_code_resend_seconds - int((now - last.created_at).total_seconds())
        if wait > 0:
            raise HTTPException(
                status.HTTP_429_TOO_MANY_REQUESTS,
                f"Un code vient d'être envoyé. Patientez {wait} s avant d'en redemander un.",
            )
    sent_from_ip = db.scalar(
        select(func.count())
        .select_from(EmailVerification)
        .where(EmailVerification.ip == ip, EmailVerification.created_at > now - timedelta(hours=1))
    )
    if sent_from_ip >= settings.email_code_per_ip_hour:
        raise HTTPException(
            status.HTTP_429_TOO_MANY_REQUESTS,
            "Trop de codes demandés. Réessayez dans une heure.",
        )

    code = f"{secrets.randbelow(1_000_000):06d}"
    db.add(
        EmailVerification(
            email=email,
            code_hash=_hash(email, code),
            ip=ip,
            expires_at=now + timedelta(minutes=settings.email_code_minutes),
        )
    )
    db.commit()

    if not mail_configured():
        # Développement : sans service d'envoi, le code se lit dans les journaux.
        logger.warning("Code de vérification pour %s : %s", email, code)
        return
    minutes = settings.email_code_minutes
    origin = "ce changement d'adresse" if change else "cette inscription"
    sent = send_email(
        email,
        f"CodEval : votre code de vérification {code}",
        f"""<p style="margin:0 0 12px">Bonjour,</p>
<p style="margin:0 0 16px">Voici le code pour confirmer votre adresse e-mail sur CodEval :</p>
<p style="margin:0 0 16px;padding:14px 0;text-align:center;background:#f4f4f5;border-radius:6px;font-size:30px;font-weight:700;letter-spacing:8px;font-family:'Courier New',monospace;color:#18181b">{code}</p>
<p style="margin:0 0 12px">Il est valable {minutes} minutes.</p>
<p style="margin:0;color:#62626b;font-size:13px">Si vous n'êtes pas à l'origine de {origin}, ignorez cet e-mail.</p>""",
        f"Bonjour,\n\nVotre code de vérification CodEval : {code}\n\n"
        f"Il est valable {minutes} minutes.\n"
        f"Si vous n'êtes pas à l'origine de {origin}, ignorez cet e-mail.\n\nCodEval",
        preheader=f"Votre code est valable {minutes} minutes.",
    )
    if not sent:
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            "L'e-mail n'a pas pu être envoyé. Vérifiez l'adresse ou réessayez plus tard.",
        )


def check_signup_code(db, email: str, code: str | None) -> None:
    """Le code d'une inscription, sauf quand la vérification est coupée
    (`CODEVAL_EMAIL_VERIFICATION=false`, en développement)."""
    if settings.email_verification:
        check_code(db, email, code)


def check_code(db, email: str, code: str | None) -> None:
    """Vérifie le code saisi. En cas de succès, les codes de l'adresse sont
    effacés dans la transaction en cours : l'appelant la valide avec le compte."""
    email = email.lower()
    last = _latest(db, email)
    invalid = HTTPException(
        status.HTTP_400_BAD_REQUEST, "Code de vérification incorrect ou expiré"
    )
    if not code or last is None or last.expires_at <= utcnow():
        raise invalid
    if last.attempts >= settings.email_code_max_attempts:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST, "Trop d'essais : demandez un nouveau code."
        )
    if not hmac.compare_digest(last.code_hash, _hash(email, code.strip())):
        last.attempts += 1
        db.commit()
        raise invalid
    db.execute(delete(EmailVerification).where(EmailVerification.email == email))
