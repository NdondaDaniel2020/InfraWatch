"""Dependências FastAPI para injeção de sessão e Unit of Work."""

from __future__ import annotations

from src.core.database.session import DbSessionDep, get_db_session
from src.core.database.unit_of_work import (
    SqlAlchemyUnitOfWork,
    UnitOfWorkDep,
    get_unit_of_work,
)

__all__ = [
    "DbSessionDep",
    "SqlAlchemyUnitOfWork",
    "UnitOfWorkDep",
    "get_db_session",
    "get_unit_of_work",
]
