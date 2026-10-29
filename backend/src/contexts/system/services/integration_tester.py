"""Serviço de teste e diagnóstico in-process de integrações corporativas (Issue #268)."""

from __future__ import annotations

import logging
import time
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
    SmtpNotificationChannel,
    TelegramChannel,
    WebhookChannel,
    WhatsAppChannel,
)
from src.integrations.zabbix import ZabbixClient

logger = logging.getLogger("infrawatch.system.integration_tester")


class IntegrationTesterService:
    """Executa diagnósticos diretos em memória utilizando os clientes nativos do InfraWatch."""

    def __init__(self) -> None:
        self.settings = get_settings()
        self.session_factory = get_session_factory()

    def get_status(self) -> IntegrationStatusResponse:
        """Gera sumário do estado operacional de todas as integrações sem vazar segredos."""
        s = self.settings
        items: list[IntegrationStatusItem] = [
            IntegrationStatusItem(
                name="glpi",
                enabled=bool(s.GLPI_ENABLED),
                endpoint=s.GLPI_BASE_URL if s.GLPI_BASE_URL else None,
                configured=bool(s.GLPI_APP_TOKEN and s.GLPI_USER_TOKEN),
                details={
                    "timeout_seconds": s.GLPI_TIMEOUT_SECONDS,
                    "app_token_configured": bool(s.GLPI_APP_TOKEN),
                    "user_token_configured": bool(s.GLPI_USER_TOKEN),
                },
            ),
            IntegrationStatusItem(
                name="zabbix",
                enabled=bool(s.ZABBIX_ENABLED),
                endpoint=s.ZABBIX_API_URL if s.ZABBIX_API_URL else None,
                configured=bool(s.ZABBIX_API_TOKEN or (s.ZABBIX_USER and s.ZABBIX_PASSWORD)),
                details={
                    "timeout_seconds": s.ZABBIX_TIMEOUT_SECONDS,
                    "api_token_configured": bool(s.ZABBIX_API_TOKEN),
                    "user": s.ZABBIX_USER,
                    "webhook_secret_configured": bool(s.ZABBIX_WEBHOOK_SECRET),
                },
            ),
            IntegrationStatusItem(
                name="telegram",
                enabled=bool(s.TELEGRAM_BOT_TOKEN),
                endpoint="api.telegram.org",
                configured=bool(s.TELEGRAM_BOT_TOKEN and s.TELEGRAM_DEFAULT_CHAT_ID),
                details={
                    "default_chat_id": s.TELEGRAM_DEFAULT_CHAT_ID or None,
                    "bot_token_configured": bool(s.TELEGRAM_BOT_TOKEN),
                },
            ),
            IntegrationStatusItem(
                name="whatsapp",
                enabled=bool(s.WHATSAPP_ENABLED),
                endpoint=s.WHATSAPP_GATEWAY_URL if s.WHATSAPP_GATEWAY_URL else None,
                configured=bool(s.WHATSAPP_ENABLED and s.WHATSAPP_GATEWAY_URL),
                details={
                    "gateway_url": s.WHATSAPP_GATEWAY_URL or None,
                    "api_token_configured": bool(s.WHATSAPP_API_TOKEN),
                    "default_recipient": s.WHATSAPP_DEFAULT_RECIPIENT or None,
                },
            ),
            IntegrationStatusItem(
                name="smtp",
                enabled=bool(s.SMTP_HOST),
                endpoint=f"{s.SMTP_HOST}:{s.SMTP_PORT}" if s.SMTP_HOST else None,
                configured=bool(s.SMTP_HOST and s.SMTP_FROM),
                details={
                    "host": s.SMTP_HOST or None,
                    "port": s.SMTP_PORT,
                    "tls": bool(s.SMTP_TLS),
                    "from_address": s.SMTP_FROM,
                    "user_configured": bool(s.SMTP_USER),
                    "default_recipient": s.SMTP_DEFAULT_RECIPIENT or None,
                },
            ),
            IntegrationStatusItem(
                name="webhook",
                enabled=bool(s.DEFAULT_WEBHOOK_URL),
                endpoint=s.DEFAULT_WEBHOOK_URL if s.DEFAULT_WEBHOOK_URL else None,
                configured=bool(s.DEFAULT_WEBHOOK_URL),
                details={"default_webhook_configured": bool(s.DEFAULT_WEBHOOK_URL)},
            ),
            IntegrationStatusItem(
                name="postgres",
                enabled=True,
                endpoint=f"{s.POSTGRES_HOST}:{s.POSTGRES_PORT}",
                configured=True,
                details={"database": s.POSTGRES_DB, "pool_size": s.DB_POOL_SIZE},
            ),
            IntegrationStatusItem(
                name="redis",
                enabled=True,
                endpoint=f"{s.REDIS_HOST}:{s.REDIS_PORT}",
                configured=True,
                details={"db": s.REDIS_DB},
            ),
        ]
        return IntegrationStatusResponse(
            integrations=items,
            environment=s.ENVIRONMENT,
        )

    async def test_glpi(self, req: GlpiTestRequest | None = None) -> GlpiTestResponse:
        """Autentica na API REST do GLPI, cria ticket efêmero e encerra com status SOLVED."""
        base_url = (req and req.base_url) or self.settings.GLPI_BASE_URL
        app_token = (req and req.app_token) or self.settings.GLPI_APP_TOKEN
        user_token = (req and req.user_token) or self.settings.GLPI_USER_TOKEN

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
        api_url = (req and req.api_url) or self.settings.ZABBIX_API_URL
        api_token = (req and req.api_token) or self.settings.ZABBIX_API_TOKEN or None
        username = (req and req.username) or self.settings.ZABBIX_USER or "Admin"
        password = (req and req.password) or self.settings.ZABBIX_PASSWORD or "zabbix"

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

        channel_map = {
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
