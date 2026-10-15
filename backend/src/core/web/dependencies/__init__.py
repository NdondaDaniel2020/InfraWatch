"""Módulo público de dependências transversais da camada Web do núcleo."""

from __future__ import annotations

from src.core.web.dependencies.database import (
    DbSessionDep,
    SqlAlchemyUnitOfWork,
    UnitOfWorkDep,
    get_db_session,
    get_unit_of_work,
)
from src.core.web.dependencies.infrastructure import (
    EventBusDep,
    RedisDep,
    get_event_bus,
    get_redis_client,
)
from src.core.web.dependencies.pagination import (
    PaginationParams,
    PaginationParamsDep,
    get_pagination_params,
)

__all__ = [
    "DbSessionDep",
    "EventBusDep",
    "PaginationParams",
    "PaginationParamsDep",
    "RedisDep",
    "SqlAlchemyUnitOfWork",
    "UnitOfWorkDep",
    "get_db_session",
    "get_event_bus",
    "get_pagination_params",
    "get_redis_client",
    "get_unit_of_work",
]
