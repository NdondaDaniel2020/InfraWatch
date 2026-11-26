"""Testes unitários estendidos para DeviceCommandService (Inventory)."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest

from src.contexts.inventory.domain.aggregate import Device
from src.contexts.inventory.domain.value_objects import DeviceCategory, DeviceStatus
from src.contexts.inventory.schemas.requests import (
    CreateDeviceRequest,
    SetMaintenanceRequest,
    UpdateDeviceRequest,
)
from src.contexts.inventory.services.device_command_service import DeviceCommandService
from src.core.database.unit_of_work import AbstractUnitOfWork


@pytest.fixture
def mock_uow_and_session():
    mock_session = AsyncMock()
    mock_session.flush = AsyncMock()
    mock_session.refresh = AsyncMock()

    mock_uow = MagicMock(spec=AbstractUnitOfWork)
    mock_uow.session = mock_session
    mock_uow.commit = AsyncMock()
    return mock_uow, mock_session


@pytest.mark.asyncio
async def test_create_device_validation_and_success(mock_uow_and_session) -> None:
    """Valida criação de dispositivo, validações de intervalo/organização e persistência no outbox."""
    mock_uow, _ = mock_uow_and_session
    mock_repo = AsyncMock()
    service = DeviceCommandService(uow_or_session=mock_uow, repository=mock_repo)
    service.audit_service = AsyncMock()

    actor_id = uuid4()
    org_id = uuid4()

    # 1. Falha: sem organization_id
    req_no_org = CreateDeviceRequest(
        name="Router BGP",
        ip_address="192.168.1.1",
        protocol="ICMP",
        category="ROUTER",
        interval_seconds=30,
        organization_id=None,
    )
    with pytest.raises(ValueError, match="organization_id is required"):
        await service.create_device(req_no_org, actor_user_id=actor_id, actor_ip="127.0.0.1")

    # 2. Falha: intervalo < 5s
    req_fast = CreateDeviceRequest(
        name="Router BGP",
        ip_address="192.168.1.1",
        protocol="ICMP",
        category="ROUTER",
        interval_seconds=2,
        organization_id=org_id,
    )
    with pytest.raises(ValueError, match="at least 5 seconds"):
        await service.create_device(req_fast, actor_user_id=actor_id, actor_ip="127.0.0.1")

    # 3. Sucesso com protocolo SNMP e porta default (161)
    req_snmp = CreateDeviceRequest(
        name="Switch Core",
        ip_address="10.0.0.1",
        protocol="SNMP",
        category="SWITCH",
        port=0,
        interval_seconds=60,
        organization_id=org_id,
    )
    with patch(
        "src.contexts.inventory.services.device_command_service.OutboxRepository.add_event"
    ) as mock_outbox:
        device = await service.create_device(req_snmp, actor_user_id=actor_id, actor_ip="127.0.0.1")
        assert device.name == "Switch Core"
        assert device.port == 161
        mock_repo.save.assert_called_once()
        mock_outbox.assert_called_once()
        mock_uow.commit.assert_called_once()


@pytest.mark.asyncio
async def test_update_pause_resume_maintenance_device(mock_uow_and_session) -> None:
    """Valida ciclo de vida: update, pause, resume e manutenção do dispositivo."""
    mock_uow, _ = mock_uow_and_session
    mock_repo = AsyncMock()
    service = DeviceCommandService(uow_or_session=mock_uow, repository=mock_repo)
    service.audit_service = AsyncMock()

    device_id = uuid4()
    org_id = uuid4()
    actor_id = uuid4()

    device = Device(
        id=device_id,
        organization_id=org_id,
        name="Servidor Web",
        ip_address="10.1.1.5",
        port=80,
        protocol="HTTP",
        category=DeviceCategory.SERVER.value,
        interval_seconds=15,
        thresholds={},
    )
    mock_repo.find_by_id.return_value = device

    # 1. Update device
    up_req = UpdateDeviceRequest(name="Servidor Web Nginx", interval_seconds=20)
    with patch("src.contexts.inventory.services.device_command_service.OutboxRepository.add_event"):
        updated = await service.update_device(
            up_req, actor_user_id=actor_id, actor_ip="127.0.0.1", device_id=device_id
        )
        assert updated.name == "Servidor Web Nginx"
        assert updated.interval_seconds == 20

    # 2. Pause device
    with patch("src.contexts.inventory.services.device_command_service.OutboxRepository.add_event"):
        paused = await service.pause_device(device_id=device_id, reason="Manutenção preventiva")
        assert paused.is_paused is True

    # 3. Resume device
    with patch("src.contexts.inventory.services.device_command_service.OutboxRepository.add_event"):
        resumed = await service.resume_device(device_id=device_id)
        assert resumed.is_paused is False

    # 4. Set maintenance
    with patch("src.contexts.inventory.services.device_command_service.OutboxRepository.add_event"):
        maint_req = SetMaintenanceRequest(
            until=datetime.now(UTC) + timedelta(hours=2),
            reason="Upgrade OS",
        )
        maint = await service.set_maintenance(
            cmd=maint_req,
            actor_user_id=actor_id,
            actor_ip="127.0.0.1",
            device_id=device_id,
        )
        assert maint.status == DeviceStatus.MAINTENANCE.value
        assert maint.maintenance_until is not None


@pytest.mark.asyncio
async def test_execute_pre_check_probe_scenarios(mock_uow_and_session) -> None:
    """Valida execute_pre_check_probe para SNMP e outros protocolos, sucesso e erro."""
    mock_uow, _ = mock_uow_and_session
    mock_repo = AsyncMock()
    service = DeviceCommandService(uow_or_session=mock_uow, repository=mock_repo)
    service.probe_executor = AsyncMock()

    from src.contexts.inventory.schemas.requests import TestProbeRequest
    from src.workers.probers.executor import ProbeResult

    # 1. SNMP com porta 0 -> resolve para 161 e sucesso
    service.probe_executor.execute.return_value = ProbeResult(
        device_id=uuid4(),
        target_name="Switch SNMP",
        status="UP",
        latency_ms=12.5,
        packet_loss_pct=0.0,
        error_message=None,
    )
    req_snmp = TestProbeRequest(ip_address="10.0.0.1", protocol="SNMP", port=0, timeout_ms=2000)
    res_snmp = await service.execute_pre_check_probe(req_snmp)
    assert res_snmp.success is True
    assert res_snmp.status == "UP"
    assert "Conexão validada" in res_snmp.message

    # 2. Falha (DOWN)
    service.probe_executor.execute.return_value = ProbeResult(
        device_id=uuid4(),
        target_name="Router ICMP",
        status="DOWN",
        latency_ms=0.0,
        packet_loss_pct=100.0,
        error_message="Host unreachable",
    )
    req_down = TestProbeRequest(ip_address="10.0.0.2", protocol="ICMP", port=0, timeout_ms=1000)
    res_down = await service.execute_pre_check_probe(req_down)
    assert res_down.success is False
    assert res_down.status == "DOWN"
    assert res_down.error_message == "Host unreachable"


@pytest.mark.asyncio
async def test_execute_on_demand_probe_and_zabbix_status(mock_uow_and_session) -> None:
    """Valida execute_on_demand_probe com host Zabbix vinculado e fallback."""
    mock_uow, _ = mock_uow_and_session
    mock_repo = AsyncMock()
    service = DeviceCommandService(uow_or_session=mock_uow, repository=mock_repo)
    service.probe_executor = AsyncMock()

    device_id = uuid4()
    org_id = uuid4()
    device = Device(
        id=device_id,
        organization_id=org_id,
        name="Switch Edge",
        ip_address="10.2.2.1",
        port=0,
        protocol="SNMP",
        category=DeviceCategory.SWITCH.value,
        interval_seconds=30,
        thresholds={"zabbix_host_id": "10050"},
    )
    mock_repo.find_by_id.return_value = device

    from src.workers.probers.executor import ProbeResult

    service.probe_executor.execute.return_value = ProbeResult(
        device_id=device_id,
        target_name="Switch Edge",
        status="UP",
        latency_ms=5.4,
        packet_loss_pct=0.0,
        error_message=None,
    )

    with patch.object(
        service, "_check_zabbix_status", return_value={"status": "online", "available": True}
    ):
        res = await service.execute_on_demand_probe(device_id=device_id, organization_id=org_id)
        assert res is not None
        assert res.success is True
        assert res.zabbix_status == {"status": "online", "available": True}

    # Dispositivo não encontrado ou organização divergente
    assert await service.execute_on_demand_probe(device_id=uuid4(), organization_id=uuid4()) is None

    mock_repo.find_by_id.return_value = device
    assert (
        await service.execute_on_demand_probe(device_id=device_id, organization_id=uuid4()) is None
    )
