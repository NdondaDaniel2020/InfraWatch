from datetime import UTC, datetime, timedelta
from uuid import uuid4

import pytest

from src.contexts.inventory.domain.aggregate import Device
from src.contexts.inventory.schemas.requests import (
    CreateDeviceRequest,
    PauseDeviceRequest,
    ResumeDeviceRequest,
    SetMaintenanceRequest,
)
from src.contexts.inventory.services.device_command_service import DeviceCommandService


class MockRepository:
    def __init__(self):
        self.devices = {}
        self.saved_devices = []

    async def save(self, device: Device) -> None:
        self.saved_devices.append(device)
        self.devices[device.id] = device

    async def find_by_id(self, device_id):
        return self.devices.get(device_id)

    async def find_by_organization(self, organization_id):
        return [d for d in self.devices.values() if d.organization_id == organization_id]


class MockAuditService:
    def __init__(self):
        self.actions = []

    async def record_action(self, **kwargs):
        self.actions.append(kwargs)


class MockSession:
    def __init__(self):
        self.added = []

    def add(self, entity):
        self.added.append(entity)

    async def commit(self):
        pass


# Removed global monkeypatch of OutboxRepository.add_event


from unittest.mock import patch


def mock_add_event(session, event, aggregate_type=""):
    session.add({"event": event, "type": aggregate_type})


@pytest.mark.asyncio
@patch(
    "src.contexts.inventory.services.device_command_service.OutboxRepository.add_event",
    new=mock_add_event,
)
async def test_create_device_success():
    session = MockSession()
    repo = MockRepository()
    service = DeviceCommandService(session, repo)
    service.audit_service = MockAuditService()

    org_id = uuid4()
    actor_id = uuid4()

    cmd = CreateDeviceRequest(
        organization_id=org_id,
        name="Router Edge",
        ip_address="192.168.1.1",
        port=22,
        protocol="ssh",
        category="ROUTER",
        interval_seconds=60,
        thresholds={},
    )

    device = await service.create_device(cmd, actor_user_id=actor_id, actor_ip="127.0.0.1")

    assert device.name == "Router Edge"
    assert device.status == "UP"
    assert len(repo.saved_devices) == 1

    assert len(session.added) == 1
    event = session.added[0]["event"]
    assert event.event_type == "DeviceCreated"
    assert event.name == "Router Edge"

    assert len(service.audit_service.actions) == 1
    assert service.audit_service.actions[0]["action"] == "CREATE_DEVICE"


@pytest.mark.asyncio
@patch(
    "src.contexts.inventory.services.device_command_service.OutboxRepository.add_event",
    new=mock_add_event,
)
async def test_create_device_with_camel_case_snmp_and_hostname():
    session = MockSession()
    repo = MockRepository()
    service = DeviceCommandService(session, repo)
    service.audit_service = MockAuditService()

    org_id = uuid4()
    actor_id = uuid4()

    # Criação simulando payload do frontend com camelCase
    cmd = CreateDeviceRequest.model_validate(
        {
            "organizationId": str(org_id),
            "name": "Core Switch Luanda",
            "hostname": "sw-core-01.local",
            "ipAddress": "192.168.10.5",
            "port": 0,  # Omitido / 0 no frontend para SNMP
            "protocol": "SNMP",
            "category": "SWITCH",
            "intervalSeconds": 30,
            "snmpConfig": {
                "version": "v3",
                "port": 161,
                "username": "noc_admin",
                "securityLevel": "authPriv",
                "authProtocol": "SHA256",
                "authPassword": "auth_password_123",
                "privProtocol": "AES128",
                "privPassword": "priv_password_123",
            },
        }
    )

    device = await service.create_device(cmd, actor_user_id=actor_id, actor_ip="127.0.0.1")

    assert device.name == "Core Switch Luanda"
    assert device.hostname == "sw-core-01.local"
    assert device.ip_address == "192.168.10.5"
    assert device.port == 161  # Auto-resolvido para 161
    assert device.protocol == "SNMP"
    assert "snmp_config" in device.thresholds
    assert device.thresholds["snmp_config"]["username"] == "noc_admin"


