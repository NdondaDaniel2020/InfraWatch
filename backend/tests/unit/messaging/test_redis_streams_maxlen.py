"""Testes unitários para validação de poda automática (MAXLEN aproximado) no RedisStreamsEventBus."""

from unittest.mock import AsyncMock

import pytest

from src.core.config import get_settings
from src.core.messaging.redis_streams_bus import RedisStreamsEventBus
from src.core.messaging.topics import StreamTopics


@pytest.mark.asyncio
async def test_publish_uses_default_settings_maxlen() -> None:
    """Valida que publish() chama xadd com o maxlen configurado nas settings e approximate=True."""
    mock_redis = AsyncMock()
    mock_redis.xadd = AsyncMock(return_value="1700000000000-0")

    bus = RedisStreamsEventBus(redis_client=mock_redis)
    expected_maxlen = get_settings().REDIS_STREAM_MAXLEN

    assert bus._maxlen == expected_maxlen

    payload = {"event_id": "evt-123", "event_type": "IncidentTriggeredEvent"}
    success = await bus.publish(StreamTopics.INCIDENTS, payload)

    assert success is True
    mock_redis.xadd.assert_awaited_once()

    call_kwargs = mock_redis.xadd.call_args.kwargs
    assert call_kwargs["name"] == StreamTopics.INCIDENTS
    assert call_kwargs["id"] == "*"
    assert call_kwargs["maxlen"] == expected_maxlen
    assert call_kwargs["approximate"] is True


@pytest.mark.asyncio
async def test_publish_uses_custom_configured_maxlen() -> None:
    """Valida que maxlen customizado injetado no construtor é repassado ao xadd."""
    mock_redis = AsyncMock()
    mock_redis.xadd = AsyncMock(return_value="1700000000001-0")

    bus = RedisStreamsEventBus(redis_client=mock_redis, maxlen=2500)
    assert bus._maxlen == 2500

    payload = {"event_id": "evt-custom", "event_type": "DeviceCreated"}
    success = await bus.publish(StreamTopics.INVENTORY_CHANGES, payload)

    assert success is True
    mock_redis.xadd.assert_awaited_once()

    call_kwargs = mock_redis.xadd.call_args.kwargs
    assert call_kwargs["name"] == StreamTopics.INVENTORY_CHANGES
    assert call_kwargs["maxlen"] == 2500
    assert call_kwargs["approximate"] is True


@pytest.mark.asyncio
async def test_publish_dlq_preserves_stream_trimming() -> None:
    """Valida que publicações na DLQ também recebem poda automática através de publish()."""
    mock_redis = AsyncMock()
    mock_redis.xadd = AsyncMock(return_value="1700000000002-0")
    mock_redis.xack = AsyncMock(return_value=1)

    bus = RedisStreamsEventBus(redis_client=mock_redis, maxlen=5000)

    dlq_id = await bus.publish_dlq(
        original_topic=StreamTopics.INCIDENTS,
        original_msg_id="1700000000000-1",
        payload={"event_id": "evt-dlq"},
        reason="Poison pill payload",
        group="cg:notification_workers",
    )

    assert dlq_id == "1700000000000-1"
    mock_redis.xadd.assert_awaited_once()

    call_kwargs = mock_redis.xadd.call_args.kwargs
    assert call_kwargs["name"] == StreamTopics.INCIDENTS_DLQ
    assert call_kwargs["maxlen"] == 5000
    assert call_kwargs["approximate"] is True
