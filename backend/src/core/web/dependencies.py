"""Dependências FastAPI transversais do núcleo da aplicação (Sessão, UoW, Paginação)."""

from __future__ import annotations

from src.core.database.session import DbSessionDep, get_db_session
from src.core.database.unit_of_work import UnitOfWorkDep, get_unit_of_work
from src.core.web.pagination import (
    PaginationParams,
    PaginationParamsDep,
    get_pagination_params,
)

__all__ = [
    "DbSessionDep",
    "PaginationParams",
    "PaginationParamsDep",
    "UnitOfWorkDep",
    "get_db_session",
    "get_pagination_params",
    "get_unit_of_work",
]
