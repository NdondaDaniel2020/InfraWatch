"""Gerenciamento de conexões assíncronas do SQLAlchemy 2.0 para o InfraWatch.

Configura o AsyncEngine com pool de conexões dimensionado para alta concorrência
e sessionmaker assíncrono com expire_on_commit=False.
"""

from collections.abc import AsyncGenerator
from functools import lru_cache
from typing import Annotated, Any

from fastapi import Depends
from sqlalchemy import pool
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from src.core.config import get_settings


def build_async_database_url(url: str) -> str:
    """Garante que a URL do banco utilize os drivers assíncronos (asyncpg ou aiosqlite)."""
    if url.startswith("postgresql://"):
        return url.replace("postgresql://", "postgresql+asyncpg://", 1)
    if url.startswith("sqlite:///"):
        return url.replace("sqlite:///", "sqlite+aiosqlite:///", 1)
    return url


@lru_cache(maxsize=1)
def get_engine() -> AsyncEngine:
    """Cria e retorna uma instância singleton do AsyncEngine."""
    settings = get_settings()
    db_url = build_async_database_url(settings.DATABASE_URL)

    engine_kwargs: dict[str, Any] = {
        "echo": False,
    }

    # SQLite (usado em testes in-memory) requer StaticPool ou NullPool e não suporta pool_size
    if "sqlite" in db_url:
        engine_kwargs["connect_args"] = {"check_same_thread": False}
        if ":memory:" in db_url:
            engine_kwargs["poolclass"] = pool.StaticPool
    else:
        # Configurações de Pool para PostgreSQL em alta concorrência
        engine_kwargs.update(
            {
                "pool_size": settings.DB_POOL_SIZE,
                "max_overflow": settings.DB_MAX_OVERFLOW,
                "pool_timeout": settings.DB_POOL_TIMEOUT,
                "pool_pre_ping": settings.DB_POOL_PRE_PING,
            }
        )

    return create_async_engine(db_url, **engine_kwargs)


@lru_cache(maxsize=1)
def get_session_factory() -> async_sessionmaker[AsyncSession]:
    """Cria e retorna o sessionmaker configurado para sessões assíncronas."""
    engine = get_engine()
    return async_sessionmaker(
        bind=engine,
        class_=AsyncSession,
        expire_on_commit=False,
        autoflush=False,
    )


async def get_db_session() -> AsyncGenerator[AsyncSession, None]:
    """Dependência FastAPI para injeção de sessão assíncrona por requisição."""
    session_factory = get_session_factory()
    async with session_factory() as session:
        try:
            yield session
        finally:
            await session.close()


DbSessionDep = Annotated[AsyncSession, Depends(get_db_session)]
