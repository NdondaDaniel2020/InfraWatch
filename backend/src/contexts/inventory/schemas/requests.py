from __future__ import annotations

from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator
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
    security_name: str | None = None
    auth_protocol: str | None = None
    auth_password: str | None = None
    auth_passphrase: str | None = None
    priv_protocol: str | None = None
    priv_password: str | None = None
    priv_passphrase: str | None = None
    timeout_seconds: int = 5

    @field_validator("version")
    @classmethod
    def validate_version(cls, v: str) -> str:
        norm = str(v).strip().lower()
        if norm in ("1", "v1"):
            return "v1"
        if norm in ("2", "2c", "v2", "v2c"):
            return "v2c"
        if norm in ("3", "v3"):
            return "v3"
        raise ValueError(f"Versão SNMP inválida: '{v}'. Suportadas: 'v1', 'v2c', 'v3'.")

    @model_validator(mode="after")
    def validate_snmp_details(self) -> SnmpConfigSchema:
        if self.version in ("v1", "v2c"):
            if not self.community:
                self.community = "public"
        elif self.version == "v3":
            # username / security_name
            sec_name = self.security_name or self.username
            if not sec_name:
                raise ValueError("Para SNMPv3, o campo 'security_name' (ou 'username') é obrigatório.")
            self.security_name = sec_name
            self.username = sec_name

            # Normalização de security_level
            sec_level = self.security_level or "authPriv"
            if isinstance(sec_level, int) or str(sec_level) in ("0", "1", "2"):
                int_map = {
                    0: "noAuthNoPriv",
                    1: "authNoPriv",
                    2: "authPriv",
                    "0": "noAuthNoPriv",
                    "1": "authNoPriv",
                    "2": "authPriv",
                }
                sec_level = int_map.get(sec_level, "authPriv")
            elif str(sec_level).lower() in ("noauthnopriv", "noauth_nopriv", "noauth"):
                sec_level = "noAuthNoPriv"
            elif str(sec_level).lower() in ("authnopriv", "auth_nopriv", "auth"):
                sec_level = "authNoPriv"
            elif str(sec_level).lower() in ("authpriv", "auth_priv", "priv"):
                sec_level = "authPriv"
            else:
                raise ValueError(
                    f"Nível de segurança SNMPv3 inválido: '{sec_level}'. "
                    "Suportados: 'noAuthNoPriv', 'authNoPriv', 'authPriv'."
                )
            self.security_level = sec_level

            # Validação para authNoPriv e authPriv
            if sec_level in ("authNoPriv", "authPriv"):
                if not self.auth_protocol:
                    raise ValueError(f"Para SNMPv3 no modo '{sec_level}', 'auth_protocol' é obrigatório.")
                auth_pass = self.auth_passphrase or self.auth_password
                if not auth_pass:
                    raise ValueError(
                        f"Para SNMPv3 no modo '{sec_level}', 'auth_passphrase' (ou 'auth_password') é obrigatório."
                    )
                self.auth_passphrase = auth_pass
                self.auth_password = auth_pass

            # Validação para authPriv
            if sec_level == "authPriv":
                if not self.priv_protocol:
                    raise ValueError("Para SNMPv3 no modo 'authPriv', 'priv_protocol' é obrigatório.")
                priv_pass = self.priv_passphrase or self.priv_password
                if not priv_pass:
                    raise ValueError(
                        "Para SNMPv3 no modo 'authPriv', 'priv_passphrase' (ou 'priv_password') é obrigatório."
                    )
                self.priv_passphrase = priv_pass
                self.priv_password = priv_pass

        return self


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

    @model_validator(mode="after")
    def validate_embedded_snmp_in_thresholds(self) -> CreateDeviceRequest:
        if self.thresholds and not self.snmp_config:
            snmp_raw = self.thresholds.get("snmp") or self.thresholds.get("snmp_config")
            if isinstance(snmp_raw, dict):
                self.snmp_config = SnmpConfigSchema.model_validate(snmp_raw)
        return self


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

    @model_validator(mode="after")
    def validate_embedded_snmp_in_thresholds(self) -> UpdateDeviceRequest:
        if self.thresholds and not self.snmp_config:
            snmp_raw = self.thresholds.get("snmp") or self.thresholds.get("snmp_config")
            if isinstance(snmp_raw, dict):
                self.snmp_config = SnmpConfigSchema.model_validate(snmp_raw)
        return self


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
