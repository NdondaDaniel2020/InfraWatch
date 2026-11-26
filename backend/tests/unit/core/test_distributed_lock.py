"""Testes unitários para o DistributedLock com Redis."""

from __future__ import annotations

from unittest.mock import AsyncMock

import pytest
from redis.exceptions import RedisError

from src.core.redis.distributed_lock import DistributedLock, redis_distributed_lock


@pytest.mark.asyncio
async def test_distributed_lock_acquire_success_and_release() -> None:
    """Valida aquisição e liberação atômica com script Lua."""
    mock_redis = AsyncMock()
    mock_redis.set.return_value = True
    mock_redis.eval.return_value = 1

    lock = DistributedLock(redis_client=mock_redis, key="job_sync", timeout=60, blocking=False)
    assert not lock.acquired
    assert bool(lock) is False

    # 1. Adquirir lock com sucesso
    acquired = await lock.acquire()
    assert acquired is True
    assert lock.acquired is True
    assert bool(lock) is True
    mock_redis.set.assert_awaited_once_with(
        "lock:job_sync",
        lock.owner_id,
        nx=True,
        ex=60,
    )

    # 2. Liberar lock
    released = await lock.release()
    assert released is True
    assert lock.acquired is False
    mock_redis.eval.assert_awaited_once()

    # 3. Segunda tentativa de liberação não deve chamar eval pois acquired é False
    mock_redis.eval.reset_mock()
    assert await lock.release() is False
    mock_redis.eval.assert_not_awaited()


@pytest.mark.asyncio
async def test_distributed_lock_acquire_conflict_non_blocking() -> None:
    """Valida recusa imediata quando lock já retido e blocking=False."""
    mock_redis = AsyncMock()
    mock_redis.set.return_value = None  # Lock já retido por outro processo

    lock = DistributedLock(redis_client=mock_redis, key="lock:already_locked", blocking=False)
    assert lock.lock_key == "lock:already_locked"

    acquired = await lock.acquire()
    assert acquired is False
    assert lock.acquired is False


@pytest.mark.asyncio
async def test_distributed_lock_acquire_and_release_exceptions() -> None:
    """Valida tratamento seguro de exceções de rede no Redis."""
    mock_redis = AsyncMock()
    mock_redis.set.side_effect = RedisError("Network down")

    lock = DistributedLock(redis_client=mock_redis, key="faulty_lock")
    assert await lock.acquire() is False
    assert lock.acquired is False

    # Simular acquire forçado para testar release com erro
    lock._acquired = True
    mock_redis.eval.side_effect = ConnectionRefusedError("Redis down")
    assert await lock.release() is False
    assert lock.acquired is False


@pytest.mark.asyncio
async def test_redis_distributed_lock_context_manager() -> None:
    """Valida os context managers async with DistributedLock e redis_distributed_lock."""
    mock_redis = AsyncMock()
    mock_redis.set.return_value = True
    mock_redis.eval.return_value = 1

    # 1. Context manager na classe
    async with DistributedLock(mock_redis, "backup_job", timeout=30) as lock:
        assert lock.acquired is True

    assert lock.acquired is False

    # 2. Context manager auxiliar
    mock_redis.set.return_value = True
    mock_redis.eval.return_value = 1
    async with redis_distributed_lock(mock_redis, "backup_job", timeout=30) as lock:
        assert lock.acquired is True

    assert lock.acquired is False
