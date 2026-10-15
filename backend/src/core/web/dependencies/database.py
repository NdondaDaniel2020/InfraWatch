"""Dependências FastAPI para injeção de sessão e Unit of Work."""

from __future__ import annotations

from typing import Annotated

from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession

from src.core.database.session import get_db_session
from src.core.database.unit_of_work import AbstractUnitOfWork, SqlAlchemyUnitOfWork

DbSessionDep = Annotated[AsyncSession, Depends(get_db_session)]


def get_unit_of_work(session: DbSessionDep) -> SqlAlchemyUnitOfWork:
    """Fábrica FastAPI para injeção de Unit of Work."""
    return SqlAlchemyUnitOfWork(session=session)


UnitOfWorkDep = Annotated[AbstractUnitOfWork, Depends(get_unit_of_work)]

__all__ = [
    "DbSessionDep",
    "SqlAlchemyUnitOfWork",
    "UnitOfWorkDep",
    "get_db_session",
    "get_unit_of_work",
]
