"""Testes unitários para classificação semântica de falhas (Poison vs Transitórias) nos consumidores e Outbox Relay."""

import asyncio
from dataclasses import dataclass
from unittest.mock import AsyncMock, patch
from uuid import uuid4

import httpx
import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.pool import StaticPool

from src.contexts.alerting.consumers.alert_notification_consumer import (
    NOTIFICATION_CONSUMER_GROUP,
    AlertNotificationConsumer,
)
from src.contexts.alerting.consumers.glpi_ticket_consumer import (
    CONSUMER_GROUP as GLPI_CONSUMER_GROUP,
)
from src.contexts.alerting.consumers.glpi_ticket_consumer import (
    GlpiTicketConsumer,
)
from src.contexts.iam.consumers.iam_email_consumer import (
    IAM_EMAIL_CONSUMER_GROUP,
    IamEmailConsumer,
)
from src.contexts.inventory.consumers.inventory_changes_consumer import (
    CONSUMER_GROUP as INVENTORY_CONSUMER_GROUP,
)
from src.contexts.inventory.consumers.inventory_changes_consumer import (
    InventoryChangesConsumer,
)
from src.core.database import OutboxRepository
from src.core.database.base_model import Base
from src.core.database.models.outbox import OutboxEventModel, OutboxStatus
from src.core.domain.events import DomainEvent
from src.core.messaging.exceptions import (
    PoisonMessageError,
    TransientMessageError,
)
from src.core.messaging.idempotency import IdempotencyGuard
from src.core.messaging.in_memory_bus import InMemoryEventBus
from src.workers.daemons.outbox_relay_worker import OutboxRelayWorker
from src.workers.scheduler.in_memory_inventory import InMemorySchedule


@dataclass(frozen=True)
class DummyEvent(DomainEvent):
    hostname: str = "router-01"


@pytest.fixture
async def db_session_factory():
    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    factory = async_sessionmaker(bind=engine, expire_on_commit=False)
    yield factory
    await engine.dispose()


@pytest.fixture
async def idempotency_guard(db_session_factory):
    return IdempotencyGuard(session_factory=db_session_factory)


# ============================================================================
# 1. GlpiTicketConsumer Tests
# ============================================================================


@pytest.mark.asyncio
async def test_glpi_ticket_consumer_immediate_dlq_on_poison_error(idempotency_guard) -> None:
    """Valida desvio imediato para DLQ com ACK quando ocorre erro determinístico (Poison Message)."""
    bus = InMemoryEventBus()
    consumer = GlpiTicketConsumer(
        event_bus=bus,  # type: ignore[arg-type]
        glpi_base_url="http://mock-glpi",
        glpi_app_token="app_tok",
        glpi_user_token="user_tok",
        idempotency_guard=idempotency_guard,
        poll_timeout_ms=10,
        max_retries=5,
    )

    topic = "stream:incidents"
    group = GLPI_CONSUMER_GROUP
    payload = {
        "event_id": str(uuid4()),
        "event_type": "IncidentTriggeredEvent",
        "severity": "CRITICAL",
        "device_name": "Switch-01",
    }
    await bus.publish(topic, payload)

    req = httpx.Request("POST", "http://mock-glpi/Ticket")
    resp_400 = httpx.Response(status_code=400, request=req)
    http_err = httpx.HTTPStatusError("Bad Request", request=req, response=resp_400)

    stop_event = asyncio.Event()

    def _fail_and_stop(*_args, **_kwargs):
        stop_event.set()
        raise http_err

    with patch.object(consumer, "_handle_event", side_effect=_fail_and_stop):
        await consumer.consume_loop(stop_event=stop_event)

    # Verifica que mensagem foi enviada para stream:incidents:dlq
    dlq_topic = f"{topic}:dlq"
    dlq_messages = await bus.consume_batch(dlq_topic, "cg:test_auditors", "auditor-1")
    assert len(dlq_messages) == 1
    _, dlq_payload = dlq_messages[0]
    assert dlq_payload["error_type"] == "PoisonMessage"
    assert dlq_payload["consumer_group"] == group

    # Mensagem original recebeu XACK imediato e NÃO está pendente no PEL
    assert len(bus._pel[topic][group]) == 0
    await bus.close()


