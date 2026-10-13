"""Testes unitários para o mapeamento declarativo de streams no OutboxRelayWorker."""

from typing import Any
from unittest.mock import AsyncMock

import pytest

from src.workers.daemons.outbox_relay_worker import OutboxRelayWorker


@pytest.mark.parametrize(
    ("event_type", "expected_stream"),
    [
        ("DeviceCreated", "stream:inventory:changes"),
        ("DeviceUpdated", "stream:inventory:changes"),
        ("DeviceDeleted", "stream:inventory:changes"),
        ("DevicePaused", "stream:inventory:changes"),
        ("DeviceResumed", "stream:inventory:changes"),
        ("IncidentTriggeredEvent", "stream:incidents"),
        ("DeviceDegradedEvent", "stream:incidents"),
        ("IncidentResolvedEvent", "stream:incidents"),
        ("PasswordResetRequestedEvent", "stream:iam:events"),
        ("EmailVerificationRequestedEvent", "stream:iam:events"),
        ("AccountLockedEvent", "stream:iam:events"),
        ("CustomUnknownEvent", "CustomUnknownEvent"),
    ],
)
def test_resolve_stream_topic_maps_correctly(event_type: str, expected_stream: str) -> None:
    """Valida que resolve_stream_topic retorna o stream consolidado ou fallback para o próprio nome."""
    resolved = OutboxRelayWorker.resolve_stream_topic(event_type)
    assert resolved == expected_stream


async def test_dispatch_event_uses_mapped_stream() -> None:
    """Valida que _dispatch_event envia para o publisher o tópico consolidado."""
    mock_publisher = AsyncMock()
    worker = OutboxRelayWorker(publisher=mock_publisher)

    payload: dict[str, Any] = {"aggregate_id": "123", "event_type": "DeviceCreated"}
    await worker._dispatch_event("DeviceCreated", payload)

    mock_publisher.publish.assert_awaited_once_with("stream:inventory:changes", payload)


async def test_dispatch_event_uses_callable_publisher_fallback() -> None:
    """Valida que _dispatch_event com função assíncrona pura recebe o stream correto."""
    dispatched: list[tuple[str, dict[str, Any]]] = []

    async def callback_publisher(topic: str, payload: dict[str, Any]) -> None:
        dispatched.append((topic, payload))

    worker = OutboxRelayWorker(publisher=callback_publisher)
    payload = {"event_type": "PasswordResetRequestedEvent", "user_id": "abc"}
    await worker._dispatch_event("PasswordResetRequestedEvent", payload)

    assert len(dispatched) == 1
    assert dispatched[0][0] == "stream:iam:events"
    assert dispatched[0][1] == payload
