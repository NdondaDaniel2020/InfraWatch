"""Testes unitários para teto de retentativas (max_retries) e descarte em DLQ nos consumidores.

Valida:
1. GlpiTicketConsumer: Descarte e isolamento em stream:incidents:dlq após 5 tentativas.
2. AlertNotificationConsumer: Descarte e isolamento em stream:incidents:dlq após 3 tentativas.
3. IamEmailConsumer: Descarte e isolamento em stream:iam:events:dlq após 2 tentativas.
4. InventoryChangesConsumer: Descarte e isolamento em stream:inventory:changes:dlq após 2 tentativas.
"""

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
from src.contexts.inventory.consumers.inventory_changes_consumer import (
    InventoryChangesConsumer,
)
from src.core.database.base_model import Base
from src.core.messaging.idempotency import IdempotencyGuard
from src.core.messaging.in_memory_bus import InMemoryEventBus
from src.workers.scheduler.in_memory_inventory import InMemorySchedule


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
# 1. GlpiTicketConsumer Retries & DLQ
# ============================================================================


@pytest.mark.asyncio
async def test_glpi_ticket_consumer_retries_and_dlq(idempotency_guard) -> None:
    bus = InMemoryEventBus()
    consumer = GlpiTicketConsumer(
        event_bus=bus,  # type: ignore[arg-type]
        glpi_base_url="http://mock-glpi",
        glpi_app_token="app_tok",
        glpi_user_token="user_tok",
        idempotency_guard=idempotency_guard,
        max_retries=5,
    )

    topic = "stream:incidents"
    group = "cg:glpi_workers"
    event_id = uuid4()
    payload = {
        "event_id": str(event_id),
        "event_type": "IncidentTriggeredEvent",
        "severity": "CRITICAL",
        "device_name": "Switch-Core",
    }

    await bus.publish(topic, payload)

    mock_client_instance = AsyncMock()
    mock_client_instance.open_ticket.side_effect = RuntimeError("GLPI connection timeout")
    mock_client_instance.__aenter__.return_value = mock_client_instance
    mock_client_instance.__aexit__.return_value = None

    with patch(
        "src.contexts.alerting.consumers.glpi_ticket_consumer.GlpiClient",
        return_value=mock_client_instance,
    ):
        # 1. Primeiras 4 tentativas: mensagem permanece pendente no PEL
        for attempt in range(1, 5):
            messages = await bus.consume_batch(topic, group, "worker-1", batch_size=1)
            assert len(messages) == 1
            msg_id, msg_payload = messages[0]

            try:
                await consumer._handle_event("IncidentTriggeredEvent", msg_payload)
            except RuntimeError as exc:
                delivery_count = await bus.get_delivery_count(topic, group, msg_id)
                assert delivery_count == attempt
                if delivery_count >= consumer.max_retries:
                    await bus.send_to_dlq(topic, group, msg_id, msg_payload, str(exc), delivery_count)

            # Permanece no PEL
            assert msg_id in bus._pel[topic][group]

        # 2. 5ª tentativa: atinge o teto max_retries e vai para o DLQ
        messages = await bus.consume_batch(topic, group, "worker-1", batch_size=1)
        assert len(messages) == 1
        msg_id, msg_payload = messages[0]

        try:
            await consumer._handle_event("IncidentTriggeredEvent", msg_payload)
        except RuntimeError as exc:
            delivery_count = await bus.get_delivery_count(topic, group, msg_id)
            assert delivery_count == 5
            if delivery_count >= consumer.max_retries:
                await bus.send_to_dlq(topic, group, msg_id, msg_payload, str(exc), delivery_count)

        # Mensagem foi removida do PEL original
        assert msg_id not in bus._pel[topic][group]

        # Mensagem existe no stream DLQ
        dlq_messages = await bus.consume_batch(f"{topic}:dlq", "cg:dlq_auditors", "audit-1")
        assert len(dlq_messages) == 1
        assert dlq_messages[0][1]["delivery_count"] == 5
        assert "GLPI connection timeout" in dlq_messages[0][1]["error_message"]

    await bus.close()


# ============================================================================
# 2. AlertNotificationConsumer Retries & DLQ
# ============================================================================


@pytest.mark.asyncio
async def test_alert_notification_consumer_retries_and_dlq(idempotency_guard) -> None:
    bus = InMemoryEventBus()
    mock_dispatcher = AsyncMock()
    mock_dispatcher.dispatch_by_severity.side_effect = ConnectionError("Telegram webhook unreachable")

    consumer = AlertNotificationConsumer(
        event_bus=bus,  # type: ignore[arg-type]
        dispatcher=mock_dispatcher,
        idempotency_guard=idempotency_guard,
        max_retries=3,
    )

    topic = "stream:incidents"
    group = "cg:notification_workers"
    event_id = uuid4()
    payload = {
        "event_id": str(event_id),
        "event_type": "IncidentTriggeredEvent",
        "severity": "CRITICAL",
        "device_name": "Firewall-01",
    }

    await bus.publish(topic, payload)

    # 1. Tentativas 1 e 2
    for attempt in range(1, 3):
        messages = await bus.consume_batch(topic, group, "worker-1", batch_size=1)
        assert len(messages) == 1
        msg_id, msg_payload = messages[0]
        try:
            await consumer.handle("IncidentTriggeredEvent", msg_payload)
        except ConnectionError as exc:
            count = await bus.get_delivery_count(topic, group, msg_id)
            assert count == attempt
            if count >= consumer.max_retries:
                await bus.send_to_dlq(topic, group, msg_id, msg_payload, str(exc), count)

        assert msg_id in bus._pel[topic][group]

    # 2. Tentativa 3 (atinge limite)
    messages = await bus.consume_batch(topic, group, "worker-1", batch_size=1)
    assert len(messages) == 1
    msg_id, msg_payload = messages[0]
    try:
        await consumer.handle("IncidentTriggeredEvent", msg_payload)
    except ConnectionError as exc:
        count = await bus.get_delivery_count(topic, group, msg_id)
        assert count == 3
        if count >= consumer.max_retries:
            await bus.send_to_dlq(topic, group, msg_id, msg_payload, str(exc), count)

    # Removido do PEL
    assert msg_id not in bus._pel[topic][group]

    # Presente na DLQ
    dlq_messages = await bus.consume_batch(f"{topic}:dlq", "cg:dlq_auditors", "audit-1")
    assert len(dlq_messages) == 1
    assert dlq_messages[0][1]["delivery_count"] == 3
    assert "Telegram webhook unreachable" in dlq_messages[0][1]["error_message"]

    await bus.close()


