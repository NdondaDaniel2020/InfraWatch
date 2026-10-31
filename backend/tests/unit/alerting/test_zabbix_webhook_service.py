"""Testes unitários para o ZabbixWebhookService no contexto de Alerting."""

from __future__ import annotations

from unittest.mock import AsyncMock

import pytest

from src.contexts.alerting.schemas.zabbix_webhook import ZabbixWebhookPayload
from src.contexts.alerting.services.zabbix_webhook_service import ZabbixWebhookService


@pytest.fixture
def mock_redis() -> AsyncMock:
    redis = AsyncMock()
    redis.set.return_value = True
    return redis


@pytest.fixture
def mock_event_bus() -> AsyncMock:
    bus = AsyncMock()
    bus.publish.return_value = True
    return bus


@pytest.fixture
def service(mock_redis: AsyncMock, mock_event_bus: AsyncMock) -> ZabbixWebhookService:
    return ZabbixWebhookService(redis=mock_redis, event_bus=mock_event_bus)


@pytest.mark.asyncio
async def test_process_webhook_new_problem_disaster(
    service: ZabbixWebhookService,
    mock_redis: AsyncMock,
    mock_event_bus: AsyncMock,
) -> None:
    payload = ZabbixWebhookPayload(
        event_id="9991",
        event_value=1,
        event_severity="Disaster",
        trigger_name="Core Router BGP Down",
        host_name="borda-01",
        host_ip="10.0.0.1",
        operational_data="peer 192.168.1.1 down",
        extra_data={"tenant_id": "org-test"},
    )

    response = await service.process_webhook(payload)

    assert response.status == "processed"
    assert response.event_id == "9991"
    mock_redis.set.assert_awaited_once_with("idempotency:zabbix:event:9991", "1", nx=True, ex=86400)
    mock_event_bus.publish.assert_awaited_once()
    event_topic, event_data = mock_event_bus.publish.call_args[0]
    assert event_topic == "stream:incidents"
    assert event_data["event_type"] == "IncidentTriggeredEvent"
    assert event_data["severity"] == "CRITICAL"
    assert event_data["device_name"] == "borda-01"


@pytest.mark.asyncio
async def test_process_webhook_duplicate_event_is_ignored(
    service: ZabbixWebhookService,
    mock_redis: AsyncMock,
    mock_event_bus: AsyncMock,
) -> None:
    mock_redis.set.return_value = False  # Chave já existe (duplicado)
    payload = ZabbixWebhookPayload(
        event_id="9991",
        event_value=1,
        event_severity="High",
        trigger_name="Link Down",
        host_name="sw-dist-01",
    )

    response = await service.process_webhook(payload)

    assert response.status == "ignored"
    assert response.reason == "duplicate_event"
    mock_event_bus.publish.assert_not_awaited()


@pytest.mark.asyncio
async def test_process_webhook_resolved_event(
    service: ZabbixWebhookService,
    mock_redis: AsyncMock,
    mock_event_bus: AsyncMock,
) -> None:
    payload = ZabbixWebhookPayload(
        event_id="9992",
        event_value=0,
        event_severity="Resolved",
        trigger_name="Core Router BGP Down",
        host_name="borda-01",
    )

    response = await service.process_webhook(payload)

    assert response.status == "processed"
    mock_event_bus.publish.assert_awaited_once()
    _, event_data = mock_event_bus.publish.call_args[0]
    assert event_data["event_type"] == "IncidentResolvedEvent"
    assert event_data["severity"] == "RESOLVED"
