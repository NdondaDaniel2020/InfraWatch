from datetime import datetime
from typing import Any, Optional
from pydantic import BaseModel, Field

class CreateDeviceRequest(BaseModel):
    name: str = Field(..., max_length=255)
    hostname: Optional[str] = Field(None, max_length=255)
    ip_address: str = Field(..., max_length=45)
    port: int = Field(..., ge=1, le=65535)
    protocol: str = Field(..., max_length=50)
    category: str = Field(..., max_length=50)
    interval_seconds: int = Field(60, ge=10)
    thresholds: dict[str, Any] = Field(default_factory=dict)

class UpdateDeviceRequest(BaseModel):
    name: Optional[str] = Field(None, max_length=255)
    hostname: Optional[str] = Field(None, max_length=255)
    ip_address: Optional[str] = Field(None, max_length=45)
    port: Optional[int] = Field(None, ge=1, le=65535)
    protocol: Optional[str] = Field(None, max_length=50)
    category: Optional[str] = Field(None, max_length=50)
    interval_seconds: Optional[int] = Field(None, ge=10)
    thresholds: Optional[dict[str, Any]] = None

class SetMaintenanceRequest(BaseModel):
    until: datetime = Field(..., description="Data/hora de fim da manutenção")
