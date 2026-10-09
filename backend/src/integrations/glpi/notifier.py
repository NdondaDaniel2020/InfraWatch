"""Notificador de eventos para GLPI (startup heartbeat, etc.)."""

import logging
from datetime import UTC, datetime

from src.core.config import get_settings
from src.core.infrastructure.redis import get_redis_client
from src.integrations.glpi.client import GlpiClient
from src.integrations.glpi.schemas import (
    GlpiImpact,
    GlpiPriority,
    GlpiTicketCreate,
    GlpiUrgency,
)
from src.integrations.glpi.templates import render_glpi_template

logger = logging.getLogger("infrawatch.integrations.glpi.notifier")


class GlpiNotifier:
    """Encapsula notificações assíncronas para o GLPI."""

    def __init__(self) -> None:
        settings = get_settings()
        self.enabled = getattr(settings, "GLPI_ENABLED", False) and getattr(settings, "GLPI_NOTIFY_STARTUP", False)
        self.app_token = getattr(settings, "GLPI_APP_TOKEN", "")
        self.user_token = getattr(settings, "GLPI_USER_TOKEN", "")
        self.base_url = getattr(settings, "GLPI_BASE_URL", "")
        self.timeout = getattr(settings, "GLPI_TIMEOUT_SECONDS", 10.0)

    async def _acquire_startup_lock(self) -> bool:
        """Adquire lock Redis com TTL 24h para evitar spam de tickets."""
        if not self.enabled:
            return False

        try:
            redis_client = get_redis_client()
            acquired = await redis_client.set(
                "infrawatch:glpi:startup_heartbeat_sent", "1", nx=True, ex=86400
            )
            return bool(acquired)
        except Exception:  # noqa: BLE001
            logger.debug("Redis indisponível para lock de startup GLPI; prosseguindo.")
            return True  # Fail-open: permite notificação se Redis cair

    async def notify_startup(self) -> None:
        """Emite ticket de heartbeat informativo no GLPI (fire-and-forget)."""
        if not self.enabled:
            return

        if get_settings().ENVIRONMENT == "test":
            return

        if not self.app_token or not self.user_token:
            logger.debug("Tokens do GLPI não configurados. Notificação ignorada.")
            return

        acquired = await self._acquire_startup_lock()
        if not acquired:
            logger.debug("Ticket de inicialização já emitido nas últimas 24h (Redis debounce).")
            return

        try:
            async with GlpiClient(
                base_url=self.base_url,
                app_token=self.app_token,
                user_token=self.user_token,
                timeout=self.timeout,
            ) as glpi:
                now_str = datetime.now(UTC).strftime("%d/%m/%Y às %H:%M:%S UTC")
                settings = get_settings()
                ticket_content = render_glpi_template(
                    "startup_heartbeat.html",
                    app_name=settings.APP_NAME,
                    app_version=getattr(settings, "APP_VERSION", "0.1.0"),
                    environment=settings.ENVIRONMENT,
                    started_at=now_str,
                )
                ticket_payload = GlpiTicketCreate(
                    name=f"🟢 [InfraWatch] Motor de Monitoramento no Ar — {settings.APP_NAME}",
                    content=ticket_content,
                    urgency=GlpiUrgency.VERY_LOW,
                    impact=GlpiImpact.VERY_LOW,
                    priority=GlpiPriority.VERY_LOW,
                )
                ticket_id = await glpi.open_ticket(ticket_payload)
                logger.info("Ticket de inicialização criado no GLPI (#%d)", ticket_id)
        except Exception as exc:  # noqa: BLE001
            logger.warning("Falha ao notificar GLPI no startup: %s", exc)


# Singleton
_glpi_notifier: GlpiNotifier | None = None


def get_glpi_notifier() -> GlpiNotifier:
    """Retorna instância singleton do GlpiNotifier."""
    global _glpi_notifier
    if _glpi_notifier is None:
        _glpi_notifier = GlpiNotifier()
    return _glpi_notifier


def reset_glpi_notifier() -> None:
    """Reseta o singleton do GlpiNotifier (apenas para testes)."""
    global _glpi_notifier
    _glpi_notifier = None