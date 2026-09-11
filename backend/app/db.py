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


# Colonnes ajoutées après coup à des tables déjà en production. `create_all` ne
# crée que les tables manquantes, jamais les colonnes : on les ajoute nous-mêmes,
# de façon idempotente, au démarrage.
_ADDED_COLUMNS: list[tuple[str, str, str]] = [
    ("test_cases", "args", "TEXT"),
    ("test_cases", "target_id", "VARCHAR(24)"),
    ("test_cases", "input_types", "TEXT"),
    ("test_cases", "expected_type", "VARCHAR(20)"),
    ("bank_test_cases", "args", "TEXT"),
    ("bank_test_cases", "target_id", "VARCHAR(24)"),
    ("bank_test_cases", "input_types", "TEXT"),
    ("bank_test_cases", "expected_type", "VARCHAR(20)"),
    ("evaluations", "is_template", "BOOLEAN DEFAULT FALSE"),
]


def _ensure_columns() -> None:
    from sqlalchemy import inspect

    inspector = inspect(engine)
    tables = set(inspector.get_table_names())
    with engine.begin() as conn:
        for table, column, ddl_type in _ADDED_COLUMNS:
            if table not in tables:
                continue
            existing = {c["name"] for c in inspector.get_columns(table)}
            if column in existing:
                continue
            conn.exec_driver_sql(f"ALTER TABLE {table} ADD COLUMN {column} {ddl_type}")


def init_db() -> None:
    from . import models  # noqa: F401

    if _is_sqlite:
        with engine.connect() as conn:
            conn.exec_driver_sql("PRAGMA journal_mode=WAL")
    Base.metadata.create_all(engine)
    _ensure_columns()
