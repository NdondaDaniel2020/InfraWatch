"""Testes unitários de autorização e rotas REST para Configurações e Diagnóstico (ADR-032 / Issue #268)."""

from __future__ import annotations

from unittest.mock import AsyncMock, patch

import httpx
import pytest
from fastapi import FastAPI, status

from src.contexts.iam.domain.enums import UserRole
from src.contexts.iam.security.tokens import create_access_token
from src.contexts.system.api.routes.settings import router as settings_router
from src.contexts.system.schemas.settings import (
    GlpiTestResponse,
    InfraTestResponse,
    IntegrationStatusItem,
    IntegrationStatusResponse,
    NotificationTestResponse,
    ZabbixTestResponse,
)


@pytest.fixture
def settings_test_app() -> FastAPI:
    """Cria uma aplicação FastAPI isolada com o roteador de configurações."""
    app = FastAPI()
    app.include_router(settings_router)
    return app


@pytest.fixture
def admin_token() -> str:
    """Gera um JWT válido com privilégio SUPER_ADMIN."""
    return create_access_token(
        user_id="usr-admin-1",
        role=UserRole.SUPER_ADMIN.value,
        extra_claims={"email": "noc-admin@rcsangola.co.ao"},
    )


@pytest.fixture
def org_admin_token() -> str:
    """Gera um JWT com papel ORG_ADMIN (que não deve ter acesso às configs globais de infra)."""
    return create_access_token(
        user_id="usr-org-admin-1",
        role=UserRole.ORG_ADMIN.value,
        extra_claims={"email": "org-admin@cliente.ao", "tenant_id": "tenant-123"},
    )


@pytest.mark.asyncio
async def test_settings_status_requires_super_admin(settings_test_app: FastAPI, org_admin_token: str) -> None:
    """Garante que ORG_ADMIN receba 403 Forbidden em /status."""
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=settings_test_app),
        base_url="http://test",
    ) as client:
        response = await client.get(
            "/api/v1/system/settings/status",
            headers={"Authorization": f"Bearer {org_admin_token}"},
        )
        assert response.status_code == status.HTTP_403_FORBIDDEN


@pytest.mark.asyncio
async def test_settings_status_success(settings_test_app: FastAPI, admin_token: str) -> None:
    """Garante que SUPER_ADMIN consiga listar o status consolidado das integrações."""
    mock_status = IntegrationStatusResponse(
        integrations=[
            IntegrationStatusItem(
                name="glpi",
                enabled=True,
                endpoint="https://glpi.empresa.ao",
                configured=True,
                details={"app_token_configured": True},
            ),
            IntegrationStatusItem(
                name="zabbix",
                enabled=True,
                endpoint="http://zabbix:8080/api_jsonrpc.php",
                configured=True,
                details={"api_token_configured": True},
            ),
        ],
        environment="test",
    )

    with patch(
        "src.contexts.system.api.routes.settings.IntegrationTesterService.get_status",
        return_value=mock_status,
    ):
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=settings_test_app),
            base_url="http://test",
        ) as client:
            response = await client.get(
                "/api/v1/system/settings/status",
                headers={"Authorization": f"Bearer {admin_token}"},
            )
            assert response.status_code == status.HTTP_200_OK
            data = response.json()
            assert data["environment"] == "test"
            assert len(data["integrations"]) == 2
            assert data["integrations"][0]["name"] == "glpi"


@pytest.mark.asyncio
async def test_test_glpi_endpoint(settings_test_app: FastAPI, admin_token: str) -> None:
    """Valida chamada do endpoint de teste do GLPI."""
    mock_res = GlpiTestResponse(
        success=True,
        latency_ms=18.4,
        message="Conexão com GLPI bem-sucedida.",
        session_token_obtained=True,
        ticket_id=123,
    )

    with patch(
        "src.contexts.system.api.routes.settings.IntegrationTesterService.test_glpi",
        new_callable=AsyncMock,
        return_value=mock_res,
    ):
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=settings_test_app),
            base_url="http://test",
        ) as client:
            response = await client.post(
                "/api/v1/system/settings/test/glpi",
                headers={"Authorization": f"Bearer {admin_token}"},
                json={"base_url": "https://glpi.test", "app_token": "app123", "user_token": "usr123"},
            )
            assert response.status_code == status.HTTP_200_OK
            data = response.json()
            assert data["success"] is True
            assert data["latency_ms"] == 18.4
            assert data["ticket_id"] == 123


@pytest.mark.asyncio
async def test_test_zabbix_endpoint(settings_test_app: FastAPI, admin_token: str) -> None:
    """Valida chamada do endpoint de teste do Zabbix."""
    mock_res = ZabbixTestResponse(
        success=True,
        latency_ms=12.2,
        message="Conexão Zabbix OK (v7.0.0).",
        api_version="7.0.0",
        hosts_count=42,
    )

    with patch(
        "src.contexts.system.api.routes.settings.IntegrationTesterService.test_zabbix",
        new_callable=AsyncMock,
        return_value=mock_res,
    ):
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=settings_test_app),
            base_url="http://test",
        ) as client:
            response = await client.post(
                "/api/v1/system/settings/test/zabbix",
                headers={"Authorization": f"Bearer {admin_token}"},
                json={"api_url": "http://zabbix.test/api_jsonrpc.php", "api_token": "zbxtoken"},
            )
            assert response.status_code == status.HTTP_200_OK
            assert response.json()["api_version"] == "7.0.0"


@pytest.mark.asyncio
async def test_test_notification_endpoint(settings_test_app: FastAPI, admin_token: str) -> None:
    """Valida disparo de teste multicanal de notificação."""
    mock_res = NotificationTestResponse(
        success=True,
        channel="telegram",
        latency_ms=45.0,
        message="Mensagem de teste entregue via telegram com sucesso.",
    )

    with patch(
        "src.contexts.system.api.routes.settings.IntegrationTesterService.test_notification",
        new_callable=AsyncMock,
        return_value=mock_res,
    ):
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=settings_test_app),
            base_url="http://test",
        ) as client:
            response = await client.post(
                "/api/v1/system/settings/test/notification",
                headers={"Authorization": f"Bearer {admin_token}"},
                json={"channel": "telegram", "recipient": "987654"},
            )
            assert response.status_code == status.HTTP_200_OK
            assert response.json()["success"] is True


@pytest.mark.asyncio
async def test_test_infra_cluster_endpoint(settings_test_app: FastAPI, admin_token: str) -> None:
    """Valida diagnóstico de infraestrutura de cluster (TimescaleDB e Redis)."""
    mock_res = InfraTestResponse(
        postgres_ok=True,
        postgres_latency_ms=2.1,
        redis_ok=True,
        redis_latency_ms=0.8,
        message="Cluster de infraestrutura 100% operacional.",
    )

    with patch(
        "src.contexts.system.api.routes.settings.IntegrationTesterService.test_infra",
        new_callable=AsyncMock,
        return_value=mock_res,
    ):
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=settings_test_app),
            base_url="http://test",
        ) as client:
            response = await client.post(
                "/api/v1/system/settings/test/infra",
                headers={"Authorization": f"Bearer {admin_token}"},
            )
            assert response.status_code == status.HTTP_200_OK
            data = response.json()
            assert data["postgres_ok"] is True
            assert data["redis_ok"] is True