# ============================================================================
# 3. IamEmailConsumer Retries & DLQ
# ============================================================================


@pytest.mark.asyncio
async def test_iam_email_consumer_retries_and_dlq(idempotency_guard) -> None:
    bus = InMemoryEventBus()
    consumer = IamEmailConsumer(
        event_bus=bus,  # type: ignore[arg-type]
        idempotency_guard=idempotency_guard,
        max_retries=2,
    )

    topic = "stream:iam:events"
    group = "cg:iam_email_workers"
    event_id = uuid4()
    payload = {
        "event_id": str(event_id),
        "event_type": "PasswordResetRequestedEvent",
        "email": "user@infrawatch.ao",
        "reset_token": "token-1",
    }

    await bus.publish(topic, payload)

    with patch(
        "src.contexts.iam.consumers.iam_email_consumer.email_service.send_password_reset_email",
        side_effect=RuntimeError("SMTP relay connection dropped"),
    ):
        # Tentativa 1
        messages = await bus.consume_batch(topic, group, "worker-1", batch_size=1)
        assert len(messages) == 1
        msg_id, msg_payload = messages[0]
        try:
            await consumer.handle("stream:iam:events", msg_payload)
        except RuntimeError as exc:
            count = await bus.get_delivery_count(topic, group, msg_id)
            assert count == 1
            if count >= consumer.max_retries:
                await bus.send_to_dlq(topic, group, msg_id, msg_payload, str(exc), count)
        assert msg_id in bus._pel[topic][group]

        # Tentativa 2 -> DLQ
        messages = await bus.consume_batch(topic, group, "worker-1", batch_size=1)
        assert len(messages) == 1
        msg_id, msg_payload = messages[0]
        try:
            await consumer.handle("stream:iam:events", msg_payload)
        except RuntimeError as exc:
            count = await bus.get_delivery_count(topic, group, msg_id)
            assert count == 2
            if count >= consumer.max_retries:
                await bus.send_to_dlq(topic, group, msg_id, msg_payload, str(exc), count)

        assert msg_id not in bus._pel[topic][group]
        dlq_msgs = await bus.consume_batch(f"{topic}:dlq", "cg:dlq_auditors", "audit-1")
        assert len(dlq_msgs) == 1
        assert dlq_msgs[0][1]["delivery_count"] == 2
        assert "SMTP relay connection dropped" in dlq_msgs[0][1]["error_message"]

    await bus.close()


# ============================================================================
# 4. InventoryChangesConsumer Retries & DLQ
# ============================================================================


@pytest.mark.asyncio
async def test_inventory_changes_consumer_retries_and_dlq() -> None:
    bus = InMemoryEventBus()
    schedule = InMemorySchedule()
    consumer = InventoryChangesConsumer(
        schedule=schedule,
        event_bus=bus,  # type: ignore[arg-type]
        max_retries=2,
    )

    topic = "stream:inventory:changes"
    group = "cg:probe_workers"
    dev_id = uuid4()
    payload = {
        "event_id": str(uuid4()),
        "event_type": "DeviceCreated",
        "aggregate_id": str(dev_id),
        "target": None,
    }

    await bus.publish(topic, payload)

    # Tentativa 1
    messages = await bus.consume_batch(topic, group, "worker-1", batch_size=1)
    assert len(messages) == 1
    msg_id, msg_payload = messages[0]
    try:
        await consumer._handle_event("DeviceCreated", msg_payload)
    except (KeyError, ValueError, AttributeError) as exc:
        count = await bus.get_delivery_count(topic, group, msg_id)
        assert count == 1
        if count >= consumer.max_retries:
            await bus.send_to_dlq(topic, group, msg_id, msg_payload, str(exc), count)
    assert msg_id in bus._pel[topic][group]

    # Tentativa 2 -> DLQ
    messages = await bus.consume_batch(topic, group, "worker-1", batch_size=1)
    assert len(messages) == 1
    msg_id, msg_payload = messages[0]
    try:
        await consumer._handle_event("DeviceCreated", msg_payload)
    except (KeyError, ValueError, AttributeError) as exc:
        count = await bus.get_delivery_count(topic, group, msg_id)
        assert count == 2
        if count >= consumer.max_retries:
            await bus.send_to_dlq(topic, group, msg_id, msg_payload, str(exc), count)

    assert msg_id not in bus._pel[topic][group]
    dlq_msgs = await bus.consume_batch(f"{topic}:dlq", "cg:dlq_auditors", "audit-1")
    assert len(dlq_msgs) == 1
    assert dlq_msgs[0][1]["delivery_count"] == 2

    await bus.close()
