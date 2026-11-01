"""Testes unitários para o recuo progressivo (progressive backoff) nos barramentos e consumidores."""

import asyncio
from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock, patch
from uuid import uuid4

import pytest
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from src.contexts.alerting.consumers.alert_notification_consumer import (
    AlertNotificationConsumer,
)
from src.contexts.alerting.consumers.glpi_ticket_consumer import (
    GlpiTicketConsumer,
)
from src.contexts.iam.consumers.iam_email_consumer import (
    IamEmailConsumer,
)
from src.core.database.base_model import Base
from src.core.messaging.idempotency import IdempotencyGuard
from src.core.messaging.in_memory_bus import InMemoryEventBus
from src.core.messaging.redis_streams_bus import RedisStreamsEventBus
from src.core.messaging.resilient_bus import ResilientEventBus


@pytest.fixture
async def db_session_factory():
    engine = create_async_engine("sqlite+aiosqlite:///:memory:", echo=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    factory = async_sessionmaker(bind=engine, expire_on_commit=False)
    yield factory
    await engine.dispose()


@pytest.fixture
async def idempotency_guard(db_session_factory):
    return IdempotencyGuard(session_factory=db_session_factory)


# ============================================================================
# 1. Testes de Barramento: RedisStreamsEventBus
# ============================================================================


@pytest.mark.asyncio
async def test_redis_streams_should_process_retry_thresholds() -> None:
    """Valida limiares de recuo progressivo (30s, 60s, 180s, 300s) no Redis Streams."""
    mock_redis = AsyncMock()
    bus = RedisStreamsEventBus(redis_client=mock_redis)

    # 1ª tentativa: sempre True
    mock_redis.xpending_range.return_value = [
        {"name": "msg-1", "consumer": "w-1", "idle": 0, "times_delivered": 1}
    ]
    assert await bus.should_process_retry("stream:incidents", "cg:workers", "msg-1") is True

    # 2ª tentativa (limiar: 30_000 ms)
    mock_redis.xpending_range.return_value = [
        {"name": "msg-1", "consumer": "w-1", "idle": 15000, "times_delivered": 2}
    ]
    assert await bus.should_process_retry("stream:incidents", "cg:workers", "msg-1") is False

    mock_redis.xpending_range.return_value = [
        {"name": "msg-1", "consumer": "w-1", "idle": 30000, "times_delivered": 2}
    ]
    assert await bus.should_process_retry("stream:incidents", "cg:workers", "msg-1") is True

    # 3ª tentativa (limiar: 60_000 ms)
    mock_redis.xpending_range.return_value = [
        ("msg-1", "w-1", 45000, 3)
    ]
    assert await bus.should_process_retry("stream:incidents", "cg:workers", "msg-1") is False

    mock_redis.xpending_range.return_value = [
        ("msg-1", "w-1", 60000, 3)
    ]
    assert await bus.should_process_retry("stream:incidents", "cg:workers", "msg-1") is True

    # 4ª tentativa (limiar: 180_000 ms)
    mock_redis.xpending_range.return_value = [
        {"name": "msg-1", "consumer": "w-1", "idle": 100000, "times_delivered": 4}
    ]
    assert await bus.should_process_retry("stream:incidents", "cg:workers", "msg-1") is False

    mock_redis.xpending_range.return_value = [
        {"name": "msg-1", "consumer": "w-1", "idle": 180000, "times_delivered": 4}
    ]
    assert await bus.should_process_retry("stream:incidents", "cg:workers", "msg-1") is True

    # 5ª tentativa ou superior (limiar: 300_000 ms)
    mock_redis.xpending_range.return_value = [
        {"name": "msg-1", "consumer": "w-1", "idle": 200000, "times_delivered": 5}
    ]
    assert await bus.should_process_retry("stream:incidents", "cg:workers", "msg-1") is False

    mock_redis.xpending_range.return_value = [
        {"name": "msg-1", "consumer": "w-1", "idle": 305000, "times_delivered": 5}
    ]
    assert await bus.should_process_retry("stream:incidents", "cg:workers", "msg-1") is True

    # Caso defensivo: se não encontrar no PEL ou houver erro, retorna True
    mock_redis.xpending_range.return_value = []
    assert await bus.should_process_retry("stream:incidents", "cg:workers", "msg-unknown") is True

    mock_redis.xpending_range.side_effect = TimeoutError("Redis timeout")
    assert await bus.should_process_retry("stream:incidents", "cg:workers", "msg-1") is True


# ============================================================================
# 2. Testes de Barramento: InMemoryEventBus & ResilientEventBus
# ============================================================================


@pytest.mark.asyncio
async def test_in_memory_should_process_retry() -> None:
    """Valida cálculo de recuo progressivo no InMemoryEventBus."""
    bus = InMemoryEventBus()
    topic = "stream:test"
    group = "cg:test"

    await bus.publish(topic, {"data": "test"})
    messages = await bus.consume_batch(topic, group, "worker-1", batch_size=1)
    msg_id, _ = messages[0]

    # 1ª entrega: delivery_count = 1 -> True
    assert await bus.should_process_retry(topic, group, msg_id) is True

    # Simula 2ª entrega (reentrega recente) -> idle < 30s -> False
    bus._delivery_counts[(topic, group, msg_id)] = 2
    assert await bus.should_process_retry(topic, group, msg_id) is False

    # Simula passagem de tempo de 35 segundos para a 2ª entrega -> True
    past_time = datetime.now(UTC) - timedelta(seconds=35)
    bus._pel[topic][group][msg_id] = ("worker-1", past_time, {"data": "test"})
    assert await bus.should_process_retry(topic, group, msg_id) is True

    await bus.close()


@pytest.mark.asyncio
async def test_resilient_event_bus_delegates_should_process_retry() -> None:
    """Valida delegação transparente de should_process_retry no ResilientEventBus."""
    mock_primary = AsyncMock()
    mock_primary.should_process_retry.return_value = False

    fallback = InMemoryEventBus()
    bus = ResilientEventBus(primary_bus=mock_primary, fallback_bus=fallback)

    # 1. Com primário saudável
    assert await bus.should_process_retry("stream:t", "cg:g", "m-1") is False
    mock_primary.should_process_retry.assert_awaited_once_with("stream:t", "cg:g", "m-1")

    # 2. Com falha de conexão no primário -> comuta para fallback
    mock_primary.should_process_retry.side_effect = ConnectionRefusedError("Redis down")
    # No fallback, msg não está pendente -> default True
    assert await bus.should_process_retry("stream:t", "cg:g", "m-1") is True
    assert bus.is_primary_healthy is False

    await bus.close()


# ============================================================================
# 3. Testes dos Consumidores com Backoff
# ============================================================================


@pytest.mark.asyncio
async def test_glpi_ticket_consumer_skips_when_in_backoff(idempotency_guard) -> None:
    """Valida que GlpiTicketConsumer posterga mensagens cujo backoff ainda não expirou."""
    mock_bus = AsyncMock()
    consumer = GlpiTicketConsumer(
        event_bus=mock_bus,
        glpi_base_url="http://mock-glpi",
        glpi_app_token="app_tok",
        glpi_user_token="user_tok",
        idempotency_guard=idempotency_guard,
    )

    msg_id = "msg-glpi-1"
    payload = {
        "event_id": str(uuid4()),
        "event_type": "IncidentTriggeredEvent",
        "severity": "CRITICAL",
        "device_name": "Switch-Core",
    }
    stop_event = asyncio.Event()

    def _consume_once(*_args, **_kwargs):
        stop_event.set()
        return [(msg_id, payload)]

    mock_bus.consume_batch.side_effect = _consume_once
    mock_bus.should_process_retry.return_value = False

    with patch("src.contexts.alerting.consumers.glpi_ticket_consumer.GlpiClient") as mock_glpi_cls:
        await consumer.consume_loop(stop_event=stop_event)

        # Não deve invocar cliente GLPI nem enviar ACK nem enviar para DLQ
        mock_glpi_cls.assert_not_called()
        mock_bus.ack.assert_not_awaited()
        mock_bus.send_to_dlq.assert_not_awaited()


@pytest.mark.asyncio
async def test_alert_notification_consumer_skips_when_in_backoff(idempotency_guard) -> None:
    """Valida que AlertNotificationConsumer adia processamento em caso de backoff ativo."""
    mock_bus = AsyncMock()
    mock_dispatcher = AsyncMock()
    consumer = AlertNotificationConsumer(
        event_bus=mock_bus,
        dispatcher=mock_dispatcher,
        idempotency_guard=idempotency_guard,
    )

    msg_id = "msg-alert-1"
    payload = {
        "event_id": str(uuid4()),
        "event_type": "IncidentTriggeredEvent",
        "severity": "DOWN",
        "device_name": "Firewall-01",
    }
    stop_event = asyncio.Event()

    def _consume_once(*_args, **_kwargs):
        stop_event.set()
        return [(msg_id, payload)]

    mock_bus.consume_batch.side_effect = _consume_once
    mock_bus.should_process_retry.return_value = False

    await consumer.consume_loop(stop_event=stop_event)

    mock_dispatcher.dispatch_by_severity.assert_not_awaited()
    mock_bus.ack.assert_not_awaited()


@pytest.mark.asyncio
async def test_iam_email_consumer_skips_when_in_backoff(idempotency_guard) -> None:
    """Valida que IamEmailConsumer adia envio de email se em período de recuo."""
    mock_bus = AsyncMock()
    consumer = IamEmailConsumer(
        event_bus=mock_bus,
        idempotency_guard=idempotency_guard,
    )

    msg_id = "msg-iam-1"
    payload = {
        "event_id": str(uuid4()),
        "event_type": "EmailVerifiedEvent",
        "email": "user@example.com",
    }
    stop_event = asyncio.Event()

    def _consume_once(*_args, **_kwargs):
        stop_event.set()
        return [(msg_id, payload)]

    mock_bus.consume_batch.side_effect = _consume_once
    mock_bus.should_process_retry.return_value = False

    with patch.object(consumer, "handle", new_callable=AsyncMock) as mock_handle:
        await consumer.consume_loop(stop_event=stop_event)

        mock_handle.assert_not_awaited()
        mock_bus.ack.assert_not_awaited()
