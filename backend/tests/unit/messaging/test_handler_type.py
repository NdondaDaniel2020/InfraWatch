"""Testes unitários para o tipo unificado HandlerType e protocolo EventHandler (ADR-001)."""

from typing import Any
from unittest.mock import MagicMock

import pytest

from src.core.messaging.in_memory_bus import InMemoryEventBus
from src.core.messaging.interfaces import (
    EventHandler,
    EventHandlerCallable,
    HandlerType,
)
from src.core.messaging.redis_streams_bus import RedisStreamsEventBus


def test_handler_type_definitions():
    """Valida a composição e assinaturas dos tipos de handlers."""
    import typing

    args = typing.get_args(HandlerType)
    assert EventHandler in args
    assert EventHandlerCallable in args
    assert len(args) == 2


class ConcreteEventHandler:
    """Implementação concreta de EventHandler para teste do protocolo."""

    def __init__(self) -> None:
        self.invocations: list[tuple[str, dict[str, Any]]] = []

    async def handle(self, topic: str, event_data: dict[str, Any]) -> None:
        self.invocations.append((topic, event_data))


def test_event_handler_protocol_conformance():
    """Valida que uma classe com método handle(topic, event_data) satisfaz o protocolo EventHandler."""
    handler = ConcreteEventHandler()
    assert isinstance(handler, EventHandler)


def test_event_handler_protocol_rejection_when_missing_handle():
    """Valida que uma classe sem handle() não satisfaz o protocolo EventHandler."""
    class InvalidHandler:
        pass

    assert not isinstance(InvalidHandler(), EventHandler)


@pytest.mark.asyncio
async def test_in_memory_bus_invokes_protocol_event_handler():
    """Valida que o InMemoryEventBus executa corretamente uma classe EventHandler."""
    bus = InMemoryEventBus()
    handler = ConcreteEventHandler()

    await bus._invoke_handler(handler, "telemetry.cpu", {"usage": 42})

    assert len(handler.invocations) == 1
    assert handler.invocations[0] == ("telemetry.cpu", {"usage": 42})


@pytest.mark.asyncio
async def test_in_memory_bus_invokes_canonical_callable_handler():
    """Valida que o InMemoryEventBus executa uma função com assinatura padrão (topic, payload)."""
    bus = InMemoryEventBus()
    received: list[tuple[str, dict[str, Any]]] = []

    async def canonical_handler(topic: str, payload: dict[str, Any]) -> None:
        received.append((topic, payload))

    await bus._invoke_handler(canonical_handler, "telemetry.ram", {"used_gb": 16})

    assert len(received) == 1
    assert received[0] == ("telemetry.ram", {"used_gb": 16})


@pytest.mark.asyncio
async def test_in_memory_bus_invokes_legacy_callable_handler():
    """Valida que o InMemoryEventBus mantém compatibilidade reversa com callable de 1 argumento."""
    bus = InMemoryEventBus()
    received: list[dict[str, Any]] = []

    async def legacy_handler(payload: dict[str, Any]) -> None:
        received.append(payload)

    await bus._invoke_handler(legacy_handler, "telemetry.disk", {"free_gb": 500})

    assert len(received) == 1
    assert received[0] == {"free_gb": 500}


@pytest.mark.asyncio
async def test_redis_streams_bus_invokes_all_handler_variants():
    """Valida invocação de handlers de protocolo, canônico e legado no RedisStreamsEventBus."""
    mock_redis = MagicMock()
    bus = RedisStreamsEventBus(redis_client=mock_redis)

    # 1. Protocolo EventHandler
    protocol_handler = ConcreteEventHandler()
    await bus._invoke_handler(protocol_handler, "stream.alerts", {"level": "CRITICAL"})
    assert protocol_handler.invocations == [("stream.alerts", {"level": "CRITICAL"})]

    # 2. Callable canônico (topic, payload)
    canonical_calls: list[tuple[str, dict[str, Any]]] = []

    async def canonical_fn(topic: str, payload: dict[str, Any]) -> None:
        canonical_calls.append((topic, payload))

    await bus._invoke_handler(canonical_fn, "stream.alerts", {"level": "WARNING"})
    assert canonical_calls == [("stream.alerts", {"level": "WARNING"})]

    # 3. Callable legado (payload)
    legacy_calls: list[dict[str, Any]] = []

    async def legacy_fn(payload: dict[str, Any]) -> None:
        legacy_calls.append(payload)

    await bus._invoke_handler(legacy_fn, "stream.alerts", {"level": "INFO"})
    assert legacy_calls == [{"level": "INFO"}]
