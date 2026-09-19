from collections.abc import Iterator

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from .config import settings

_is_sqlite = settings.database_url.startswith("sqlite")

engine = create_engine(
    settings.database_url,
    echo=False,
    pool_pre_ping=True,
    connect_args=(
        {"check_same_thread": False}
        if _is_sqlite
        else {"application_name": "codeval", "connect_timeout": 5}
    ),
    **(
        {}
        if _is_sqlite
        else {"pool_size": settings.pool_size, "max_overflow": settings.pool_max_overflow,
              "pool_recycle": 1800}
    ),
)

SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


def get_db() -> Iterator[Session]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db() -> None:
    """Crée les tables manquantes au démarrage (dev / tests).

    En production, utiliser `alembic upgrade head` avant de lancer l'API.
    """
    from . import models  # noqa: F401

    if _is_sqlite:
        with engine.connect() as conn:
            conn.exec_driver_sql("PRAGMA journal_mode=WAL")
    Base.metadata.create_all(engine)
