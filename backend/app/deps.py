from __future__ import annotations

from typing import Annotated

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from .db import get_db
from .models import Role, User
from .security import decode_access_token

bearer = HTTPBearer(auto_error=False)

DbSession = Annotated[Session, Depends(get_db)]


def current_user(
    db: DbSession,
    creds: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer)] = None,
) -> User:
    if creds is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Authentification requise")
    payload = decode_access_token(creds.credentials)
    if not payload:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Session expirée ou invalide")
    user = db.get(User, int(payload["sub"]))
    if user is None or not user.is_active:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Compte inactif")
    return user


CurrentUser = Annotated[User, Depends(current_user)]


def require_roles(*roles: Role):
    def _dep(user: CurrentUser) -> User:
        if user.role not in roles:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Accès non autorisé pour ce rôle")
        return user

    return _dep


def structure_manager(user: CurrentUser) -> User:
    """Qui gère classes, matières et inscriptions : l'administration d'un
    établissement, ou l'enseignant seul dans son espace personnel."""
    if user.role is Role.ADMIN:
        return user
    if user.role is Role.TEACHER and user.organization.is_personal:
        return user
    raise HTTPException(status.HTTP_403_FORBIDDEN, "Accès non autorisé pour ce rôle")


AdminUser = Annotated[User, Depends(require_roles(Role.ADMIN))]
StructureManager = Annotated[User, Depends(structure_manager)]
TeacherUser = Annotated[User, Depends(require_roles(Role.TEACHER))]
StudentUser = Annotated[User, Depends(require_roles(Role.STUDENT))]
