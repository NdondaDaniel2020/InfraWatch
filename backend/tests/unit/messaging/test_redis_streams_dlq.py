"""Testes unitários para contagem de tentativas (times_delivered) e publicação em DLQ.

Valida:
1. RedisStreamsEventBus: get_delivery_count via XPENDING e send_to_dlq em {topic}:dlq.
2. InMemoryEventBus: rastreamento de entregas e encaminhamento para DLQ em memória.
3. ResilientEventBus: delegação de get_delivery_count e send_to_dlq com comutação de falha.
"""

from unittest.mock import AsyncMock

import pytest

from src.core.messaging.in_memory_bus import InMemoryEventBus
from src.core.messaging.redis_streams_bus import RedisStreamsEventBus
from src.core.messaging.resilient_bus import ResilientEventBus

# ============================================================================
# 1. RedisStreamsEventBus DLQ Tests
# ============================================================================


@pytest.mark.asyncio
async def test_redis_streams_get_delivery_count_dict_entry() -> None:
    mock_redis = AsyncMock()
    mock_redis.xpending_range.return_value = [
        {"message_id": "1000-1", "consumer": "w-1", "idle": 5000, "times_delivered": 4}
    ]

    bus = RedisStreamsEventBus(redis_client=mock_redis)
    count = await bus.get_delivery_count("stream:test", "cg:test", "1000-1")

    assert count == 4
    mock_redis.xpending_range.assert_awaited_once_with(
        name="stream:test",
        groupname="cg:test",
        min="1000-1",
        max="1000-1",
        count=1,
    )


@pytest.mark.asyncio
async def test_redis_streams_get_delivery_count_tuple_entry() -> None:
    mock_redis = AsyncMock()
    mock_redis.xpending_range.return_value = [
        ("1000-2", "w-1", 60000, 3)
    ]

    bus = RedisStreamsEventBus(redis_client=mock_redis)
    count = await bus.get_delivery_count("stream:test", "cg:test", "1000-2")

    assert count == 3


@pytest.mark.asyncio
async def test_redis_streams_get_delivery_count_empty_or_error() -> None:
    mock_redis = AsyncMock()
    mock_redis.xpending_range.return_value = []

    bus = RedisStreamsEventBus(redis_client=mock_redis)
    # Lista vazia retorna default 1
    assert await bus.get_delivery_count("stream:test", "cg:test", "1000-3") == 1

    # Erro de timeout retorna default defensivo 1
    mock_redis.xpending_range.side_effect = TimeoutError("Redis timeout")
    assert await bus.get_delivery_count("stream:test", "cg:test", "1000-3") == 1


@pytest.mark.asyncio
async def test_redis_streams_send_to_dlq_publishes_and_acks() -> None:
    mock_redis = AsyncMock()
    mock_redis.xadd.return_value = "dlq-msg-1"
    mock_redis.xack.return_value = 1

    bus = RedisStreamsEventBus(redis_client=mock_redis)
    payload = {"event_id": "xyz-123", "device_name": "Switch-01"}

    msg_id = await bus.send_to_dlq(
        topic="stream:incidents",
        group="cg:workers",
        message_id="1700-1",
        payload=payload,
        error="Connection refused to GLPI",
        delivery_count=5,
    )

    assert msg_id == "1700-1"
    # Valida publicação no stream stream:incidents:dlq
    mock_redis.xadd.assert_awaited_once()
    call_kwargs = mock_redis.xadd.await_args.kwargs
    assert call_kwargs["name"] == "stream:incidents:dlq"
    dlq_data = call_kwargs["fields"]
    assert "payload" in dlq_data
    # Valida XACK da mensagem original
    mock_redis.xack.assert_awaited_once_with("stream:incidents", "cg:workers", "1700-1")


# ============================================================================
# 2. InMemoryEventBus DLQ Tests
# ============================================================================


@pytest.mark.asyncio
async def test_in_memory_bus_tracks_delivery_count_and_dlq() -> None:
    bus = InMemoryEventBus()
    topic = "stream:inventory:changes"
    group = "cg:probes"

    await bus.publish(topic, {"aggregate_id": "dev-1", "name": "Router-01"})

    # Primeira entrega
    messages = await bus.consume_batch(topic, group, "worker-1", batch_size=1)
    assert len(messages) == 1
    msg_id, payload = messages[0]
    assert await bus.get_delivery_count(topic, group, msg_id) == 1

    # Encaminha para DLQ
    dlq_res = await bus.send_to_dlq(
        topic=topic,
        group=group,
        message_id=msg_id,
        payload=payload,
        error="Invalid payload schema",
        delivery_count=5,
    )
    assert dlq_res == msg_id

    # Mensagem original foi removida do PEL
    assert msg_id not in bus._pel[topic][group]

    # Mensagem foi entregue no stream DLQ
    dlq_topic = f"{topic}:dlq"
    dlq_messages = await bus.consume_batch(dlq_topic, "cg:dlq_auditors", "auditor-1")
    assert len(dlq_messages) == 1
    _dlq_id, dlq_payload = dlq_messages[0]
    assert dlq_payload["error_message"] == "Invalid payload schema"
    assert dlq_payload["delivery_count"] == 5
    assert dlq_payload["original_message_id"] == msg_id

    await bus.close()


# ============================================================================
# 3. ResilientEventBus DLQ Tests
# ============================================================================


@pytest.mark.asyncio
async def test_resilient_event_bus_delegates_dlq_and_fallback() -> None:
    mock_primary = AsyncMock()
    mock_primary.get_delivery_count.return_value = 5
    mock_primary.send_to_dlq.return_value = "res-msg-1"

    fallback = InMemoryEventBus()
    bus = ResilientEventBus(primary_bus=mock_primary, fallback_bus=fallback)

    # 1. Com primário saudável
    assert await bus.get_delivery_count("stream:iam:events", "cg:iam", "msg-1") == 5
    await bus.send_to_dlq(
        topic="stream:iam:events",
        group="cg:iam",
        message_id="msg-1",
        payload={"email": "admin@infrawatch.ao"},
        error="SMTP timeout",
        delivery_count=5,
    )
    mock_primary.send_to_dlq.assert_awaited_once()

    # 2. Com falha de conexão no primário -> comuta para fallback
    mock_primary.get_delivery_count.side_effect = ConnectionRefusedError("Redis down")
    count = await bus.get_delivery_count("stream:iam:events", "cg:iam", "msg-1")
    # No fallback, mensagem não foi consumida previamente, logo retorna 1
    assert count == 1
    assert bus.is_primary_healthy is False

    await bus.close()
