"""Serviço de teste e diagnóstico in-process de integrações corporativas (Issue #268)."""

from __future__ import annotations

import logging
import time
from typing import Any
from uuid import uuid4

from sqlalchemy import text

from src.contexts.system.schemas.settings import (
    GlpiTestRequest,
    GlpiTestResponse,
    InfraTestResponse,
    IntegrationStatusItem,
    IntegrationStatusResponse,
    NotificationTestRequest,
    NotificationTestResponse,
    ZabbixTestRequest,
    ZabbixTestResponse,
)
from src.contexts.system.services.dynamic_settings_provider import (
    DynamicSettingsProvider,
    get_dynamic_settings_provider,
)
from src.core.config import get_settings
from src.core.database.session import get_session_factory
from src.core.infrastructure.redis import ensure_redis
from src.integrations.glpi import GlpiClient
from src.integrations.glpi.schemas import (
    GlpiImpact,
    GlpiTicketCreate,
    GlpiUrgency,
)
from src.integrations.notifications import (
    AlertMessage,
    AlertSeverity,
    NotificationChannel,
    SmtpNotificationChannel,
    TelegramChannel,
    WebhookChannel,
    WhatsAppChannel,
)
from src.integrations.zabbix import ZabbixClient

logger = logging.getLogger("infrawatch.system.integration_tester")


