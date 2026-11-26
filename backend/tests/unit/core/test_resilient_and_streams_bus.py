"""Testes unitários para RedisStreamsEventBus e ResilientEventBus (ADR-016)."""

from __future__ import annotations

from unittest.mock import AsyncMock, patch
from uuid import uuid4

import pytest
from redis.exceptions import RedisError

from src.core.messaging.redis_streams_bus import RedisStreamsEventBus
from src.core.messaging.resilient_bus import ResilientEventBus


@pytest.mark.asyncio
async def test_redis_streams_bus_operations() -> None:
    """Valida ensure_consumer_group, publish, normalize, parse, claim, ack, retry e métricas do RedisStreamsEventBus."""
    mock_redis = AsyncMock()
    bus = RedisStreamsEventBus(redis_client=mock_redis)

    # 1. ensure_consumer_group (sucesso e BUSYGROUP já existente)
    await bus.ensure_consumer_group("topic.events", "group_workers")
    mock_redis.xgroup_create.assert_called_with(
        name="topic.events", groupname="group_workers", id="0", mkstream=True
    )

    mock_redis.xgroup_create.side_effect = RedisError(
        "BUSYGROUP Consumer Group name already exists"
    )
    await bus.ensure_consumer_group("topic.events", "group_workers")

    # 2. publish & normalize
    mock_redis.xadd.side_effect = None
    mock_redis.xadd.return_value = "1700000000000-0"
    event_payload = {"event_type": "DeviceCreated", "aggregate_id": str(uuid4()), "data": 123}
    pub_ok = await bus.publish("devices.events", event_payload)
    assert pub_ok is True
    mock_redis.xadd.assert_called_once()

    # 3. parse_message & claim_pending_messages
    raw_fields = {
        "event_type": "DeviceCreated",
        "payload": '{"event_type": "DeviceCreated", "aggregate_id": "123"}',
    }
    parsed = bus._parse_message(raw_fields)
    assert parsed["event_type"] == "DeviceCreated"

    mock_redis.xautoclaim.return_value = ("0-0", [("1700000000000-1", raw_fields)], [])
    claimed = await bus.claim_pending_messages(
        "devices.events", "group_workers", "worker_1", min_idle_ms=60000
    )
    assert len(claimed) == 1
    assert claimed[0][0] == "1700000000000-1"

    # 4. ack & get_delivery_count & should_process_retry
    mock_redis.xack.return_value = 1
    acked = await bus.ack("devices.events", "group_workers", "1700000000000-1")
    assert acked == 1

    mock_redis.xpending_range.return_value = [
        {"message_id": "1700000000000-1", "times_delivered": 2}
    ]
    deliv = await bus.get_delivery_count("devices.events", "group_workers", "1700000000000-1")
    assert deliv == 2

    # should_process_retry
    mock_redis.xpending_range.return_value = [
        {"message_id": "1700000000000-1", "times_delivered": 2, "idle": 40000}
    ]
    assert (
        await bus.should_process_retry("devices.events", "group_workers", "1700000000000-1") is True
    )

    mock_redis.xpending_range.return_value = [
        {"message_id": "1700000000000-1", "times_delivered": 2, "idle": 5000}
    ]
    assert (
        await bus.should_process_retry("devices.events", "group_workers", "1700000000000-1")
        is False
    )

    # 5. publish_dlq & send_to_dlq
    mock_redis.xadd.return_value = "dlq-msg-id"
    dlq_id = await bus.publish_dlq("devices.events", "orig-1", event_payload, reason="Timeout")
    assert dlq_id == "orig-1"

    with patch.object(bus, "ack", return_value=1):
        dlq_sent = await bus.send_to_dlq(
            "devices.events", "group_workers", "msg_id", event_payload, "Fatal error", 3
        )
        assert dlq_sent == "msg_id"

    # 6. collect_stream_metrics & close
    mock_redis.xinfo_groups.return_value = [
        {"name": "group_workers", "pending": 3, "consumers": 1, "lag": 0}
    ]
    mock_redis.xinfo_consumers.return_value = [{"name": "worker_1", "pending": 3, "idle": 100}]
    metrics = await bus.collect_stream_metrics("devices.events", "group_workers")
    assert metrics["pending_count"] == 3
    assert metrics["consumer_count"] == 1

    await bus.close()


@pytest.mark.asyncio
async def test_resilient_event_bus_lifecycle_and_fallback() -> None:
    """Valida ResilientEventBus com failover para in-memory, buffer de reconciliação e recuperação."""
    mock_primary = AsyncMock()
    mock_fallback = AsyncMock()

    bus = ResilientEventBus(
        primary_bus=mock_primary,
        fallback_bus=mock_fallback,
        reconnect_interval_seconds=10.0,
    )

    # 1. Primário saudável
    assert bus.is_primary_healthy is True
    assert bus.pending_reconciliation_count == 0

    mock_primary.publish.return_value = True
    res_prim = await bus.publish("devices.events", {"event_type": "Created"})
    assert res_prim is True
    mock_primary.publish.assert_called_once()

    # 2. Primário falha -> ativa fallback e enfileira no buffer
    mock_primary.publish.side_effect = ConnectionRefusedError("Connection refused")
    mock_fallback.publish.return_value = True

    res_fall = await bus.publish("devices.events", {"event_type": "DeviceUpdated", "data": "xyz"})
    assert res_fall is True
    assert bus.is_primary_healthy is False
    assert bus.pending_reconciliation_count == 1
    mock_fallback.publish.assert_called_once()

    # 3. Drenagem do buffer ao recuperar
    mock_primary.publish.side_effect = None
    mock_primary.publish.return_value = True
    await bus._drain_reconciliation_buffer()
    assert bus.pending_reconciliation_count == 0

    assert await bus.check_and_recover() is True
    assert bus.is_primary_healthy is True

    # 4. ack, get_delivery_count, publish_dlq, send_to_dlq
    mock_primary.ack.return_value = 1
    assert await bus.ack("topic", "group", "m1") == 1

    mock_primary.get_delivery_count.return_value = 3
    assert await bus.get_delivery_count("topic", "group", "m1") == 3

    mock_primary.should_process_retry.return_value = True
    assert await bus.should_process_retry("topic", "group", "m1") is True

    mock_primary.publish_dlq.return_value = "dlq-res"
    assert await bus.publish_dlq("topic", "orig-m1", {"k": "v"}, "Error") == "dlq-res"

    mock_primary.send_to_dlq.return_value = "orig-m1"
    assert await bus.send_to_dlq("topic", "group", "orig-m1", {"k": "v"}, "Err", 2) == "orig-m1"

    await bus.close()
    mock_primary.close.assert_called_once()
    mock_fallback.close.assert_called_once()
