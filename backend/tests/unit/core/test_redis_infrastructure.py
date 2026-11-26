"""Testes unitários para o módulo core.infrastructure.redis."""

from __future__ import annotations

import json
from unittest.mock import AsyncMock, patch

import pytest
from redis.exceptions import RedisError

import src.core.infrastructure.redis as redis_module
from src.core.infrastructure.redis import (
    _sanitize_redis_url,
    cache_delete,
    cache_delete_pattern,
    cache_get,
    cache_set,
    close_redis,
    ensure_redis,
    get_redis_client,
    init_redis,
    rate_limit_check,
    redis_lifespan,
    session_delete,
    session_delete_user_sessions,
    session_get,
    session_store,
)


def test_sanitize_redis_url() -> None:
    """Valida mascaramento de credenciais na URL do Redis."""
    assert (
        _sanitize_redis_url("redis://:secret@localhost:6379/0") == "redis://:***@localhost:6379/0"
    )
    assert (
        _sanitize_redis_url("redis://user:pass123@redis.local:6379/1")
        == "redis://:***@redis.local:6379/1"
    )
    assert _sanitize_redis_url("redis://localhost:6379/0") == "redis://localhost:6379/0"


@pytest.mark.asyncio
async def test_init_and_close_redis() -> None:
    """Valida inicialização e fechamento seguro do cliente Redis."""
    # Reset estado inicial
    await close_redis()

    # 1. Sem URL configurada
    with patch("src.core.infrastructure.redis.get_settings") as mock_settings:
        mock_settings.return_value.REDIS_URL = None
        client = await init_redis()
        assert client is None
        assert get_redis_client() is None

    # 2. Com URL e sucesso na conexão
    mock_redis = AsyncMock()
    mock_redis.ping = AsyncMock()
    with (
        patch("src.core.infrastructure.redis.get_settings") as mock_settings,
        patch("src.core.infrastructure.redis.redis.from_url", return_value=mock_redis),
    ):
        mock_settings.return_value.REDIS_URL = "redis://localhost:6379/0"
        mock_settings.return_value.REDIS_MAX_CONNECTIONS = 10
        client = await init_redis()
        assert client is mock_redis
        assert get_redis_client() is mock_redis

    # 3. ensure_redis quando já inicializado
    same_client = await ensure_redis()
    assert same_client is mock_redis

    # 4. Fechamento
    await close_redis()
    assert get_redis_client() is None
    mock_redis.aclose.assert_awaited_once()


@pytest.mark.asyncio
async def test_init_redis_error_handling() -> None:
    """Valida tratamento de erro ao falhar ping do Redis."""
    await close_redis()
    mock_redis = AsyncMock()
    mock_redis.ping.side_effect = RedisError("Connection refused")

    # Em ambiente não-produção: registra warning e retorna None
    with (
        patch("src.core.infrastructure.redis.get_settings") as mock_settings,
        patch("src.core.infrastructure.redis.redis.from_url", return_value=mock_redis),
    ):
        mock_settings.return_value.REDIS_URL = "redis://localhost:6379/0"
        mock_settings.return_value.ENVIRONMENT = "test"
        client = await init_redis()
        assert client is None

    # Em ambiente produção: levanta exceção
    with (
        patch("src.core.infrastructure.redis.get_settings") as mock_settings,
        patch("src.core.infrastructure.redis.redis.from_url", return_value=mock_redis),
    ):
        mock_settings.return_value.REDIS_URL = "redis://localhost:6379/0"
        mock_settings.return_value.ENVIRONMENT = "production"
        with pytest.raises(RedisError):
            await init_redis()

    await close_redis()


@pytest.mark.asyncio
async def test_redis_lifespan() -> None:
    """Valida o context manager redis_lifespan."""
    mock_redis = AsyncMock()
    mock_redis.ping = AsyncMock()
    with (
        patch("src.core.infrastructure.redis.get_settings") as mock_settings,
        patch("src.core.infrastructure.redis.redis.from_url", return_value=mock_redis),
    ):
        mock_settings.return_value.REDIS_URL = "redis://localhost:6379/0"
        async with redis_lifespan():
            assert get_redis_client() is mock_redis
    assert get_redis_client() is None


