"""Testes unitários para DeviceRepository e método find_by_id (ADR-001)."""

from datetime import UTC, datetime
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import pytest

from src.contexts.inventory.database.models import DeviceModel
from src.contexts.inventory.domain.aggregate import Device
from src.contexts.inventory.repositories.device_repository import DeviceRepository


@pytest.mark.asyncio
async def test_find_by_id_returns_none_when_device_not_found():
    """Valida que find_by_id retorna None quando o registro não existir no banco."""
    mock_session = MagicMock()
    mock_session.execute = AsyncMock()
    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = None
    mock_session.execute.return_value = mock_result

    repo = DeviceRepository(session=mock_session)
    device = await repo.find_by_id(uuid4())

    assert device is None


@pytest.mark.asyncio
async def test_find_by_id_reconstructs_device_aggregate():
    """Valida que find_by_id reconstrói e retorna a entidade de domínio Device a partir do DeviceModel."""
    device_id = uuid4()
    org_id = uuid4()
    now = datetime.now(UTC)

    model = DeviceModel(
        id=device_id,
        organization_id=org_id,
        name="Core-Router-Luanda",
        hostname="core-rt-01",
        ip_address="192.168.10.1",
        port=22,
        protocol="ssh",
        category="ROUTER",
        interval_seconds=60,
        thresholds={"packet_loss_critical": 50.0},
        status="UP",
        is_paused=False,
        maintenance_until=None,
        created_at=now,
        updated_at=now,
    )

    mock_session = MagicMock()
    mock_session.execute = AsyncMock()
    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = model
    mock_session.execute.return_value = mock_result

    repo = DeviceRepository(session=mock_session)
    device = await repo.find_by_id(device_id)

    assert device is not None
    assert isinstance(device, Device)
    assert device.id == device_id
    assert device.organization_id == org_id
    assert device.name == "Core-Router-Luanda"
    assert device.hostname == "core-rt-01"
    assert device.ip_address == "192.168.10.1"
    assert device.port == 22
    assert device.protocol == "ssh"
    assert device.category == "ROUTER"
    assert device.interval_seconds == 60
    assert device.status == "UP"
    assert device.is_paused is False


@pytest.mark.asyncio
async def test_save_creates_or_updates_model():
    """Valida que save atualiza campos e executa flush na sessão."""
    device_id = uuid4()
    org_id = uuid4()

    device = Device(
        id=device_id,
        organization_id=org_id,
        name="Switch-Edge",
        ip_address="10.0.0.1",
        port=161,
        protocol="snmp",
        category="SWITCH",
        interval_seconds=30,
        thresholds={},
    )

    mock_session = MagicMock()
    mock_session.execute = AsyncMock()
    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = None
    mock_session.execute.return_value = mock_result
    mock_session.flush = AsyncMock()

    repo = DeviceRepository(session=mock_session)
    saved_model = await repo.save(device)

    assert saved_model.id == device_id
    assert saved_model.name == "Switch-Edge"
    mock_session.add.assert_called_once()
    mock_session.flush.assert_awaited_once()
