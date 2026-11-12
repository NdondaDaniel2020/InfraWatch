"""Testes de integração das rotas REST de atualização e reset de configurações (Issue #312)."""

from __future__ import annotations

from unittest.mock import AsyncMock
from uuid import uuid4

import httpx
import pytest
from fastapi import FastAPI, status

from src.contexts.iam.domain.enums import UserRole
from src.contexts.iam.security.tokens import create_access_token
from src.contexts.system.api.dependencies import get_system_settings_service
from src.contexts.system.api.routes.settings import router as settings_router
from src.contexts.system.schemas.settings import IntegrationUpdateResponse
from src.contexts.system.services.system_settings_service import SystemSettingsService


@pytest.fixture
def mock_settings_service() -> AsyncMock:
    service = AsyncMock(spec=SystemSettingsService)
    return service


@pytest.fixture
def settings_update_app(mock_settings_service: AsyncMock) -> FastAPI:
    app = FastAPI()
    app.dependency_overrides[get_system_settings_service] = lambda: mock_settings_service
    app.include_router(settings_router)
    return app


@pytest.fixture
def admin_token() -> str:
    return create_access_token(
        user_id=str(uuid4()),
        role=UserRole.SUPER_ADMIN.value,
        extra_claims={"email": "superadmin@rcsangola.co.ao"},
    )


@pytest.fixture
def org_admin_token() -> str:
    return create_access_token(
        user_id=str(uuid4()),
        role=UserRole.ORG_ADMIN.value,
        extra_claims={"email": "orgadmin@cliente.ao"},
    )


@pytest.mark.asyncio
async def test_update_glpi_settings_endpoint_success(
    settings_update_app: FastAPI,
    mock_settings_service: AsyncMock,
    admin_token: str,
) -> None:
    mock_settings_service.update_glpi_settings.return_value = IntegrationUpdateResponse(
        success=True,
        name="glpi",
        message="Configurações salvas com sucesso",
        source="database",
        details={"endpoint": "https://glpi.rcsangola.co.ao/apirest.php"},
    )

    payload = {
        "endpoint": "https://glpi.rcsangola.co.ao/apirest.php",
        "enabled": True,
        "app_token": "app_token_secret",
        "user_token": "user_token_secret",
        "timeout_seconds": 12.0,
        "validate_connectivity": True,
    }

    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=settings_update_app),
        base_url="http://test",
    ) as client:
        resp = await client.patch(
            "/api/v1/system/settings/integrations/glpi",
            headers={"Authorization": f"Bearer {admin_token}"},
            json=payload,
        )

        assert resp.status_code == status.HTTP_200_OK
        data = resp.json()
        assert data["success"] is True
        assert data["name"] == "glpi"
        assert data["source"] == "database"
        mock_settings_service.update_glpi_settings.assert_awaited_once()


@pytest.mark.asyncio
async def test_update_settings_requires_admin(
    settings_update_app: FastAPI,
    org_admin_token: str,
) -> None:
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=settings_update_app),
        base_url="http://test",
    ) as client:
        resp = await client.patch(
            "/api/v1/system/settings/integrations/glpi",
            headers={"Authorization": f"Bearer {org_admin_token}"},
            json={"endpoint": "https://glpi.empresa.ao"},
        )
        assert resp.status_code == status.HTTP_403_FORBIDDEN


@pytest.mark.asyncio
async def test_update_settings_unauthenticated(
    settings_update_app: FastAPI,
) -> None:
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=settings_update_app),
        base_url="http://test",
    ) as client:
        resp = await client.patch(
            "/api/v1/system/settings/integrations/glpi",
            json={"endpoint": "https://glpi.empresa.ao"},
        )
        assert resp.status_code == status.HTTP_401_UNAUTHORIZED


@pytest.mark.asyncio
async def test_update_settings_validation_error(
    settings_update_app: FastAPI,
    mock_settings_service: AsyncMock,
    admin_token: str,
) -> None:
    mock_settings_service.update_glpi_settings.side_effect = ValueError(
        "Falha na validação de conectividade com GLPI: Host unreachable"
    )

    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=settings_update_app),
        base_url="http://test",
    ) as client:
        resp = await client.patch(
            "/api/v1/system/settings/integrations/glpi",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={"endpoint": "https://glpi.empresa.ao"},
        )
        assert resp.status_code == status.HTTP_400_BAD_REQUEST
        assert "Falha na validação de conectividade" in resp.json()["detail"]


@pytest.mark.asyncio
async def test_update_unsupported_integration(
    settings_update_app: FastAPI,
    admin_token: str,
) -> None:
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=settings_update_app),
        base_url="http://test",
    ) as client:
        resp = await client.patch(
            "/api/v1/system/settings/integrations/unknown_module",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={"endpoint": "https://test.local"},
        )
        assert resp.status_code == status.HTTP_400_BAD_REQUEST
        assert "não é suportada" in resp.json()["detail"]


@pytest.mark.asyncio
async def test_update_zabbix_settings_endpoint_success(
    settings_update_app: FastAPI,
    mock_settings_service: AsyncMock,
    admin_token: str,
) -> None:
    mock_settings_service.update_zabbix_settings.return_value = IntegrationUpdateResponse(
        success=True,
        name="zabbix",
        message="Zabbix atualizado",
        source="database",
    )

    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=settings_update_app),
        base_url="http://test",
    ) as client:
        resp = await client.patch(
            "/api/v1/system/settings/integrations/zabbix",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={"endpoint": "http://zabbix:8080/api_jsonrpc.php", "api_token": "secret"},
        )
        assert resp.status_code == status.HTTP_200_OK
        mock_settings_service.update_zabbix_settings.assert_awaited_once()


@pytest.mark.asyncio
async def test_reset_integration_settings_endpoint_success(
    settings_update_app: FastAPI,
    mock_settings_service: AsyncMock,
    admin_token: str,
) -> None:
    mock_settings_service.reset_category_settings.return_value = IntegrationUpdateResponse(
        success=True,
        name="glpi",
        message="Resetado para padrão .env",
        source="environment",
    )

    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=settings_update_app),
        base_url="http://test",
    ) as client:
        resp = await client.delete(
            "/api/v1/system/settings/integrations/glpi",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert resp.status_code == status.HTTP_200_OK
        data = resp.json()
        assert data["source"] == "environment"
        mock_settings_service.reset_category_settings.assert_awaited_once()
