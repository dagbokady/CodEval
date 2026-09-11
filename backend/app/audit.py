from __future__ import annotations

from sqlalchemy.orm import Session

from .models import AuditLog, User


def log(
    db: Session,
    actor: User | None,
    organization_id: int,
    action: str,
    target_type: str = "",
    target_id: int | None = None,
    **meta,
) -> None:
    """Journalise une opération critique (CDC X). Le commit reste à l'appelant."""
    db.add(
        AuditLog(
            organization_id=organization_id,
            actor_id=actor.id if actor else None,
            action=action,
            target_type=target_type,
            target_id=target_id,
            meta=meta,
        )
    )
