from datetime import datetime
from typing import Any, Self
from uuid import UUID

from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel


def mask_ip_address(ip: str) -> str:
    parts = ip.split(".")
    if len(parts) == 4:
        return f"***.***.{parts[2]}.{parts[3]}"
    return "***"


class DeviceListItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str
    category: str
    status: str
    is_paused: bool
    ip_address: str
    protocol: str

    @classmethod
    def for_viewer(cls, device: "DeviceListItem") -> Self:
        """Factory que instancia um novo DeviceListItem com dados sensíveis mascarados para viewers."""
        base = device if isinstance(device, cls) else cls.model_validate(device)
        return cls(
            id=base.id,
            name=base.name,
            category=base.category,
            status=base.status,
            is_paused=base.is_paused,
            ip_address=mask_ip_address(base.ip_address),
            protocol=base.protocol,
        )

    @classmethod
    def sanitize_for_viewer(cls, device: "DeviceListItem") -> Self:
        """Método mantido para retrocompatibilidade delegando para a factory for_viewer."""
        return cls.for_viewer(device)


class DeviceDetail(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    organization_id: UUID
    name: str
    hostname: str | None = None
    ip_address: str
    port: int
    protocol: str
    category: str
    interval_seconds: int
    status: str
    is_paused: bool
    maintenance_until: datetime | None = None
    created_at: datetime
    updated_at: datetime

    @classmethod
    def for_viewer(cls, device: "DeviceDetail") -> Self:
        """Factory que instancia um novo DeviceDetail com dados sensíveis mascarados para viewers."""
        base = device if isinstance(device, cls) else cls.model_validate(device)
        return cls(
            id=base.id,
            organization_id=base.organization_id,
            name=base.name,
            hostname=base.hostname,
            ip_address=mask_ip_address(base.ip_address),
            port=0,  # Mascara porta
            protocol=base.protocol,
            category=base.category,
            interval_seconds=base.interval_seconds,
            status=base.status,
            is_paused=base.is_paused,
            maintenance_until=base.maintenance_until,
            created_at=base.created_at,
            updated_at=base.updated_at,
        )

    @classmethod
    def sanitize_for_viewer(cls, device: "DeviceDetail") -> "DeviceDetail":
        """Método mantido para retrocompatibilidade delegando para a factory for_viewer."""
        return cls.for_viewer(device)


class DeviceSearchResult(DeviceListItem):
    pass


class DeviceManualProbeResult(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    success: bool
    rtt_ms: float
    packet_loss_pct: float
    packets_sent: int
    packets_received: int
    timestamp: str
    status: str
    message: str
    protocol: str = "ICMP"
    target_ip: str | None = None
    zabbix_status: dict[str, Any] | None = None


class DeviceMetricBucket(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    timestamp: str
    rtt_min_ms: float
    rtt_p95_ms: float
    rtt_max_ms: float
    packet_loss_pct: float


class DeviceMetricSummary(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    min_ms: float
    p95_ms: float
    max_ms: float
    avg_loss_pct: float


class DeviceTimescaleMetricsResponse(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    buckets: list[DeviceMetricBucket]
    period: str
    summary: DeviceMetricSummary


class DeviceInterfaceResponse(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    port_number: int
    port_name: str
    speed: str
    status: str
    description: str
    rx_power_dbm: str
    tx_power_dbm: str
    crc_errors_per_min: int
    packet_loss_pct: float
    mtu: int
    duplex: str
