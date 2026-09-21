from __future__ import annotations

import logging
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.utils import formataddr

import httpx

from .config import settings

logger = logging.getLogger("codeval.mail")

MAILJET_URL = "https://api.mailjet.com/v3.1/send"


def mail_configured() -> bool:
    return bool(settings.mailjet_api_key and settings.mailjet_api_secret) or bool(
        settings.smtp_host
    )


def send_email(to: str, subject: str, html: str, text: str | None = None) -> bool:
    """Envoie un e-mail par Mailjet, ou à défaut par SMTP. Rend False si rien
    n'est configuré ou si l'envoi échoue : l'appelant décide quoi en dire."""
    if settings.mailjet_api_key and settings.mailjet_api_secret:
        return _send_mailjet(to, subject, html, text)
    if settings.smtp_host:
        return _send_smtp(to, subject, html, text)
    logger.warning("Aucun envoi d'e-mail configuré, message non envoyé à %s", to)
    return False


def _send_mailjet(to: str, subject: str, html: str, text: str | None) -> bool:
    message = {
        "From": {"Email": settings.smtp_from, "Name": settings.mail_from_name},
        "To": [{"Email": to}],
        "Subject": subject,
        "HTMLPart": html,
    }
    if text:
        message["TextPart"] = text
    try:
        res = httpx.post(
            MAILJET_URL,
            auth=(settings.mailjet_api_key, settings.mailjet_api_secret),
            json={"Messages": [message]},
            timeout=10,
        )
        status = res.json().get("Messages", [{}])[0].get("Status")
        if res.status_code == 200 and status == "success":
            return True
        logger.error("Mailjet a refusé l'e-mail pour %s : %s %s", to, res.status_code, res.text)
    except Exception:
        logger.exception("Échec d'envoi Mailjet à %s", to)
    return False


def _send_smtp(to: str, subject: str, html: str, text: str | None) -> bool:
    msg = MIMEMultipart("alternative")
    msg["From"] = formataddr((settings.mail_from_name, settings.smtp_from))
    msg["To"] = to
    msg["Subject"] = subject
    if text:
        msg.attach(MIMEText(text, "plain", "utf-8"))
    msg.attach(MIMEText(html, "html", "utf-8"))
    try:
        with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=10) as server:
            server.starttls()
            if settings.smtp_user:
                server.login(settings.smtp_user, settings.smtp_password)
            server.send_message(msg)
        return True
    except Exception:
        logger.exception("Échec d'envoi d'e-mail à %s", to)
        return False
