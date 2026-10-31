"""Rotas administrativas de Configurações do Sistema e Testes de Integração (ADR-032 / Issue #268)."""

from __future__ import annotations

import logging

from fastapi import APIRouter, Depends

from src.contexts.system.api.dependencies import (
    IntegrationTesterDep,
    require_admin,
)
from src.contexts.system.schemas.settings import (
    GlpiTestRequest,
    GlpiTestResponse,
    InfraTestResponse,
    IntegrationStatusResponse,
    NotificationTestRequest,
    NotificationTestResponse,
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
    return service.get_status()


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
