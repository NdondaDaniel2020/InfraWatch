"""Testes unitários para o SystemSettingsService (Issue #312)."""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from src.contexts.system.domain.events import (
    SystemSettingResetEvent,
    SystemSettingUpdatedEvent,
)
from src.contexts.system.schemas.settings import (
    GlpiSettingsUpdateRequest,
    GlpiTestResponse,
    SmtpSettingsUpdateRequest,
    WebhookSettingsUpdateRequest,
    WhatsappSettingsUpdateRequest,
    ZabbixSettingsUpdateRequest,
    ZabbixTestResponse,
)
from src.contexts.system.services.dynamic_settings_provider import DynamicSettingsProvider
from src.contexts.system.services.system_settings_service import SystemSettingsService


@pytest.fixture
def mock_session() -> MagicMock:
    session = MagicMock(spec=AsyncSession)
    session.add = MagicMock()
    return session


@pytest.fixture
def mock_provider() -> MagicMock:
    provider = MagicMock(spec=DynamicSettingsProvider)
    return provider


@pytest.fixture
def mock_tester() -> MagicMock:
    tester = MagicMock()
    tester.test_glpi = AsyncMock(
        return_value=GlpiTestResponse(
            success=True,
            latency_ms=12.5,
            message="GLPI validado com sucesso",
        )
    )
    tester.test_zabbix = AsyncMock(
        return_value=ZabbixTestResponse(
            success=True,
            latency_ms=8.0,
            message="Zabbix validado com sucesso",
        )
    )
    return tester


@pytest.mark.asyncio
async def test_update_glpi_settings_success(
    mock_session: MagicMock,
    mock_provider: MagicMock,
    mock_tester: MagicMock,
) -> None:
    service = SystemSettingsService(
        session=mock_session,
        dynamic_provider=mock_provider,
        integration_tester=mock_tester,
    )
    service.repository = AsyncMock()
    service.repository.get_category_dict.return_value = {}
    service.repository.save_setting = AsyncMock()
    service.audit_service = AsyncMock()

    user_id = uuid4()
    req = GlpiSettingsUpdateRequest(
        endpoint="https://glpi.empresa.ao/apirest.php",
        enabled=True,
        app_token="token_app_123",
        user_token="token_user_456",
        timeout_seconds=15.0,
        validate_connectivity=True,
    )

    res = await service.update_glpi_settings(req, updated_by=user_id)

    assert res.success is True
    assert res.name == "glpi"
    assert res.source == "database"

    mock_tester.test_glpi.assert_awaited_once()
    assert service.repository.save_setting.await_count == 5
    mock_session.add.assert_called_once()
    mock_provider.invalidate_cache.assert_called_with("glpi")
    service.audit_service.record_action.assert_awaited_once()


@pytest.mark.asyncio
async def test_update_glpi_settings_invalid_url(
    mock_session: MagicMock,
    mock_provider: MagicMock,
    mock_tester: MagicMock,
) -> None:
    service = SystemSettingsService(
        session=mock_session,
        dynamic_provider=mock_provider,
        integration_tester=mock_tester,
    )
    req = GlpiSettingsUpdateRequest(
        endpoint="ftp://servidor-invalido",
        enabled=True,
    )
    with pytest.raises(ValueError, match="http:// ou https://"):
        await service.update_glpi_settings(req)


@pytest.mark.asyncio
async def test_update_glpi_settings_connectivity_failure(
    mock_session: MagicMock,
    mock_provider: MagicMock,
    mock_tester: MagicMock,
) -> None:
    mock_tester.test_glpi.return_value = GlpiTestResponse(
        success=False,
        latency_ms=100.0,
        message="Host unreachable",
        error="Connection refused",
    )
    service = SystemSettingsService(
        session=mock_session,
        dynamic_provider=mock_provider,
        integration_tester=mock_tester,
    )
    service.repository = AsyncMock()
    service.repository.get_category_dict.return_value = {}

    req = GlpiSettingsUpdateRequest(
        endpoint="https://glpi.empresa.ao/apirest.php",
        enabled=True,
        app_token="app_tok",
        user_token="user_tok",
        validate_connectivity=True,
    )

    with pytest.raises(ValueError, match="Falha na validação de conectividade com GLPI"):
        await service.update_glpi_settings(req)

    service.repository.save_setting.assert_not_awaited()


@pytest.mark.asyncio
async def test_update_glpi_settings_preserves_existing_secrets(
    mock_session: MagicMock,
    mock_provider: MagicMock,
    mock_tester: MagicMock,
) -> None:
    service = SystemSettingsService(
        session=mock_session,
        dynamic_provider=mock_provider,
        integration_tester=mock_tester,
    )
    service.repository = AsyncMock()
    service.repository.get_category_dict.return_value = {
        "glpi.app_token": "existing_app_secret",
        "glpi.user_token": "existing_user_secret",
    }
    service.repository.save_setting = AsyncMock()
    service.audit_service = AsyncMock()

    req = GlpiSettingsUpdateRequest(
        endpoint="https://glpi.novo.ao/apirest.php",
        enabled=True,
        app_token=None,
        user_token=None,
        validate_connectivity=False,
    )

    res = await service.update_glpi_settings(req)
    assert res.success is True

    saved_keys = {call.kwargs["key"]: call.kwargs["value"] for call in service.repository.save_setting.await_args_list}
    assert saved_keys["glpi.app_token"] == "existing_app_secret"
    assert saved_keys["glpi.user_token"] == "existing_user_secret"


