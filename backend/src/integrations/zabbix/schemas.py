"""Schemas Pydantic v2 para comunicação com a API JSON-RPC 2.0 do Zabbix.

Define modelos de dados para:
- Envelope de requisições e respostas JSON-RPC 2.0
- Estrutura de erros JSON-RPC
- Entidades do Zabbix (Hosts, Items, History)
- Visão agregada de telemetria de hardware (CPU, Memória RAM, Disco)
"""

from datetime import UTC, datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field

# ---------------------------------------------------------------------------
# Envelope JSON-RPC 2.0 Padrão
# ---------------------------------------------------------------------------


class JsonRpcRequest(BaseModel):
    """Envelope de requisição padrão JSON-RPC 2.0 conforme especificação Zabbix."""

    model_config = ConfigDict(populate_by_name=True)

    jsonrpc: str = "2.0"
    method: str
    params: dict[str, Any] | list[Any] = Field(default_factory=dict)
    id: int | str = 1
    auth: str | None = None


class JsonRpcError(BaseModel):
    """Objeto de erro retornado pela API JSON-RPC do Zabbix."""

    model_config = ConfigDict(extra="ignore")

    code: int
    message: str
    data: str | dict[str, Any] | None = None


class JsonRpcResponse(BaseModel):
    """Envelope de resposta padrão JSON-RPC 2.0 do Zabbix."""

    model_config = ConfigDict(extra="ignore")

    jsonrpc: str = "2.0"
    result: Any = None
    error: JsonRpcError | None = None
    id: int | str = 1

    @property
    def is_success(self) -> bool:
        """Indica se a resposta foi processada com sucesso pelo Zabbix."""
        return self.error is None


# ---------------------------------------------------------------------------
# Modelos de Entidades do Zabbix
# ---------------------------------------------------------------------------


class ZabbixHost(BaseModel):
    """Representação de um host monitorado pelo Zabbix."""

    model_config = ConfigDict(extra="ignore")

    hostid: str
    host: str = ""
    name: str = ""
    status: str = "0"  # 0 = Monitored, 1 = Unmonitored
    available: str | int | None = None  # 1 = Available, 2 = Unavailable

    @property
    def status_label(self) -> str:
        """Retorna o rótulo legível do status de monitoramento."""
        return "Monitored" if str(self.status) == "0" else "Unmonitored"

    @property
    def available_label(self) -> str:
        """Retorna o rótulo de disponibilidade do agente Zabbix."""
        val = str(self.available) if self.available is not None else "0"
        if val == "1":
            return "Available"
        if val == "2":
            return "Unavailable"
        return "Unknown"


class ZabbixItem(BaseModel):
    """Item de monitoramento (métrica ou sensor) do Zabbix."""

    model_config = ConfigDict(extra="ignore")

    itemid: str
    name: str = ""
    key_: str
    lastvalue: str | None = None
    units: str | None = None
    lastclock: str | int | None = None
    status: str = "0"  # 0 = Enabled, 1 = Disabled

    def parse_float_value(self) -> float | None:
        """Converte de forma segura o valor textual da métrica para float."""
        if self.lastvalue is None:
            return None
        try:
            return float(self.lastvalue.strip())
        except (ValueError, TypeError):
            return None


class ZabbixHostMetrics(BaseModel):
    """Consolidação das métricas de hardware extraídas via Zabbix para um host."""

    model_config = ConfigDict(extra="ignore")

    hostid: str
    host_name: str = ""
    cpu_utilization_pct: float | None = None
    memory_utilization_pct: float | None = None
    memory_used_bytes: float | None = None
    memory_total_bytes: float | None = None
    disk_utilization_pct: float | None = None
    disk_used_bytes: float | None = None
    disk_total_bytes: float | None = None
    collected_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    items: list[ZabbixItem] = Field(default_factory=list)

    @property
    def has_hardware_telemetry(self) -> bool:
        """Verifica se pelo menos uma métrica de hardware foi coletada com sucesso."""
        return any(
            metric is not None
            for metric in (
                self.cpu_utilization_pct,
                self.memory_utilization_pct,
                self.disk_utilization_pct,
            )
        )


# ---------------------------------------------------------------------------
# Modelos para Ingestão de Webhooks do Zabbix (Fast-Path)
# ---------------------------------------------------------------------------


class ZabbixWebhookPayload(BaseModel):
    """Payload recebido via Webhook Media Type do Zabbix."""

    model_config = ConfigDict(extra="ignore")

    event_id: str = Field(description="Identificador único do evento no Zabbix ({EVENT.ID})")
    event_value: int = Field(default=1, description="Estado do evento: 1=PROBLEM, 0=RESOLVED ({EVENT.VALUE})")
    event_severity: str = Field(default="Average", description="Severidade do evento no Zabbix ({EVENT.SEVERITY})")
    trigger_name: str = Field(description="Nome do gatilho/trigger ({TRIGGER.NAME})")
    host_name: str = Field(description="Nome do host monitorado ({HOST.NAME} ou {HOST.HOST})")
    host_ip: str | None = Field(default=None, description="IP do host ({HOST.IP})")
    operational_data: str | None = Field(default=None, description="Valores operacionais no momento ({EVENT.OPDATA})")
    occurred_at: str | None = Field(default=None, description="Data/hora do evento ({EVENT.DATE} {EVENT.TIME})")
    extra_data: dict[str, Any] = Field(default_factory=dict, description="Metadados adicionais opcionais")


class ZabbixWebhookResponse(BaseModel):
    """Resposta estruturada para o Zabbix Server ao processar o webhook."""

    status: str = Field(description="'processed' ou 'ignored'")
    event_id: str = Field(description="Identificador do evento processado")
    reason: str | None = Field(default=None, description="Justificativa de descarte (ex: duplicate_event)")

