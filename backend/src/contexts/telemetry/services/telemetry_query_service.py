"""Serviço de consulta de telemetria consolidada e detalhes cadastrais/séries temporais."""

from __future__ import annotations

from datetime import datetime
from typing import Any
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from src.contexts.iam.domain.authenticated_user import AuthenticatedUser
from src.contexts.inventory.repositories.device_repository import DeviceRepository
from src.contexts.network_topology.database.repository import TopologyRepository
from src.contexts.telemetry.database.models import MetricModel
from src.contexts.telemetry.database.repository import TelemetryRepository
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

    def __init__(
        self,
        session: AsyncSession,
        device_repo: DeviceRepository | None = None,
        topology_repo: TopologyRepository | None = None,
        telemetry_repo: TelemetryRepository | None = None,
    ) -> None:
        self._session = session
        self._device_repo = device_repo or DeviceRepository(session)
        self._topology_repo = topology_repo or TopologyRepository(session)
        self._telemetry_repo = telemetry_repo or TelemetryRepository(session)

    async def get_latest_metrics_for_devices(
        self, device_ids: list[UUID]
    ) -> dict[UUID, dict[str, float]]:
        """Recupera as métricas operacionais mais recentes para um conjunto de dispositivos."""
        if not device_ids:
            return {}

        metrics_result = await self._telemetry_repo.get_latest_metrics_by_devices(device_ids)

        device_metrics: dict[UUID, dict[str, float]] = {}
        for m in metrics_result:
            if m.device_id not in device_metrics:
                device_metrics[m.device_id] = {}
            if m.metric_type == "latency_ms":
                device_metrics[m.device_id]["latency_ms"] = round(m.value, 1)
            elif m.metric_type == "packet_loss":
                device_metrics[m.device_id]["packet_loss"] = round(m.value, 1)
            elif m.metric_type == "cpu_usage":
                device_metrics[m.device_id]["cpu_usage"] = round(m.value, 1)
            elif m.metric_type == "memory_usage":
                device_metrics[m.device_id]["mem_usage"] = round(m.value, 1)
            if m.packet_loss is not None:
                device_metrics[m.device_id]["packet_loss"] = round(m.packet_loss, 1)

        return device_metrics

    async def list_monitored_devices(
        self,
        current_user: AuthenticatedUser,
        organization_id: UUID | None = None,
        status_filter: str | None = None,
        limit: int = 50,
        offset: int = 0,
    ) -> MonitoredDevicesResponse:
        """Consulta os ativos sob monitoramento com sua telemetria mais recente."""
        # Isolamento multitenancy: usuários regulares acessam apenas a sua própria organização
        if not current_user.is_global_operator:
            if current_user.organization_id:
                org_filter = UUID(current_user.organization_id)
            else:
                return MonitoredDevicesResponse(total=0, items=[])
        else:
            org_filter = organization_id

        devices, total_count = await self._device_repo.list_devices(
            organization_id=org_filter,
            status_filter=status_filter,
            limit=limit,
            offset=offset,
        )

        if not devices:
            return MonitoredDevicesResponse(total=total_count, items=[])

        device_ids = [d.id for d in devices]

        # Busca a última métrica de cada dispositivo em lote
        metrics_result = await self._telemetry_repo.get_latest_metrics_by_devices(device_ids)
        latencies_by_dev: dict[UUID, float] = {}
        losses_by_dev: dict[UUID, float] = {}
        timestamps_by_dev: dict[UUID, datetime] = {}
        fallback_metric_by_dev: dict[UUID, MetricModel] = {}

        # Mapeamento de cluster da topologia para identificação de Região / DC
        cluster_by_dev: dict[UUID, str] = {}
        if self._topology_repo is not None:
            try:
                cluster_by_dev = await self._topology_repo.get_clusters_by_device_ids(device_ids)
            except (RuntimeError, ValueError, AttributeError, KeyError):
                cluster_by_dev = {}

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

            dc_region = (
                cluster_by_dev.get(dev.id)
                or (dev.thresholds or {}).get("datacenter")
                or (dev.thresholds or {}).get("datacenter_region")
                or (dev.thresholds or {}).get("region")
                or (dev.thresholds or {}).get("cluster")
                or "CLUSTER LUANDA-01"
            )

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
                    datacenter_region=dc_region,
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
        device = await self._device_repo.find_by_id(device_id)

        if not device:
            raise TelemetryDeviceNotFoundError("Dispositivo não encontrado")

        # Validação de isolamento multitenant
        if not current_user.can_access_organization(str(device.organization_id)):
            raise TelemetryDeviceNotFoundError("Dispositivo não encontrado")

        # Busca série temporal recente de métricas para este dispositivo
        metric_rows = await self._telemetry_repo.get_recent_metrics_for_device(
            device_id, limit=metric_limit
        )

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

    async def get_device_timescale_buckets(
        self, device_id: UUID, period: str = "24h"
    ) -> list[dict[str, Any]]:
        """Recupera buckets agregados do TimescaleDB delegando ao TelemetryRepository."""
        interval_sql = "INTERVAL '10 minutes'"
        limit_buckets = 60
        if period == "1h":
            interval_sql = "INTERVAL '1 minute'"
            limit_buckets = 60
        elif period == "7d":
            interval_sql = "INTERVAL '1 hour'"
            limit_buckets = 168
        elif period == "30d":
            interval_sql = "INTERVAL '4 hours'"
            limit_buckets = 180

        return await self._telemetry_repo.get_timescale_buckets(
            device_id=device_id,
            interval_sql=interval_sql,
            limit_buckets=limit_buckets,
        )


__all__ = ["TelemetryDeviceNotFoundError", "TelemetryQueryService"]
