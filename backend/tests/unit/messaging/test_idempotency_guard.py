"""Testes unitários para o serviço IdempotencyGuard.

Valida:
1. Verificação inicial (is_processed retorna False para novos eventos).
2. Marcação e persistência ACID (mark_processed e consulta no banco).
3. Cache em memória via Redis com TTL e fallback transparente.
4. Idempotência em múltiplas chamadas de mark_processed.
5. Tratamento gracioso de erros de cache e identificadores inválidos.
"""

from unittest.mock import AsyncMock
from uuid import uuid4

import pytest
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from src.core.database.base_model import Base
from src.core.messaging.idempotency import IdempotencyGuard


@pytest.fixture
async def db_session_factory():
    engine = create_async_engine("sqlite+aiosqlite:///:memory:", echo=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    factory = async_sessionmaker(bind=engine, expire_on_commit=False)
    yield factory
    await engine.dispose()


@pytest.mark.asyncio
async def test_idempotency_guard_db_lifecycle(db_session_factory) -> None:
    guard = IdempotencyGuard(session_factory=db_session_factory)
    event_id = uuid4()
    consumer = "TestConsumer"

    # 1. Não processado inicialmente
    assert await guard.is_processed(event_id, consumer) is False

    # 2. Marca como processado
    await guard.mark_processed(event_id, consumer)

    # 3. Agora deve constar como processado
    assert await guard.is_processed(event_id, consumer) is True


@pytest.mark.asyncio
async def test_idempotency_guard_with_explicit_session(db_session_factory) -> None:
    guard = IdempotencyGuard(session_factory=db_session_factory)
    event_id = uuid4()
    consumer = "ExplicitSessionConsumer"

    async with db_session_factory() as session, session.begin():
        assert await guard.is_processed(event_id, consumer, session=session) is False
        await guard.mark_processed(event_id, consumer, session=session)
        assert await guard.is_processed(event_id, consumer, session=session) is True


@pytest.mark.asyncio
async def test_idempotency_guard_multiple_marks_are_idempotent(db_session_factory) -> None:
    guard = IdempotencyGuard(session_factory=db_session_factory)
    event_id = uuid4()
    consumer = "DuplicateConsumer"

    # Múltiplas chamadas não devem lançar IntegrityError
    await guard.mark_processed(event_id, consumer)
    await guard.mark_processed(event_id, consumer)
    assert await guard.is_processed(event_id, consumer) is True


@pytest.mark.asyncio
async def test_idempotency_guard_redis_cache_hit_and_miss(db_session_factory) -> None:
    mock_redis = AsyncMock()
    mock_redis.get.return_value = None  # Cache miss

    guard = IdempotencyGuard(redis_client=mock_redis, session_factory=db_session_factory)
    event_id = uuid4()
    consumer = "RedisConsumer"

    # Miss no cache, miss no banco
    assert await guard.is_processed(event_id, consumer) is False
    mock_redis.get.assert_awaited_once_with(f"idempotency:{consumer}:{event_id}")

    # Marca como processado: deve gravar no DB e no Redis
    await guard.mark_processed(event_id, consumer)
    mock_redis.set.assert_awaited_with(f"idempotency:{consumer}:{event_id}", "1", ex=86400)

    # Simula HIT no cache Redis
    mock_redis.get.return_value = "1"
    assert await guard.is_processed(event_id, consumer) is True


@pytest.mark.asyncio
async def test_idempotency_guard_redis_failure_falls_back_to_db(db_session_factory) -> None:
    mock_redis = AsyncMock()
    mock_redis.get.side_effect = ConnectionError("Redis unreachable")
    mock_redis.set.side_effect = ConnectionError("Redis unreachable")

    guard = IdempotencyGuard(redis_client=mock_redis, session_factory=db_session_factory)
    event_id = uuid4()
    consumer = "FallbackConsumer"

    # Falha no Redis não trava a consulta no DB
    assert await guard.is_processed(event_id, consumer) is False

    # Marcação no DB persiste mesmo se Redis falhar
    await guard.mark_processed(event_id, consumer)
    assert await guard.is_processed(event_id, consumer) is True


@pytest.mark.asyncio
async def test_idempotency_guard_invalid_event_id_handled_safely(db_session_factory) -> None:
    guard = IdempotencyGuard(session_factory=db_session_factory)
    # Não deve lançar exceção
    assert await guard.is_processed("not-a-valid-uuid", "InvalidIdConsumer") is False
    await guard.mark_processed("not-a-valid-uuid", "InvalidIdConsumer")
