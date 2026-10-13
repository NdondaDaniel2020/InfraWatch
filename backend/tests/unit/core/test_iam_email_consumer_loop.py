"""Testes unitários para o consume_loop do IamEmailConsumer."""

import asyncio
from unittest.mock import AsyncMock, patch

import pytest

from src.contexts.iam.consumers.iam_email_consumer import (
    IAM_EMAIL_CONSUMER_GROUP,
    STREAM_TOPIC,
    IamEmailConsumer,
)


@pytest.mark.asyncio
async def test_iam_email_consumer_consume_loop_processes_and_acks() -> None:
    """Valida que consume_loop consome eventos, despacha e confirma no EventBus."""
    mock_event_bus = AsyncMock()

    test_payload = {
        "event_type": "PasswordResetRequestedEvent",
        "email": "admin@infrawatch.io",
        "reset_token": "secret-token-123",
    }
    messages = [("msg-101", test_payload)]

    # Retorna uma mensagem no primeiro ciclo e depois vazia
    mock_event_bus.consume_batch.side_effect = [messages, []]

    consumer = IamEmailConsumer(event_bus=mock_event_bus, consumer_name="test-email-worker")
    stop_event = asyncio.Event()

    with patch.object(consumer, "handle", new_callable=AsyncMock) as mock_handle:
        async def run_and_stop():
            await asyncio.sleep(0.05)
            stop_event.set()

        await asyncio.gather(
            consumer.consume_loop(stop_event),
            run_and_stop(),
        )

        mock_handle.assert_awaited_once_with("PasswordResetRequestedEvent", test_payload)
        mock_event_bus.ack.assert_awaited_once_with(
            STREAM_TOPIC, IAM_EMAIL_CONSUMER_GROUP, "msg-101"
        )


@pytest.mark.asyncio
async def test_iam_email_consumer_consume_loop_skips_ack_on_failure() -> None:
    """Valida que mensagens que falham no handle não recebem ack."""
    mock_event_bus = AsyncMock()

    test_payload = {
        "event_type": "PasswordResetRequestedEvent",
        "email": "fail@infrawatch.io",
        "reset_token": "bad-token",
    }
    messages = [("msg-failed", test_payload)]
    mock_event_bus.consume_batch.side_effect = [messages, []]

    consumer = IamEmailConsumer(event_bus=mock_event_bus, consumer_name="test-email-worker")
    stop_event = asyncio.Event()

    with patch.object(consumer, "handle", side_effect=RuntimeError("SMTP down")):
        async def run_and_stop():
            await asyncio.sleep(0.05)
            stop_event.set()

        await asyncio.gather(
            consumer.consume_loop(stop_event),
            run_and_stop(),
        )

        mock_event_bus.ack.assert_not_called()
