"""Qui voit une classe, qui la gère.

Une classe appartient à un espace (établissement ou espace personnel) et ses
apprenants avec elle. Deux portes y mènent :

- l'espace lui-même : son administration et ses enseignants ;
- le partage : un enseignant invité, qui peut venir d'un autre espace.

La gestion (nom, inscrits, partage, suppression) revient à l'administration,
à l'enseignant seul dans son espace personnel, et au créateur de la classe.
L'invité y fait passer ses épreuves et voit la liste des inscrits.
"""

from __future__ import annotations

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from .models import Classroom, ClassroomShare, Role, User


def shared_classroom_ids(db: Session, user: User) -> set[int]:
    if user.role is not Role.TEACHER:
        return set()
    return set(
        db.scalars(select(ClassroomShare.classroom_id).where(ClassroomShare.teacher_id == user.id))
    )


def is_shared_with(db: Session, user: User, classroom: Classroom) -> bool:
    return user.role is Role.TEACHER and db.scalar(
        select(ClassroomShare.id).where(
            ClassroomShare.classroom_id == classroom.id, ClassroomShare.teacher_id == user.id
        )
    ) is not None


def can_access(db: Session, user: User, classroom: Classroom) -> bool:
    if classroom.organization_id == user.organization_id:
        return True
    return is_shared_with(db, user, classroom)


def can_manage(user: User, classroom: Classroom) -> bool:
    if classroom.organization_id != user.organization_id:
        return False
    if user.role is Role.ADMIN:
        return True
    if user.role is not Role.TEACHER:
        return False
    return user.organization.is_personal or classroom.owner_id == user.id


def classroom_for(db: Session, user: User, classroom_id: int) -> Classroom:
    """La classe, si l'utilisateur y a accès ; sinon elle n'existe pas pour lui."""
    classroom = db.get(Classroom, classroom_id)
    if classroom is None or not can_access(db, user, classroom):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Classe introuvable")
    return classroom


def managed_classroom(db: Session, user: User, classroom_id: int) -> Classroom:
    classroom = classroom_for(db, user, classroom_id)
    if not can_manage(user, classroom):
        raise HTTPException(
            status.HTTP_403_FORBIDDEN,
            "Seul le créateur de la classe peut la modifier",
        )
    return classroom
