from dataclasses import dataclass
from datetime import datetime
from typing import Optional
from uuid import UUID

from src.core.domain.events import DomainEvent


@dataclass(frozen=True)
class DeviceCreated(DomainEvent):
    organization_id: UUID = None
    name: str = ""
    ip_address: str = ""
    port: int = 0
    protocol: str = ""
    category: str = ""


@dataclass(frozen=True)
class DeviceUpdated(DomainEvent):
    organization_id: UUID = None
    name: Optional[str] = None
    ip_address: Optional[str] = None
    port: Optional[int] = None
    protocol: Optional[str] = None


@dataclass(frozen=True)
class DevicePaused(DomainEvent):
    organization_id: UUID = None
    reason: str = ""


@dataclass(frozen=True)
class DeviceResumed(DomainEvent):
    organization_id: UUID = None


@dataclass(frozen=True)
class DeviceMaintenanceStarted(DomainEvent):
    organization_id: UUID = None
    maintenance_until: datetime = None
    title: str = ""
    reason: str = ""


@dataclass(frozen=True)
class DeviceStatusChanged(DomainEvent):
    """Evento emitido quando o status de um dispositivo muda via métricas dos probes."""
    organization_id: UUID = None
    previous_status: str = ""
    new_status: str = ""
    latency_ms: float = 0.0
    loss_percent: float = 0.0


@dataclass(frozen=True)
class DeviceMaintenanceToggled(DomainEvent):
    """Evento emitido quando a manutenção é ativada ou desativada."""
    organization_id: UUID = None
    is_maintenance: bool = False
    maintenance_until: Optional[datetime] = None
