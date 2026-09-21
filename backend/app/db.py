from collections.abc import Iterator

from sqlalchemy import create_engine
from datetime import datetime, timezone

from sqlalchemy import DateTime, event
from sqlalchemy.orm import (DeclarativeBase, Mapped, Session, mapped_column, sessionmaker,
                            with_loader_criteria)

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


class SoftDeleteMixin:
    """Ligne supprimée = deleted_at renseigné ; elle disparaît de toutes les requêtes ORM
    (y compris les relations) sauf avec execution_options(include_deleted=True)."""

    deleted_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), default=None, index=True)


def soft_delete(obj) -> None:
    obj.deleted_at = datetime.now(timezone.utc)


@event.listens_for(Session, "do_orm_execute")
def _hide_deleted(state) -> None:
    if state.is_select and not state.execution_options.get("include_deleted", False):
        state.statement = state.statement.options(with_loader_criteria(
            SoftDeleteMixin, lambda cls: cls.deleted_at.is_(None), include_aliases=True))


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
