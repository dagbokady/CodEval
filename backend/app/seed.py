"""Installation initiale : python -m app.seed

Crée l'établissement et son compte d'administration, rien d'autre : ni
enseignant, ni étudiant, ni classe, ni exercice, ni évaluation. L'administrateur
invite ensuite les enseignants et configure l'établissement depuis l'interface.

Le nom de l'établissement, l'e-mail et le mot de passe de l'administrateur sont
lus dans `.env` (voir `.env.example`) :

    CODEVAL_ORG_NAME, CODEVAL_ADMIN_EMAIL, CODEVAL_ADMIN_PASSWORD, CODEVAL_ADMIN_NAME

Le script est rejouable : un compte déjà présent sous cet e-mail n'est pas recréé.
"""

from __future__ import annotations

import sys

from sqlalchemy import select

from .config import settings
from .db import SessionLocal, init_db
from .exports import slugify
from .models import Organization, Role, User
from .security import hash_password


def _config() -> tuple[str, str, str, str]:
    manquantes = [
        nom
        for nom, valeur in (
            ("CODEVAL_ORG_NAME", settings.org_name),
            ("CODEVAL_ADMIN_EMAIL", settings.admin_email),
            ("CODEVAL_ADMIN_PASSWORD", settings.admin_password),
        )
        if not valeur.strip()
    ]
    if manquantes:
        sys.exit(f"Variables manquantes dans .env : {', '.join(manquantes)}")
    if settings.admin_password == "change-me":
        sys.exit("CODEVAL_ADMIN_PASSWORD vaut encore la valeur d'exemple : choisissez un mot de passe.")
    return (
        settings.org_name.strip(),
        settings.admin_email.strip().lower(),
        settings.admin_password,
        settings.admin_name.strip() or "Administration",
    )


def main() -> None:
    org_name, email, password, full_name = _config()
    init_db()
    db = SessionLocal()
    try:
        if db.scalar(select(User).where(User.email == email)):
            print(f"Administrateur déjà présent : {email}")
            return

        slug = slugify(org_name)
        org = db.scalar(select(Organization).where(Organization.slug == slug))
        if org is None:
            org = Organization(name=org_name, slug=slug, settings={})
            db.add(org)
            db.flush()

        db.add(
            User(
                organization_id=org.id,
                email=email,
                password_hash=hash_password(password),
                full_name=full_name,
                role=Role.ADMIN,
            )
        )
        db.commit()

        print(f"Établissement  : {org.name}")
        print(f"Administrateur : {full_name} <{email}>")
    finally:
        db.close()


if __name__ == "__main__":
    main()
