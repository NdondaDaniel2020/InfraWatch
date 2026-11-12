"""Rotas administrativas de Configurações do Sistema e Testes de Integração (ADR-032 / Issue #268 / Issue #312)."""

from __future__ import annotations

import inspect
import logging
from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, status

from src.contexts.system.api.dependencies import (
    AdminUserDep,
    IntegrationTesterDep,
    SystemSettingsServiceDep,
    require_admin,
)
from src.contexts.system.schemas.settings import (
    GlpiSettingsUpdateRequest,
    GlpiTestRequest,
    GlpiTestResponse,
    InfraTestResponse,
    IntegrationStatusResponse,
    IntegrationUpdateResponse,
    NotificationTestRequest,
    NotificationTestResponse,
    SmtpSettingsUpdateRequest,
    WebhookSettingsUpdateRequest,
    WhatsappSettingsUpdateRequest,
    ZabbixSettingsUpdateRequest,
    ZabbixTestRequest,
    ZabbixTestResponse,
)
from src.contexts.system.services.integration_tester import (
    IntegrationTesterService,
    get_integration_tester_service,
)

logger = logging.getLogger("infrawatch.system.api.settings")

router = APIRouter(
    prefix="/api/v1/system/settings",
    tags=["System & Settings"],
    dependencies=[Depends(require_admin())],
)


@router.get(
    "/status",
    response_model=IntegrationStatusResponse,
    summary="Obter status consolidado das integrações com segredos mascarados",
)
async def get_system_settings_status(
    service: IntegrationTesterDep,
) -> IntegrationStatusResponse:
    """Retorna o status e os parâmetros operacionais mascarados de todas as integrações."""
    res = service.get_status()
    if inspect.isawaitable(res):
        return await res
    return res


@router.patch(
    "/integrations/{name}",
    response_model=IntegrationUpdateResponse,
    summary="Atualizar e persistir parâmetros de integração no banco de dados",
)
async def update_integration_settings(
    name: str,
    payload: dict[str, Any],
    service: SystemSettingsServiceDep,
    current_user: AdminUserDep,
    request: Request,
) -> IntegrationUpdateResponse:
    """Valida, testa previamente e salva parâmetros de conexão de forma permanente."""
    cat = name.lower().strip()
    user_uuid = UUID(current_user.id) if current_user.id else None
    client_ip = request.client.host if request.client else None

    try:
        if cat == "glpi":
            glpi_req = GlpiSettingsUpdateRequest(**payload)
            return await service.update_glpi_settings(glpi_req, updated_by=user_uuid, ip_address=client_ip)
        elif cat == "zabbix":
            zabbix_req = ZabbixSettingsUpdateRequest(**payload)
            return await service.update_zabbix_settings(zabbix_req, updated_by=user_uuid, ip_address=client_ip)
        elif cat == "whatsapp":
            wa_req = WhatsappSettingsUpdateRequest(**payload)
            return await service.update_whatsapp_settings(wa_req, updated_by=user_uuid, ip_address=client_ip)
        elif cat == "smtp":
            smtp_req = SmtpSettingsUpdateRequest(**payload)
            return await service.update_smtp_settings(smtp_req, updated_by=user_uuid, ip_address=client_ip)
        elif cat == "webhook":
            webhook_req = WebhookSettingsUpdateRequest(**payload)
            return await service.update_webhook_settings(webhook_req, updated_by=user_uuid, ip_address=client_ip)
        else:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Integração '{name}' não é suportada. Opções: glpi, zabbix, whatsapp, smtp, webhook.",
            )
    except ValueError as err:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(err))
    except Exception as err:
        if isinstance(err, HTTPException):
            raise
        logger.exception("Erro ao processar atualização de integração %s: %s", name, err)
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Payload inválido para a integração '{name}': {err}",
        )


@router.delete(
    "/integrations/{name}",
    response_model=IntegrationUpdateResponse,
    summary="Restaurar parâmetros da integração para o padrão do ambiente (.env)",
)
async def reset_integration_settings(
    name: str,
    service: SystemSettingsServiceDep,
    current_user: AdminUserDep,
    request: Request,
) -> IntegrationUpdateResponse:
    """Remove overrides no banco de dados e restaura parâmetros padrão de fábrica."""
    user_uuid = UUID(current_user.id) if current_user.id else None
    client_ip = request.client.host if request.client else None
    try:
        return await service.reset_category_settings(
            category=name,
            updated_by=user_uuid,
            ip_address=client_ip,
        )
    except ValueError as err:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(err))


@router.post(
    "/test/glpi",
    response_model=GlpiTestResponse,
    summary="Executar teste de conectividade in-process com API REST do GLPI",
)
async def test_glpi_integration(
    body: GlpiTestRequest | None,
    service: IntegrationTesterDep,
) -> GlpiTestResponse:
    """Valida credenciais, app_token e sessão nativa com o GLPI."""
    return await service.test_glpi(body)


@router.post(
    "/test/zabbix",
    response_model=ZabbixTestResponse,
    summary="Executar teste de conectividade JSON-RPC com a API do Zabbix",
)
async def test_zabbix_integration(
    body: ZabbixTestRequest | None,
    service: IntegrationTesterDep,
) -> ZabbixTestResponse:
    """Valida endpoint JSON-RPC e token de API com apiinfo.version e host.get."""
    return await service.test_zabbix(body)


@router.post(
    "/test/notification",
    response_model=NotificationTestResponse,
    summary="Executar disparo de notificação de teste in-process",
)
async def test_notification_integration(
    body: NotificationTestRequest,
    service: IntegrationTesterDep,
) -> NotificationTestResponse:
    """Dispara mensagem de teste para o canal especificado (telegram, whatsapp, smtp, webhook)."""
    return await service.test_notification(body)


@router.post(
    "/test/infra",
    response_model=InfraTestResponse,
    summary="Executar diagnóstico de latência e saúde do TimescaleDB e Redis",
)
async def test_infra_cluster(
    service: IntegrationTesterDep,
) -> InfraTestResponse:
    """Verifica latência de roundtrip do banco de dados e Redis."""
    return await service.test_infra()


__all__ = [
    "IntegrationTesterDep",
    "IntegrationTesterService",
    "get_integration_tester_service",
    "router",
]
