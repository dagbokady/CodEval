from __future__ import annotations

import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

from .config import settings
from .db import init_db
from .routers import (
    admin,
    auth,
    bank,
    community,
    corrections,
    evaluations,
    joining,
    notifications,
    org,
    stats,
    student,
)
from .scheduler import run_scheduler

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")


@asynccontextmanager
async def lifespan(_app: FastAPI):
    init_db()
    task = asyncio.create_task(run_scheduler())
    yield
    task.cancel()
    try:
        await task
    except asyncio.CancelledError:
        pass


app = FastAPI(
    title="CodEval API",
    version="1.0.0",
    description="Plateforme SaaS d'évaluation pratique en programmation et algorithmique",
    lifespan=lifespan,
)

class UnhandledErrors(BaseHTTPMiddleware):
    """Répond 500 en JSON à toute erreur non prévue.

    Un gestionnaire `exception_handler(Exception)` répond depuis la couche la
    plus externe, hors de CORS : la réponse partait sans en-têtes CORS et le
    navigateur la faisait passer pour une panne réseau (« Serveur injoignable »).
    Placée sous CORS, cette couche garde l'erreur lisible par le client.
    """

    async def dispatch(self, request: Request, call_next):
        try:
            return await call_next(request)
        except Exception as exc:  # noqa: BLE001 (c'est précisément le filet)
            logging.getLogger("codeval").exception("Erreur non gérée", exc_info=exc)
            return JSONResponse(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                content={"detail": "Erreur interne du serveur"},
            )


# Le premier middleware ajouté est le plus interne : les erreurs sont converties
# en réponses avant que CORS n'y pose ses en-têtes.
app.add_middleware(UnhandledErrors)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.origins,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

for module in (
    auth, org, admin, evaluations, corrections, student, bank, community, notifications, joining,
    stats,
):
    app.include_router(module.router)


@app.get("/api/health", tags=["observabilité"])
def health() -> dict:
    return {"status": "ok"}
