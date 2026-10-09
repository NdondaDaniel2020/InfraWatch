"""Core messaging and EventBus package for InfraWatch."""

from src.core.messaging.in_memory_bus import InMemoryEventBus
from src.core.messaging.interfaces import (
    EventBus,
    EventHandler,
    EventHandlerCallable,
    HandlerType,
    LegacyEventHandlerCallable,
)
from src.core.messaging.redis_streams_bus import RedisStreamsEventBus
from src.core.messaging.resilient_bus import ResilientEventBus
from src.core.messaging.sse_broadcaster import (
    SSEBroadcaster,
    SSEConnection,
    get_sse_broadcaster,
)

__all__ = [
    "EventBus",
    "EventHandler",
    "EventHandlerCallable",
    "HandlerType",
    "InMemoryEventBus",
    "LegacyEventHandlerCallable",
    "RedisStreamsEventBus",
    "ResilientEventBus",
    "SSEBroadcaster",
    "SSEConnection",
    "get_sse_broadcaster",
]
