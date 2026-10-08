"""Schemas Pydantic v2 para comunicação com a API JSON-RPC 2.0 do Zabbix.

Define modelos de dados para:
- Envelope de requisições e respostas JSON-RPC 2.0
- Estrutura de erros JSON-RPC
- Entidades do Zabbix (Hosts, Items, History)
- Visão agregada de telemetria de hardware (CPU, Memória RAM, Disco)
"""

from datetime import datetime, UTC
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
