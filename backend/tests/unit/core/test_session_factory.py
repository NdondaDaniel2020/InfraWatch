"""Testes unitários para fábrica e utilitários de sessão de banco de dados assíncrono."""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from src.core.database.session import (
    build_async_database_url,
    get_db_session,
    get_engine,
)


def test_build_async_database_url() -> None:
    assert (
        build_async_database_url("postgresql://user:pass@localhost:5432/db")
        == "postgresql+asyncpg://user:pass@localhost:5432/db"
    )
    assert build_async_database_url("sqlite:///app.db") == "sqlite+aiosqlite:///app.db"
    assert (
        build_async_database_url("sqlite+aiosqlite:///:memory:") == "sqlite+aiosqlite:///:memory:"
    )


def test_get_engine_no_database_url() -> None:
    get_engine.cache_clear()
    with patch("src.core.database.session.get_settings") as mock_settings:
        mock_settings.return_value.DATABASE_URL = ""
        with pytest.raises(RuntimeError, match="DATABASE_URL não configurado"):
            get_engine()
    get_engine.cache_clear()


@pytest.mark.asyncio
async def test_get_db_session_lifecycle() -> None:
    mock_session = MagicMock(spec=AsyncSession)
    mock_session.close = AsyncMock()

    class MockAsyncContext:
        async def __aenter__(self):
            return mock_session

        async def __aexit__(self, exc_type, exc_val, exc_tb):
            pass

    mock_factory = MagicMock(return_value=MockAsyncContext())

    with patch("src.core.database.session.get_session_factory", return_value=mock_factory):
        sessions = []
        async for session in get_db_session():
            sessions.append(session)

        assert len(sessions) == 1
        assert sessions[0] is mock_session