@pytest.mark.asyncio
@patch(
    "src.contexts.inventory.services.device_command_service.OutboxRepository.add_event",
    new=mock_add_event,
)
async def test_create_device_icmp_zero_port():
    session = MockSession()
    repo = MockRepository()
    service = DeviceCommandService(session, repo)
    service.audit_service = MockAuditService()

    org_id = uuid4()
    actor_id = uuid4()

    cmd = CreateDeviceRequest.model_validate(
        {
            "organizationId": str(org_id),
            "name": "Firewall Borda",
            "hostname": "fw-edge.local",
            "ipAddress": "10.0.0.1",
            "port": 0,
            "protocol": "ICMP",
            "category": "FIREWALL",
            "intervalSeconds": 15,
        }
    )

    device = await service.create_device(cmd, actor_user_id=actor_id, actor_ip="127.0.0.1")

    assert device.name == "Firewall Borda"
    assert device.hostname == "fw-edge.local"
    assert device.port == 0
    assert device.protocol == "ICMP"
    assert device.category == "FIREWALL"


@pytest.mark.asyncio
@patch(
    "src.contexts.inventory.services.device_command_service.OutboxRepository.add_event",
    new=mock_add_event,
)
async def test_create_device_invalid_interval():
    session = MockSession()
    repo = MockRepository()
    service = DeviceCommandService(session, repo)
    service.audit_service = MockAuditService()

    cmd = CreateDeviceRequest(
        organization_id=uuid4(),
        name="Router",
        ip_address="1.1.1.1",
        port=80,
        protocol="http",
        category="ROUTER",
        interval_seconds=2,  # Invalid < 5
        thresholds={},
    )

    with pytest.raises(ValueError, match="Interval must be at least 5 seconds"):
        await service.create_device(cmd, actor_user_id=uuid4(), actor_ip="127.0.0.1")


@pytest.mark.asyncio
@patch(
    "src.contexts.inventory.services.device_command_service.OutboxRepository.add_event",
    new=mock_add_event,
)
async def test_pause_and_resume_device():
    session = MockSession()
    repo = MockRepository()
    service = DeviceCommandService(session, repo)
    service.audit_service = MockAuditService()

    device = Device(uuid4(), uuid4(), "Switch", "10.0.0.1", 161, "snmp", "SWITCH", 60, {})
    await repo.save(device)

    cmd_pause = PauseDeviceRequest(
        device_id=device.id, organization_id=device.organization_id, reason="Maintenance"
    )
    await service.pause_device(cmd_pause, uuid4(), "127.0.0.1")

    assert device.status == "PAUSED"
    assert device.is_paused is True
    assert session.added[-1]["event"].event_type == "DevicePaused"

    cmd_resume = ResumeDeviceRequest(device_id=device.id, organization_id=device.organization_id)
    await service.resume_device(cmd_resume, uuid4(), "127.0.0.1")

    assert device.status == "UP"
    assert device.is_paused is False
    assert session.added[-1]["event"].event_type == "DeviceResumed"


@pytest.mark.asyncio
@patch(
    "src.contexts.inventory.services.device_command_service.OutboxRepository.add_event",
    new=mock_add_event,
)
async def test_set_maintenance():
    session = MockSession()
    repo = MockRepository()
    service = DeviceCommandService(session, repo)
    service.audit_service = MockAuditService()

    device = Device(uuid4(), uuid4(), "Server", "10.0.0.2", 443, "https", "SERVER", 60, {})
    await repo.save(device)

    future = datetime.now(UTC) + timedelta(hours=2)
    cmd = SetMaintenanceRequest(
        device_id=device.id,
        organization_id=device.organization_id,
        until=future,
        title="OS Update",
        reason="Security patch",
    )

    await service.set_maintenance(cmd, uuid4(), "127.0.0.1")

    assert device.status == "MAINTENANCE"
    assert device.maintenance_until == future
    assert session.added[-1]["event"].event_type == "DeviceMaintenanceStarted"
