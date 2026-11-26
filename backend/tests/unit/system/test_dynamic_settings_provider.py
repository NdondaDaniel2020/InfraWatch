"""Testes unitários para DynamicSettingsProvider (Issue #312 / ADR-038)."""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from src.contexts.system.services.dynamic_settings_provider import (
    DynamicSettingsProvider,
    get_dynamic_settings_provider,
)
from src.core.config import Settings


@pytest.mark.asyncio
async def test_dynamic_settings_provider_cache_and_invalidation() -> None:
    """Valida ciclo de cache em memória e invalidação."""
    mock_session = AsyncMock()
    mock_session_factory = MagicMock()
    mock_session_factory.return_value.__aenter__.return_value = mock_session

    settings = Settings()
    provider = DynamicSettingsProvider(session_factory=mock_session_factory, settings=settings)

    assert provider.settings == settings

    # Invalidação total e específica
    provider._cache["glpi"] = {"k": "v"}
    provider._cache_timestamps["glpi"] = 12345.0
    provider._cache["zabbix"] = {"k2": "v2"}
    provider._cache_timestamps["zabbix"] = 12345.0

    provider.invalidate_cache("glpi")
    assert "glpi" not in provider._cache
    assert "zabbix" in provider._cache

    provider.invalidate_cache()
    assert len(provider._cache) == 0


@pytest.mark.asyncio
async def test_dynamic_settings_provider_configs_with_overrides() -> None:
    """Valida resolução de configs (GLPI, Zabbix, Telegram, WhatsApp, SMTP, Webhook) com overrides de BD."""
    mock_session = AsyncMock()
    mock_session_factory = MagicMock()
    mock_session_factory.return_value.__aenter__.return_value = mock_session

    settings = Settings(
        GLPI_ENABLED=False,
        GLPI_BASE_URL="http://env.glpi",
        ZABBIX_ENABLED=False,
        ZABBIX_API_URL="http://env.zabbix",
        TELEGRAM_BOT_TOKEN="env_bot_token",
        TELEGRAM_DEFAULT_CHAT_ID="env_chat",
        WHATSAPP_ENABLED=False,
        WHATSAPP_GATEWAY_URL="http://env.whatsapp",
        SMTP_HOST="smtp.env.io",
        SMTP_PORT=587,
        DEFAULT_WEBHOOK_URL="http://env.webhook",
    )

    provider = DynamicSettingsProvider(session_factory=mock_session_factory, settings=settings)

    # 1. GLPI
    with patch.object(
        provider,
        "_get_category_overrides",
        return_value={
            "glpi.enabled": "true",
            "glpi.base_url": "https://db.glpi.io",
            "glpi.app_token": "app_tok",
            "glpi.user_token": "usr_tok",
            "glpi.timeout_seconds": "15.0",
        },
    ):
        glpi = await provider.get_glpi_config()
        assert glpi["enabled"] is True
        assert glpi["base_url"] == "https://db.glpi.io"
        assert glpi["source"] == "database"
        assert glpi["configured"] is True

    # 2. Zabbix
    with patch.object(
        provider,
        "_get_category_overrides",
        return_value={
            "zabbix.enabled": "1",
            "zabbix.api_url": "https://db.zabbix.io",
            "zabbix.api_token": "zab_tok",
            "zabbix.timeout_seconds": "20.0",
        },
    ):
        zab = await provider.get_zabbix_config()
        assert zab["enabled"] is True
        assert zab["api_url"] == "https://db.zabbix.io"
        assert zab["configured"] is True

    # 3. Telegram
    with patch.object(
        provider,
        "_get_category_overrides",
        return_value={
            "telegram.enabled": "yes",
            "telegram.bot_token": "db_bot_token",
            "telegram.default_chat_id": "123456",
        },
    ):
        tg = await provider.get_telegram_config()
        assert tg["enabled"] is True
        assert tg["bot_token"] == "db_bot_token"
        assert tg["configured"] is True

    # 4. WhatsApp
    with patch.object(
        provider,
        "_get_category_overrides",
        return_value={
            "whatsapp.enabled": "true",
            "whatsapp.gateway_url": "https://db.whatsapp.io",
            "whatsapp.api_token": "wa_token",
            "whatsapp.default_recipient": "551199999999",
        },
    ):
        wa = await provider.get_whatsapp_config()
        assert wa["enabled"] is True
        assert wa["gateway_url"] == "https://db.whatsapp.io"
        assert wa["configured"] is True

    # 5. SMTP
    with patch.object(
        provider,
        "_get_category_overrides",
        return_value={
            "smtp.enabled": "true",
            "smtp.host": "smtp.db.io",
            "smtp.port": "465",
            "smtp.tls": "false",
            "smtp.from": "no-reply@db.io",
        },
    ):
        smtp = await provider.get_smtp_config()
        assert smtp["enabled"] is True
        assert smtp["host"] == "smtp.db.io"
        assert smtp["port"] == 465
        assert smtp["tls"] is False
        assert smtp["configured"] is True

    # 6. Webhook
    with patch.object(
        provider,
        "_get_category_overrides",
        return_value={
            "webhook.enabled": "true",
            "webhook.url": "https://db.webhook.io/hook",
        },
    ):
        wh = await provider.get_webhook_config()
        assert wh["enabled"] is True
        assert wh["url"] == "https://db.webhook.io/hook"
        assert wh["configured"] is True


@pytest.mark.asyncio
async def test_dynamic_settings_provider_fallback_on_db_error() -> None:
    """Valida fallback gracioso quando o banco de dados falha ao carregar overrides."""
    mock_session_factory = MagicMock()
    mock_session_factory.side_effect = RuntimeError("DB connection failure")

    provider = DynamicSettingsProvider(session_factory=mock_session_factory)
    overrides = await provider._get_category_overrides("glpi")
    assert overrides == {}

    # Singleton function
    singleton = get_dynamic_settings_provider()
    assert isinstance(singleton, DynamicSettingsProvider)