@pytest.mark.asyncio
async def test_cache_helpers() -> None:
    """Valida helpers de cache: get, set, delete e delete_pattern."""
    # 1. Sem cliente configurado
    await close_redis()
    assert await cache_get("key1") is None
    assert await cache_set("key1", "val1") is False
    assert await cache_delete("key1") is False
    assert await cache_delete_pattern("key*") == 0

    # 2. Com cliente configurado
    mock_client = AsyncMock()
    redis_module._redis_client = mock_client

    # Get
    mock_client.get.return_value = json.dumps({"hello": "world"})
    val = await cache_get("test_key")
    assert val == {"hello": "world"}

    # Set
    assert await cache_set("test_key", {"k": "v"}, ttl=60) is True
    mock_client.setex.assert_awaited_with("test_key", 60, json.dumps({"k": "v"}))

    # Delete
    assert await cache_delete("test_key") is True
    mock_client.delete.assert_awaited_with("test_key")

    # Delete pattern
    async def fake_scan_iter(match: str):
        for k in ["test:1", "test:2"]:
            yield k

    mock_client.scan_iter = fake_scan_iter
    mock_client.delete.return_value = 2
    deleted = await cache_delete_pattern("test:*")
    assert deleted == 2

    # Tratamento de exceções
    mock_client.get.side_effect = RedisError("error")
    assert await cache_get("err") is None

    mock_client.setex.side_effect = RedisError("error")
    assert await cache_set("err", 123) is False

    mock_client.delete.side_effect = RedisError("error")
    assert await cache_delete("err") is False

    await close_redis()


@pytest.mark.asyncio
async def test_rate_limit_check() -> None:
    """Valida rate_limit_check em cenários de sucesso, excedido, fail-open e fail-closed."""
    # 1. Sem cliente - dev/test (fail-open -> retorna None)
    await close_redis()
    with patch("src.core.infrastructure.redis.get_settings") as mock_settings:
        mock_settings.return_value.ENVIRONMENT = "test"
        assert await rate_limit_check("user:123", limit=5, window_seconds=60) is None

    # 2. Sem cliente - production (fail-closed -> retorna window_seconds)
    with patch("src.core.infrastructure.redis.get_settings") as mock_settings:
        mock_settings.return_value.ENVIRONMENT = "production"
        assert await rate_limit_check("user:123", limit=5, window_seconds=60) == 60

    # 3. Com cliente - dentro do limite
    mock_client = AsyncMock()
    redis_module._redis_client = mock_client
    with patch("src.core.infrastructure.redis.get_settings") as mock_settings:
        mock_settings.return_value.ENVIRONMENT = "production"
        mock_client.incr.return_value = 1
        assert await rate_limit_check("user:123", limit=5, window_seconds=60) is None
        mock_client.expire.assert_awaited_with("user:123", 60)

        # 4. Com cliente - limite excedido
        mock_client.incr.return_value = 6
        mock_client.ttl.return_value = 45
        assert await rate_limit_check("user:123", limit=5, window_seconds=60) == 45

        # 5. Com erro no Redis em produção (fail-closed)
        mock_client.incr.side_effect = RedisError("timeout")
        assert await rate_limit_check("user:123", limit=5, window_seconds=60) == 60

    await close_redis()


@pytest.mark.asyncio
async def test_session_helpers() -> None:
    """Valida helpers de sessão."""
    mock_client = AsyncMock()
    redis_module._redis_client = mock_client

    mock_client.get.return_value = json.dumps({"user_id": "u-123"})
    assert await session_store("sess-1", {"user_id": "u-123"}) is True
    assert await session_get("sess-1") == {"user_id": "u-123"}
    assert await session_delete("sess-1") is True

    async def fake_scan(match: str):
        yield "session:123:user_id:u-123"

    mock_client.scan_iter = fake_scan
    mock_client.delete.return_value = 1
    assert await session_delete_user_sessions("u-123") == 1

    await close_redis()
