from __future__ import annotations

import html as html_lib
import logging
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.utils import formataddr, formatdate, make_msgid

import httpx

from .config import settings

logger = logging.getLogger("codeval.mail")

MAILJET_URL = "https://api.mailjet.com/v3.1/send"

# Messageries gratuites : leurs domaines publient une politique DMARC qu'un
# service d'envoi tiers (Mailjet, SMTP d'hébergeur) ne peut pas satisfaire.
# Un e-mail « de » ces adresses part donc sans signature valable, et finit en
# indésirables.
FREE_MAIL_DOMAINS = {
    "gmail.com", "googlemail.com", "yahoo.com", "yahoo.fr", "hotmail.com", "hotmail.fr",
    "outlook.com", "outlook.fr", "live.com", "live.fr", "icloud.com", "me.com",
    "aol.com", "gmx.com", "gmx.fr", "orange.fr", "free.fr", "laposte.net", "proton.me",
    "protonmail.com",
}


def mail_configured() -> bool:
    return bool(settings.mailjet_api_key and settings.mailjet_api_secret) or bool(
        settings.smtp_host
    )


def sender_warning() -> str | None:
    """Explique pourquoi les e-mails risquent les indésirables, s'il y a lieu."""
    domain = settings.smtp_from.rsplit("@", 1)[-1].lower()
    if mail_configured() and domain in FREE_MAIL_DOMAINS:
        return (
            f"L'adresse d'expédition {settings.smtp_from} est une messagerie gratuite : "
            f"les e-mails envoyés en son nom par un service tiers ne peuvent pas être "
            f"authentifiés (SPF/DKIM) et arrivent en indésirables. Utilisez une adresse "
            f"d'un domaine à vous, authentifié dans Mailjet (voir DEPLOIEMENT.md)."
        )
    return None


def render_email(body_html: str, preheader: str = "") -> str:
    """Habille le contenu d'un e-mail : logo, nom, pied de page.

    Mise en page en tableaux et styles en ligne : c'est ce que toutes les
    messageries (Outlook compris) affichent de la même façon.
    """
    # Logo dessiné en HTML, sans image : rien à télécharger ni à débloquer,
    # pas de pièce jointe, et la même taille dans toutes les messageries.
    # Une image jointe s'affichait à sa taille réelle dans certaines d'entre
    # elles, puis une seconde fois en bas du message.
    logo = (
        '<table role="presentation" cellpadding="0" cellspacing="0"><tr>'
        '<td width="34" height="34" align="center" valign="middle" bgcolor="#2458d3" '
        'style="width:34px;height:34px;background:#2458d3;border-radius:8px;'
        "font-family:'Courier New',Courier,monospace;font-size:14px;font-weight:700;"
        'line-height:34px;color:#ffffff;text-align:center">&lt;/&gt;</td>'
        "</tr></table>"
    )
    name = html_lib.escape(settings.mail_from_name)
    hidden = (
        f'<div style="display:none;max-height:0;overflow:hidden;opacity:0">'
        f"{html_lib.escape(preheader)}</div>"
        if preheader
        else ""
    )
    return f"""<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>{name}</title>
</head>
<body style="margin:0;padding:0;background:#f4f4f5">
{hidden}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5">
<tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px">
<tr><td style="padding:0 4px 16px">
<table role="presentation" cellpadding="0" cellspacing="0"><tr>
<td style="padding-right:10px">{logo}</td>
<td style="font-family:Arial,Helvetica,sans-serif;font-size:19px;font-weight:700;color:#18181b">{name}</td>
</tr></table>
</td></tr>
<tr><td style="background:#ffffff;border:1px solid #e4e4e7;border-radius:8px;padding:28px 28px 24px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.55;color:#2e2e33">
{body_html}
</td></tr>
<tr><td style="padding:16px 4px 0;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.5;color:#62626b">
Cet e-mail vous a été envoyé par {name}, la plateforme d'évaluation pratique en programmation, suite à une action sur votre compte. Il n'appelle pas de réponse.
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>"""


def button(link: str, label: str) -> str:
    """Un bouton qui reste un lien lisible dans les messageries sans styles."""
    href = html_lib.escape(link, quote=True)
    return (
        f'<table role="presentation" cellpadding="0" cellspacing="0" style="margin:20px 0">'
        f'<tr><td style="border-radius:6px;background:#2458d3">'
        f'<a href="{href}" style="display:inline-block;padding:11px 20px;font-family:Arial,'
        f'Helvetica,sans-serif;font-size:15px;font-weight:700;color:#ffffff;'
        f'text-decoration:none;border-radius:6px">{html_lib.escape(label)}</a>'
        f"</td></tr></table>"
    )


def send_email(
    to: str, subject: str, html: str, text: str | None = None, preheader: str = ""
) -> bool:
    """Envoie un e-mail par Mailjet, ou à défaut par SMTP. Rend False si rien
    n'est configuré ou si l'envoi échoue : l'appelant décide quoi en dire.

    `html` est le contenu seul : il est habillé du logo et du pied de page."""
    page = render_email(html, preheader)
    if settings.mailjet_api_key and settings.mailjet_api_secret:
        return _send_mailjet(to, subject, page, text)
    if settings.smtp_host:
        return _send_smtp(to, subject, page, text)
    logger.warning("Aucun envoi d'e-mail configuré, message non envoyé à %s", to)
    return False


def _send_mailjet(to: str, subject: str, html: str, text: str | None) -> bool:
    message = {
        "From": {"Email": settings.smtp_from, "Name": settings.mail_from_name},
        "To": [{"Email": to}],
        "Subject": subject,
        "HTMLPart": html,
        # Le suivi réécrit les liens vers un domaine de Mailjet et ajoute un
        # pixel espion : deux signaux que les filtres anti-spam sanctionnent.
        "TrackOpens": "disabled",
        "TrackClicks": "disabled",
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
    # Sans date ni identifiant, un message perd des points auprès des filtres.
    msg["Date"] = formatdate(localtime=False)
    msg["Message-ID"] = make_msgid(domain=settings.smtp_from.rsplit("@", 1)[-1])
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
