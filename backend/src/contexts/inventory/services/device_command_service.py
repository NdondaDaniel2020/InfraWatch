from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from src.contexts.iam.services.audit_service import AuditService
from src.contexts.inventory.domain.aggregate import Device
from src.contexts.inventory.domain.events import (
    DeviceCreated,
    DeviceMaintenanceStarted,
    DevicePaused,
    DeviceResumed,
    DeviceUpdated,
)
from src.contexts.inventory.repositories.device_repository import DeviceRepository
from src.contexts.inventory.schemas.requests import (
    CreateDeviceRequest,
    PauseDeviceRequest,
    ResumeDeviceRequest,
    SetMaintenanceRequest,
    UpdateDeviceRequest,
)
from src.core.database.outbox_repository import OutboxRepository
from src.core.database.unit_of_work import AbstractUnitOfWork, SqlAlchemyUnitOfWork
from src.core.domain.entity import generate_uuid7


class DeviceCommandService:
    def __init__(
        self,
        uow_or_session: AbstractUnitOfWork | AsyncSession | None = None,
        repository: DeviceRepository | None = None,
        session: AsyncSession | None = None,
    ):
        target = uow_or_session if uow_or_session is not None else session
        if target is None:
            raise ValueError("uow_or_session or session is required")

        if isinstance(target, AbstractUnitOfWork):
            self.uow = target
            self.session = target.session
        else:
            self.session = target
            self.uow = SqlAlchemyUnitOfWork(session=target)

        self.repository = repository or DeviceRepository(self.session)
        self.audit_service = AuditService(self.session)

    async def create_device(
        self,
        cmd: CreateDeviceRequest,
        actor_user_id: UUID,
        actor_ip: str,
        organization_id: UUID | None = None,
    ) -> Device:
        org_id = organization_id or getattr(cmd, "organization_id", None)
        if not org_id:
            raise ValueError("organization_id is required")

        if cmd.interval_seconds < 5:
            raise ValueError("Interval must be at least 5 seconds")

        device_id = generate_uuid7()
        device = Device(
            id=device_id,
            organization_id=org_id,
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
            organization_id=org_id,
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
            organization_id=org_id,
            details={"name": cmd.name, "ip_address": cmd.ip_address},
            ip_address=actor_ip,
        )

        return device

    async def update_device(
        self,
        cmd: UpdateDeviceRequest,
        actor_user_id: UUID,
        actor_ip: str,
        device_id: UUID | None = None,
        organization_id: UUID | None = None,
    ) -> Device:
        target_device_id = device_id or getattr(cmd, "device_id", None)
        target_org_id = organization_id or getattr(cmd, "organization_id", None)
        if not target_device_id:
            raise ValueError("device_id is required")

        device = await self.repository.find_by_id(target_device_id)
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
            aggregate_id=target_device_id,
            organization_id=target_org_id or device.organization_id,
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
            resource_id=str(target_device_id),
            actor_user_id=actor_user_id,
            organization_id=target_org_id or device.organization_id,
            details={"updated_fields": True},
            ip_address=actor_ip,
        )

        return device

    async def pause_device(
        self,
        cmd: PauseDeviceRequest | None = None,
        actor_user_id: UUID | None = None,
        actor_ip: str = "127.0.0.1",
        device_id: UUID | None = None,
        organization_id: UUID | None = None,
        reason: str | None = None,
    ) -> Device:
        target_device_id = device_id or getattr(cmd, "device_id", None)
        target_org_id = organization_id or getattr(cmd, "organization_id", None)
        pause_reason = (
            reason
            or getattr(cmd, "reason", None)
            or (cmd.reason if isinstance(cmd, PauseDeviceRequest) else None)
            or "Pausado via API"
        )
        if not target_device_id:
            raise ValueError("device_id is required")

        device = await self.repository.find_by_id(target_device_id)
        if not device:
            raise ValueError("Device not found")

        device.pause()

        event = DevicePaused(
            aggregate_id=target_device_id,
            organization_id=target_org_id or device.organization_id,
            reason=pause_reason,
        )

        await self.repository.save(device)
        OutboxRepository.add_event(self.session, event, aggregate_type="Device")

        await self.audit_service.record_action(
            action="PAUSE_DEVICE",
            resource_type="device",
            resource_id=str(target_device_id),
            actor_user_id=actor_user_id,
            organization_id=target_org_id or device.organization_id,
            details={"reason": pause_reason},
            ip_address=actor_ip,
        )

        return device

    async def resume_device(
        self,
        cmd: ResumeDeviceRequest | None = None,
        actor_user_id: UUID | None = None,
        actor_ip: str = "127.0.0.1",
        device_id: UUID | None = None,
        organization_id: UUID | None = None,
    ) -> Device:
        target_device_id = device_id or getattr(cmd, "device_id", None)
        target_org_id = organization_id or getattr(cmd, "organization_id", None)
        if not target_device_id:
            raise ValueError("device_id is required")

        device = await self.repository.find_by_id(target_device_id)
        if not device:
            raise ValueError("Device not found")

        device.resume()

        event = DeviceResumed(
            aggregate_id=target_device_id,
            organization_id=target_org_id or device.organization_id,
        )

        await self.repository.save(device)
        OutboxRepository.add_event(self.session, event, aggregate_type="Device")

        await self.audit_service.record_action(
            action="RESUME_DEVICE",
            resource_type="device",
            resource_id=str(target_device_id),
            actor_user_id=actor_user_id,
            organization_id=target_org_id or device.organization_id,
            details={},
            ip_address=actor_ip,
        )

        return device

    async def set_maintenance(
        self,
        cmd: SetMaintenanceRequest,
        actor_user_id: UUID,
        actor_ip: str,
        device_id: UUID | None = None,
        organization_id: UUID | None = None,
    ) -> Device:
        target_device_id = device_id or getattr(cmd, "device_id", None)
        target_org_id = organization_id or getattr(cmd, "organization_id", None)
        maintenance_until = getattr(cmd, "maintenance_until", None) or getattr(cmd, "until", None)
        title = getattr(cmd, "title", "Manutenção API")
        reason = getattr(cmd, "reason", "Manutenção agendada via API")

        if not target_device_id:
            raise ValueError("device_id is required")
        if not maintenance_until:
            raise ValueError("maintenance_until is required")

        device = await self.repository.find_by_id(target_device_id)
        if not device:
            raise ValueError("Device not found")

        device.set_maintenance(maintenance_until)

        event = DeviceMaintenanceStarted(
            aggregate_id=target_device_id,
            organization_id=target_org_id or device.organization_id,
            maintenance_until=maintenance_until,
            title=title,
            reason=reason,
        )

        await self.repository.save(device)
        OutboxRepository.add_event(self.session, event, aggregate_type="Device")

        await self.audit_service.record_action(
            action="SET_MAINTENANCE",
            resource_type="device",
            resource_id=str(target_device_id),
            actor_user_id=actor_user_id,
            organization_id=target_org_id or device.organization_id,
            details={"until": maintenance_until.isoformat(), "reason": reason},
            ip_address=actor_ip,
        )

        return device