@pytest.mark.asyncio
async def test_glpi_ticket_consumer_retains_on_transient_error(idempotency_guard) -> None:
    """Valida que falha transitória (timeout/conexão) NÃO emite ACK e mantém mensagem no PEL se tentativas < max_retries."""
    bus = InMemoryEventBus()
    consumer = GlpiTicketConsumer(
        event_bus=bus,  # type: ignore[arg-type]
        glpi_base_url="http://mock-glpi",
        glpi_app_token="app_tok",
        glpi_user_token="user_tok",
        idempotency_guard=idempotency_guard,
        poll_timeout_ms=10,
        max_retries=5,
    )

    topic = "stream:incidents"
    group = GLPI_CONSUMER_GROUP
    payload = {
        "event_id": str(uuid4()),
        "event_type": "IncidentTriggeredEvent",
        "severity": "CRITICAL",
        "device_name": "Switch-01",
    }
    await bus.publish(topic, payload)

    stop_event = asyncio.Event()

    def _fail_and_stop(*_args, **_kwargs):
        stop_event.set()
        raise TimeoutError("GLPI Gateway Timeout")

    with patch.object(consumer, "_handle_event", side_effect=_fail_and_stop):
        await consumer.consume_loop(stop_event=stop_event)

    # Mensagem permanece pendente no PEL para backoff progressivo (sem ACK)
    assert len(bus._pel[topic][group]) == 1

    # DLQ NÃO deve conter mensagens pois retries (1) < max_retries (5)
    dlq_topic = f"{topic}:dlq"
    dlq_messages = await bus.consume_batch(dlq_topic, "cg:test_auditors", "auditor-1")
    assert len(dlq_messages) == 0
    await bus.close()


# ============================================================================
# 2. AlertNotificationConsumer Tests
# ============================================================================


@pytest.mark.asyncio
async def test_alert_notification_consumer_immediate_dlq_on_poison_error(idempotency_guard) -> None:
    """Valida desvio imediato para DLQ com ACK no AlertNotificationConsumer em caso de PoisonMessage."""
    bus = InMemoryEventBus()
    dispatcher = AsyncMock()
    consumer = AlertNotificationConsumer(
        event_bus=bus,  # type: ignore[arg-type]
        dispatcher=dispatcher,
        idempotency_guard=idempotency_guard,
        poll_timeout_ms=10,
        max_retries=3,
    )

    topic = "stream:incidents"
    group = NOTIFICATION_CONSUMER_GROUP
    payload = {
        "event_id": str(uuid4()),
        "event_type": "IncidentTriggeredEvent",
        "corrupted": True,
    }
    await bus.publish(topic, payload)

    stop_event = asyncio.Event()

    def _fail_and_stop(*_args, **_kwargs):
        stop_event.set()
        raise PoisonMessageError("Invalid schema payload")

    with patch.object(consumer, "handle", side_effect=_fail_and_stop):
        await consumer.consume_loop(stop_event=stop_event)

    # Verifica que mensagem foi enviada para stream:incidents:dlq e confirmada
    dlq_topic = f"{topic}:dlq"
    dlq_messages = await bus.consume_batch(dlq_topic, "cg:alert_auditors", "auditor-1")
    assert len(dlq_messages) == 1
    assert dlq_messages[0][1]["error_type"] == "PoisonMessage"
    assert len(bus._pel[topic][group]) == 0
    await bus.close()


# ============================================================================
# 3. IamEmailConsumer Tests
# ============================================================================


@pytest.mark.asyncio
async def test_iam_email_consumer_immediate_dlq_on_poison_error(idempotency_guard) -> None:
    """Valida desvio imediato para DLQ com ACK no IamEmailConsumer em caso de ValueError/KeyError."""
    bus = InMemoryEventBus()
    consumer = IamEmailConsumer(
        event_bus=bus,  # type: ignore[arg-type]
        idempotency_guard=idempotency_guard,
        poll_timeout_ms=10,
        max_retries=3,
    )

    topic = "stream:iam:events"
    group = IAM_EMAIL_CONSUMER_GROUP
    payload = {
        "event_id": str(uuid4()),
        "event_type": "EmailVerifiedEvent",
    }
    await bus.publish(topic, payload)

    stop_event = asyncio.Event()

    def _fail_and_stop(*_args, **_kwargs):
        stop_event.set()
        raise KeyError("email")

    with patch.object(consumer, "handle", side_effect=_fail_and_stop):
        await consumer.consume_loop(stop_event=stop_event)

    dlq_topic = f"{topic}:dlq"
    dlq_messages = await bus.consume_batch(dlq_topic, "cg:iam_auditors", "auditor-1")
    assert len(dlq_messages) == 1
    assert dlq_messages[0][1]["error_type"] == "PoisonMessage"
    assert len(bus._pel[topic][group]) == 0
    await bus.close()


