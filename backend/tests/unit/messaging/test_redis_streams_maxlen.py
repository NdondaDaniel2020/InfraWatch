"""Testes unitários para validação de poda automática (MAXLEN aproximado) no RedisStreamsEventBus."""

from unittest.mock import AsyncMock

import pytest

from src.core.config import get_settings
from src.core.messaging.redis_streams_bus import RedisStreamsEventBus
from src.core.messaging.topics import StreamTopics


@pytest.mark.asyncio
async def test_publish_uses_default_settings_maxlen() -> None:
    """Valida que publish() chama xadd com o maxlen configurado nas settings para tópicos não mapeados."""
    mock_redis = AsyncMock()
    mock_redis.xadd = AsyncMock(return_value="1700000000000-0")

    bus = RedisStreamsEventBus(redis_client=mock_redis)
    expected_maxlen = get_settings().REDIS_STREAM_MAXLEN

    assert bus._maxlen == expected_maxlen

    payload = {"event_id": "evt-123", "event_type": "GenericUnmappedEvent"}
    success = await bus.publish("stream:generic:unmapped", payload)

    assert success is True
    mock_redis.xadd.assert_awaited_once()

    call_kwargs = mock_redis.xadd.call_args.kwargs
    assert call_kwargs["name"] == "stream:generic:unmapped"
    assert call_kwargs["id"] == "*"
    assert call_kwargs["maxlen"] == expected_maxlen
    assert call_kwargs["approximate"] is True


@pytest.mark.asyncio
async def test_publish_uses_topic_specific_maxlen() -> None:
    """Valida que tópicos com limite granular (DLQs ou voláteis) utilizam TOPIC_MAXLEN_MAPPING."""
    mock_redis = AsyncMock()
    mock_redis.xadd = AsyncMock(return_value="1700000000000-0")

    bus = RedisStreamsEventBus(redis_client=mock_redis)

    # 1. Probes on-demand: 5.000 mensagens
    await bus.publish(StreamTopics.PROBES_ONDEMAND, {"event_type": "ProbeCommand"})
    call_kwargs_probe = mock_redis.xadd.call_args.kwargs
    assert call_kwargs_probe["name"] == StreamTopics.PROBES_ONDEMAND
    assert call_kwargs_probe["maxlen"] == 5_000

    # 2. DLQ de Incidentes: 50.000 mensagens para retenção ampliada
    await bus.publish(StreamTopics.INCIDENTS_DLQ, {"event_type": "DeadLetter"})
    call_kwargs_dlq = mock_redis.xadd.call_args.kwargs
    assert call_kwargs_dlq["name"] == StreamTopics.INCIDENTS_DLQ
    assert call_kwargs_dlq["maxlen"] == 50_000

    # 3. Sobrescrita pontual direta via argumento maxlen
    await bus.publish(StreamTopics.INCIDENTS, {"event_type": "Special"}, maxlen=1234)
    call_kwargs_override = mock_redis.xadd.call_args.kwargs
    assert call_kwargs_override["maxlen"] == 1234


@pytest.mark.asyncio
async def test_publish_uses_custom_configured_maxlen() -> None:
    """Valida que maxlen customizado injetado no construtor é repassado ao xadd para tópicos sem mapeamento granular."""
    mock_redis = AsyncMock()
    mock_redis.xadd = AsyncMock(return_value="1700000000001-0")

    bus = RedisStreamsEventBus(redis_client=mock_redis, maxlen=2500)
    assert bus._maxlen == 2500

    payload = {"event_id": "evt-custom", "event_type": "DeviceCreated"}
    # Tópico não presente em TOPIC_MAXLEN_MAPPING
    success = await bus.publish("stream:custom:unmapped", payload)

    assert success is True
    mock_redis.xadd.assert_awaited_once()

    call_kwargs = mock_redis.xadd.call_args.kwargs
    assert call_kwargs["name"] == "stream:custom:unmapped"
    assert call_kwargs["maxlen"] == 2500
    assert call_kwargs["approximate"] is True


@pytest.mark.asyncio
async def test_publish_dlq_preserves_stream_trimming() -> None:
    """Valida que publicações na DLQ recebem a retenção ampliada de 50.000 através de publish()."""
    mock_redis = AsyncMock()
    mock_redis.xadd = AsyncMock(return_value="1700000000002-0")
    mock_redis.xack = AsyncMock(return_value=1)

    bus = RedisStreamsEventBus(redis_client=mock_redis)

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
    assert call_kwargs["maxlen"] == 50_000
    assert call_kwargs["approximate"] is True
