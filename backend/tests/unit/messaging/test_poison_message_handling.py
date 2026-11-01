"""Testes unitários para detecção de poison messages e publicação direta na DLQ com enriquecimento."""

import json
from unittest.mock import AsyncMock

import httpx
import pytest
from pydantic import BaseModel, ValidationError

from src.core.messaging.exceptions import (
    MessageProcessingError,
    PoisonMessageError,
    TransientMessageError,
    is_poison_error,
    is_transient_error,
)
from src.core.messaging.in_memory_bus import InMemoryEventBus
from src.core.messaging.redis_streams_bus import RedisStreamsEventBus
from src.core.messaging.resilient_bus import ResilientEventBus


class DummySchema(BaseModel):
    name: str
    code: int


def test_exception_classification_predicates() -> None:
    """Valida o mapeamento semântico de falhas transitórias vs venenosas."""
    # 1. Poison errors
    assert is_poison_error(PoisonMessageError("Invalid JSON")) is True
    assert is_transient_error(PoisonMessageError("Invalid JSON")) is False

    assert is_poison_error(ValueError("Invalid int format")) is True
    assert is_poison_error(TypeError("Unsupported operand")) is True
    assert is_poison_error(KeyError("missing_field")) is True

    # Pydantic validation error
    with pytest.raises(ValidationError) as val_err:
        DummySchema.model_validate({"name": 123, "code": "not_an_int"})
    assert is_poison_error(val_err.value) is True

    # HTTP client 4xx (exceto 429)
    req = httpx.Request("POST", "http://test")
    resp_400 = httpx.Response(status_code=400, request=req)
    resp_422 = httpx.Response(status_code=422, request=req)
    assert is_poison_error(httpx.HTTPStatusError("Bad request", request=req, response=resp_400)) is True
    assert is_poison_error(httpx.HTTPStatusError("Unprocessable", request=req, response=resp_422)) is True

    # 2. Transient errors
    assert is_transient_error(TransientMessageError("Temporary glitch")) is True
    assert is_poison_error(TransientMessageError("Temporary glitch")) is False

    assert is_transient_error(TimeoutError("Socket timeout")) is True
    assert is_transient_error(ConnectionError("Refused")) is True
    assert is_transient_error(OSError("Network is unreachable")) is True

    assert is_transient_error(httpx.TimeoutException("Read timeout")) is True
    assert is_transient_error(httpx.ConnectError("Connection refused")) is True

    # HTTP 429 e 5xx
    resp_429 = httpx.Response(status_code=429, request=req)
    resp_503 = httpx.Response(status_code=503, request=req)
    assert is_transient_error(httpx.HTTPStatusError("Too Many Requests", request=req, response=resp_429)) is True
    assert is_poison_error(httpx.HTTPStatusError("Too Many Requests", request=req, response=resp_429)) is False

    assert is_transient_error(httpx.HTTPStatusError("Service Unavailable", request=req, response=resp_503)) is True
    assert is_poison_error(httpx.HTTPStatusError("Service Unavailable", request=req, response=resp_503)) is False


def test_base_message_processing_error_details() -> None:
    """Valida armazenamento de mensagem e detalhes customizados na exceção base."""
    err = MessageProcessingError("Falha genérica", details={"field": "ip", "received": None})
    assert str(err) == "Falha genérica"
    assert err.details["field"] == "ip"
    assert err.details["received"] is None


