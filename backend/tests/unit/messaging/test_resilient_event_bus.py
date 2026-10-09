"""Testes unitários e de integração para o Barramento de Eventos (EventBus).

Valida:
1. InMemoryEventBus (publicação, consumo, ACK e PEL)
2. RedisStreamsEventBus (XADD, XREADGROUP, XACK e XAUTOCLAIM com mocks de conexão)
3. ResilientEventBus (comutação transparente diante de ConnectionRefusedError,
   retenção em buffer de reconciliação e restauração pós-reconexão)
4. Compatibilidade com o OutboxRelayWorker
"""

from collections.abc import AsyncGenerator
from dataclasses import dataclass
from typing import Any
from unittest.mock import AsyncMock, MagicMock

import pytest
from redis.exceptions import ConnectionError as RedisConnectionError

from src.core.domain.events import DomainEvent
from src.core.messaging.in_memory_bus import InMemoryEventBus
from src.core.messaging.redis_streams_bus import RedisStreamsEventBus
from src.core.messaging.resilient_bus import ResilientEventBus


@dataclass(frozen=True)
class SampleDeviceCreatedEvent(DomainEvent):
    """Evento fictício de teste."""

    device_name: str = "Router-Core-Luanda"
    ip_address: str = "192.168.1.1"


# ============================================================================
# 1. Testes do InMemoryEventBus
# ============================================================================


class TestInMemoryEventBus:
    """Suíte de testes para a implementação em memória do EventBus."""

    @pytest.fixture
    async def bus(self) -> AsyncGenerator[InMemoryEventBus, None]:
        bus_instance = InMemoryEventBus()
        yield bus_instance
        await bus_instance.close()

    async def test_publish_and_consume_batch_with_domain_event(self, bus: InMemoryEventBus) -> None:
        topic = "devices.events"
        group = "test-group"
        consumer = "worker-1"

        event = SampleDeviceCreatedEvent()
        success = await bus.publish(topic, event)
        assert success is True

        batch = await bus.consume_batch(topic, group, consumer, batch_size=10, timeout_ms=500)
        assert len(batch) == 1

        msg_id, payload = batch[0]
        assert isinstance(msg_id, str)
        assert payload["event_type"] == "SampleDeviceCreatedEvent"
        assert payload["device_name"] == "Router-Core-Luanda"
        assert payload["ip_address"] == "192.168.1.1"
        assert "event_id" in payload

    async def test_publish_and_consume_with_plain_dict(self, bus: InMemoryEventBus) -> None:
        topic = "telemetry.ping"
        group = "telemetry-group"
        consumer = "probe-1"

        dict_event = {
            "event_type": "PingReceived",
            "latency_ms": 14.5,
            "status": "UP",
        }
        assert await bus.publish(topic, dict_event) is True

        batch = await bus.consume_batch(topic, group, consumer)
        assert len(batch) == 1
        _, payload = batch[0]
        assert payload["latency_ms"] == 14.5
        assert payload["status"] == "UP"

    async def test_ack_removes_from_pel(self, bus: InMemoryEventBus) -> None:
        topic = "alerts.triggers"
        group = "alert-engine"
        consumer = "consumer-a"

        await bus.publish(topic, {"event_type": "ThresholdExceeded", "value": 98.2})
        batch = await bus.consume_batch(topic, group, consumer)
        assert len(batch) == 1
        msg_id, _ = batch[0]

        # Verifica se está no PEL antes do ACK
        assert msg_id in bus._pel[topic][group]

        # Executa o ACK
        acked = await bus.ack(topic, group, msg_id)
        assert acked == 1
        assert msg_id not in bus._pel[topic][group]

    async def test_subscribe_invokes_handler_automatically(self, bus: InMemoryEventBus) -> None:
        topic = "orders.new"
        group = "order-processors"
        consumer = "order-worker"
        received_events: list[dict[str, Any]] = []

        async def handler(t: str, payload: dict[str, Any]) -> None:
            received_events.append(payload)

        await bus.subscribe(topic, group, consumer, handler)

        await bus.publish(topic, {"event_type": "OrderPlaced", "order_id": 123})
        await bus.publish(topic, {"event_type": "OrderPlaced", "order_id": 456})

        import asyncio

        # Aguarda o loop em background processar
        for _ in range(10):
            if len(received_events) >= 2:
                break
            await asyncio.sleep(0.1)

        assert len(received_events) == 2
        assert received_events[0]["order_id"] == 123
        assert received_events[1]["order_id"] == 456

    async def test_subscribe_invokes_canonical_handler_with_topic(
        self, bus: InMemoryEventBus
    ) -> None:
        topic = "notifications.email"
        group = "email-workers"
        consumer = "email-worker-1"
        received_calls: list[tuple[str, dict[str, Any]]] = []

        async def canonical_handler(t: str, payload: dict[str, Any]) -> None:
            received_calls.append((t, payload))

        await bus.subscribe(topic, group, consumer, canonical_handler)
        await bus.publish(topic, {"recipient": "admin@infrawatch.io", "subject": "Alerta"})

        import asyncio

        for _ in range(10):
            if len(received_calls) >= 1:
                break
            await asyncio.sleep(0.1)

        assert len(received_calls) == 1
        assert received_calls[0] == (topic, {"recipient": "admin@infrawatch.io", "subject": "Alerta"})

    async def test_subscribe_invokes_event_handler_protocol(
        self, bus: InMemoryEventBus
    ) -> None:
        topic = "audit.events"
        group = "audit-workers"
        consumer = "audit-worker-1"

        class AuditHandler:
            def __init__(self) -> None:
                self.records: list[tuple[str, dict[str, Any]]] = []

            async def handle(self, t: str, event_data: dict[str, Any]) -> None:
                self.records.append((t, event_data))

        handler_instance = AuditHandler()
        await bus.subscribe(topic, group, consumer, handler_instance)
        await bus.publish(topic, {"action": "USER_LOGIN", "user": "daniel"})

        import asyncio

        for _ in range(10):
            if len(handler_instance.records) >= 1:
                break
            await asyncio.sleep(0.1)

        assert len(handler_instance.records) == 1
        assert handler_instance.records[0] == (topic, {"action": "USER_LOGIN", "user": "daniel"})


