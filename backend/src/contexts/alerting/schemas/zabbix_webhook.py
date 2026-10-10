"""Contratos Pydantic de entrada e saída para ingestão de alertas via Webhook do Zabbix."""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class ZabbixWebhookPayload(BaseModel):
    """Payload recebido via Webhook Media Type do Zabbix (Fast-Path de Alertas)."""

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
    """Resposta estruturada para o Zabbix Server ao processar o webhook de alerta."""

    status: str = Field(description="'processed' ou 'ignored'")
    event_id: str = Field(description="Identificador do evento processado")
    reason: str | None = Field(default=None, description="Justificativa de descarte (ex: duplicate_event)")


__all__ = ["ZabbixWebhookPayload", "ZabbixWebhookResponse"]