@pytest.mark.asyncio
async def test_redis_streams_publish_dlq_enriches_and_acks() -> None:
    """Valida que publish_dlq no Redis Streams enriquece metadados diagnósticos e confirma no stream de origem."""
    mock_redis = AsyncMock()
    mock_redis.xadd.return_value = "dlq-msg-99"
    mock_redis.xack.return_value = 1

    bus = RedisStreamsEventBus(redis_client=mock_redis)
    payload = {"event_id": "evt-123", "device": "core-sw-01"}

    msg_id = await bus.publish_dlq(
        original_topic="stream:incidents",
        original_msg_id="1700000000-1",
        payload=payload,
        reason="PoisonMessage: Invalid field type",
        error_details="ValueError: expected float got string",
        group="cg:notification_workers",
        delivery_count=1,
    )

    assert msg_id == "1700000000-1"
    # Valida publicação na DLQ
    mock_redis.xadd.assert_awaited_once()
    call_kwargs = mock_redis.xadd.await_args.kwargs
    assert call_kwargs["name"] == "stream:incidents:dlq"
    dlq_fields = call_kwargs["fields"]
    assert "payload" in dlq_fields
    dlq_payload = json.loads(dlq_fields["payload"])
    assert dlq_payload["error_type"] == "PoisonMessage"
    assert dlq_payload["reason"] == "PoisonMessage: Invalid field type"
    assert dlq_payload["original_topic"] == "stream:incidents"
    assert dlq_payload["original_message_id"] == "1700000000-1"
    assert dlq_payload["consumer_group"] == "cg:notification_workers"
    assert dlq_payload["delivery_count"] == 1
    assert "failed_at" in dlq_payload

    # Valida ACK imediato no stream principal
    mock_redis.xack.assert_awaited_once_with(
        "stream:incidents", "cg:notification_workers", "1700000000-1"
    )


@pytest.mark.asyncio
async def test_in_memory_bus_publish_dlq_and_ack() -> None:
    """Valida publish_dlq em memória e remoção do PEL."""
    bus = InMemoryEventBus()
    topic = "stream:iam:events"
    group = "cg:iam_workers"

    await bus.publish(topic, {"user_id": "usr-1", "email": "bad-email"})
    messages = await bus.consume_batch(topic, group, "worker-1", batch_size=1)
    assert len(messages) == 1
    msg_id, payload = messages[0]

    # Mensagem está pendente no PEL
    assert msg_id in bus._pel[topic][group]

    # Desvia diretamente para a DLQ com ACK
    dlq_id = await bus.publish_dlq(
        original_topic=topic,
        original_msg_id=msg_id,
        payload=payload,
        reason="PoisonMessage: Invalid email address",
        group=group,
        delivery_count=1,
    )
    assert dlq_id == msg_id

    # Mensagem original foi confirmada e removida do PEL
    assert msg_id not in bus._pel[topic][group]

    # Mensagem enriquecida está disponível no stream DLQ
    dlq_topic = f"{topic}:dlq"
    dlq_batch = await bus.consume_batch(dlq_topic, "cg:dlq_monitors", "monitor-1")
    assert len(dlq_batch) == 1
    _, dlq_payload = dlq_batch[0]
    assert dlq_payload["error_type"] == "PoisonMessage"
    assert dlq_payload["reason"] == "PoisonMessage: Invalid email address"
    assert dlq_payload["original_message_id"] == msg_id
    assert dlq_payload["user_id"] == "usr-1"

    await bus.close()


@pytest.mark.asyncio
async def test_resilient_event_bus_delegates_publish_dlq() -> None:
    """Valida delegação de publish_dlq para o primário e fallback transparente."""
    mock_primary = AsyncMock()
    mock_primary.publish_dlq.return_value = "res-dlq-1"

    fallback = InMemoryEventBus()
    bus = ResilientEventBus(primary_bus=mock_primary, fallback_bus=fallback)

    # 1. Primário saudável
    res = await bus.publish_dlq(
        original_topic="stream:test",
        original_msg_id="m-1",
        payload={"k": "v"},
        reason="PoisonMessage: parse error",
        group="cg:test",
    )
    assert res == "res-dlq-1"
    mock_primary.publish_dlq.assert_awaited_once()

    # 2. Primário offline -> comuta para fallback
    mock_primary.publish_dlq.side_effect = ConnectionRefusedError("Redis down")
    res_fallback = await bus.publish_dlq(
        original_topic="stream:test",
        original_msg_id="m-2",
        payload={"k": "v2"},
        reason="PoisonMessage: fallback error",
        group="cg:test",
    )
    assert res_fallback == "m-2"
    assert bus.is_primary_healthy is False

    await bus.close()
