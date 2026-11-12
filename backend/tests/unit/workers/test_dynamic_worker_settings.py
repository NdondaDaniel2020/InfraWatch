"""Testes de adaptação dinâmica dos workers de background (IntegrationWorker e ZabbixSyncWorker)."""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import pytest

from src.contexts.alerting.consumers.glpi_ticket_consumer import GlpiTicketConsumer
from src.contexts.system.services.dynamic_settings_provider import DynamicSettingsProvider
from src.integrations.zabbix.client import ZabbixClient
from src.workers.daemons.integration_worker import IntegrationWorker
from src.workers.daemons.zabbix_sync_worker import ZabbixSyncWorker


@pytest.mark.asyncio
async def test_integration_worker_applies_dynamic_glpi_settings() -> None:
    """Verifica que o IntegrationWorker instancia e atualiza o GlpiTicketConsumer dinamicamente."""
    mock_provider = MagicMock(spec=DynamicSettingsProvider)
    mock_provider.get_glpi_config = AsyncMock(
        return_value={
            "enabled": True,
            "configured": True,
            "base_url": "https://glpi.dynamic.ao/apirest.php",
            "app_token": "dyn_app_tok",
            "user_token": "dyn_user_tok",
            "timeout_seconds": 15.0,
            "source": "database",
        }
    )
    mock_bus = AsyncMock()
    mock_notif = MagicMock()
    mock_email = MagicMock()

    worker = IntegrationWorker(
        event_bus=mock_bus,
        notification_consumer=mock_notif,
        email_consumer=mock_email,
        dynamic_provider=mock_provider,
        glpi_consumer=None,
    )
    worker._glpi_consumer = None

    await worker._apply_glpi_settings()

    assert worker._glpi_consumer is not None
    assert worker._glpi_consumer._glpi_base_url == "https://glpi.dynamic.ao/apirest.php"
    assert worker._glpi_consumer._glpi_app_token == "dyn_app_tok"

    # Atualização de parâmetros em tempo de execução
    mock_provider.get_glpi_config.return_value = {
        "enabled": True,
        "configured": True,
        "base_url": "https://glpi.updated.ao/apirest.php",
        "app_token": "new_token",
        "user_token": "new_user_token",
        "timeout_seconds": 20.0,
        "source": "database",
    }
    await worker._apply_glpi_settings()

    assert worker._glpi_consumer._glpi_base_url == "https://glpi.updated.ao/apirest.php"
    assert worker._glpi_consumer._glpi_app_token == "new_token"


@pytest.mark.asyncio
async def test_zabbix_sync_worker_uses_dynamic_settings() -> None:
    """Verifica que o ZabbixSyncWorker obtém o cliente com credenciais do DynamicSettingsProvider."""
    mock_provider = MagicMock(spec=DynamicSettingsProvider)
    mock_provider.get_zabbix_config = AsyncMock(
        return_value={
            "enabled": True,
            "configured": True,
            "api_url": "https://zabbix.dynamic.ao/api_jsonrpc.php",
            "api_token": "zabbix_dyn_token",
            "user": "dyn_user",
            "password": "dyn_password",
            "timeout_seconds": 18.0,
            "source": "database",
        }
    )
    mock_session_factory = MagicMock()

    worker = ZabbixSyncWorker(
        session_factory=mock_session_factory,
        dynamic_provider=mock_provider,
    )

    client = await worker.get_zabbix_client()
    assert client._api_url == "https://zabbix.dynamic.ao/api_jsonrpc.php"
    assert client._api_token == "zabbix_dyn_token"
    assert client._timeout == 18.0


@pytest.mark.asyncio
async def test_zabbix_sync_worker_sync_once_disabled_skips() -> None:
    """Verifica que o sync_once é ignorado quando a integração Zabbix está desativada no provedor dinâmico."""
    mock_provider = MagicMock(spec=DynamicSettingsProvider)
    mock_provider.get_zabbix_config = AsyncMock(
        return_value={
            "enabled": False,
            "configured": False,
            "api_url": "",
            "api_token": "",
            "user": "",
            "password": "",
            "timeout_seconds": 10.0,
            "source": "database",
        }
    )
    mock_session_factory = MagicMock()

    worker = ZabbixSyncWorker(
        session_factory=mock_session_factory,
        dynamic_provider=mock_provider,
    )
    synced = await worker.sync_once()
    assert synced == 0
