"""Testes unitários para o AlertNotificationConsumer (ADR-022, ADR-023)."""

from __future__ import annotations

import asyncio
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest

from src.contexts.alerting.consumers.alert_notification_consumer import (
    NOTIFICATION_CONSUMER_GROUP,
    STREAM_TOPIC,
    AlertNotificationConsumer,
)
from src.core.messaging.resilient_bus import ResilientEventBus
from src.integrations.notifications import AlertSeverity, NotificationDispatcher


@pytest.fixture
def mock_event_bus() -> AsyncMock:
    bus = AsyncMock(spec=ResilientEventBus)
    bus.consume_batch.return_value = []
    bus.ack.return_value = 1
    return bus


@pytest.fixture
def mock_dispatcher() -> AsyncMock:
    dispatcher = AsyncMock(spec=NotificationDispatcher)
    dispatcher.dispatch_by_severity.return_value = {
        "telegram": True,
        "whatsapp": True,
        "webhook": True,
        "smtp": True,
    }
    return dispatcher


@pytest.mark.asyncio
async def test_handle_incident_triggered_critical(
    mock_event_bus: AsyncMock,
    mock_dispatcher: AsyncMock,
) -> None:
    consumer = AlertNotificationConsumer(
        event_bus=mock_event_bus,
        dispatcher=mock_dispatcher,
    )
    device_id = uuid4()
    payload = {
        "event_type": "IncidentTriggeredEvent",
        "device_id": str(device_id),
        "device_name": "Core-Switch-01",
        "device_ip": "10.0.0.1",
        "severity": "CRITICAL",
        "reason": "Host inacessível após 3 pings perdidos",
    }

    await consumer.handle("stream:incidents", payload)

    mock_dispatcher.dispatch_by_severity.assert_awaited_once()
    alert = mock_dispatcher.dispatch_by_severity.call_args[0][0]
    assert alert.severity == AlertSeverity.CRITICAL
    assert alert.device_name == "Core-Switch-01"
    assert alert.device_ip == "10.0.0.1"
    assert alert.device_id == device_id
    assert "Core-Switch-01" in alert.title
    assert "Host inacessível" in alert.description


@pytest.mark.asyncio
async def test_handle_device_degraded(
    mock_event_bus: AsyncMock,
    mock_dispatcher: AsyncMock,
) -> None:
    consumer = AlertNotificationConsumer(
        event_bus=mock_event_bus,
        dispatcher=mock_dispatcher,
    )
    device_id = uuid4()
    payload = {
        "event_type": "DeviceDegradedEvent",
        "device_id": str(device_id),
        "device_name": "Edge-Router-02",
        "device_ip": "10.0.0.2",
        "latency_ms": 185.0,
        "packet_loss_pct": 20.0,
    }

    await consumer.handle("stream:incidents", payload)

    mock_dispatcher.dispatch_by_severity.assert_awaited_once()
    alert = mock_dispatcher.dispatch_by_severity.call_args[0][0]
    assert alert.severity == AlertSeverity.DEGRADED
    assert alert.device_name == "Edge-Router-02"
    assert "Degradação" in alert.title
    assert "185.0" in alert.description or "Degradação" in alert.description


@pytest.mark.asyncio
async def test_handle_incident_resolved_with_downtime(
    mock_event_bus: AsyncMock,
    mock_dispatcher: AsyncMock,
) -> None:
    consumer = AlertNotificationConsumer(
        event_bus=mock_event_bus,
        dispatcher=mock_dispatcher,
    )
    device_id = uuid4()
    payload = {
        "event_type": "IncidentResolvedEvent",
        "device_id": str(device_id),
        "device_name": "Firewall-Corp",
        "device_ip": "10.0.0.254",
        "downtime_minutes": 25.5,
        "root_cause": "Link de fibra reconectado pela operadora",
    }

    await consumer.handle("stream:incidents", payload)

    mock_dispatcher.dispatch_by_severity.assert_awaited_once()
    alert = mock_dispatcher.dispatch_by_severity.call_args[0][0]
    assert alert.severity == AlertSeverity.RESOLVED
    assert alert.device_name == "Firewall-Corp"
    assert alert.downtime_minutes == 25.5
    assert "Resolvido" in alert.title
    assert "Link de fibra" in alert.description


@pytest.mark.asyncio
async def test_handle_unrelated_event_ignored(
    mock_event_bus: AsyncMock,
    mock_dispatcher: AsyncMock,
) -> None:
    consumer = AlertNotificationConsumer(
        event_bus=mock_event_bus,
        dispatcher=mock_dispatcher,
    )
    payload = {
        "event_type": "UserLoggedEvent",
        "user_id": str(uuid4()),
    }

    await consumer.handle("stream:auth", payload)
    mock_dispatcher.dispatch_by_severity.assert_not_awaited()


@pytest.mark.asyncio
async def test_consume_loop_processes_batch_and_acks(
    mock_event_bus: AsyncMock,
    mock_dispatcher: AsyncMock,
) -> None:
    stop_event = asyncio.Event()

    # Retorna um lote com 2 mensagens e depois aciona o stop_event
    async def fake_consume_batch(*args: object, **kwargs: object) -> list[tuple[str, dict[str, object]]]:
        stop_event.set()
        return [
            (
                "msg-1",
                {
                    "event_type": "IncidentTriggeredEvent",
                    "device_name": "Switch-01",
                    "severity": "CRITICAL",
                },
            ),
            (
                "msg-2",
                {
                    "event_type": "IncidentResolvedEvent",
                    "device_name": "Switch-01",
                    "downtime_minutes": 10.0,
                },
            ),
        ]

    mock_event_bus.consume_batch.side_effect = fake_consume_batch

    consumer = AlertNotificationConsumer(
        event_bus=mock_event_bus,
        dispatcher=mock_dispatcher,
    )

    await consumer.consume_loop(stop_event=stop_event)

    assert mock_dispatcher.dispatch_by_severity.await_count == 2
    mock_event_bus.ack.assert_awaited_once_with(
        STREAM_TOPIC,
        NOTIFICATION_CONSUMER_GROUP,
        "msg-1",
        "msg-2",
    )
