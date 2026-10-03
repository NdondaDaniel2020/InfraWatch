from typing import Any
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from src.contexts.iam.services.audit_service import AuditService
from src.contexts.inventory.domain.aggregate import Device
from src.contexts.inventory.domain.commands import (
    CreateDeviceCommand,
    PauseDeviceCommand,
    ResumeDeviceCommand,
    SetMaintenanceCommand,
    UpdateDeviceCommand,
)
from src.contexts.inventory.domain.events import (
    DeviceCreated,
    DeviceMaintenanceStarted,
    DevicePaused,
    DeviceResumed,
    DeviceUpdated,
)
from src.contexts.inventory.repositories.device_repository import DeviceRepository
from src.core.database.outbox_repository import OutboxRepository
from src.core.domain.entity import generate_uuid7


class DeviceCommandService:
    def __init__(self, session: AsyncSession, repository: DeviceRepository):
        self.session = session
        self.repository = repository
        self.audit_service = AuditService(session)

    async def create_device(self, cmd: CreateDeviceCommand, actor_user_id: UUID, actor_ip: str) -> Device:
        if cmd.interval_seconds < 5:
            raise ValueError("Interval must be at least 5 seconds")

        device_id = generate_uuid7()
        device = Device(
            id=device_id,
            organization_id=cmd.organization_id,
            name=cmd.name,
            ip_address=cmd.ip_address,
            port=cmd.port,
            protocol=cmd.protocol,
            category=cmd.category,
            interval_seconds=cmd.interval_seconds,
            thresholds=cmd.thresholds,
        )

        event = DeviceCreated(
            aggregate_id=device_id,
            organization_id=cmd.organization_id,
            name=cmd.name,
            ip_address=cmd.ip_address,
            port=cmd.port,
            protocol=cmd.protocol,
            category=cmd.category,
        )

        await self.repository.save(device)
        OutboxRepository.add_event(self.session, event, aggregate_type="Device")

        await self.audit_service.record_action(
            action="CREATE_DEVICE",
            resource_type="device",
            resource_id=str(device_id),
            actor_user_id=actor_user_id,
            organization_id=cmd.organization_id,
            details={"name": cmd.name, "ip_address": cmd.ip_address},
            ip_address=actor_ip,
        )

        await self.session.commit()
        return device

    async def update_device(self, cmd: UpdateDeviceCommand, actor_user_id: UUID, actor_ip: str) -> Device:
        device = await self.repository.find_by_id(cmd.device_id)
        if not device:
            raise ValueError("Device not found")
            
        if cmd.interval_seconds is not None and cmd.interval_seconds < 5:
            raise ValueError("Interval must be at least 5 seconds")

        device.update(
            name=cmd.name,
            ip_address=cmd.ip_address,
            port=cmd.port,
            protocol=cmd.protocol,
            interval_seconds=cmd.interval_seconds,
            thresholds=cmd.thresholds,
        )

        event = DeviceUpdated(
            aggregate_id=cmd.device_id,
            organization_id=cmd.organization_id,
            name=cmd.name,
            ip_address=cmd.ip_address,
            port=cmd.port,
            protocol=cmd.protocol,
        )

        await self.repository.save(device)
        OutboxRepository.add_event(self.session, event, aggregate_type="Device")

        await self.audit_service.record_action(
            action="UPDATE_DEVICE",
            resource_type="device",
            resource_id=str(cmd.device_id),
            actor_user_id=actor_user_id,
            organization_id=cmd.organization_id,
            details={"updated_fields": True},
            ip_address=actor_ip,
        )

        await self.session.commit()
        return device

    async def pause_device(self, cmd: PauseDeviceCommand, actor_user_id: UUID, actor_ip: str) -> Device:
        device = await self.repository.find_by_id(cmd.device_id)
        if not device:
            raise ValueError("Device not found")

        device.pause()

        event = DevicePaused(
            aggregate_id=cmd.device_id,
            organization_id=cmd.organization_id,
            reason=cmd.reason,
        )

        await self.repository.save(device)
        OutboxRepository.add_event(self.session, event, aggregate_type="Device")

        await self.audit_service.record_action(
            action="PAUSE_DEVICE",
            resource_type="device",
            resource_id=str(cmd.device_id),
            actor_user_id=actor_user_id,
            organization_id=cmd.organization_id,
            details={"reason": cmd.reason},
            ip_address=actor_ip,
        )

        await self.session.commit()
        return device

    async def resume_device(self, cmd: ResumeDeviceCommand, actor_user_id: UUID, actor_ip: str) -> Device:
        device = await self.repository.find_by_id(cmd.device_id)
        if not device:
            raise ValueError("Device not found")

        device.resume()

        event = DeviceResumed(
            aggregate_id=cmd.device_id,
            organization_id=cmd.organization_id,
        )

        await self.repository.save(device)
        OutboxRepository.add_event(self.session, event, aggregate_type="Device")

        await self.audit_service.record_action(
            action="RESUME_DEVICE",
            resource_type="device",
            resource_id=str(cmd.device_id),
            actor_user_id=actor_user_id,
            organization_id=cmd.organization_id,
            details={},
            ip_address=actor_ip,
        )

        await self.session.commit()
        return device

    async def set_maintenance(self, cmd: SetMaintenanceCommand, actor_user_id: UUID, actor_ip: str) -> Device:
        device = await self.repository.find_by_id(cmd.device_id)
        if not device:
            raise ValueError("Device not found")

        device.set_maintenance(cmd.maintenance_until)

        event = DeviceMaintenanceStarted(
            aggregate_id=cmd.device_id,
            organization_id=cmd.organization_id,
            maintenance_until=cmd.maintenance_until,
            title=cmd.title,
            reason=cmd.reason,
        )

        await self.repository.save(device)
        OutboxRepository.add_event(self.session, event, aggregate_type="Device")

        await self.audit_service.record_action(
            action="SET_MAINTENANCE",
            resource_type="device",
            resource_id=str(cmd.device_id),
            actor_user_id=actor_user_id,
            organization_id=cmd.organization_id,
            details={"until": cmd.maintenance_until.isoformat(), "reason": cmd.reason},
            ip_address=actor_ip,
        )

        await self.session.commit()
        return device
