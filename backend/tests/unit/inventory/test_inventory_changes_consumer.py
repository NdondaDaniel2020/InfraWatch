"""Testes unitários para InventoryChangesConsumer."""

from __future__ import annotations

import asyncio
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import pytest

from src.contexts.inventory.consumers.inventory_changes_consumer import InventoryChangesConsumer


@pytest.mark.asyncio
async def test_inventory_changes_consumer_handle_events() -> None:
    """Valida o roteamento e mutação do agendador em memória para eventos do ciclo de vida de dispositivos."""
    mock_schedule = AsyncMock()
    mock_event_bus = AsyncMock()

    consumer = InventoryChangesConsumer(
        event_bus=mock_event_bus,
        schedule=mock_schedule,
    )

    dev_id = uuid4()
    dev_str = str(dev_id)

    # 1. Sem aggregate_id -> ignora
    await consumer._handle_event("DeviceCreated", {"foo": "bar"})
    mock_schedule.add_or_update.assert_not_called()

    # 2. DeviceCreated
    create_payload = {
        "aggregate_id": dev_str,
        "name": "Router Core",
        "ip_address": "192.168.1.1",
        "port": 80,
        "protocol": "HTTP",
        "check_interval": 30,
        "timeout": 5,
        "organization_id": str(uuid4()),
        "status": "ONLINE",
    }
    await consumer._handle_event("DeviceCreated", create_payload)
    mock_schedule.add_or_update.assert_called_once()

    # 3. DeviceUpdated
    mock_target = MagicMock()
    mock_schedule.get.return_value = mock_target
    update_payload = {
        "aggregate_id": dev_str,
        "name": "Router Core Updated",
        "ip_address": "192.168.1.254",
        "port": 443,
        "protocol": "HTTPS",
    }
    await consumer._handle_event("DeviceUpdated", update_payload)
    assert mock_target.name == "Router Core Updated"
    assert mock_target.ip_address == "192.168.1.254"
    assert mock_target.port == 443
    assert mock_target.protocol == "HTTPS"

    # 4. DevicePaused & DeviceResumed
    await consumer._handle_event("DevicePaused", {"aggregate_id": dev_str})
    mock_schedule.pause.assert_called_with(dev_id)

    await consumer._handle_event("DeviceResumed", {"aggregate_id": dev_str})
    mock_schedule.resume.assert_called_with(dev_id)

    # 5. DeviceMaintenanceStarted
    await consumer._handle_event("DeviceMaintenanceStarted", {"aggregate_id": dev_str})
    assert mock_target.status == "MAINTENANCE"

    # 6. DeviceStatusChanged
    await consumer._handle_event(
        "DeviceStatusChanged", {"aggregate_id": dev_str, "new_status": "OFFLINE"}
    )
    assert mock_target.status == "OFFLINE"

    # 7. Evento desconhecido
    await consumer._handle_event("UnknownEvent", {"aggregate_id": dev_str})


@pytest.mark.asyncio
async def test_inventory_changes_consumer_loop_graceful_stop() -> None:
    """Valida encerramento gracioso do consume_loop."""
    mock_schedule = AsyncMock()
    mock_event_bus = AsyncMock()
    mock_redis = AsyncMock()
    mock_event_bus._redis = mock_redis

    consumer = InventoryChangesConsumer(
        event_bus=mock_event_bus,
        schedule=mock_schedule,
    )

    stop_event = asyncio.Event()
    stop_event.set()  # Encerra no primeiro check

    await consumer.consume_loop(stop_event=stop_event)
