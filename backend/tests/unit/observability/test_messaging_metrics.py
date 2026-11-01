"""Testes unitários para validação de métricas Prometheus de mensageria assíncrona."""

import asyncio
from unittest.mock import AsyncMock, patch

import pytest

from src.contexts.alerting.consumers.alert_notification_consumer import (
    NOTIFICATION_CONSUMER_GROUP,
    STREAM_TOPIC,
    AlertNotificationConsumer,
)
from src.core.messaging.exceptions import PoisonMessageError, TransientMessageError
from src.core.messaging.redis_streams_bus import RedisStreamsEventBus
from src.core.messaging.topics import StreamTopics
from src.core.observability import (
    MESSAGING_CONSUMED_TOTAL,
    MESSAGING_DLQ_MESSAGES_TOTAL,
    MESSAGING_PEL_PENDING,
    MESSAGING_PROCESSING_DURATION,
)


@pytest.mark.asyncio
async def test_consumer_metrics_recorded_on_success() -> None:
    """Valida que mensagens processadas com sucesso incrementam MESSAGING_CONSUMED_TOTAL e observam latência."""
    mock_bus = AsyncMock()
    mock_bus.consume_batch.side_effect = [
        [("100-1", {"event_type": "IncidentTriggeredEvent", "incident_id": "inc-1"})],
        [],
    ]
    mock_bus.should_process_retry.return_value = True

    stop_event = asyncio.Event()

    consumer = AlertNotificationConsumer(event_bus=mock_bus)
    with patch.object(consumer, "handle", new_callable=AsyncMock) as mock_handle:

        async def _handle_side_effect(*args, **kwargs):
            stop_event.set()

        mock_handle.side_effect = _handle_side_effect

        initial_success = MESSAGING_CONSUMED_TOTAL.labels(
            stream=STREAM_TOPIC, group=NOTIFICATION_CONSUMER_GROUP, status="success"
        )._value.get()
        initial_sum = MESSAGING_PROCESSING_DURATION.labels(
            stream=STREAM_TOPIC, group=NOTIFICATION_CONSUMER_GROUP
        )._sum.get()

        await consumer.consume_loop(stop_event=stop_event)

        final_success = MESSAGING_CONSUMED_TOTAL.labels(
            stream=STREAM_TOPIC, group=NOTIFICATION_CONSUMER_GROUP, status="success"
        )._value.get()
        assert final_success == initial_success + 1

        final_sum = MESSAGING_PROCESSING_DURATION.labels(
            stream=STREAM_TOPIC, group=NOTIFICATION_CONSUMER_GROUP
        )._sum.get()
        assert final_sum > initial_sum


@pytest.mark.asyncio
async def test_consumer_metrics_and_dlq_on_poison_error() -> None:
    """Valida que poison pill incrementa MESSAGING_CONSUMED_TOTAL(error) e MESSAGING_DLQ_MESSAGES_TOTAL."""
    mock_bus = AsyncMock()
    mock_bus.consume_batch.side_effect = [
        [("100-2", {"event_type": "IncidentTriggeredEvent", "corrupted": True})],
        [],
    ]
    mock_bus.should_process_retry.return_value = True

    stop_event = asyncio.Event()

    consumer = AlertNotificationConsumer(event_bus=mock_bus)
    with patch.object(consumer, "handle", new_callable=AsyncMock) as mock_handle:

        async def _handle_side_effect(*args, **kwargs):
            stop_event.set()
            raise PoisonMessageError("Invalid schema payload")

        mock_handle.side_effect = _handle_side_effect

        initial_error = MESSAGING_CONSUMED_TOTAL.labels(
            stream=STREAM_TOPIC, group=NOTIFICATION_CONSUMER_GROUP, status="error"
        )._value.get()
        initial_dlq = MESSAGING_DLQ_MESSAGES_TOTAL.labels(
            stream=STREAM_TOPIC, group=NOTIFICATION_CONSUMER_GROUP, reason="PoisonMessage"
        )._value.get()

        await consumer.consume_loop(stop_event=stop_event)

        final_error = MESSAGING_CONSUMED_TOTAL.labels(
            stream=STREAM_TOPIC, group=NOTIFICATION_CONSUMER_GROUP, status="error"
        )._value.get()
        final_dlq = MESSAGING_DLQ_MESSAGES_TOTAL.labels(
            stream=STREAM_TOPIC, group=NOTIFICATION_CONSUMER_GROUP, reason="PoisonMessage"
        )._value.get()

        assert final_error == initial_error + 1
        assert final_dlq == initial_dlq + 1
        mock_bus.publish_dlq.assert_awaited_once()


