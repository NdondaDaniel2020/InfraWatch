from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel


class HttpConfigSchema(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    url: str | None = None
    method: str = "GET"
    expected_status_codes: list[int] | str | None = None
    follow_redirects: bool = True
    verify_ssl: bool = True
    timeout_seconds: int = 10


class TcpConfigSchema(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    port: int | None = None
    timeout_seconds: int = 5


class DockerConfigSchema(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    container_name: str | None = None
    socket_path: str | None = None


class SnmpConfigSchema(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    version: str = "v2c"
    port: int = 161
    community: str | None = None
    oid: str | None = None
    security_level: str | None = "authPriv"
    username: str | None = None
    auth_protocol: str | None = None
    auth_password: str | None = None
    priv_protocol: str | None = None
    priv_password: str | None = None
    timeout_seconds: int = 5


class CreateDeviceRequest(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    name: str = Field(..., max_length=255)
    hostname: str | None = Field(None, max_length=255)
    ip_address: str = Field(..., max_length=45)
    port: int = Field(0, ge=0, le=65535)
    protocol: str = Field(..., max_length=50)
    category: str = Field(..., max_length=50)
    interval_seconds: int = Field(60, ge=1)
    thresholds: dict[str, Any] = Field(default_factory=dict)
    description: str | None = Field(None, max_length=500)
    tags: list[str] = Field(default_factory=list)
    sla_exemption_48h: bool = True
    http_config: HttpConfigSchema | None = None
    tcp_config: TcpConfigSchema | None = None
    docker_config: DockerConfigSchema | None = None
    snmp_config: SnmpConfigSchema | None = None
    organization_id: UUID | None = None


class UpdateDeviceRequest(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    name: str | None = Field(None, max_length=255)
    hostname: str | None = Field(None, max_length=255)
    ip_address: str | None = Field(None, max_length=45)
    port: int | None = Field(None, ge=0, le=65535)
    protocol: str | None = Field(None, max_length=50)
    category: str | None = Field(None, max_length=50)
    interval_seconds: int | None = Field(None, ge=1)
    thresholds: dict[str, Any] | None = None
    description: str | None = Field(None, max_length=500)
    tags: list[str] | None = None
    http_config: HttpConfigSchema | None = None
    tcp_config: TcpConfigSchema | None = None
    docker_config: DockerConfigSchema | None = None
    snmp_config: SnmpConfigSchema | None = None
    device_id: UUID | None = None
    organization_id: UUID | None = None


class SetMaintenanceRequest(BaseModel):
    until: datetime = Field(..., description="Data/hora de fim da manutenção")
    title: str = Field("Manutenção API", description="Título descritivo da janela de manutenção")
    reason: str = Field("Manutenção agendada via API", description="Motivo detalhado da manutenção")
    device_id: UUID | None = None
    organization_id: UUID | None = None


class PauseDeviceRequest(BaseModel):
    reason: str = Field("Pausado via API", description="Motivo da pausa do monitoramento")
    device_id: UUID | None = None
    organization_id: UUID | None = None


class ResumeDeviceRequest(BaseModel):
    reason: str | None = Field(None, description="Motivo da retomada do monitoramento")
    device_id: UUID | None = None
    organization_id: UUID | None = None


class TestProbeRequest(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    ip_address: str = Field(..., max_length=255)
    port: int = Field(0, ge=0, le=65535)
    protocol: str = Field("ICMP", max_length=50)
    timeout_ms: int = Field(3000, ge=500, le=30000)
    snmp_config: SnmpConfigSchema | None = None
    http_config: HttpConfigSchema | None = None
    tcp_config: TcpConfigSchema | None = None
    docker_config: DockerConfigSchema | None = None


class TestProbeResponse(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    status: str
    latency_ms: float
    packet_loss_pct: float
    message: str
    success: bool
    error_message: str | None = None
