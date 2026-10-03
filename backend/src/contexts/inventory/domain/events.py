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