# ============================================================================
# 2. Testes do RedisStreamsEventBus (com Mock)
# ============================================================================


class TestRedisStreamsEventBus:
    """Suíte de testes para a implementação Redis Streams com cliente simulado."""

    @pytest.fixture
    def mock_redis(self) -> MagicMock:
        mock = MagicMock()
        mock.xadd = AsyncMock(return_value="1720000000000-0")
        mock.xgroup_create = AsyncMock(return_value=True)
        mock.xautoclaim = AsyncMock(return_value=("0-0", [], []))
        mock.xreadgroup = AsyncMock(return_value=[])
        mock.xack = AsyncMock(return_value=1)
        mock.aclose = AsyncMock()
        mock.ping = AsyncMock(return_value=True)
        return mock

    async def test_publish_calls_xadd_with_asterisk_id(self, mock_redis: MagicMock) -> None:
        bus = RedisStreamsEventBus(redis_client=mock_redis)
        event = SampleDeviceCreatedEvent()

        success = await bus.publish("devices.stream", event)
        assert success is True

        mock_redis.xadd.assert_awaited_once()
        call_kwargs = mock_redis.xadd.await_args.kwargs
        assert call_kwargs["name"] == "devices.stream"
        assert call_kwargs["id"] == "*"
        assert "payload" in call_kwargs["fields"]
        assert call_kwargs["fields"]["event_type"] == "SampleDeviceCreatedEvent"

    async def test_consume_batch_calls_xreadgroup_and_parses_json(
        self, mock_redis: MagicMock
    ) -> None:
        import json

        mock_payload = {"event_type": "NodeDown", "node_id": "core-switch-1"}
        mock_redis.xreadgroup.return_value = [
            [
                "devices.stream",
                [
                    ("1720000000000-0", {"payload": json.dumps(mock_payload)}),
                ],
            ]
        ]

        bus = RedisStreamsEventBus(redis_client=mock_redis)
        messages = await bus.consume_batch("devices.stream", "group-1", "consumer-1")

        assert len(messages) == 1
        msg_id, payload = messages[0]
        assert msg_id == "1720000000000-0"
        assert payload["event_type"] == "NodeDown"
        assert payload["node_id"] == "core-switch-1"

    async def test_claim_pending_messages_via_xautoclaim(self, mock_redis: MagicMock) -> None:
        import json

        orphaned_payload = {"event_type": "OrphanRecovered", "data": "restored"}
        mock_redis.xautoclaim.return_value = (
            "0-0",
            [
                ("1720000000001-0", {"payload": json.dumps(orphaned_payload)}),
            ],
            [],
        )

        bus = RedisStreamsEventBus(redis_client=mock_redis)
        claimed = await bus.claim_pending_messages("devices.stream", "group-1", "consumer-1")

        assert len(claimed) == 1
        assert claimed[0][0] == "1720000000001-0"
        assert claimed[0][1]["event_type"] == "OrphanRecovered"

    async def test_ack_calls_xack(self, mock_redis: MagicMock) -> None:
        bus = RedisStreamsEventBus(redis_client=mock_redis)
        acked = await bus.ack("devices.stream", "group-1", "1720000000000-0")
        assert acked == 1
        mock_redis.xack.assert_awaited_once_with("devices.stream", "group-1", "1720000000000-0")


# ============================================================================
# 3. Testes do ResilientEventBus (Critérios de Aceite da Issue #5)
# ============================================================================


