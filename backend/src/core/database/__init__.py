"""InfraWatch Core Database Package (SQLAlchemy 2.0 Async, Session and Unit of Work)."""

from typing import TYPE_CHECKING

from src.core.database.base_model import NAMING_CONVENTION, Base
from src.core.database.session import (
    DbSessionDep,
    build_async_database_url,
    get_db_session,
    get_engine,
    get_session_factory,
)
from src.core.database.unit_of_work import (
    AbstractUnitOfWork,
    SqlAlchemyUnitOfWork,
)

if TYPE_CHECKING:
    from src.core.database.outbox_repository import OutboxRepository

__all__ = [
    "NAMING_CONVENTION",
    "AbstractUnitOfWork",
    "Base",
    "DbSessionDep",
    "OutboxRepository",
    "SqlAlchemyUnitOfWork",
    "build_async_database_url",
    "get_db_session",
    "get_engine",
    "get_session_factory",
]


def __getattr__(name: str):
    if name == "OutboxRepository":
        from src.core.database.outbox_repository import OutboxRepository

        return OutboxRepository
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")
