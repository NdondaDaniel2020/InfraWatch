"""Serviço de aplicação para ingestão e processamento de webhooks do Zabbix."""

from __future__ import annotations

import logging
from typing import Any

from redis.asyncio import Redis

from src.contexts.alerting.consumers.alert_notification_consumer import STREAM_TOPIC
from src.contexts.alerting.schemas.zabbix_webhook import (
    ZabbixWebhookPayload,
    ZabbixWebhookResponse,
)
from src.core.messaging.resilient_bus import ResilientEventBus

logger = logging.getLogger("infrawatch.alerting.services.zabbix_webhook")

IDEMPOTENCY_TTL_SECONDS = 86400  # 24 horas


class ZabbixWebhookService:
    """Orquestrador de caso de uso para ingestão de alertas reativos do Zabbix.

    Aplica idempotência com Redis, mapeia severidades e publica no stream de incidentes.
    """

    def __init__(self, redis: Redis, event_bus: ResilientEventBus) -> None:
        self._redis = redis
        self._event_bus = event_bus

    async def process_webhook(self, payload: ZabbixWebhookPayload) -> ZabbixWebhookResponse:
        """Processa o payload de alerta do Zabbix com idempotência e despacho desacoplado."""
        # 1. Verificação de Idempotência com Redis
        idempotency_key = f"idempotency:zabbix:event:{payload.event_id}"
        is_new = await self._redis.set(idempotency_key, "1", nx=True, ex=IDEMPOTENCY_TTL_SECONDS)
        if not is_new:
            logger.info(
                "Alerta duplicado do Zabbix ignorado pelo controle de idempotência (event_id=%s)",
                payload.event_id,
            )
            return ZabbixWebhookResponse(
                status="ignored",
                event_id=payload.event_id,
                reason="duplicate_event",
            )

        # 2. Mapeamento de Severidades e Estados do Zabbix
        event_data = self._map_payload_to_event(payload)

        # 3. Publicação assíncrona no barramento (Redis Streams)
        await self._event_bus.publish(STREAM_TOPIC, event_data)
        logger.info(
            "Alerta do Zabbix publicado com sucesso no stream '%s' (event_id=%s, host=%s, severidade=%s)",
            STREAM_TOPIC,
            payload.event_id,
            payload.host_name,
            payload.event_severity,
        )

        return ZabbixWebhookResponse(
            status="processed",
            event_id=payload.event_id,
        )

    def _map_payload_to_event(self, payload: ZabbixWebhookPayload) -> dict[str, Any]:
        """Traduz o payload externo do Zabbix em evento de domínio do InfraWatch."""
        if payload.event_value == 1:
            # PROBLEM
            sev_upper = payload.event_severity.upper().strip()
            if sev_upper in ("DISASTER", "HIGH"):
                event_type = "IncidentTriggeredEvent"
                mapped_severity = "CRITICAL"
            elif sev_upper in ("AVERAGE", "WARNING"):
                event_type = "DeviceDegradedEvent"
                mapped_severity = "DEGRADED"
            else:
                event_type = "IncidentTriggeredEvent"
                mapped_severity = "INFO"

            op_info = f" ({payload.operational_data})" if payload.operational_data else ""
            reason = f"[{payload.event_severity}] {payload.trigger_name}{op_info}"

            return {
                "event_type": event_type,
                "severity": mapped_severity,
                "device_name": payload.host_name,
                "device_ip": payload.host_ip or "N/A",
                "reason": reason,
                "extra_data": {
                    "source": "zabbix_webhook",
                    "zabbix_event_id": payload.event_id,
                    "operational_data": payload.operational_data,
                    "occurred_at": payload.occurred_at,
                    **payload.extra_data,
                },
            }

        # RESOLVED (event_value == 0)
        return {
            "event_type": "IncidentResolvedEvent",
            "severity": "RESOLVED",
            "device_name": payload.host_name,
            "device_ip": payload.host_ip or "N/A",
            "reason": f"Normalização no Zabbix: {payload.trigger_name}",
            "root_cause": f"Zabbix Trigger Normalizado: {payload.trigger_name}",
            "extra_data": {
                "source": "zabbix_webhook",
                "zabbix_event_id": payload.event_id,
                "occurred_at": payload.occurred_at,
                **payload.extra_data,
            },
        }


__all__ = ["ZabbixWebhookService"]