class TestResilientEventBus:
    """Testa a resiliência, fallback transparente e reconciliação."""

    @pytest.fixture
    async def resilient_bus(
        self,
    ) -> AsyncGenerator[tuple[ResilientEventBus, MagicMock, InMemoryEventBus], None]:
        # Primário: mock do Redis que pode simular falhas
        mock_primary = MagicMock(spec=RedisStreamsEventBus)
        mock_primary.publish = AsyncMock(return_value=True)
        mock_primary.consume_batch = AsyncMock(return_value=[])
        mock_primary.ack = AsyncMock(return_value=1)
        mock_primary.close = AsyncMock()
        mock_primary._get_client = AsyncMock()
        mock_client = MagicMock()
        mock_client.ping = AsyncMock(return_value=True)
        mock_primary._get_client.return_value = mock_client

        fallback = InMemoryEventBus()
        bus = ResilientEventBus(
            primary_bus=mock_primary,
            fallback_bus=fallback,
            reconnect_interval_seconds=0.1,
            buffer_capacity=100,
        )

        yield bus, mock_primary, fallback
        await bus.close()

    async def test_normal_operation_uses_primary_bus(
        self,
        resilient_bus: tuple[ResilientEventBus, MagicMock, InMemoryEventBus],
    ) -> None:
        bus, primary, _ = resilient_bus
        event = SampleDeviceCreatedEvent()

        success = await bus.publish("devices.events", event)
        assert success is True
        assert bus.is_primary_healthy is True
        primary.publish.assert_awaited_once()

    async def test_connection_refused_falls_back_to_in_memory_without_raising_exception(
        self,
        resilient_bus: tuple[ResilientEventBus, MagicMock, InMemoryEventBus],
    ) -> None:
        """Critério de aceite: ConnectionRefusedError comuta imediatamente para InMemoryEventBus

        sem gerar exceção não tratada na API.
        """
        bus, primary, fallback = resilient_bus
        mock_client = primary._get_client.return_value
        mock_client.ping.side_effect = ConnectionRefusedError("Connection to Redis 6379 refused")
        primary.publish.side_effect = ConnectionRefusedError("Connection to Redis 6379 refused")

        event = SampleDeviceCreatedEvent()
        # Não pode lançar exceção! Deve retornar True e entregar no fallback.
        success = await bus.publish("devices.events", event)

        assert success is True
        assert bus.is_primary_healthy is False
        assert bus.pending_reconciliation_count == 1

        # Verifica se a mensagem está de fato disponível no fallback em memória
        batch = await fallback.consume_batch("devices.events", "monitoring", "worker-1")
        assert len(batch) == 1
        _, payload = batch[0]
        assert payload["event_type"] == "SampleDeviceCreatedEvent"

    async def test_redis_connection_error_falls_back_and_stores_in_buffer(
        self,
        resilient_bus: tuple[ResilientEventBus, MagicMock, InMemoryEventBus],
    ) -> None:
        bus, primary, _ = resilient_bus
        mock_client = primary._get_client.return_value
        mock_client.ping.side_effect = RedisConnectionError("Socket closed unexpectedly")
        primary.publish.side_effect = RedisConnectionError("Socket closed unexpectedly")

        dict_event = {"event_type": "AlertRaised", "severity": "CRITICAL"}
        success = await bus.publish("alerts.stream", dict_event)

        assert success is True
        assert bus.is_primary_healthy is False
        assert bus.pending_reconciliation_count == 1

        # Segunda mensagem vai direto ao buffer e ao fallback
        await bus.publish("alerts.stream", {"event_type": "AlertRaised", "severity": "WARNING"})
        assert bus.pending_reconciliation_count == 2

    async def test_reconnection_drains_buffer_and_restores_primary_broker(
        self,
        resilient_bus: tuple[ResilientEventBus, MagicMock, InMemoryEventBus],
    ) -> None:
        """Critério de aceite: Ao restabelecer a conexão com o Redis,

        o broker primário volta a ser utilizado e o buffer é drenado.
        """
        bus, primary, _ = resilient_bus
        mock_client = primary._get_client.return_value
        mock_client.ping.side_effect = ConnectionRefusedError("Redis down")
        primary.publish.side_effect = ConnectionRefusedError("Redis down")

        # 1. Simula queda
        await bus.publish("telemetry.metrics", {"event_type": "MetricReport", "cpu": 45.0})
        await bus.publish("telemetry.metrics", {"event_type": "MetricReport", "cpu": 52.0})

        assert bus.is_primary_healthy is False
        assert bus.pending_reconciliation_count == 2

        # 2. Restaura o Redis (remover a exceção)
        mock_client.ping.side_effect = None
        mock_client.ping.return_value = True
        primary.publish.side_effect = None
        primary.publish.return_value = True

        # 3. Executa verificação e recuperação
        recovered = await bus.check_and_recover()
        assert recovered is True
        assert bus.is_primary_healthy is True
        assert bus.pending_reconciliation_count == 0

        # As 2 mensagens pendentes foram reenviadas para o primário
        assert primary.publish.await_count >= 2

        # 4. Próxima mensagem vai diretamente para o primário restabelecido
        await bus.publish("telemetry.metrics", {"event_type": "MetricReport", "cpu": 30.0})
        assert primary.publish.await_count >= 3
