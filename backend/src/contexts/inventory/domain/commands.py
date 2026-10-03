from dataclasses import dataclass
from datetime import datetime
from typing import Optional
from uuid import UUID


@dataclass(frozen=True)
class CreateDeviceCommand:
    organization_id: UUID
    name: str
    ip_address: str
    port: int
    protocol: str
    category: str
    interval_seconds: int
    thresholds: dict


@dataclass(frozen=True)
class UpdateDeviceCommand:
    device_id: UUID
    organization_id: UUID
    name: Optional[str] = None
    ip_address: Optional[str] = None
    port: Optional[int] = None
    protocol: Optional[str] = None
    interval_seconds: Optional[int] = None
    thresholds: Optional[dict] = None


@dataclass(frozen=True)
class PauseDeviceCommand:
    device_id: UUID
    organization_id: UUID
    reason: str


@dataclass(frozen=True)
class ResumeDeviceCommand:
    device_id: UUID
    organization_id: UUID


@dataclass(frozen=True)
class SetMaintenanceCommand:
    device_id: UUID
    organization_id: UUID
    maintenance_until: datetime
    title: str
    reason: str