@pytest.mark.asyncio
async def test_consumer_metrics_and_dlq_on_max_retries_exceeded() -> None:
    """Valida que falha transitória após estourar max_retries despacha para DLQ com contador de métrica."""
    mock_bus = AsyncMock()
    mock_bus.consume_batch.side_effect = [
        [("100-3", {"event_type": "IncidentTriggeredEvent", "incident_id": "inc-3"})],
        [],
    ]
    mock_bus.should_process_retry.return_value = True
    mock_bus.get_delivery_count.return_value = 5  # >= max_retries

    stop_event = asyncio.Event()

    consumer = AlertNotificationConsumer(event_bus=mock_bus)
    consumer.max_retries = 3

    with patch.object(consumer, "handle", new_callable=AsyncMock) as mock_handle:

        async def _handle_side_effect(*args, **kwargs):
            stop_event.set()
            raise TransientMessageError("Upstream timeout")

        mock_handle.side_effect = _handle_side_effect

        initial_dlq = MESSAGING_DLQ_MESSAGES_TOTAL.labels(
            stream=STREAM_TOPIC, group=NOTIFICATION_CONSUMER_GROUP, reason="MaxRetriesExceeded"
        )._value.get()

        await consumer.consume_loop(stop_event=stop_event)

        final_dlq = MESSAGING_DLQ_MESSAGES_TOTAL.labels(
            stream=STREAM_TOPIC, group=NOTIFICATION_CONSUMER_GROUP, reason="MaxRetriesExceeded"
        )._value.get()

        assert final_dlq == initial_dlq + 1
        mock_bus.send_to_dlq.assert_awaited_once()


@pytest.mark.asyncio
async def test_collect_stream_metrics_updates_pel_gauge() -> None:
    """Valida que collect_stream_metrics consulta xinfo e atualiza MESSAGING_PEL_PENDING."""
    mock_redis = AsyncMock()
    mock_redis.xinfo_groups = AsyncMock(
        return_value=[
            {
                "name": "cg:notification_workers",
                "consumers": 3,
                "pending": 42,
                "last-delivered-id": "1700000000000-0",
                "lag": 5,
            }
        ]
    )
    mock_redis.xinfo_consumers = AsyncMock(
        return_value=[
            {"name": "worker-1", "pending": 10, "idle": 5000},
            {"name": "worker-2", "pending": 32, "idle": 12000},
        ]
    )

    bus = RedisStreamsEventBus(redis_client=mock_redis)

    metrics = await bus.collect_stream_metrics(
        StreamTopics.INCIDENTS, "cg:notification_workers"
    )

    assert metrics["topic"] == StreamTopics.INCIDENTS
    assert metrics["group"] == "cg:notification_workers"
    assert metrics["pending_count"] == 42
    assert metrics["consumer_count"] == 3
    assert metrics["lag"] == 5
    assert len(metrics["consumers"]) == 2

    # Verifica que o gauge do Prometheus foi atualizado para 42
    gauge_val = MESSAGING_PEL_PENDING.labels(
        stream=StreamTopics.INCIDENTS, group="cg:notification_workers"
    )._value.get()
    assert gauge_val == 42.0
