from datetime import datetime, timezone
from uuid import UUID, uuid4

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
from src.contexts.inventory.schemas.device_schemas import DeviceManualProbeResult
from src.contexts.inventory.schemas.requests import (
    CreateDeviceRequest,
    PauseDeviceRequest,
    ResumeDeviceRequest,
    SetMaintenanceRequest,
    TestProbeRequest,
    TestProbeResponse,
    UpdateDeviceRequest,
)
from src.core.database.outbox_repository import OutboxRepository
from src.core.database.unit_of_work import AbstractUnitOfWork, SqlAlchemyUnitOfWork
from src.core.domain.entity import generate_uuid7
from src.workers.probers.executor import ProbeExecutor
from src.workers.scheduler.in_memory_inventory import ProbeTarget


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
        thresholds_data = dict(cmd.thresholds or {})
        if cmd.http_config:
            thresholds_data["http_config"] = cmd.http_config.model_dump(exclude_none=True)
        if cmd.tcp_config:
            thresholds_data["tcp_config"] = cmd.tcp_config.model_dump(exclude_none=True)
        if cmd.docker_config:
            thresholds_data["docker_config"] = cmd.docker_config.model_dump(exclude_none=True)
        if cmd.snmp_config:
            thresholds_data["snmp_config"] = cmd.snmp_config.model_dump(exclude_none=True)
        if cmd.description:
            thresholds_data["description"] = cmd.description
        if cmd.tags:
            thresholds_data["tags"] = cmd.tags

        # Porta inteligente: se omitida ou 0, para SNMP default é 161
        resolved_port = cmd.port
        if resolved_port == 0 and cmd.protocol.upper() == "SNMP":
            resolved_port = 161

        device = Device(
            id=device_id,
            organization_id=org_id,
            name=cmd.name,
            ip_address=cmd.ip_address,
            port=resolved_port,
            protocol=cmd.protocol,
            category=cmd.category,
            interval_seconds=cmd.interval_seconds,
            thresholds=thresholds_data,
            hostname=cmd.hostname,
        )

        event = DeviceCreated(
            aggregate_id=device_id,
            organization_id=org_id,
            name=cmd.name,
            ip_address=cmd.ip_address,
            port=resolved_port,
            protocol=cmd.protocol,
            category=cmd.category,
            thresholds=thresholds_data,
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

        await self.uow.commit()
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

        thresholds_data = None
        if (
            cmd.thresholds is not None
            or cmd.http_config
            or cmd.tcp_config
            or cmd.docker_config
            or cmd.snmp_config
            or cmd.description
            or cmd.tags
        ):
            thresholds_data = dict(device.thresholds or {})
            if cmd.thresholds is not None:
                thresholds_data.update(cmd.thresholds)
            if cmd.http_config:
                thresholds_data["http_config"] = cmd.http_config.model_dump(exclude_none=True)
            if cmd.tcp_config:
                thresholds_data["tcp_config"] = cmd.tcp_config.model_dump(exclude_none=True)
            if cmd.docker_config:
                thresholds_data["docker_config"] = cmd.docker_config.model_dump(exclude_none=True)
            if cmd.snmp_config:
                thresholds_data["snmp_config"] = cmd.snmp_config.model_dump(exclude_none=True)
            if cmd.description is not None:
                thresholds_data["description"] = cmd.description
            if cmd.tags is not None:
                thresholds_data["tags"] = cmd.tags

        device.update(
            name=cmd.name,
            ip_address=cmd.ip_address,
            port=cmd.port,
            protocol=cmd.protocol,
            interval_seconds=cmd.interval_seconds,
            thresholds=thresholds_data,
            hostname=cmd.hostname,
        )

        event = DeviceUpdated(
            aggregate_id=target_device_id,
            organization_id=target_org_id or device.organization_id,
            name=cmd.name,
            ip_address=cmd.ip_address,
            port=cmd.port,
            protocol=cmd.protocol,
            thresholds=thresholds_data or device.thresholds or {},
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

        await self.uow.commit()
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

        await self.uow.commit()
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

        await self.uow.commit()
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

        await self.uow.commit()
        return device

    async def execute_pre_check_probe(
        self,
        cmd: TestProbeRequest,
        organization_id: UUID | None = None,
    ) -> TestProbeResponse:
        """Executa sonda preliminar sob demanda para testar conectividade com o alvo."""
        resolved_port = cmd.port
        if resolved_port == 0 and cmd.protocol.upper() == "SNMP":
            resolved_port = 161

        target = ProbeTarget(
            device_id=uuid4(),
            organization_id=organization_id or uuid4(),
            name=f"Pre-Check-{cmd.ip_address}",
            ip_address=cmd.ip_address,
            port=resolved_port,
            protocol=cmd.protocol,
            category="PRE_CHECK",
            interval_seconds=60,
        )

        executor = ProbeExecutor(max_concurrent=10)
        result = await executor.execute(target, timeout_ms=cmd.timeout_ms)

        success = result.status in ("UP", "DEGRADED")
        if success:
            message = (
                f"Conexão validada com sucesso! RTT: {result.latency_ms:.2f}ms"
                if result.latency_ms > 0
                else f"Conexão validada com sucesso! Status: {result.status}"
            )
        else:
            message = result.error_message or f"Falha na sondagem: {result.status}"

        return TestProbeResponse(
            status=result.status,
            latency_ms=result.latency_ms,
            packet_loss_pct=result.packet_loss_pct,
            message=message,
            success=success,
            error_message=result.error_message,
        )

    async def execute_on_demand_probe(
        self,
        device_id: UUID,
        organization_id: UUID | None = None,
    ) -> DeviceManualProbeResult | None:
        """Executa sonda on-demand no dispositivo cadastrado com base em seus atributos reais."""
        device = await self.repository.find_by_id(device_id)
        if not device:
            return None

        if organization_id and device.organization_id != organization_id:
            return None

        resolved_port = device.port
        if resolved_port == 0 and device.protocol.upper() == "SNMP":
            resolved_port = 161

        target = ProbeTarget(
            device_id=device.id,
            organization_id=device.organization_id,
            name=device.name,
            ip_address=device.ip_address,
            port=resolved_port,
            protocol=device.protocol,
            category=device.category,
            interval_seconds=device.interval_seconds,
        )

        executor = ProbeExecutor(max_concurrent=10)
        result = await executor.execute(target, timeout_ms=3000)

        success = result.status in ("UP", "DEGRADED")
        now_iso = datetime.now(timezone.utc).isoformat()

        zabbix_status = None
        thresholds = device.thresholds or {}
        zh_id = thresholds.get("zabbix_host_id") or thresholds.get("hostid")
        if zh_id:
            try:
                from src.contexts.system.services.dynamic_settings_provider import DynamicSettingsProvider
                from src.integrations.zabbix.client import ZabbixClient

                dyn_provider = DynamicSettingsProvider(self.session)
                zabbix_cfg = await dyn_provider.get_zabbix_config()
                if zabbix_cfg.get("enabled", False) and zabbix_cfg.get("api_url"):
                    async with ZabbixClient(
                        api_url=zabbix_cfg["api_url"],
                        api_token=zabbix_cfg.get("api_token"),
                        username=zabbix_cfg.get("user") or "Admin",
                        password=zabbix_cfg.get("password") or "zabbix",
                        timeout=2.0,
                    ) as zbx:
                        hosts = await zbx.get_hosts(hostids=[str(zh_id)])
                        if hosts:
                            h = hosts[0]
                            snmp_avail = str(h.get("snmp_available", "0"))
                            agent_avail = str(h.get("available", "0"))
                            is_avail = snmp_avail == "1" or agent_avail == "1"
                            zabbix_status = {
                                "host_id": str(zh_id),
                                "host_name": h.get("name") or h.get("host"),
                                "status": "UP" if is_avail else "DOWN",
                                "snmp_available": snmp_avail == "1",
                                "agent_available": agent_avail == "1",
                                "message": "Host verificado no Zabbix Server (SNMP / Agent Telemetry)." if is_avail else "Host inalcançável no Zabbix Server.",
                            }
            except Exception as exc:
                zabbix_status = {
                    "host_id": str(zh_id),
                    "status": "UNKNOWN",
                    "message": f"Diagnóstico Zabbix indisponível: {exc!s}",
                }

        if success:
            detail_msg = f"Sonda concluída com status {result.status}. Latência média: {round(result.latency_ms, 2)} ms."
        elif result.error_message:
            detail_msg = result.error_message
        elif result.packet_loss_pct == 100.0:
            detail_msg = f"Host inalcançável: 100% de perda de pacotes para o IP {device.ip_address} (sem resposta ICMP)."
        else:
            detail_msg = f"Sonda finalizada com status {result.status} (perda de {result.packet_loss_pct}%)."

        return DeviceManualProbeResult(
            success=success,
            rtt_ms=round(result.latency_ms, 2),
            packet_loss_pct=round(result.packet_loss_pct, 1),
            packets_sent=5,
            packets_received=round(5 * (1 - result.packet_loss_pct / 100.0)),
            timestamp=now_iso,
            status=result.status,
            message=detail_msg,
            protocol=device.protocol.upper(),
            target_ip=device.ip_address,
            zabbix_status=zabbix_status,
        )
