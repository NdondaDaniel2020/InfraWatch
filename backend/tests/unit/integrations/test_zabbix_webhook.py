"""Testes unitários para o endpoint de Webhook do Zabbix (Fast-Path)."""

from __future__ import annotations

from unittest.mock import AsyncMock, patch

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from src.api.routes.zabbix_webhook import router
from src.core.infrastructure.redis import get_redis_client
from src.core.messaging import get_event_bus


@pytest.fixture
def mock_redis() -> AsyncMock:
    redis = AsyncMock()
    # Padrão: evento novo (não duplicado)
    redis.set.return_value = True
    return redis


@pytest.fixture
def mock_event_bus() -> AsyncMock:
    bus = AsyncMock()
    bus.publish.return_value = True
    return bus


@pytest.fixture
def test_app(mock_redis: AsyncMock, mock_event_bus: AsyncMock) -> FastAPI:
    app = FastAPI()
    app.include_router(router)
    app.dependency_overrides[get_redis_client] = lambda: mock_redis
    app.dependency_overrides[get_event_bus] = lambda: mock_event_bus
    return app


@pytest.fixture
def client(test_app: FastAPI) -> TestClient:
    return TestClient(test_app)


def test_webhook_unauthorized_missing_token(client: TestClient) -> None:
    payload = {
        "event_id": "1001",
        "event_value": 1,
        "event_severity": "High",
        "trigger_name": "Link de Fibra DOWN",
        "host_name": "cr01.luanda",
    }
    with patch("src.api.routes.zabbix_webhook.get_settings") as mock_settings:
        mock_settings.return_value.ZABBIX_WEBHOOK_SECRET = "secret-token-123"
        response = client.post("/api/v1/integrations/zabbix/webhook", json=payload)
        assert response.status_code == 401
        assert "Token de webhook do Zabbix" in response.json()["detail"]


def test_webhook_unauthorized_invalid_token(client: TestClient) -> None:
    payload = {
        "event_id": "1001",
        "event_value": 1,
        "event_severity": "High",
        "trigger_name": "Link de Fibra DOWN",
        "host_name": "cr01.luanda",
    }
    with patch("src.api.routes.zabbix_webhook.get_settings") as mock_settings:
        mock_settings.return_value.ZABBIX_WEBHOOK_SECRET = "secret-token-123"
        response = client.post(
            "/api/v1/integrations/zabbix/webhook",
            json=payload,
            headers={"X-Zabbix-Webhook-Token": "wrong-token"},
        )
        assert response.status_code == 401
        assert "inválido" in response.json()["detail"]


def test_webhook_problem_disaster_publishes_critical_incident(
    client: TestClient,
    mock_event_bus: AsyncMock,
    mock_redis: AsyncMock,
) -> None:
    payload = {
        "event_id": "9901",
        "event_value": 1,
        "event_severity": "Disaster",
        "trigger_name": "Roteador Core Inacessível",
        "host_name": "cr01.luanda",
        "host_ip": "10.200.0.1",
        "operational_data": "ICMP 100% loss",
        "occurred_at": "2026-10-10 19:30:00",
    }
    with patch("src.api.routes.zabbix_webhook.get_settings") as mock_settings:
        mock_settings.return_value.ZABBIX_WEBHOOK_SECRET = "secure-secret"
        response = client.post(
            "/api/v1/integrations/zabbix/webhook",
            json=payload,
            headers={"X-Zabbix-Webhook-Token": "secure-secret"},
        )

        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "processed"
        assert data["event_id"] == "9901"

        # Verifica idempotência registrada no Redis
        mock_redis.set.assert_awaited_once_with(
            "idempotency:zabbix:event:9901", "1", nx=True, ex=86400
        )

        # Verifica publicação no Redis Streams
        mock_event_bus.publish.assert_awaited_once()
        topic, event_data = mock_event_bus.publish.call_args[0]
        assert topic == "stream:incidents"
        assert event_data["event_type"] == "IncidentTriggeredEvent"
        assert event_data["severity"] == "CRITICAL"
        assert event_data["device_name"] == "cr01.luanda"
        assert event_data["device_ip"] == "10.200.0.1"
        assert "[Disaster] Roteador Core Inacessível" in event_data["reason"]


def test_webhook_problem_average_publishes_degraded(
    client: TestClient,
    mock_event_bus: AsyncMock,
) -> None:
    payload = {
        "event_id": "9902",
        "event_value": 1,
        "event_severity": "Average",
        "trigger_name": "Uso de CPU acima de 85%",
        "host_name": "srv-db-01",
        "operational_data": "CPU 87.2%",
    }
    with patch("src.api.routes.zabbix_webhook.get_settings") as mock_settings:
        mock_settings.return_value.ZABBIX_WEBHOOK_SECRET = "secure-secret"
        response = client.post(
            "/api/v1/integrations/zabbix/webhook",
            json=payload,
            headers={"X-Zabbix-Webhook-Token": "secure-secret"},
        )

        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "processed"

        topic, event_data = mock_event_bus.publish.call_args[0]
        assert topic == "stream:incidents"
        assert event_data["event_type"] == "DeviceDegradedEvent"
        assert event_data["severity"] == "DEGRADED"
        assert event_data["device_name"] == "srv-db-01"


def test_webhook_resolved_publishes_resolved_incident(
    client: TestClient,
    mock_event_bus: AsyncMock,
) -> None:
    payload = {
        "event_id": "9903",
        "event_value": 0,
        "event_severity": "Disaster",
        "trigger_name": "Roteador Core Inacessível",
        "host_name": "cr01.luanda",
        "host_ip": "10.200.0.1",
    }
    with patch("src.api.routes.zabbix_webhook.get_settings") as mock_settings:
        mock_settings.return_value.ZABBIX_WEBHOOK_SECRET = "secure-secret"
        response = client.post(
            "/api/v1/integrations/zabbix/webhook",
            json=payload,
            headers={"X-Zabbix-Webhook-Token": "secure-secret"},
        )

        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "processed"

        topic, event_data = mock_event_bus.publish.call_args[0]
        assert topic == "stream:incidents"
        assert event_data["event_type"] == "IncidentResolvedEvent"
        assert event_data["severity"] == "RESOLVED"
        assert "Normalizado" in event_data["root_cause"]


def test_webhook_duplicate_event_is_ignored(
    client: TestClient,
    mock_redis: AsyncMock,
    mock_event_bus: AsyncMock,
) -> None:
    # Simula evento duplicado (já registrado no Redis)
    mock_redis.set.return_value = False

    payload = {
        "event_id": "9901",
        "event_value": 1,
        "event_severity": "High",
        "trigger_name": "Alerta duplicado",
        "host_name": "sw01.benguela",
    }
    with patch("src.api.routes.zabbix_webhook.get_settings") as mock_settings:
        mock_settings.return_value.ZABBIX_WEBHOOK_SECRET = "secure-secret"
        response = client.post(
            "/api/v1/integrations/zabbix/webhook",
            json=payload,
            headers={"X-Zabbix-Webhook-Token": "secure-secret"},
        )

        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "ignored"
        assert data["reason"] == "duplicate_event"
        assert data["event_id"] == "9901"

        # NENHUM evento deve ser publicado se for duplicado
        mock_event_bus.publish.assert_not_awaited()