@pytest.mark.asyncio
async def test_update_zabbix_settings_success(
    mock_session: MagicMock,
    mock_provider: MagicMock,
    mock_tester: MagicMock,
) -> None:
    service = SystemSettingsService(
        session=mock_session,
        dynamic_provider=mock_provider,
        integration_tester=mock_tester,
    )
    service.repository = AsyncMock()
    service.repository.get_category_dict.return_value = {}
    service.repository.save_setting = AsyncMock()
    service.audit_service = AsyncMock()

    req = ZabbixSettingsUpdateRequest(
        endpoint="https://zabbix.empresa.ao/api_jsonrpc.php",
        enabled=True,
        api_token="zabbix_token_123",
        timeout_seconds=12.0,
        validate_connectivity=True,
    )

    res = await service.update_zabbix_settings(req)
    assert res.success is True
    assert res.name == "zabbix"
    mock_tester.test_zabbix.assert_awaited_once()
    mock_provider.invalidate_cache.assert_called_with("zabbix")


@pytest.mark.asyncio
async def test_update_whatsapp_settings_success(
    mock_session: MagicMock,
    mock_provider: MagicMock,
) -> None:
    service = SystemSettingsService(
        session=mock_session,
        dynamic_provider=mock_provider,
    )
    service.repository = AsyncMock()
    service.repository.get_category_dict.return_value = {}
    service.repository.save_setting = AsyncMock()
    service.audit_service = AsyncMock()

    req = WhatsappSettingsUpdateRequest(
        gateway_url="https://api.whatsapp-gateway.local",
        enabled=True,
        api_token="wa_secret",
        default_recipient="+244923000000",
    )

    res = await service.update_whatsapp_settings(req)
    assert res.success is True
    assert res.name == "whatsapp"
    mock_provider.invalidate_cache.assert_called_with("whatsapp")


@pytest.mark.asyncio
async def test_update_smtp_settings_success(
    mock_session: MagicMock,
    mock_provider: MagicMock,
) -> None:
    service = SystemSettingsService(
        session=mock_session,
        dynamic_provider=mock_provider,
    )
    service.repository = AsyncMock()
    service.repository.get_category_dict.return_value = {}
    service.repository.save_setting = AsyncMock()
    service.audit_service = AsyncMock()

    req = SmtpSettingsUpdateRequest(
        host="smtp.office365.com",
        port=587,
        tls=True,
        from_address="noreply@empresa.ao",
        password="secret_smtp_password",
    )

    res = await service.update_smtp_settings(req)
    assert res.success is True
    assert res.name == "smtp"
    mock_provider.invalidate_cache.assert_called_with("smtp")


@pytest.mark.asyncio
async def test_update_webhook_settings_success(
    mock_session: MagicMock,
    mock_provider: MagicMock,
) -> None:
    service = SystemSettingsService(
        session=mock_session,
        dynamic_provider=mock_provider,
    )
    service.repository = AsyncMock()
    service.repository.save_setting = AsyncMock()
    service.audit_service = AsyncMock()

    req = WebhookSettingsUpdateRequest(
        url="https://webhook.site/test-uuid",
        enabled=True,
    )

    res = await service.update_webhook_settings(req)
    assert res.success is True
    assert res.name == "webhook"
    mock_provider.invalidate_cache.assert_called_with("webhook")


@pytest.mark.asyncio
async def test_reset_category_settings_success(
    mock_session: MagicMock,
    mock_provider: MagicMock,
) -> None:
    service = SystemSettingsService(
        session=mock_session,
        dynamic_provider=mock_provider,
    )
    service.repository = AsyncMock()
    service.repository.delete_by_category.return_value = 4
    service.audit_service = AsyncMock()

    res = await service.reset_category_settings("glpi")
    assert res.success is True
    assert res.source == "environment"
    service.repository.delete_by_category.assert_awaited_with("glpi")
    mock_provider.invalidate_cache.assert_called_with("glpi")
    service.audit_service.record_action.assert_awaited_once()


@pytest.mark.asyncio
async def test_reset_category_settings_invalid_category(
    mock_session: MagicMock,
    mock_provider: MagicMock,
) -> None:
    service = SystemSettingsService(
        session=mock_session,
        dynamic_provider=mock_provider,
    )
    with pytest.raises(ValueError, match="Categoria 'invalid_cat' inválida"):
        await service.reset_category_settings("invalid_cat")
