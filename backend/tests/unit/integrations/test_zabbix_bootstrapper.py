"""Testes unitários para o ZabbixWebhookBootstrapper.

Valida:
- No-op quando ZABBIX_ENABLED ou ZABBIX_AUTOCONFIGURE_WEBHOOK estão desativados
- Resiliência com retentativa (backoff) quando Zabbix Server está temporariamente inacessível
- Criação completa do Media Type, binding de usuário e Action quando ausentes
- Idempotência rigorosa quando os recursos já existem no Zabbix
"""

from unittest.mock import AsyncMock, patch

import pytest

from src.integrations.zabbix.bootstrapper import (
    DEFAULT_ACTION_NAME,
    DEFAULT_MEDIA_TYPE_NAME,
    ZabbixWebhookBootstrapper,
)
from src.integrations.zabbix.client import ZabbixClient, ZabbixConnectionError


@pytest.fixture
def mock_zabbix_client() -> AsyncMock:
    """Fixture com ZabbixClient mockado para context manager e métodos de bootstrap."""
    client = AsyncMock(spec=ZabbixClient)
    client.__aenter__.return_value = client
    client.__aexit__.return_value = None
    client.get_api_version = AsyncMock(return_value="7.0.0")
    client.get_media_type_by_name = AsyncMock(return_value=None)
    client.create_webhook_media_type = AsyncMock(return_value="101")
    client.get_user_by_username = AsyncMock(
        return_value={"userid": "1", "username": "Admin", "medias": []}
    )
    client.bind_media_type_to_user = AsyncMock(return_value=True)
    client.get_action_by_name = AsyncMock(return_value=None)
    client.create_trigger_action = AsyncMock(return_value="201")
    return client


# ---------------------------------------------------------------------------
# Testes de Flags de Configuração (No-op)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_bootstrapper_skips_when_zabbix_disabled(mock_zabbix_client):
    """Valida que o bootstrapper não executa nada quando ZABBIX_ENABLED é falso."""
    bootstrapper = ZabbixWebhookBootstrapper(client=mock_zabbix_client)

    with patch("src.integrations.zabbix.bootstrapper.get_settings") as mock_settings:
        mock_settings.return_value.ZABBIX_ENABLED = False
        mock_settings.return_value.ZABBIX_AUTOCONFIGURE_WEBHOOK = True

        result = await bootstrapper.run_bootstrap_task()
        assert result is False
        mock_zabbix_client.get_api_version.assert_not_called()


@pytest.mark.asyncio
async def test_bootstrapper_skips_when_autoconfig_disabled(mock_zabbix_client):
    """Valida que o bootstrapper não executa nada quando ZABBIX_AUTOCONFIGURE_WEBHOOK é falso."""
    bootstrapper = ZabbixWebhookBootstrapper(client=mock_zabbix_client)

    with patch("src.integrations.zabbix.bootstrapper.get_settings") as mock_settings:
        mock_settings.return_value.ZABBIX_ENABLED = True
        mock_settings.return_value.ZABBIX_AUTOCONFIGURE_WEBHOOK = False

        result = await bootstrapper.run_bootstrap_task()
        assert result is False
        mock_zabbix_client.get_api_version.assert_not_called()


# ---------------------------------------------------------------------------
# Testes de Resiliência a Conexão (wait_for_zabbix_ready)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_wait_for_zabbix_ready_success_after_retries(mock_zabbix_client):
    """Valida sucesso na prontidão do Zabbix após falhas transitórias iniciais."""
    mock_zabbix_client.get_api_version.side_effect = [
        ZabbixConnectionError("Connection refused"),
        ZabbixConnectionError("Timeout"),
        "7.0.0",
    ]

    bootstrapper = ZabbixWebhookBootstrapper(
        client=mock_zabbix_client,
        max_retries=5,
        retry_delay=0.01,
    )
    ready = await bootstrapper.wait_for_zabbix_ready(mock_zabbix_client)

    assert ready is True
    assert mock_zabbix_client.get_api_version.call_count == 3


