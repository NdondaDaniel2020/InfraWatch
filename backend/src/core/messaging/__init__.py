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

# Singleton do Event Bus
_event_bus: ResilientEventBus | None = None


def get_event_bus() -> ResilientEventBus:
    """Retorna a instância singleton do ResilientEventBus."""
    global _event_bus
    if _event_bus is None:
        _event_bus = ResilientEventBus()
    return _event_bus


async def close_event_bus() -> None:
    """Fecha a instância singleton do EventBus."""
    global _event_bus
    if _event_bus is not None:
        await _event_bus.close()
        _event_bus = None


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
    "close_event_bus",
    "get_event_bus",
    "get_sse_broadcaster",
]