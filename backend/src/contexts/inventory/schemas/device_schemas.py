from datetime import datetime
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict


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
    def sanitize_for_viewer(cls, device: "DeviceListItem") -> "DeviceListItem":
        return cls(
            id=device.id,
            name=device.name,
            category=device.category,
            status=device.status,
            is_paused=device.is_paused,
            ip_address=mask_ip_address(device.ip_address),
            protocol=device.protocol,
        )


class DeviceDetail(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    organization_id: UUID
    name: str
    hostname: Optional[str] = None
    ip_address: str
    port: int
    protocol: str
    category: str
    interval_seconds: int
    status: str
    is_paused: bool
    maintenance_until: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime
    
    @classmethod
    def sanitize_for_viewer(cls, device: "DeviceDetail") -> "DeviceDetail":
        return cls(
            id=device.id,
            organization_id=device.organization_id,
            name=device.name,
            hostname=device.hostname,
            ip_address=mask_ip_address(device.ip_address),
            port=0, # Mascara porta
            protocol=device.protocol,
            category=device.category,
            interval_seconds=device.interval_seconds,
            status=device.status,
            is_paused=device.is_paused,
            maintenance_until=device.maintenance_until,
            created_at=device.created_at,
            updated_at=device.updated_at,
        )


class DeviceSearchResult(DeviceListItem):
    pass
