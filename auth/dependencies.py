
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from auth.security import decode_token
from db.session import get_db
from db.models import User

__all__ = [
    "get_current_user", "require_role", "get_store_id",
    "StoreScopedSession", "get_store_scoped_session",
]

security_scheme = HTTPBearer(auto_error=False)

ROLE_HIERARCHY = {
    "owner": 4,
    "manager": 3,
    "staff": 2,
    "cashier": 1,
}


async def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(security_scheme),
    db: AsyncSession = Depends(get_db),
) -> User | None:
    """Returns the authenticated user or None if no/invalid token.

    Routes that require auth should use require_role() instead.
    """
    if credentials is None:
        return None

    payload = decode_token(credentials.credentials)
    if payload is None:
        return None

    user_id = payload.get("sub")
    if not user_id:
        return None

    result = await db.execute(select(User).where(User.id == user_id, User.is_active))
    return result.scalar_one_or_none()


def require_role(minimum_role: str = "cashier"):
    """Dependency factory: require the caller to have at least `minimum_role` level."""
    min_level = ROLE_HIERARCHY.get(minimum_role, 0)

    async def _dependency(
        credentials: HTTPAuthorizationCredentials | None = Depends(security_scheme),
        db: AsyncSession = Depends(get_db),
    ) -> User:
        if credentials is None:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication required")

        payload = decode_token(credentials.credentials)
        if payload is None:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired token")

        user_id = payload.get("sub")
        if not user_id:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token payload")

        result = await db.execute(select(User).where(User.id == user_id, User.is_active))
        user = result.scalar_one_or_none()
        if user is None:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found or deactivated")

        user_level = ROLE_HIERARCHY.get(user.role, 0)
        if user_level < min_level:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Requires role '{minimum_role}' or higher. Your role: '{user.role}'",
            )

        return user

    return _dependency


async def get_store_id(user: User = Depends(require_role("cashier"))) -> str:
    """Extract store_id from the current user. All tenant-scoped queries use this."""
    if not user.store_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="User is not assigned to any store",
        )
    return user.store_id


class StoreScopedSession:
    """Wraps an async DB session to auto-filter queries by store_id.

    Usage as a FastAPI dependency:
        scoped: StoreScopedSession = Depends(get_store_scoped_session)
        products = await scoped.query(Product)
        # Equivalent to: SELECT * FROM products WHERE store_id = <user's store>

    Also exposes the raw session and store_id for custom queries.
    """

    def __init__(self, db: AsyncSession, store_id: str):
        self.db = db
        self.store_id = store_id

    async def query(self, model, *extra_filters, order_by=None, limit: int = 500):
        """Query a model auto-filtered by store_id.

        Only applies store_id filter if the model has a store_id column.
        """
        stmt = select(model)
        if hasattr(model, "store_id"):
            stmt = stmt.where(model.store_id == self.store_id)
        for f in extra_filters:
            stmt = stmt.where(f)
        if order_by is not None:
            stmt = stmt.order_by(order_by)
        stmt = stmt.limit(limit)
        result = await self.db.execute(stmt)
        return result.scalars().all()

    async def get_one(self, model, *filters):
        """Get a single record, auto-scoped by store_id."""
        stmt = select(model)
        if hasattr(model, "store_id"):
            stmt = stmt.where(model.store_id == self.store_id)
        for f in filters:
            stmt = stmt.where(f)
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()


async def get_store_scoped_session(
    user: User = Depends(require_role("cashier")),
    db: AsyncSession = Depends(get_db),
) -> StoreScopedSession:
    """FastAPI dependency that returns a store-scoped DB session."""
    if not user.store_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="User is not assigned to any store",
        )
    return StoreScopedSession(db, user.store_id)
