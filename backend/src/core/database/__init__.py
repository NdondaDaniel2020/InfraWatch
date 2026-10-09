"""InfraWatch Core Database Package (SQLAlchemy 2.0 Async, Session and Unit of Work)."""

from src.core.database.base_model import NAMING_CONVENTION, Base
from src.core.database.outbox_repository import OutboxRepository
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
