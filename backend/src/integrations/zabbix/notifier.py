"""Notificador de eventos para Zabbix (startup heartbeat, etc.)."""

import logging

from src.core.config import get_settings
from src.core.infrastructure.redis import get_redis_client
from src.integrations.zabbix.client import ZabbixClient

logger = logging.getLogger("infrawatch.integrations.zabbix.notifier")


class ZabbixNotifier:
    """Encapsula notificações assíncronas para o Zabbix."""

    def __init__(self) -> None:
        settings = get_settings()
        self.enabled = getattr(settings, "ZABBIX_ENABLED", False) and getattr(settings, "ZABBIX_NOTIFY_STARTUP", False)
        self.api_url = getattr(settings, "ZABBIX_API_URL", "")
        self.api_token = getattr(settings, "ZABBIX_API_TOKEN", "")
        self.username = getattr(settings, "ZABBIX_USER", "")
        self.password = getattr(settings, "ZABBIX_PASSWORD", "")
        self.timeout = getattr(settings, "ZABBIX_TIMEOUT_SECONDS", 10.0)

    async def _acquire_startup_lock(self) -> bool:
        """Adquire lock Redis com TTL 24h para evitar spam de heartbeats."""
        if not self.enabled:
            return False

        try:
            redis_client = get_redis_client()
            acquired = await redis_client.set(
                "infrawatch:zabbix:startup_heartbeat_sent", "1", nx=True, ex=86400
            )
            return bool(acquired)
        except Exception:  # noqa: BLE001
            logger.debug("Redis indisponível para lock de startup Zabbix; prosseguindo.")
            return True  # Fail-open

    async def notify_startup(self) -> None:
        """Emite heartbeat de startup no Zabbix (fire-and-forget)."""
        if not self.enabled:
            return

        if get_settings().ENVIRONMENT == "test":
            return

        if not self.api_token and not (self.username and self.password):
            logger.debug("Credenciais/Token do Zabbix não configurados. Notificação ignorada.")
            return

        acquired = await self._acquire_startup_lock()
        if not acquired:
            logger.debug("Heartbeat de inicialização Zabbix já emitido nas últimas 24h (Redis debounce).")
            return

        try:
            async with ZabbixClient(
                api_url=self.api_url,
                api_token=self.api_token or None,
                username=self.username or None,
                password=self.password or None,
                timeout=self.timeout,
            ) as zabbix:
                settings = get_settings()
                app_name = getattr(settings, "PROJECT_NAME", getattr(settings, "APP_NAME", "InfraWatch"))
                app_version = getattr(settings, "APP_VERSION", "0.1.0")
                result = await zabbix.send_startup_heartbeat(
                    app_name=app_name,
                    version=app_version,
                    environment=settings.ENVIRONMENT,
                )
                logger.info(
                    "Notificação de inicialização registrada no Zabbix (v%s, %d hosts)",
                    result.get("api_version", "unknown"),
                    result.get("hosts_count", 0),
                )
        except Exception as exc:  # noqa: BLE001
            logger.warning("Falha ao notificar Zabbix no startup: %s", exc)


# Singleton
_zabbix_notifier: ZabbixNotifier | None = None


def get_zabbix_notifier() -> ZabbixNotifier:
    """Retorna instância singleton do ZabbixNotifier."""
    global _zabbix_notifier
    if _zabbix_notifier is None:
        _zabbix_notifier = ZabbixNotifier()
    return _zabbix_notifier


def reset_zabbix_notifier() -> None:
    """Reseta o singleton do ZabbixNotifier (apenas para testes)."""
    global _zabbix_notifier
    _zabbix_notifier = None