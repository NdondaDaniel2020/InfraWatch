"""Padrão Unit of Work (UoW) assíncrono para o InfraWatch.

Garante transações atômicas ACID através de context managers assíncronos,
com commit explícito, rollback automático em exceções e fechamento de sessão garantido.
"""

from abc import ABC, abstractmethod
from types import TracebackType
from typing import Annotated, Self

from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from src.core.database.session import DbSessionDep, get_session_factory


class AbstractUnitOfWork(ABC):
    """Contrato abstrato para o Unit of Work assíncrono."""

    session: AsyncSession

    async def __aenter__(self) -> Self:
        return self

    async def __aexit__(
        self,
        exc_type: type[BaseException] | None,
        exc_val: BaseException | None,
        exc_tb: TracebackType | None,
    ) -> None:
        if exc_type is not None:
            await self.rollback()

    @abstractmethod
    async def commit(self) -> None:
        """Confirma todas as alterações da transação atômica."""
        raise NotImplementedError

    @abstractmethod
    async def rollback(self) -> None:
        """Reverte todas as alterações não comitadas da transação."""
        raise NotImplementedError


class SqlAlchemyUnitOfWork(AbstractUnitOfWork):
    """Implementação concreta de Unit of Work utilizando SQLAlchemy 2.0 Async."""

    def __init__(
        self,
        session_factory: async_sessionmaker[AsyncSession] | None = None,
        session: AsyncSession | None = None,
    ) -> None:
        self._session_factory = session_factory
        self._session = session
        self._is_external_session = session is not None

    @property
    def session(self) -> AsyncSession:
        """Retorna a sessão assíncrona ativa dentro do contexto."""
        if self._session is None:
            raise RuntimeError(
                "Sessão não inicializada. O UnitOfWork deve ser utilizado dentro de um bloco 'async with uow:'."
            )
        return self._session

    async def __aenter__(self) -> Self:
        """Inicializa a sessão assíncrona ao entrar no context manager caso não tenha sido injetada externamente."""
        if not self._is_external_session and self._session is None:
            factory = self._session_factory or get_session_factory()
            self._session = factory()
        return self

    async def __aexit__(
        self,
        exc_type: type[BaseException] | None,
        exc_val: BaseException | None,
        exc_tb: TracebackType | None,
    ) -> None:
        """Garante rollback automático em falhas e encerramento da sessão gerenciada."""
        try:
            if exc_type is not None:
                await self.rollback()
        finally:
            if not self._is_external_session and self._session is not None:
                await self._session.close()
                self._session = None

    async def commit(self) -> None:
        """Confirma a transação na sessão ativa."""
        await self.session.commit()

    async def rollback(self) -> None:
        """Reverte a transação na sessão ativa."""
        await self.session.rollback()


def get_unit_of_work(session: DbSessionDep) -> SqlAlchemyUnitOfWork:
    """Dependência FastAPI para injetar o Unit of Work associado à sessão da requisição."""
    return SqlAlchemyUnitOfWork(session=session)


UnitOfWorkDep = Annotated[SqlAlchemyUnitOfWork, Depends(get_unit_of_work)]
