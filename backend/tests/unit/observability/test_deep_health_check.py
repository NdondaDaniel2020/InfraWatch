"""Testes unitários para a checagem profunda de integridade operacional (get_health_status)."""

from unittest.mock import AsyncMock, MagicMock

import pytest

from src.core.observability.observability import get_health_status


@pytest.mark.asyncio
async def test_health_check_healthy_when_all_services_ok() -> None:
    """Valida retorno 'healthy' com latências quando PostgreSQL e Redis respondem com sucesso."""
    mock_session = AsyncMock()
    mock_session.execute = AsyncMock()

    mock_session_factory = MagicMock()
    mock_session_factory.return_value.__aenter__.return_value = mock_session
    mock_session_factory.return_value.__aexit__.return_value = None

    mock_redis = AsyncMock()
    mock_redis.ping = AsyncMock(return_value=True)

    health = await get_health_status(
        session_factory=mock_session_factory,
        redis_client=mock_redis,
    )

    assert health["status"] == "healthy"
    assert health["service"] == "infrawatch-api"

    assert health["checks"]["database"]["status"] == "ok"
    assert "latency_ms" in health["checks"]["database"]

    assert health["checks"]["redis"]["status"] == "ok"
    assert "latency_ms" in health["checks"]["redis"]


@pytest.mark.asyncio
async def test_health_check_degraded_when_database_fails() -> None:
    """Valida status 'degraded' quando o banco falha mas o Redis está operacional."""
    mock_session = AsyncMock()
    mock_session.execute.side_effect = RuntimeError("Database connection timed out")

    mock_session_factory = MagicMock()
    mock_session_factory.return_value.__aenter__.return_value = mock_session
    mock_session_factory.return_value.__aexit__.return_value = None

    mock_redis = AsyncMock()
    mock_redis.ping = AsyncMock(return_value=True)

    health = await get_health_status(
        session_factory=mock_session_factory,
        redis_client=mock_redis,
    )

    assert health["status"] == "degraded"
    assert health["checks"]["database"]["status"] == "fail"
    assert "Database connection timed out" in health["checks"]["database"]["error"]
    assert health["checks"]["redis"]["status"] == "ok"


@pytest.mark.asyncio
async def test_health_check_degraded_when_redis_fails() -> None:
    """Valida status 'degraded' quando o Redis falha mas o banco está operacional."""
    mock_session = AsyncMock()
    mock_session.execute = AsyncMock()

    mock_session_factory = MagicMock()
    mock_session_factory.return_value.__aenter__.return_value = mock_session
    mock_session_factory.return_value.__aexit__.return_value = None

    mock_redis = AsyncMock()
    mock_redis.ping.side_effect = ConnectionRefusedError("Redis down")

    health = await get_health_status(
        session_factory=mock_session_factory,
        redis_client=mock_redis,
    )

    assert health["status"] == "degraded"
    assert health["checks"]["database"]["status"] == "ok"
    assert health["checks"]["redis"]["status"] == "fail"
    assert "Redis down" in health["checks"]["redis"]["error"]


@pytest.mark.asyncio
async def test_health_check_unhealthy_when_all_services_fail() -> None:
    """Valida status 'unhealthy' quando ambos PostgreSQL e Redis falham."""
    mock_session = AsyncMock()
    mock_session.execute.side_effect = RuntimeError("PG offline")

    mock_session_factory = MagicMock()
    mock_session_factory.return_value.__aenter__.return_value = mock_session
    mock_session_factory.return_value.__aexit__.return_value = None

    mock_redis = AsyncMock()
    mock_redis.ping.side_effect = RuntimeError("Redis offline")

    health = await get_health_status(
        session_factory=mock_session_factory,
        redis_client=mock_redis,
    )

    assert health["status"] == "unhealthy"
    assert health["checks"]["database"]["status"] == "fail"
    assert health["checks"]["redis"]["status"] == "fail"
