"""Worker de correction : consomme les campagnes en attente.

Séparé de l'API pour que la correction (coûteuse en CPU) ne dégrade pas les temps
de réponse pendant les sessions, et pour permettre de le répliquer horizontalement.
Lancement : python -m app.worker
"""

from __future__ import annotations

import logging
import time

from sqlalchemy import select

from .config import settings
from .db import SessionLocal, init_db
from .grading.engine import process_run
from .models import CorrectionRun, RunStatus, utcnow

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("codeval.worker")


def claim_next(db) -> CorrectionRun | None:
    stmt = select(CorrectionRun).where(CorrectionRun.status == RunStatus.PENDING).limit(1)
    if db.bind.dialect.name == "postgresql":
        stmt = stmt.with_for_update(skip_locked=True)
    run = db.scalar(stmt)
    if run is None:
        return None
    run.status = RunStatus.RUNNING
    run.started_at = utcnow()
    db.commit()
    return run


def run_once() -> bool:
    db = SessionLocal()
    try:
        run = claim_next(db)
        if run is None:
            return False
        log.info("Campagne #%s (évaluation %s) démarrée", run.number, run.evaluation_id)
        try:
            process_run(db, run)
            log.info("Campagne #%s terminée : %s", run.number, run.status.value)
        except Exception:
            db.rollback()
            run = db.get(CorrectionRun, run.id)
            run.status = RunStatus.FAILED
            run.finished_at = utcnow()
            run.error = "Échec du traitement de la campagne"
            db.commit()
            log.exception("Campagne #%s en échec", run.number)
        return True
    finally:
        db.close()


def main() -> None:
    init_db()
    log.info("Worker de correction démarré")
    while True:
        if not run_once():
            time.sleep(settings.worker_poll_seconds)


if __name__ == "__main__":
    main()
