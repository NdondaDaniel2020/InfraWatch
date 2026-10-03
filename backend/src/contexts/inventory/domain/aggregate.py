from datetime import datetime
from typing import Optional
from uuid import UUID

from src.core.domain.entity import Entity


class Device(Entity):
    def __init__(self, id: UUID, organization_id: UUID, name: str, ip_address: str, port: int, protocol: str, category: str, interval_seconds: int, thresholds: dict):
        super().__init__(id)
        self.organization_id = organization_id
        self.name = name
        self.ip_address = ip_address
        self.port = port
        self.protocol = protocol
        self.category = category
        self.interval_seconds = interval_seconds
        self.thresholds = thresholds
        self.is_paused = False
        self.status = "UP"
        self.maintenance_until: Optional[datetime] = None

    def update(self, name: Optional[str] = None, ip_address: Optional[str] = None, port: Optional[int] = None, protocol: Optional[str] = None, interval_seconds: Optional[int] = None, thresholds: Optional[dict] = None):
        if name:
            self.name = name
        if ip_address:
            self.ip_address = ip_address
        if port:
            self.port = port
        if protocol:
            self.protocol = protocol
        if interval_seconds:
            self.interval_seconds = interval_seconds
        if thresholds:
            self.thresholds = thresholds

    def pause(self):
        self.is_paused = True
        self.status = "PAUSED"

    def resume(self):
        self.is_paused = False
        self.status = "UP"

    def set_maintenance(self, maintenance_until: datetime):
        self.status = "MAINTENANCE"
        self.maintenance_until = maintenance_until
