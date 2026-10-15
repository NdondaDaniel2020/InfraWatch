"""Rotas de integração para ingestão reativa de alertas do Zabbix (Fast-Path)."""

from __future__ import annotations

from fastapi import APIRouter, status

from src.contexts.alerting.api.dependencies import (
    AuthTokenDep,
    ZabbixWebhookAuthDep,
    ZabbixWebhookServiceDep,
    verify_zabbix_webhook_token,
)
from src.contexts.alerting.schemas.zabbix_webhook import (
    ZabbixWebhookPayload,
    ZabbixWebhookResponse,
)
from src.core.config import get_settings

router = APIRouter(prefix="/api/v1/integrations/zabbix", tags=["Alerting - Zabbix Ingestion"])


@router.post(
    "/webhook",
    status_code=status.HTTP_200_OK,
    response_model=ZabbixWebhookResponse,
    summary="Ingestão reativa de alertas do Zabbix (Fast-Path)",
    description=(
        "Recebe alertas acionados por Triggers do Zabbix, valida autenticação "
        "e delega o processamento com idempotência ao ZabbixWebhookService."
    ),
)
async def handle_zabbix_webhook(
    payload: ZabbixWebhookPayload,
    _auth_token: ZabbixWebhookAuthDep,
    service: ZabbixWebhookServiceDep,
) -> ZabbixWebhookResponse:
    """Processa o payload do Zabbix delegando para a camada de serviços."""
    return await service.process_webhook(payload)


__all__ = [
    "AuthTokenDep",
    "ZabbixWebhookAuthDep",
    "ZabbixWebhookServiceDep",
    "get_settings",
    "handle_zabbix_webhook",
    "router",
    "verify_zabbix_webhook_token",
]
