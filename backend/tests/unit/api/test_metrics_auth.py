"""Testes unitários para a proteção do endpoint /metrics via HTTP Basic Auth (ADR-025)."""

import base64
from unittest.mock import patch

import pytest
from httpx import ASGITransport, AsyncClient

from src.api.main import create_app
from src.core.config import Settings


@pytest.fixture
def app():
    return create_app()


@pytest.mark.asyncio
async def test_metrics_without_credentials_returns_401(app):
    """Garante que requisições anônimas a /metrics recebem 401 com header WWW-Authenticate."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/metrics")
        assert response.status_code == 401
        assert "WWW-Authenticate" in response.headers
        assert 'realm="Prometheus Metrics"' in response.headers["WWW-Authenticate"]


@pytest.mark.asyncio
async def test_metrics_with_invalid_credentials_returns_401(app):
    """Garante que credenciais incorretas são rejeitadas com 401."""
    invalid_creds = base64.b64encode(b"wrong_user:wrong_password").decode("ascii")
    headers = {"Authorization": f"Basic {invalid_creds}"}

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/metrics", headers=headers)
        assert response.status_code == 401


@pytest.mark.asyncio
async def test_metrics_with_valid_basic_auth_returns_200(app):
    """Garante que credenciais válidas acessam com sucesso as métricas em /metrics e /api/v1/monitoring/metrics."""
    valid_creds = base64.b64encode(b"prometheus:prometheus_secure_password_2026").decode("ascii")
    headers = {"Authorization": f"Basic {valid_creds}"}

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        # Testa rota /metrics
        response = await client.get("/metrics", headers=headers)
        assert response.status_code == 200
        assert "text/plain" in response.headers.get("content-type", "")

        # Testa alias /api/v1/monitoring/metrics
        response_alias = await client.get("/api/v1/monitoring/metrics", headers=headers)
        assert response_alias.status_code == 200


@pytest.mark.asyncio
async def test_metrics_with_bearer_token_returns_200(app):
    """Garante que Bearer Token de serviço também é aceito para scrapers modernos."""
    headers = {"Authorization": "Bearer prometheus_secure_password_2026"}

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/metrics", headers=headers)
        assert response.status_code == 200


@pytest.mark.asyncio
async def test_metrics_auth_disabled_permits_anonymous_access():
    """Garante que quando METRICS_REQUIRE_AUTH=False, o acesso anônimo é permitido."""
    custom_settings = Settings(
        ENVIRONMENT="test",
        METRICS_REQUIRE_AUTH=False,
    )

    with (
        patch("src.api.dependencies.metrics_auth.get_settings", return_value=custom_settings),
        patch("src.core.config.get_settings", return_value=custom_settings),
    ):
        unprotected_app = create_app()
        async with AsyncClient(
            transport=ASGITransport(app=unprotected_app), base_url="http://test"
        ) as client:
            response = await client.get("/metrics")
            assert response.status_code == 200
