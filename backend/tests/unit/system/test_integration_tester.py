"""Testes unitários completos para o IntegrationTesterService (Issue #268)."""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from src.contexts.system.schemas.settings import (
    GlpiTestRequest,
    NotificationTestRequest,
    ZabbixTestRequest,
)
from src.contexts.system.services.integration_tester import (
    IntegrationTesterService,
    get_integration_tester_service,
)


def test_mask_webhook_url() -> None:
    """Valida mascara de segurança para diversos tipos de URLs de webhook."""
    # None ou vazia
    assert IntegrationTesterService.mask_webhook_url(None) is None
    assert IntegrationTesterService.mask_webhook_url("") is None

    # Discord com ID e Token
    discord_url = "https://discord.com/api/webhooks/123456789/abcdefghij123456"
    masked_discord = IntegrationTesterService.mask_webhook_url(discord_url)
    assert masked_discord == "https://discord.com/api/webhooks/123456789/••••••••"

    # Discord sem subpath
    discord_short = "https://discord.com/api/webhooks/"
    assert "••••••••" in IntegrationTesterService.mask_webhook_url(discord_short)

    # Slack
    slack_url = "https://hooks.slack.com/services/mockteam/mockbot/mocktoken123"
    masked_slack = IntegrationTesterService.mask_webhook_url(slack_url)
    assert masked_slack == "https://hooks.slack.com/services/mockteam/mockbot/••••••••"

    # Slack curto
    slack_short = "https://hooks.slack.com/services/"
    assert "••••••••" in IntegrationTesterService.mask_webhook_url(slack_short)

    # URL genérica longa (> 10 chars no final)
    generic_url = "https://example.com/alerts/secret-token-1234567890"
    masked_gen = IntegrationTesterService.mask_webhook_url(generic_url)
    assert "••••••••" in masked_gen
    assert "secret-token" not in masked_gen

    # URL genérica curta
    short_url = "https://example.com/api/v1"
    assert IntegrationTesterService.mask_webhook_url(short_url) == "https://example.com/api/v1"

    # URL malformada
    with patch("urllib.parse.urlparse", side_effect=Exception("parse error")):
        assert "••••••••" in IntegrationTesterService.mask_webhook_url(
            "invalid://url-very-long-string-test-for-fallback"
        )


@pytest.mark.asyncio
async def test_get_status_aggregation() -> None:
    """Valida agregação de status de todas as integrações sem expor credenciais."""
    mock_settings = MagicMock()
    mock_settings.ENVIRONMENT = "production"
    mock_settings.POSTGRES_HOST = "pg.internal"
    mock_settings.POSTGRES_PORT = 5432
    mock_settings.POSTGRES_DB = "infrawatch"
    mock_settings.DB_POOL_SIZE = 10
    mock_settings.REDIS_HOST = "redis.internal"
    mock_settings.REDIS_PORT = 6379
    mock_settings.REDIS_DB = 0
    mock_settings.ZABBIX_WEBHOOK_SECRET = "secret"

    mock_dp = AsyncMock()
    mock_dp.get_glpi_config.return_value = {
        "enabled": True,
        "base_url": "https://glpi.corp",
        "configured": True,
        "source": "database",
        "timeout_seconds": 5,
        "app_token": "app123",
        "user_token": "usr123",
    }
    mock_dp.get_zabbix_config.return_value = {
        "enabled": True,
        "api_url": "https://zabbix.corp/api_jsonrpc.php",
        "configured": True,
        "source": "database",
        "timeout_seconds": 5,
        "api_token": "zab123",
        "user": "Admin",
        "password": "pwd",
    }
    mock_dp.get_telegram_config.return_value = {
        "enabled": True,
        "default_chat_id": "-100123456",
        "configured": True,
        "source": "database",
        "bot_token": "bot123",
    }
    mock_dp.get_whatsapp_config.return_value = {
        "enabled": True,
        "gateway_url": "https://wa.corp",
        "configured": True,
        "source": "database",
        "api_token": "wa123",
        "default_recipient": "5511999999999",
    }
    mock_dp.get_smtp_config.return_value = {
        "enabled": True,
        "host": "smtp.corp",
        "port": 587,
        "tls": True,
        "from_address": "noc@corp.ao",
        "user": "noc",
        "password": "pwd",
        "default_recipient": "admin@corp.ao",
        "configured": True,
        "source": "database",
    }
    mock_dp.get_webhook_config.return_value = {
        "enabled": True,
        "url": "https://discord.com/api/webhooks/123/token-secret-xyz",
        "configured": True,
        "source": "database",
    }

    tester = IntegrationTesterService(settings=mock_settings, dynamic_provider=mock_dp)
    status = await tester.get_status()

    assert status.environment == "production"
    names = {item.name for item in status.integrations}
    assert {
        "glpi",
        "zabbix",
        "telegram",
        "whatsapp",
        "smtp",
        "webhook",
        "postgres",
        "redis",
    }.issubset(names)

    # Verificar mascaramento de webhook
    webhook_item = next(i for i in status.integrations if i.name == "webhook")
    assert "token-secret" not in webhook_item.endpoint
    assert "••••••••" in webhook_item.endpoint


