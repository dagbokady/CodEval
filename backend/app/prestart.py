"""Préparation avant le lancement de l'API : python -m app.prestart

Pour les hébergeurs sans terminal (Render) : applique les migrations puis crée
le compte d'administration si CODEVAL_ADMIN_EMAIL et CODEVAL_ADMIN_PASSWORD
sont renseignées, puis publie les exercices des TD d'algorithmique dans la
communauté (app.seed_community). Rejouable à chaque démarrage.
"""

from __future__ import annotations

from alembic import command
from alembic.config import Config

from .config import settings


def main() -> None:
    command.upgrade(Config("alembic.ini"), "head")
    if settings.admin_email.strip() and settings.admin_password.strip():
        from .seed import main as seed

        seed()
        from .seed_community import main as seed_community

        seed_community()


if __name__ == "__main__":
    main()
