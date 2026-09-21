"""Préparation avant le lancement de l'API : python -m app.prestart

Pour les hébergeurs sans terminal (Render) : applique les migrations puis crée
le compte d'administration si CODEVAL_ADMIN_EMAIL et CODEVAL_ADMIN_PASSWORD
sont renseignées, puis publie les exercices des TD d'algorithmique dans la
communauté (app.seed_community). Rejouable à chaque démarrage.
"""

from __future__ import annotations

import time

from alembic import command
from alembic.config import Config
from sqlalchemy import inspect, text
from sqlalchemy.exc import OperationalError

from .config import settings
from .db import Base, engine


def wait_for_database(timeout: int = 300) -> None:
    # Une base tout juste créée (Render) refuse les connexions quelques minutes.
    limite = time.monotonic() + timeout
    while True:
        try:
            with engine.connect() as conn:
                conn.execute(text("SELECT 1"))
            return
        except OperationalError:
            if time.monotonic() > limite:
                raise
            print("Base de données injoignable, nouvel essai dans 5 s")
            time.sleep(5)


def main() -> None:
    wait_for_database()
    alembic_cfg = Config("alembic.ini")
    if not inspect(engine).get_table_names():
        # Base vide : les migrations supposent les tables de base, que create_all
        # a toujours créées. On pose le schéma complet puis on le marque à jour.
        from . import models  # noqa: F401

        Base.metadata.create_all(engine)
        command.stamp(alembic_cfg, "head")
    else:
        command.upgrade(alembic_cfg, "head")
    if settings.admin_email.strip() and settings.admin_password.strip():
        from .seed import main as seed

        seed()
        from .seed_community import main as seed_community

        seed_community()


if __name__ == "__main__":
    main()
