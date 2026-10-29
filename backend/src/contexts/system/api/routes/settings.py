"""Rotas administrativas de Configurações do Sistema e Testes de Integração (ADR-032 / Issue #268)."""

from __future__ import annotations

import logging
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status

from src.contexts.iam.api.dependencies.auth import AuthenticatedUser, CurrentUserDep
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

router = APIRouter(prefix="/api/v1/system/settings", tags=["System & Settings"])

IntegrationTesterDep = Annotated[IntegrationTesterService, Depends(get_integration_tester_service)]


def _require_admin(user: AuthenticatedUser) -> None:
    """Garante que apenas operadores com privilégios de administrador possam acessar configurações do sistema."""
    if not user.is_super_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Acesso negado: apenas administradores globais podem gerenciar e testar configurações do sistema.",
        )


@router.get(
    "/status",
    response_model=IntegrationStatusResponse,
    summary="Obter status consolidado das integrações com segredos mascarados",
)
async def get_system_settings_status(
    user: CurrentUserDep,
    service: IntegrationTesterDep,
) -> IntegrationStatusResponse:
    """Retorna o status e os parâmetros operacionais mascarados de todas as integrações."""
    _require_admin(user)
    return service.get_status()


@router.post(
    "/test/glpi",
    response_model=GlpiTestResponse,
    summary="Executar teste de conectividade in-process com API REST do GLPI",
)
async def test_glpi_integration(
    body: GlpiTestRequest | None,
    user: CurrentUserDep,
    service: IntegrationTesterDep,
) -> GlpiTestResponse:
    """Valida credenciais, app_token e sessão nativa com o GLPI."""
    _require_admin(user)
    return await service.test_glpi(body)


@router.post(
    "/test/zabbix",
    response_model=ZabbixTestResponse,
    summary="Executar teste de conectividade JSON-RPC com a API do Zabbix",
)
async def test_zabbix_integration(
    body: ZabbixTestRequest | None,
    user: CurrentUserDep,
    service: IntegrationTesterDep,
) -> ZabbixTestResponse:
    """Valida endpoint JSON-RPC e token de API com apiinfo.version e host.get."""
    _require_admin(user)
    return await service.test_zabbix(body)


@router.post(
    "/test/notification",
    response_model=NotificationTestResponse,
    summary="Executar disparo de notificação de teste in-process",
)
async def test_notification_integration(
    body: NotificationTestRequest,
    user: CurrentUserDep,
    service: IntegrationTesterDep,
) -> NotificationTestResponse:
    """Dispara mensagem de teste para o canal especificado (telegram, whatsapp, smtp, webhook)."""
    _require_admin(user)
    return await service.test_notification(body)


@router.post(
    "/test/infra",
    response_model=InfraTestResponse,
    summary="Executar diagnóstico de latência e saúde do TimescaleDB e Redis",
)
async def test_infra_cluster(
    user: CurrentUserDep,
    service: IntegrationTesterDep,
) -> InfraTestResponse:
    """Verifica latência de roundtrip do banco de dados e Redis."""
    _require_admin(user)
    return await service.test_infra()
