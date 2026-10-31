"""Serviço de consulta de telemetria consolidada e detalhes cadastrais/séries temporais."""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from src.contexts.iam.api.dependencies.auth import AuthenticatedUser
from src.contexts.inventory.database.models import DeviceModel
from src.contexts.telemetry.database.models import MetricModel
from src.contexts.telemetry.schemas.telemetry import (
    MonitoredDeviceDetail,
    MonitoredDeviceItem,
    MonitoredDevicesResponse,
    TelemetryMetricPoint,
)


class TelemetryDeviceNotFoundError(Exception):
    """Exceção levantada quando um dispositivo não é localizado ou não pertence à organização."""


class TelemetryQueryService:
    """Serviço de aplicação para consultas analíticas de telemetria e monitoramento passivo."""

    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def list_monitored_devices(
        self,
        current_user: AuthenticatedUser,
        status_filter: str | None = None,
        limit: int = 50,
        offset: int = 0,
    ) -> MonitoredDevicesResponse:
        """Consulta os ativos sob monitoramento com sua telemetria mais recente."""
        stmt = select(DeviceModel)

        # Isolamento multitenancy: usuários regulares acessam apenas a sua própria organização
        if not current_user.is_super_admin:
            if current_user.organization_id:
                stmt = stmt.where(DeviceModel.organization_id == UUID(current_user.organization_id))
            else:
                return MonitoredDevicesResponse(total=0, items=[])

        if status_filter:
            stmt = stmt.where(DeviceModel.status == status_filter.upper())

        count_stmt = select(func.count()).select_from(stmt.subquery())
        total_count = (await self._session.execute(count_stmt)).scalar_one() or 0

        stmt = stmt.order_by(DeviceModel.name.asc()).offset(offset).limit(limit)
        devices = (await self._session.execute(stmt)).scalars().all()

        if not devices:
            return MonitoredDevicesResponse(total=total_count, items=[])

        device_ids = [d.id for d in devices]

        # Busca a última métrica de cada dispositivo em lote
        latest_subq = (
            select(
                MetricModel.device_id,
                func.max(MetricModel.timestamp).label("max_ts"),
            )
            .where(MetricModel.device_id.in_(device_ids))
            .group_by(MetricModel.device_id)
            .subquery()
        )

        metrics_stmt = select(MetricModel).join(
            latest_subq,
            (MetricModel.device_id == latest_subq.c.device_id)
            & (MetricModel.timestamp == latest_subq.c.max_ts),
        )
        metrics_result = (await self._session.execute(metrics_stmt)).scalars().all()
        latencies_by_dev: dict[UUID, float] = {}
        losses_by_dev: dict[UUID, float] = {}
        timestamps_by_dev: dict[UUID, datetime] = {}
        fallback_metric_by_dev: dict[UUID, MetricModel] = {}

        for m in metrics_result:
            timestamps_by_dev[m.device_id] = m.timestamp
            fallback_metric_by_dev[m.device_id] = m
            if m.packet_loss is not None:
                losses_by_dev[m.device_id] = m.packet_loss
            if m.metric_type == "latency_ms":
                latencies_by_dev[m.device_id] = m.value
            elif m.metric_type == "packet_loss":
                losses_by_dev[m.device_id] = m.value

        items: list[MonitoredDeviceItem] = []
        for dev in devices:
            ts = timestamps_by_dev.get(dev.id)
            loss = losses_by_dev.get(dev.id)
            lat = latencies_by_dev.get(dev.id)
            if lat is None and dev.id in fallback_metric_by_dev:
                fallback_m = fallback_metric_by_dev[dev.id]
                if fallback_m.metric_type not in (
                    "packet_loss",
                    "cpu_quota",
                    "cpu_period",
                    "cpu_shares",
                ):
                    lat = fallback_m.value

            items.append(
                MonitoredDeviceItem(
                    device_id=dev.id,
                    organization_id=dev.organization_id,
                    name=dev.name,
                    ip_address=dev.ip_address,
                    protocol=dev.protocol,
                    category=dev.category,
                    status=dev.status,
                    is_paused=dev.is_paused,
                    interval_seconds=dev.interval_seconds,
                    last_latency_ms=lat,
                    last_packet_loss=loss if loss is not None else (0.0 if ts else None),
                    last_monitored_at=ts,
                )
            )

        return MonitoredDevicesResponse(total=total_count, items=items)

    async def get_monitored_device_detail(
        self,
        device_id: UUID,
        current_user: AuthenticatedUser,
        metric_limit: int = 50,
    ) -> MonitoredDeviceDetail:
        """Consulta os detalhes cadastrais e série histórica recente de métricas por ativo."""
        stmt = select(DeviceModel).where(DeviceModel.id == device_id)
        device = (await self._session.execute(stmt)).scalar_one_or_none()

        if not device:
            raise TelemetryDeviceNotFoundError("Dispositivo não encontrado")

        # Validação de isolamento multitenant
        if not current_user.can_access_organization(str(device.organization_id)):
            raise TelemetryDeviceNotFoundError("Dispositivo não encontrado")

        # Busca série temporal recente de métricas para este dispositivo
        metrics_stmt = (
            select(MetricModel)
            .where(MetricModel.device_id == device_id)
            .order_by(MetricModel.timestamp.desc())
            .limit(metric_limit)
        )
        metric_rows = (await self._session.execute(metrics_stmt)).scalars().all()

        recent_metrics = [
            TelemetryMetricPoint(
                metric_type=m.metric_type,
                value=m.value,
                packet_loss=m.packet_loss,
                status=m.status,
                timestamp=m.timestamp,
            )
            for m in metric_rows
        ]

        last_latency = None
        last_packet_loss = None
        last_timestamp = None

        if metric_rows:
            last_timestamp = metric_rows[0].timestamp
            for m in metric_rows:
                if m.packet_loss is not None and last_packet_loss is None:
                    last_packet_loss = m.packet_loss
                if m.metric_type == "latency_ms" and last_latency is None:
                    last_latency = m.value
                elif m.metric_type == "packet_loss" and last_packet_loss is None:
                    last_packet_loss = m.value

            if last_latency is None:
                for m in metric_rows:
                    if m.metric_type not in (
                        "packet_loss",
                        "cpu_quota",
                        "cpu_period",
                        "cpu_shares",
                    ):
                        last_latency = m.value
                        break

        return MonitoredDeviceDetail(
            device_id=device.id,
            organization_id=device.organization_id,
            name=device.name,
            hostname=device.hostname,
            ip_address=device.ip_address,
            port=device.port,
            protocol=device.protocol,
            category=device.category,
            status=device.status,
            is_paused=device.is_paused,
            interval_seconds=device.interval_seconds,
            last_latency_ms=last_latency,
            last_packet_loss=last_packet_loss
            if last_packet_loss is not None
            else (0.0 if last_timestamp else None),
            last_monitored_at=last_timestamp,
            recent_metrics=recent_metrics,
        )


__all__ = ["TelemetryDeviceNotFoundError", "TelemetryQueryService"]