@pytest.mark.asyncio
async def test_test_glpi_success_and_failures() -> None:
    """Valida execução do diagnóstico de conectividade com GLPI."""
    mock_settings = MagicMock()
    mock_settings.GLPI_TIMEOUT_SECONDS = 5.0
    mock_dp = AsyncMock()

    # Caso 1: Parâmetros incompletos
    mock_dp.get_glpi_config.return_value = {"base_url": "", "app_token": "", "user_token": ""}
    tester = IntegrationTesterService(settings=mock_settings, dynamic_provider=mock_dp)
    res_incomplete = await tester.test_glpi()
    assert not res_incomplete.success
    assert "incompletos" in res_incomplete.message

    # Caso 2: Sucesso com factory mockada
    mock_client = AsyncMock()
    mock_client.__aenter__.return_value = mock_client
    mock_client.open_ticket.return_value = 101
    mock_client.close_ticket.return_value = True

    tester._glpi_client_factory = MagicMock(return_value=mock_client)
    res_success = await tester.test_glpi(
        GlpiTestRequest(base_url="https://glpi.test", app_token="app", user_token="usr")
    )
    assert res_success.success
    assert res_success.ticket_id == 101
    assert res_success.session_token_obtained

    # Caso 3: Erro de conexão/exceção
    mock_client.open_ticket.side_effect = RuntimeError("Falha de rede GLPI")
    res_err = await tester.test_glpi(
        GlpiTestRequest(base_url="https://glpi.test", app_token="app", user_token="usr")
    )
    assert not res_err.success
    assert "Falha de rede GLPI" in res_err.error


@pytest.mark.asyncio
async def test_test_zabbix_success_and_failures() -> None:
    """Valida execução do diagnóstico de conectividade com Zabbix Server."""
    mock_settings = MagicMock()
    mock_settings.ZABBIX_TIMEOUT_SECONDS = 5.0
    mock_dp = AsyncMock()

    # Caso 1: URL ausente
    mock_dp.get_zabbix_config.return_value = {
        "api_url": "",
        "api_token": "",
        "user": "",
        "password": "",
    }
    tester = IntegrationTesterService(settings=mock_settings, dynamic_provider=mock_dp)
    res_no_url = await tester.test_zabbix()
    assert not res_no_url.success
    assert "ausente" in res_no_url.error

    # Caso 2: Sucesso
    mock_client = AsyncMock()
    mock_client.__aenter__.return_value = mock_client
    mock_client.get_api_version.return_value = "7.0.0"
    mock_client.get_hosts.return_value = [{"hostid": "1"}, {"hostid": "2"}]

    tester._zabbix_client_factory = MagicMock(return_value=mock_client)
    res_success = await tester.test_zabbix(
        ZabbixTestRequest(api_url="https://zabbix.test/api", api_token="tok")
    )
    assert res_success.success
    assert res_success.api_version == "7.0.0"
    assert res_success.hosts_count == 2

    # Caso 3: Exceção
    mock_client.get_api_version.side_effect = ConnectionError("Zabbix timeout")
    res_err = await tester.test_zabbix(
        ZabbixTestRequest(api_url="https://zabbix.test/api", api_token="tok")
    )
    assert not res_err.success
    assert "Zabbix timeout" in res_err.error