class IntegrationTesterService:
    """Executa diagnósticos diretos em memória utilizando os clientes nativos do InfraWatch."""

    def __init__(
        self,
        settings: Any | None = None,
        dynamic_provider: DynamicSettingsProvider | None = None,
    ) -> None:
        self.settings = settings or get_settings()
        self.session_factory = get_session_factory()
        self.dynamic_provider = dynamic_provider or get_dynamic_settings_provider()

    async def get_status(self) -> IntegrationStatusResponse:
        """Gera sumário do estado operacional de todas as integrações sem vazar segredos."""
        s = self.settings
        dp = self.dynamic_provider

        glpi_cfg = await dp.get_glpi_config()
        zabbix_cfg = await dp.get_zabbix_config()
        whatsapp_cfg = await dp.get_whatsapp_config()
        smtp_cfg = await dp.get_smtp_config()
        webhook_cfg = await dp.get_webhook_config()

        items: list[IntegrationStatusItem] = [
            IntegrationStatusItem(
                name="glpi",
                enabled=bool(glpi_cfg["enabled"]),
                endpoint=glpi_cfg["base_url"] if glpi_cfg["base_url"] else None,
                configured=bool(glpi_cfg["configured"]),
                source=glpi_cfg["source"],
                details={
                    "timeout_seconds": glpi_cfg["timeout_seconds"],
                    "app_token_configured": bool(glpi_cfg["app_token"]),
                    "user_token_configured": bool(glpi_cfg["user_token"]),
                },
            ),
            IntegrationStatusItem(
                name="zabbix",
                enabled=bool(zabbix_cfg["enabled"]),
                endpoint=zabbix_cfg["api_url"] if zabbix_cfg["api_url"] else None,
                configured=bool(zabbix_cfg["configured"]),
                source=zabbix_cfg["source"],
                details={
                    "timeout_seconds": zabbix_cfg["timeout_seconds"],
                    "api_token_configured": bool(zabbix_cfg["api_token"]),
                    "user": zabbix_cfg["user"],
                    "webhook_secret_configured": bool(s.ZABBIX_WEBHOOK_SECRET),
                },
            ),
            IntegrationStatusItem(
                name="telegram",
                enabled=bool(s.TELEGRAM_BOT_TOKEN),
                endpoint="api.telegram.org",
                configured=bool(s.TELEGRAM_BOT_TOKEN and s.TELEGRAM_DEFAULT_CHAT_ID),
                source="environment",
                details={
                    "default_chat_id": s.TELEGRAM_DEFAULT_CHAT_ID or None,
                    "bot_token_configured": bool(s.TELEGRAM_BOT_TOKEN),
                },
            ),
            IntegrationStatusItem(
                name="whatsapp",
                enabled=bool(whatsapp_cfg["enabled"]),
                endpoint=whatsapp_cfg["gateway_url"] if whatsapp_cfg["gateway_url"] else None,
                configured=bool(whatsapp_cfg["configured"]),
                source=whatsapp_cfg["source"],
                details={
                    "gateway_url": whatsapp_cfg["gateway_url"] or None,
                    "api_token_configured": bool(whatsapp_cfg["api_token"]),
                    "default_recipient": whatsapp_cfg["default_recipient"] or None,
                },
            ),
            IntegrationStatusItem(
                name="smtp",
                enabled=bool(smtp_cfg["configured"]),
                endpoint=f"{smtp_cfg['host']}:{smtp_cfg['port']}" if smtp_cfg["host"] else None,
                configured=bool(smtp_cfg["configured"]),
                source=smtp_cfg["source"],
                details={
                    "host": smtp_cfg["host"] or None,
                    "port": smtp_cfg["port"],
                    "tls": bool(smtp_cfg["tls"]),
                    "from_address": smtp_cfg["from_address"],
                    "user_configured": bool(smtp_cfg["user"]),
                    "default_recipient": smtp_cfg["default_recipient"] or None,
                },
            ),
            IntegrationStatusItem(
                name="webhook",
                enabled=bool(webhook_cfg["enabled"]),
                endpoint=webhook_cfg["url"] if webhook_cfg["url"] else None,
                configured=bool(webhook_cfg["configured"]),
                source=webhook_cfg["source"],
                details={"default_webhook_configured": bool(webhook_cfg["configured"])},
            ),
            IntegrationStatusItem(
                name="postgres",
                enabled=True,
                endpoint=f"{s.POSTGRES_HOST}:{s.POSTGRES_PORT}",
                configured=True,
                source="environment",
                details={"database": s.POSTGRES_DB, "pool_size": s.DB_POOL_SIZE},
            ),
            IntegrationStatusItem(
                name="redis",
                enabled=True,
                endpoint=f"{s.REDIS_HOST}:{s.REDIS_PORT}",
                configured=True,
                source="environment",
                details={"db": getattr(s, "REDIS_DB", 0), "host": s.REDIS_HOST, "port": s.REDIS_PORT},
            ),
        ]
        return IntegrationStatusResponse(
            integrations=items,
            environment=s.ENVIRONMENT,
        )

    async def test_glpi(self, req: GlpiTestRequest | None = None) -> GlpiTestResponse:
        """Autentica na API REST do GLPI, cria ticket efêmero e encerra com status SOLVED."""
        if req and req.base_url:
            base_url = req.base_url
            app_token = req.app_token
            user_token = req.user_token
        else:
            glpi_cfg = await self.dynamic_provider.get_glpi_config()
            base_url = (req and req.base_url) or glpi_cfg["base_url"]
            app_token = (req and req.app_token) or glpi_cfg["app_token"]
            user_token = (req and req.user_token) or glpi_cfg["user_token"]

        if not base_url or not app_token or not user_token:
            return GlpiTestResponse(
                success=False,
                latency_ms=0.0,
                message="Parâmetros de conexão do GLPI incompletos.",
                error="GLPI_BASE_URL, GLPI_APP_TOKEN ou GLPI_USER_TOKEN não configurados.",
            )

        start_time = time.perf_counter()
        try:
            async with GlpiClient(
                base_url=base_url,
                app_token=app_token,
                user_token=user_token,
                timeout=float(self.settings.GLPI_TIMEOUT_SECONDS),
            ) as client:
                ticket_payload = GlpiTicketCreate(
                    name="[InfraWatch] Diagnóstico Automático de Conectividade",
                    content="Teste assíncrono disparado pelo painel de Configurações.",
                    urgency=GlpiUrgency.LOW,
                    impact=GlpiImpact.LOW,
                )
                ticket_id = await client.open_ticket(ticket_payload)
                await client.close_ticket(ticket_id)

                elapsed_ms = round((time.perf_counter() - start_time) * 1000, 2)
                return GlpiTestResponse(
                    success=True,
                    latency_ms=elapsed_ms,
                    message="Integração GLPI validada: sessão iniciada, ticket criado e encerrado.",
                    session_token_obtained=True,
                    ticket_id=ticket_id,
                )
        except Exception as exc:  # noqa: BLE001
            elapsed_ms = round((time.perf_counter() - start_time) * 1000, 2)
            logger.warning("Falha no diagnóstico GLPI: %s", exc)
            return GlpiTestResponse(
                success=False,
                latency_ms=elapsed_ms,
                message="Falha de comunicação ou autenticação com a API REST do GLPI.",
                error=str(exc),
            )

    async def test_zabbix(self, req: ZabbixTestRequest | None = None) -> ZabbixTestResponse:
        """Consulta versão da API JSON-RPC 2.0 do Zabbix e lista quantidade de hosts."""
        if req and req.api_url:
            api_url = req.api_url
            api_token = req.api_token
            username = req.username or "Admin"
            password = req.password or "zabbix"
        else:
            zabbix_cfg = await self.dynamic_provider.get_zabbix_config()
            api_url = (req and req.api_url) or zabbix_cfg["api_url"]
            api_token = (req and req.api_token) or zabbix_cfg["api_token"]
            username = (req and req.username) or zabbix_cfg["user"] or "Admin"
            password = (req and req.password) or zabbix_cfg["password"] or "zabbix"

        if not api_url:
            return ZabbixTestResponse(
                success=False,
                latency_ms=0.0,
                message="ZABBIX_API_URL não configurada.",
                error="URL do endpoint JSON-RPC do Zabbix ausente.",
            )

        start_time = time.perf_counter()
        try:
            async with ZabbixClient(
                api_url=api_url,
                api_token=api_token,
                username=username,
                password=password,
                timeout=float(self.settings.ZABBIX_TIMEOUT_SECONDS),
            ) as client:
                version = await client.get_api_version()
                hosts = await client.get_hosts()
                elapsed_ms = round((time.perf_counter() - start_time) * 1000, 2)

                return ZabbixTestResponse(
                    success=True,
                    latency_ms=elapsed_ms,
                    message=f"Conexão com Zabbix Server v{version} validada com sucesso.",
                    api_version=str(version),
                    hosts_count=len(hosts),
                )
        except Exception as exc:  # noqa: BLE001
            elapsed_ms = round((time.perf_counter() - start_time) * 1000, 2)
            logger.warning("Falha no diagnóstico Zabbix: %s", exc)
            return ZabbixTestResponse(
                success=False,
                latency_ms=elapsed_ms,
                message="Falha ao conectar ou autenticar na API JSON-RPC do Zabbix.",
                error=str(exc),
            )

    async def test_notification(self, req: NotificationTestRequest) -> NotificationTestResponse:
        """Dispara alerta sintético via canal especificado."""
        channel_name = req.channel.lower()
        alert = AlertMessage(
            title=f"Teste de Notificação InfraWatch ({channel_name.upper()})",
            description="Verificação de integridade operacional disparada a partir do painel de Configurações.",
            severity=AlertSeverity(req.severity),
            device_id=uuid4(),
            device_name="cr01.luanda.rcsangola.co.ao",
            device_ip="10.200.0.1",
        )

        channel_map: dict[str, NotificationChannel] = {
            "telegram": TelegramChannel(),
            "whatsapp": WhatsAppChannel(),
            "smtp": SmtpNotificationChannel(),
            "webhook": WebhookChannel(),
        }

        channel = channel_map.get(channel_name)
        if not channel:
            return NotificationTestResponse(
                success=False,
                channel=channel_name,
                latency_ms=0.0,
                message="Canal de notificação desconhecido.",
                error=f"Canal '{channel_name}' não suportado.",
            )

        start_time = time.perf_counter()
        try:
            is_avail = await channel.is_available()
            if not is_avail:
                return NotificationTestResponse(
                    success=False,
                    channel=channel_name,
                    latency_ms=0.0,
                    message=f"Canal {channel_name.upper()} não está configurado ou desabilitado.",
                    error=f"Credenciais para {channel_name} ausentes no ambiente.",
                )

            delivered = await channel.send(alert, recipient=req.recipient)
            elapsed_ms = round((time.perf_counter() - start_time) * 1000, 2)

            return NotificationTestResponse(
                success=delivered,
                channel=channel_name,
                latency_ms=elapsed_ms,
                message=(
                    f"Alerta de teste entregue via {channel_name.upper()} com sucesso!"
                    if delivered
                    else f"Falha no envio do alerta via {channel_name.upper()}."
                ),
                error=None if delivered else "Provedor rejeitou a entrega da mensagem.",
            )
        except Exception as exc:  # noqa: BLE001
            elapsed_ms = round((time.perf_counter() - start_time) * 1000, 2)
            logger.warning("Falha no teste de notificação %s: %s", channel_name, exc)
            return NotificationTestResponse(
                success=False,
                channel=channel_name,
                latency_ms=elapsed_ms,
                message=f"Erro inesperado no canal {channel_name.upper()}.",
                error=str(exc),
            )

    async def test_infra(self) -> InfraTestResponse:
        """Testa conectividade e latência assíncrona com PostgreSQL/TimescaleDB e Redis."""
        # Teste PostgreSQL
        pg_ok = False
        pg_ms = 0.0
        start_pg = time.perf_counter()
        try:
            async with self.session_factory() as session:
                await session.execute(text("SELECT 1"))
                pg_ms = round((time.perf_counter() - start_pg) * 1000, 2)
                pg_ok = True
        except Exception as exc:  # noqa: BLE001
            pg_ms = round((time.perf_counter() - start_pg) * 1000, 2)
            logger.warning("Falha de ping no PostgreSQL: %s", exc)

        # Teste Redis
        redis_ok = False
        redis_ms = 0.0
        start_redis = time.perf_counter()
        try:
            r = await ensure_redis()
            if r is not None:
                await r.ping()
                redis_ms = round((time.perf_counter() - start_redis) * 1000, 2)
                redis_ok = True
        except Exception as exc:  # noqa: BLE001
            redis_ms = round((time.perf_counter() - start_redis) * 1000, 2)
            logger.warning("Falha de ping no Redis: %s", exc)

        all_ok = pg_ok and redis_ok
        msg = (
            "Cluster de infraestrutura 100% operacional (PostgreSQL e Redis conectados)."
            if all_ok
            else "Atenção: Um ou mais componentes do cluster apresentaram instabilidade."
        )

        return InfraTestResponse(
            postgres_ok=pg_ok,
            postgres_latency_ms=pg_ms,
            redis_ok=redis_ok,
            redis_latency_ms=redis_ms,
            message=msg,
        )


_tester_instance: IntegrationTesterService | None = None


def get_integration_tester_service() -> IntegrationTesterService:
    """Provedor singleton do serviço de diagnósticos de integração."""
    global _tester_instance
    if _tester_instance is None:
        _tester_instance = IntegrationTesterService()
    return _tester_instance
