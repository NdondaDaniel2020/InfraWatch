"""Provedor dinâmico de configurações com fallback para variáveis de ambiente e cache em memória.

Implementa a regra de precedência arquitetural:
PostgreSQL (Override via Banco de Dados) > .env / Docker Secrets (Padrão de Fábrica).
"""

from __future__ import annotations

import logging
import time
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from src.contexts.system.database.repository import SystemSettingsRepository
from src.core.config import Settings, get_settings
from src.core.database.session import get_session_factory

logger = logging.getLogger("infrawatch.system.dynamic_settings")

_DEFAULT_CACHE_TTL = 30.0  # 30 segundos


class DynamicSettingsProvider:
    """Resolve configurações corporativas consultando o banco de dados prioritariamente."""

    def __init__(
        self,
        session_factory: async_sessionmaker[AsyncSession] | None = None,
        settings: Settings | None = None,
        cache_ttl_seconds: float = _DEFAULT_CACHE_TTL,
    ) -> None:
        self._session_factory = session_factory or get_session_factory()
        self._settings = settings
        self._cache_ttl = cache_ttl_seconds
        self._cache: dict[str, dict[str, str]] = {}
        self._cache_timestamps: dict[str, float] = {}

    @property
    def settings(self) -> Settings:
        return self._settings or get_settings()

    def invalidate_cache(self, category: str | None = None) -> None:
        """Invalida o cache em memória de uma categoria específica ou de todas."""
        if category:
            self._cache.pop(category, None)
            self._cache_timestamps.pop(category, None)
        else:
            self._cache.clear()
            self._cache_timestamps.clear()

    async def _get_category_overrides(self, category: str) -> dict[str, str]:
        """Consulta overrides de uma categoria respeitando o cache em memória."""
        now = time.monotonic()
        if (
            category in self._cache
            and (now - self._cache_timestamps.get(category, 0)) < self._cache_ttl
        ):
            return self._cache[category]

        overrides: dict[str, str] = {}
        try:
            async with self._session_factory() as session:
                repo = SystemSettingsRepository(session)
                overrides = await repo.get_category_dict(category)
        except Exception as exc:
            logger.debug(
                "Banco indisponível para override de configurações (%s); utilizando fallback .env.",
                exc,
            )

        self._cache[category] = overrides
        self._cache_timestamps[category] = now
        return overrides

    async def get_glpi_config(self) -> dict[str, Any]:
        """Resolve a configuração efetiva do GLPI ITSM."""
        overrides = await self._get_category_overrides("glpi")
        s = self.settings

        has_override = bool(overrides)
        enabled_str = overrides.get("glpi.enabled")
        enabled = (enabled_str.lower() in ("true", "1", "yes")) if enabled_str is not None else bool(s.GLPI_ENABLED)

        base_url = overrides.get("glpi.base_url") or s.GLPI_BASE_URL
        app_token = overrides.get("glpi.app_token") or s.GLPI_APP_TOKEN
        user_token = overrides.get("glpi.user_token") or s.GLPI_USER_TOKEN

        timeout_str = overrides.get("glpi.timeout_seconds")
        timeout = float(timeout_str) if timeout_str else float(s.GLPI_TIMEOUT_SECONDS)

        return {
            "enabled": enabled,
            "base_url": base_url,
            "app_token": app_token,
            "user_token": user_token,
            "timeout_seconds": timeout,
            "configured": bool(base_url and app_token and user_token),
            "source": "database" if has_override else "environment",
        }

    async def get_zabbix_config(self) -> dict[str, Any]:
        """Resolve a configuração efetiva do Zabbix Server."""
        overrides = await self._get_category_overrides("zabbix")
        s = self.settings

        has_override = bool(overrides)
        enabled_str = overrides.get("zabbix.enabled")
        enabled = (enabled_str.lower() in ("true", "1", "yes")) if enabled_str is not None else bool(s.ZABBIX_ENABLED)

        api_url = overrides.get("zabbix.api_url") or s.ZABBIX_API_URL
        api_token = overrides.get("zabbix.api_token") or s.ZABBIX_API_TOKEN
        user = overrides.get("zabbix.user") or s.ZABBIX_USER
        password = overrides.get("zabbix.password") or s.ZABBIX_PASSWORD

        timeout_str = overrides.get("zabbix.timeout_seconds")
        timeout = float(timeout_str) if timeout_str else float(s.ZABBIX_TIMEOUT_SECONDS)

        return {
            "enabled": enabled,
            "api_url": api_url,
            "api_token": api_token,
            "user": user,
            "password": password,
            "timeout_seconds": timeout,
            "configured": bool(api_url and (api_token or (user and password))),
            "source": "database" if has_override else "environment",
        }

    async def get_whatsapp_config(self) -> dict[str, Any]:
        """Resolve a configuração efetiva do WhatsApp Gateway."""
        overrides = await self._get_category_overrides("whatsapp")
        s = self.settings

        has_override = bool(overrides)
        enabled_str = overrides.get("whatsapp.enabled")
        enabled = (enabled_str.lower() in ("true", "1", "yes")) if enabled_str is not None else bool(s.WHATSAPP_ENABLED)

        gateway_url = overrides.get("whatsapp.gateway_url") or s.WHATSAPP_GATEWAY_URL
        api_token = overrides.get("whatsapp.api_token") or s.WHATSAPP_API_TOKEN
        default_recipient = overrides.get("whatsapp.default_recipient") or s.WHATSAPP_DEFAULT_RECIPIENT

        return {
            "enabled": enabled,
            "gateway_url": gateway_url,
            "api_token": api_token,
            "default_recipient": default_recipient,
            "configured": bool(enabled and gateway_url),
            "source": "database" if has_override else "environment",
        }

    async def get_smtp_config(self) -> dict[str, Any]:
        """Resolve a configuração efetiva do servidor SMTP."""
        overrides = await self._get_category_overrides("smtp")
        s = self.settings

        has_override = bool(overrides)
        host = overrides.get("smtp.host") or s.SMTP_HOST
        port_str = overrides.get("smtp.port")
        port = int(port_str) if port_str else s.SMTP_PORT
        tls_str = overrides.get("smtp.tls")
        tls = (tls_str.lower() in ("true", "1", "yes")) if tls_str is not None else bool(s.SMTP_TLS)

        from_address = overrides.get("smtp.from") or s.SMTP_FROM
        user = overrides.get("smtp.user") or s.SMTP_USER
        password = overrides.get("smtp.password") or s.SMTP_PASSWORD
        default_recipient = overrides.get("smtp.default_recipient") or s.SMTP_DEFAULT_RECIPIENT

        return {
            "host": host,
            "port": port,
            "tls": tls,
            "from_address": from_address,
            "user": user,
            "password": password,
            "default_recipient": default_recipient,
            "configured": bool(host and from_address),
            "source": "database" if has_override else "environment",
        }

    async def get_webhook_config(self) -> dict[str, Any]:
        """Resolve a configuração efetiva do Webhook padrão."""
        overrides = await self._get_category_overrides("webhook")
        s = self.settings

        has_override = bool(overrides)
        enabled_str = overrides.get("webhook.enabled")
        url = overrides.get("webhook.url") or s.DEFAULT_WEBHOOK_URL
        enabled = (enabled_str.lower() in ("true", "1", "yes")) if enabled_str is not None else bool(url)

        return {
            "enabled": enabled,
            "url": url,
            "configured": bool(url),
            "source": "database" if has_override else "environment",
        }


_global_provider: DynamicSettingsProvider | None = None


def get_dynamic_settings_provider() -> DynamicSettingsProvider:
    """Singleton do provedor dinâmico de configurações."""
    global _global_provider
    if _global_provider is None:
        _global_provider = DynamicSettingsProvider()
    return _global_provider


__all__ = ["DynamicSettingsProvider", "get_dynamic_settings_provider"]