@pytest.mark.asyncio
async def test_test_notification_all_channels() -> None:
    """Valida disparo de testes para todos os canais de notificação suportados."""
    mock_dp = AsyncMock()
    mock_dp.get_telegram_config.return_value = {"bot_token": "bot123", "default_chat_id": "123"}
    mock_dp.get_whatsapp_config.return_value = {
        "gateway_url": "http://wa",
        "api_token": "wa",
        "enabled": True,
    }
    mock_dp.get_smtp_config.return_value = {
        "host": "smtp",
        "port": 587,
        "tls": True,
        "from_address": "a@b.com",
    }
    mock_dp.get_webhook_config.return_value = {"url": "https://hook.url"}

    tester = IntegrationTesterService(dynamic_provider=mock_dp)

    # Canal desconhecido via model_construct
    res_unsupported = await tester.test_notification(
        NotificationTestRequest.model_construct(
            channel="slack_direct", recipient=None, severity="CRITICAL"
        )
    )
    assert not res_unsupported.success
    assert "não suportado" in res_unsupported.error

    # Telegram sucesso e rejeição
    with patch("src.contexts.system.services.integration_tester.TelegramChannel") as mock_chan_cls:
        chan_inst = AsyncMock()
        chan_inst.is_available.return_value = True
        chan_inst.send.return_value = True
        mock_chan_cls.return_value = chan_inst

        res_tg = await tester.test_notification(
            NotificationTestRequest(channel="telegram", recipient="chat_1", severity="CRITICAL")
        )
        assert res_tg.success

        # Provedor rejeitou
        chan_inst.send.return_value = False
        res_tg_fail = await tester.test_notification(
            NotificationTestRequest(channel="telegram", recipient="chat_1", severity="CRITICAL")
        )
        assert not res_tg_fail.success
        assert "rejeitou" in res_tg_fail.error

        # Indisponível
        chan_inst.is_available.return_value = False
        res_tg_unavail = await tester.test_notification(
            NotificationTestRequest(channel="telegram", recipient="chat_1", severity="CRITICAL")
        )
        assert not res_tg_unavail.success
        assert "não está configurado" in res_tg_unavail.message

        # Exceção inesperada
        chan_inst.is_available.side_effect = RuntimeError("Falha interna de canal")
        res_exc = await tester.test_notification(
            NotificationTestRequest(channel="telegram", recipient="chat_1", severity="CRITICAL")
        )
        assert not res_exc.success
        assert "Falha interna de canal" in res_exc.error

    # Testar outros canais (WhatsApp, SMTP, Webhook)
    for ch in ["whatsapp", "smtp", "webhook"]:
        with patch(
            f"src.contexts.system.services.integration_tester.{ch.capitalize() if ch != 'smtp' else 'SmtpNotification'}Channel",
            create=True,
        ) as mock_c:
            chan_inst = AsyncMock()
            chan_inst.is_available.return_value = True
            chan_inst.send.return_value = True
            mock_c.return_value = chan_inst

            res = await tester.test_notification(
                NotificationTestRequest(channel=ch, recipient="dest", severity="INFO")
            )
            assert res.channel == ch


@pytest.mark.asyncio
async def test_test_infra_postgres_and_redis() -> None:
    """Valida checagem agregada de PostgreSQL (TimescaleDB) e Redis."""
    mock_session = AsyncMock()
    mock_session_factory = MagicMock()
    mock_session_factory.return_value.__aenter__.return_value = mock_session

    tester = IntegrationTesterService(session_factory=mock_session_factory)

    # Caso 1: Tudo OK
    with (
        patch(
            "src.contexts.system.services.integration_tester.SystemSettingsRepository"
        ) as mock_repo_cls,
        patch("src.contexts.system.services.integration_tester.ensure_redis") as mock_redis_func,
    ):
        repo_inst = AsyncMock()
        repo_inst.check_timescaledb_extension.return_value = True
        mock_repo_cls.return_value = repo_inst

        mock_redis = AsyncMock()
        mock_redis.ping.return_value = True
        mock_redis.info.return_value = {"aof_enabled": 1, "rdb_last_bgsave_status": "ok"}
        mock_redis_func.return_value = mock_redis

        res = await tester.test_infra()
        assert res.postgres_ok
        assert res.redis_ok
        assert res.timescale_active is True
        assert res.redis_persistence == "AOF & RDB Ativa"
        assert "100% operacional" in res.message

        # Redis com AOF apenas
        mock_redis.info.return_value = {"aof_enabled": 1, "rdb_last_bgsave_status": "err"}
        res_aof = await tester.test_infra()
        assert res_aof.redis_persistence == "AOF Ativa"

        # Redis com RDB apenas
        mock_redis.info.return_value = {"aof_enabled": 0, "rdb_last_bgsave_status": "ok"}
        res_rdb = await tester.test_infra()
        assert res_rdb.redis_persistence == "RDB Snapshots"

        # Redis volátil
        mock_redis.info.return_value = {"aof_enabled": 0, "rdb_last_bgsave_status": "err"}
        res_vol = await tester.test_infra()
        assert res_vol.redis_persistence == "Em Memória (Volátil)"

        # Exceção em info("persistence")
        mock_redis.info.side_effect = RuntimeError("info error")
        res_info_err = await tester.test_infra()
        assert res_info_err.redis_persistence == "Conectado"

    # Caso 2: Falha no Postgres e falha no Redis
    with (
        patch(
            "src.contexts.system.services.integration_tester.SystemSettingsRepository"
        ) as mock_repo_cls,
        patch("src.contexts.system.services.integration_tester.ensure_redis") as mock_redis_func,
    ):
        repo_inst = AsyncMock()
        repo_inst.check_timescaledb_extension.side_effect = ConnectionRefusedError("PG down")
        mock_repo_cls.return_value = repo_inst

        mock_redis_func.return_value = None  # Redis indisponível

        res_down = await tester.test_infra()
        assert not res_down.postgres_ok
        assert not res_down.redis_ok
        assert "instabilidade" in res_down.message


def test_get_integration_tester_service_singleton() -> None:
    """Garante que a fábrica singleton retorne sempre a mesma instância válida."""
    s1 = get_integration_tester_service()
    s2 = get_integration_tester_service()
    assert s1 is s2
