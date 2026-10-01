"""Testes de integração para o Unit of Work assíncrono (SqlAlchemyUnitOfWork).

Valida:
1. Commit atômico persistindo alterações no banco relacional.
2. Rollback automático em caso de exceção dentro do bloco 'async with uow:'.
3. Liberação e fechamento da sessão assíncrona após saída do contexto.
4. Proteção contra acesso a uow.session fora do context manager.
"""

from collections.abc import AsyncGenerator

import pytest
from sqlalchemy import String, select
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.pool import StaticPool

from src.core.database.base_model import Base
from src.core.database.unit_of_work import SqlAlchemyUnitOfWork

# ---------------------------------------------------------------------------
# Modelo ORM de Teste
# ---------------------------------------------------------------------------


class InventoryItem(Base):
    """Modelo relacional de teste mapeado pelo SQLAlchemy 2.0."""

    __tablename__ = "test_inventory_items"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    status: Mapped[str] = mapped_column(String(50), default="ACTIVE")


# ---------------------------------------------------------------------------
# Fixtures do Pytest
# ---------------------------------------------------------------------------


@pytest.fixture
async def test_session_factory() -> AsyncGenerator[async_sessionmaker[AsyncSession], None]:
    """Cria engine SQLite in-memory isolada por teste e inicializa tabelas."""
    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    factory = async_sessionmaker(
        bind=engine,
        class_=AsyncSession,
        expire_on_commit=False,
    )

    yield factory

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    await engine.dispose()


# ---------------------------------------------------------------------------
# Casos de Teste Assíncronos
# ---------------------------------------------------------------------------


async def test_uow_commit_persists_data(
    test_session_factory: async_sessionmaker[AsyncSession],
) -> None:
    """Verifica se uow.commit() persiste atomicamente os dados criados na sessão."""
    uow = SqlAlchemyUnitOfWork(session_factory=test_session_factory)

    async with uow:
        item = InventoryItem(name="Switch-Edge-01", status="ONLINE")
        uow.session.add(item)
        await uow.commit()

    # Validar em uma nova sessão independente
    async with test_session_factory() as read_session:
        result = await read_session.execute(
            select(InventoryItem).where(InventoryItem.name == "Switch-Edge-01")
        )
        saved = result.scalar_one_or_none()
        assert saved is not None
        assert saved.name == "Switch-Edge-01"
        assert saved.status == "ONLINE"


async def test_uow_automatic_rollback_on_exception(
    test_session_factory: async_sessionmaker[AsyncSession],
) -> None:
    """Verifica se qualquer exceção disparada dentro do bloco uow reverte todas as mutações."""
    uow = SqlAlchemyUnitOfWork(session_factory=test_session_factory)

    with pytest.raises(ValueError, match="Erro simulado de integridade"):
        async with uow:
            item = InventoryItem(name="Router-Failed-01", status="PENDING")
            uow.session.add(item)
            # Simula falha catastrófica de negócio antes do commit
            raise ValueError("Erro simulado de integridade")

    # Validar que o item NÃO foi gravado no banco de dados
    async with test_session_factory() as read_session:
        result = await read_session.execute(
            select(InventoryItem).where(InventoryItem.name == "Router-Failed-01")
        )
        saved = result.scalar_one_or_none()
        assert saved is None


async def test_uow_session_closed_after_exit(
    test_session_factory: async_sessionmaker[AsyncSession],
) -> None:
    """Garante que a sessão é limpa e não pode mais ser acessada após a saída do bloco."""
    uow = SqlAlchemyUnitOfWork(session_factory=test_session_factory)

    async with uow:
        assert uow.session is not None

    # Fora do contexto, acessar uow.session deve disparar RuntimeError
    with pytest.raises(RuntimeError, match="Sessão não inicializada"):
        _ = uow.session


async def test_uow_manual_rollback(
    test_session_factory: async_sessionmaker[AsyncSession],
) -> None:
    """Verifica chamada explícita de rollback dentro do bloco."""
    uow = SqlAlchemyUnitOfWork(session_factory=test_session_factory)

    async with uow:
        item = InventoryItem(name="Server-Rollback", status="TEMP")
        uow.session.add(item)
        await uow.rollback()

    async with test_session_factory() as read_session:
        result = await read_session.execute(
            select(InventoryItem).where(InventoryItem.name == "Server-Rollback")
        )
        saved = result.scalar_one_or_none()
        assert saved is None