@pytest.mark.asyncio
async def test_wait_for_zabbix_ready_timeout(mock_zabbix_client):
    """Valida que o bootstrapper retorna False graciosamente quando esgota tentativas."""
    mock_zabbix_client.get_api_version.side_effect = ZabbixConnectionError("Connection refused")

    bootstrapper = ZabbixWebhookBootstrapper(
        client=mock_zabbix_client,
        max_retries=3,
        retry_delay=0.01,
    )
    ready = await bootstrapper.wait_for_zabbix_ready(mock_zabbix_client)

    assert ready is False
    assert mock_zabbix_client.get_api_version.call_count == 3


# ---------------------------------------------------------------------------
# Testes de Provisionamento Completo e Idempotência
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_bootstrap_creates_all_when_missing(mock_zabbix_client):
    """Valida criação de Media Type, binding de usuário e Action quando nenhum existe."""
    bootstrapper = ZabbixWebhookBootstrapper(client=mock_zabbix_client)

    with patch("src.integrations.zabbix.bootstrapper.get_settings") as mock_settings:
        mock_settings.return_value.ZABBIX_INTERNAL_WEBHOOK_URL = "http://api:8000/webhook"
        mock_settings.return_value.ZABBIX_WEBHOOK_SECRET = "secret-123"
        mock_settings.return_value.ZABBIX_USER = "Admin"

        result = await bootstrapper.bootstrap_webhook_and_action(mock_zabbix_client)

        assert result["status"] == "ok"
        assert result["mediatype_id"] == "101"
        assert result["action_id"] == "201"

        mock_zabbix_client.create_webhook_media_type.assert_awaited_once_with(
            name=DEFAULT_MEDIA_TYPE_NAME,
            webhook_url="http://api:8000/webhook",
            secret_token="secret-123",
        )
        mock_zabbix_client.bind_media_type_to_user.assert_awaited_once_with("Admin", "101")
        mock_zabbix_client.create_trigger_action.assert_awaited_once_with(
            name=DEFAULT_ACTION_NAME,
            mediatype_id="101",
            user_id="1",
        )


@pytest.mark.asyncio
async def test_bootstrap_idempotent_when_already_exists(mock_zabbix_client):
    """Valida que recursos existentes são preservados sem chamar métodos de criação."""
    mock_zabbix_client.get_media_type_by_name.return_value = {
        "mediatypeid": "88",
        "name": DEFAULT_MEDIA_TYPE_NAME,
    }
    mock_zabbix_client.get_action_by_name.return_value = {
        "actionid": "99",
        "name": DEFAULT_ACTION_NAME,
    }

    bootstrapper = ZabbixWebhookBootstrapper(client=mock_zabbix_client)

    with patch("src.integrations.zabbix.bootstrapper.get_settings") as mock_settings:
        mock_settings.return_value.ZABBIX_USER = "Admin"

        result = await bootstrapper.bootstrap_webhook_and_action(mock_zabbix_client)

        assert result["status"] == "ok"
        assert result["mediatype_id"] == "88"
        assert result["action_id"] == "99"

        # Métodos de criação NÃO devem ser chamados
        mock_zabbix_client.create_webhook_media_type.assert_not_called()
        mock_zabbix_client.create_trigger_action.assert_not_called()
        # Mas binding de usuário é verificado
        mock_zabbix_client.bind_media_type_to_user.assert_awaited_once_with("Admin", "88")


@pytest.mark.asyncio
async def test_run_bootstrap_task_end_to_end(mock_zabbix_client):
    """Valida fluxo completo bem-sucedido em run_bootstrap_task."""
    bootstrapper = ZabbixWebhookBootstrapper(
        client=mock_zabbix_client,
        max_retries=2,
        retry_delay=0.01,
    )

    with patch("src.integrations.zabbix.bootstrapper.get_settings") as mock_settings:
        mock_settings.return_value.ZABBIX_ENABLED = True
        mock_settings.return_value.ZABBIX_AUTOCONFIGURE_WEBHOOK = True
        mock_settings.return_value.ZABBIX_INTERNAL_WEBHOOK_URL = "http://api:8000/webhook"
        mock_settings.return_value.ZABBIX_WEBHOOK_SECRET = "secret-123"
        mock_settings.return_value.ZABBIX_USER = "Admin"

        success = await bootstrapper.run_bootstrap_task()
        assert success is True
