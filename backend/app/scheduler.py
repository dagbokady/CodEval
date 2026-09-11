"""Tâche de fond : lancement automatique des évaluations programmées."""

from __future__ import annotations

import asyncio
import logging

from sqlalchemy import select

from .db import SessionLocal
from .models import Evaluation, EvaluationStatus, User, utcnow
from .services import start_session

logger = logging.getLogger("codeval.scheduler")

POLL_SECONDS = 30


async def _tick() -> int:
    db = SessionLocal()
    launched = 0
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
