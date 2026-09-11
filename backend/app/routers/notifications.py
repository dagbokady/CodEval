"""Notifications utilisateur : lecture, compteur et marquage."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import func, select, update

from ..deps import CurrentUser, DbSession
from ..models import Notification

router = APIRouter(prefix="/api/me/notifications", tags=["notifications"])


@router.get("")
def list_notifications(user: CurrentUser, db: DbSession, limit: int = 20):
    rows = db.scalars(
        select(Notification)
        .where(Notification.user_id == user.id)
        .order_by(Notification.created_at.desc())
        .limit(limit)
    )
    return [
        {
            "id": n.id,
            "title": n.title,
            "body": n.body,
            "link": n.link,
            "read": n.read,
            "created_at": n.created_at.isoformat(),
        }
        for n in rows
    ]


@router.get("/count")
def unread_count(user: CurrentUser, db: DbSession):
    count = db.scalar(
        select(func.count(Notification.id)).where(
            Notification.user_id == user.id, Notification.read == False  # noqa: E712
        )
    )
    return {"unread": count or 0}


@router.put("/{notification_id}/read")
def mark_read(notification_id: int, user: CurrentUser, db: DbSession):
    n = db.get(Notification, notification_id)
    if n is None or n.user_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND)
    n.read = True
    db.commit()
    return {"ok": True}


@router.put("/read-all")
def mark_all_read(user: CurrentUser, db: DbSession):
    db.execute(
        update(Notification)
        .where(Notification.user_id == user.id, Notification.read == False)  # noqa: E712
        .values(read=True)
    )
    db.commit()
    return {"ok": True}