# ============================================================================
# 4. InventoryChangesConsumer Tests
# ============================================================================


@pytest.mark.asyncio
async def test_inventory_changes_consumer_immediate_dlq_on_poison_error() -> None:
    """Valida desvio imediato para DLQ com ACK no InventoryChangesConsumer em caso de PoisonMessage."""
    bus = InMemoryEventBus()
    schedule = InMemorySchedule()
    consumer = InventoryChangesConsumer(
        event_bus=bus,  # type: ignore[arg-type]
        schedule=schedule,
        poll_timeout_ms=10,
        max_retries=3,
    )

    topic = "stream:inventory:changes"
    group = INVENTORY_CONSUMER_GROUP
    payload = {
        "event_id": str(uuid4()),
        "event_type": "DeviceCreated",
        "missing_fields": True,
    }
    await bus.publish(topic, payload)

    stop_event = asyncio.Event()

    def _fail_and_stop(*_args, **_kwargs):
        stop_event.set()
        raise PoisonMessageError("Invalid target")

    with patch.object(consumer, "_handle_event", side_effect=_fail_and_stop):
        await consumer.consume_loop(stop_event=stop_event)

    dlq_topic = f"{topic}:dlq"
    dlq_messages = await bus.consume_batch(dlq_topic, "cg:inv_auditors", "auditor-1")
    assert len(dlq_messages) == 1
    assert dlq_messages[0][1]["error_type"] == "PoisonMessage"
    assert len(bus._pel[topic][group]) == 0
    await bus.close()


# ============================================================================
# 5. OutboxRelayWorker Tests
# ============================================================================


@pytest.mark.asyncio
async def test_outbox_relay_worker_immediate_failed_on_poison_error(
    db_session_factory: async_sessionmaker[AsyncSession],
) -> None:
    """Valida que OutboxRelayWorker marca imediatamente FAILED sem retentativas em caso de PoisonMessage."""
    async def failing_poison_publisher(event_type: str, payload: dict) -> None:
        raise PoisonMessageError("Corrupted payload structure")

    event = DummyEvent(hostname="bad-device")
    async with db_session_factory() as session, session.begin():
        OutboxRepository.add_event(session=session, event=event, aggregate_type="Device")

    worker = OutboxRelayWorker(
        publisher=failing_poison_publisher,
        session_factory=db_session_factory,
        batch_size=10,
        max_retries=5,
    )

    # Executa apenas 1 batch
    await worker.process_batch()

    async with db_session_factory() as session:
        result = await session.execute(
            select(OutboxEventModel).where(OutboxEventModel.id == event.event_id)
        )
        entry = result.scalar_one()

        # Deve estar FAILED diretamente na 1ª tentativa
        assert entry.status == OutboxStatus.FAILED
        assert entry.retry_count == 1
        assert entry.next_retry_at is None
        assert entry.processed_at is not None
        assert "PoisonMessage" in str(entry.error_message)


@pytest.mark.asyncio
async def test_outbox_relay_worker_retains_pending_on_transient_error(
    db_session_factory: async_sessionmaker[AsyncSession],
) -> None:
    """Valida que OutboxRelayWorker agenda backoff e mantém PENDING em caso de erro transitório."""
    async def failing_transient_publisher(event_type: str, payload: dict) -> None:
        raise TransientMessageError("Broker temporary disconnect")

    event = DummyEvent(hostname="good-device")
    async with db_session_factory() as session, session.begin():
        OutboxRepository.add_event(session=session, event=event, aggregate_type="Device")

    worker = OutboxRelayWorker(
        publisher=failing_transient_publisher,
        session_factory=db_session_factory,
        batch_size=10,
        max_retries=5,
        base_delay=10.0,
    )

    await worker.process_batch()

    async with db_session_factory() as session:
        result = await session.execute(
            select(OutboxEventModel).where(OutboxEventModel.id == event.event_id)
        )
        entry = result.scalar_one()

        # Permanece PENDING com next_retry_at agendado
        assert entry.status == OutboxStatus.PENDING
        assert entry.retry_count == 1
        assert entry.next_retry_at is not None
        assert entry.processed_at is None
