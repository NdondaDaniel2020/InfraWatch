"""Endpoint FastAPI para ingestão de alertas em tempo real do Zabbix via Webhook (Fast-Path).

Bounded Context: Alerting.
Recebe notificações push de Triggers do Zabbix Server, realiza autenticação em
tempo constante (hmac.compare_digest) para mitigar timing attacks, assegura
idempotência com Redis (SETNX com TTL de 24h) e publica imediatamente no Redis
Streams (stream:incidents) sem chamadas bloqueantes de I/O externo.
"""

from __future__ import annotations

import logging
from typing import Annotated, Any

from fastapi import APIRouter, Depends, status
from redis.asyncio import Redis

from src.contexts.alerting.consumers.alert_notification_consumer import STREAM_TOPIC
from src.contexts.alerting.schemas.zabbix_webhook import (
    ZabbixWebhookPayload,
    ZabbixWebhookResponse,
)
from src.core.config import get_settings
from src.core.infrastructure.redis import get_redis_client
from src.core.messaging import get_event_bus
from src.core.messaging.resilient_bus import ResilientEventBus

logger = logging.getLogger("infrawatch.alerting.zabbix.webhook")

router = APIRouter(prefix="/api/v1/integrations/zabbix", tags=["Alerting - Zabbix Ingestion"])


from src.contexts.alerting.api.dependencies import verify_zabbix_webhook_token

AuthTokenDep = Annotated[str, Depends(verify_zabbix_webhook_token)]
RedisDep = Annotated[Redis, Depends(get_redis_client)]
EventBusDep = Annotated[ResilientEventBus, Depends(get_event_bus)]


@router.post(
    "/webhook",
    status_code=status.HTTP_200_OK,
    response_model=ZabbixWebhookResponse,
    summary="Ingestão reativa de alertas do Zabbix (Fast-Path)",
    description=(
        "Recebe alertas acionados por Triggers do Zabbix, valida autenticação, "
        "aplica idempotência via Redis e publica o evento no stream:incidents."
    ),
)
async def handle_zabbix_webhook(
    payload: ZabbixWebhookPayload,
    _auth_token: AuthTokenDep,
    redis: RedisDep,
    event_bus: EventBusDep,
) -> ZabbixWebhookResponse:
    """Processa o payload do Zabbix com idempotência e despacho desacoplado."""
    # 1. Verificação de Idempotência com Redis (TTL de 24 horas)
    idempotency_key = f"idempotency:zabbix:event:{payload.event_id}"
    is_new = await redis.set(idempotency_key, "1", nx=True, ex=86400)
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

        event_data: dict[str, Any] = {
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
    else:
        # RESOLVED (event_value == 0)
        event_data = {
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

    # 3. Publicação assíncrona no barramento (Redis Streams)
    await event_bus.publish(STREAM_TOPIC, event_data)
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


__all__ = [
    "AuthTokenDep",
    "get_settings",
    "handle_zabbix_webhook",
    "router",
    "verify_zabbix_webhook_token",
]
