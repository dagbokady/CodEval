"""Tâche de fond : lancement et clôture automatiques des évaluations."""

from __future__ import annotations

import asyncio
import logging

from sqlalchemy import select, text

from .db import SessionLocal, _is_sqlite
from .models import Evaluation, EvaluationStatus, User, utcnow
from .services import close_if_expired, start_session

logger = logging.getLogger("codeval.scheduler")

POLL_SECONDS = 30
_LOCK_ID = 737_001


def _try_advisory_lock(db) -> bool:
    if _is_sqlite:
        return True
    row = db.execute(text("SELECT pg_try_advisory_lock(:id)"), {"id": _LOCK_ID}).scalar()
    return bool(row)


def _release_advisory_lock(db) -> None:
    if _is_sqlite:
        return
    db.execute(text("SELECT pg_advisory_unlock(:id)"), {"id": _LOCK_ID})


async def _tick() -> int:
    db = SessionLocal()
    launched = 0
    try:
        if not _try_advisory_lock(db):
            return 0
        try:
            now = utcnow()
            due = list(
                db.scalars(
                    select(Evaluation).where(
                        Evaluation.status == EvaluationStatus.SCHEDULED,
                        Evaluation.scheduled_start.isnot(None),
                        Evaluation.scheduled_start <= now,
                    )
                )
            )
            for evaluation in due:
                try:
                    actor = db.get(User, evaluation.teacher_id)
                    start_session(db, evaluation, actor)
                    launched += 1
                    logger.info(
                        "Évaluation %d « %s » lancée automatiquement",
                        evaluation.id,
                        evaluation.title,
                    )
                except Exception:
                    logger.exception(
                        "Échec du lancement auto de l'évaluation %d", evaluation.id
                    )
                    db.rollback()
            # Clôture à l'échéance même si aucun apprenant n'interroge le serveur :
            # l'enseignant voit l'épreuve terminée et peut lancer la correction.
            expired = list(
                db.scalars(
                    select(Evaluation).where(
                        Evaluation.status == EvaluationStatus.RUNNING,
                        Evaluation.ends_at.isnot(None),
                        Evaluation.ends_at <= now,
                    )
                )
            )
            for evaluation in expired:
                try:
                    close_if_expired(db, evaluation)
                except Exception:
                    logger.exception("Échec de la clôture auto de l'évaluation %d", evaluation.id)
                    db.rollback()
        finally:
            _release_advisory_lock(db)
    finally:
        db.close()
    return launched


async def run_scheduler() -> None:
    logger.info("Scheduler démarré (poll=%ds)", POLL_SECONDS)
    while True:
        try:
            count = await _tick()
            if count:
                logger.info("%d évaluation(s) lancée(s)", count)
        except Exception:
            logger.exception("Erreur dans le scheduler")
        await asyncio.sleep(POLL_SECONDS)
