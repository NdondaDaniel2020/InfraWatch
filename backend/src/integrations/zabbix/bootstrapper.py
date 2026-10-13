"""Serviço de auto-configuração e provisionamento idempotente do Webhook do Zabbix.

Executado de forma assíncrona e desacoplada no boot da aplicação InfraWatch (FastAPI lifespan),
garante que o Media Type do Webhook e a Action Geral de Alertas existam no Zabbix Server
sem necessidade de configuração manual via interface web (Zero-Touch Setup).
"""

from __future__ import annotations

import asyncio
import logging
from typing import Any

from src.core.config import get_settings
from src.integrations.zabbix.client import ZabbixClient

logger = logging.getLogger("infrawatch.integrations.zabbix.bootstrapper")

DEFAULT_MEDIA_TYPE_NAME = "InfraWatch Webhook"
DEFAULT_ACTION_NAME = "InfraWatch - Problem & Recovery Alerts"


class ZabbixWebhookBootstrapper:
    """Bootstrapper assíncrono idempotente para provisionamento do Webhook do InfraWatch no Zabbix."""

    def __init__(
        self,
        client: ZabbixClient | None = None,
        max_retries: int = 12,
        retry_delay: float = 5.0,
    ) -> None:
        self._custom_client = client
        self._max_retries = max_retries
        self._retry_delay = retry_delay

    def _get_client(self) -> ZabbixClient:
        """Instancia cliente Zabbix com configurações ativas se não injetado."""
        if self._custom_client:
            return self._custom_client

        settings = get_settings()
        return ZabbixClient(
            api_url=settings.ZABBIX_API_URL,
            api_token=settings.ZABBIX_API_TOKEN,
            username=settings.ZABBIX_USER,
            password=settings.ZABBIX_PASSWORD,
            timeout=settings.ZABBIX_TIMEOUT_SECONDS,
        )

    async def wait_for_zabbix_ready(
        self,
        client: ZabbixClient,
        stop_event: asyncio.Event | None = None,
    ) -> bool:
        """Aguarda com backoff que o Zabbix Web/API responda adequadamente ao healthcheck."""
        logger.info(
            "Verificando disponibilidade da API Zabbix (até %d tentativas a cada %.1fs)...",
            self._max_retries,
            self._retry_delay,
        )

        for attempt in range(1, self._max_retries + 1):
            if stop_event and stop_event.is_set():
                logger.info("Interrupção solicitada enquanto aguardava Zabbix.")
                return False

            try:
                version = await client.get_api_version()
                if version:
                    logger.info(
                        "Zabbix Server pronto na tentativa %d/%d (API Versão: %s)",
                        attempt,
                        self._max_retries,
                        version,
                    )
                    return True
            except Exception as exc:  # noqa: BLE001
                logger.debug(
                    "Zabbix ainda não respondeu na tentativa %d/%d: %s",
                    attempt,
                    self._max_retries,
                    exc,
                )

            if attempt < self._max_retries:
                try:
                    if stop_event:
                        await asyncio.wait_for(stop_event.wait(), timeout=self._retry_delay)
                        if stop_event.is_set():
                            return False
                    else:
                        await asyncio.sleep(self._retry_delay)
                except TimeoutError:
                    pass

        logger.warning(
            "Tempo limite esgotado (%ds) aguardando Zabbix Server. Auto-configuração adiada.",
            int(self._max_retries * self._retry_delay),
        )
        return False

    async def bootstrap_webhook_and_action(self, client: ZabbixClient) -> dict[str, Any]:
        """Executa de forma idempotente o provisionamento de Media Type, User Media e Action."""
        settings = get_settings()
        webhook_url = getattr(
            settings,
            "ZABBIX_INTERNAL_WEBHOOK_URL",
            "http://infrawatch-api:8000/api/v1/integrations/zabbix/webhook",
        )
        webhook_secret = settings.ZABBIX_WEBHOOK_SECRET

        # 1. Media Type: Verifica existência ou provisiona
        media_type = await client.get_media_type_by_name(DEFAULT_MEDIA_TYPE_NAME)
        if media_type and "mediatypeid" in media_type:
            mediatype_id = str(media_type["mediatypeid"])
            logger.info(
                "Media Type '%s' já existente no Zabbix (ID: %s). Provisionamento ignorado.",
                DEFAULT_MEDIA_TYPE_NAME,
                mediatype_id,
            )
        else:
            logger.info("Criando Media Type Webhook '%s' no Zabbix...", DEFAULT_MEDIA_TYPE_NAME)
            mediatype_id = await client.create_webhook_media_type(
                name=DEFAULT_MEDIA_TYPE_NAME,
                webhook_url=webhook_url,
                secret_token=webhook_secret,
            )

        # 2. Usuário: Garante que o usuário Admin possui o Media Type vinculado
        admin_user = settings.ZABBIX_USER or "Admin"
        user_info = await client.get_user_by_username(admin_user)
        user_id = str(user_info["userid"]) if user_info and "userid" in user_info else "1"

        bound = await client.bind_media_type_to_user(admin_user, mediatype_id)
        if bound:
            logger.info(
                "Media Type %s vinculado com sucesso ao usuário '%s' (ID: %s)",
                mediatype_id,
                admin_user,
                user_id,
            )

        # 3. Action Geral: Verifica existência ou provisiona
        action = await client.get_action_by_name(DEFAULT_ACTION_NAME)
        if action and "actionid" in action:
            action_id = str(action["actionid"])
            logger.info(
                "Trigger Action '%s' já existente no Zabbix (ID: %s). Provisionamento ignorado.",
                DEFAULT_ACTION_NAME,
                action_id,
            )
        else:
            logger.info(
                "Criando Trigger Action '%s' para envio de alertas ao InfraWatch...",
                DEFAULT_ACTION_NAME,
            )
            action_id = await client.create_trigger_action(
                name=DEFAULT_ACTION_NAME,
                mediatype_id=mediatype_id,
                user_id=user_id,
            )

        return {
            "status": "ok",
            "mediatype_id": mediatype_id,
            "action_id": action_id,
            "user_id": user_id,
        }

    async def run_bootstrap_task(self, stop_event: asyncio.Event | None = None) -> bool:
        """Ponto de entrada assíncrono para execução em background durante o lifespan."""
        settings = get_settings()
        if not getattr(settings, "ZABBIX_ENABLED", False):
            logger.debug("Integração Zabbix desabilitada (ZABBIX_ENABLED=False). Bootstrapper no-op.")
            return False

        if not getattr(settings, "ZABBIX_AUTOCONFIGURE_WEBHOOK", True):
            logger.debug(
                "Auto-configuração de Webhook do Zabbix desabilitada (ZABBIX_AUTOCONFIGURE_WEBHOOK=False)."
            )
            return False

        client = self._get_client()
        try:
            async with client:
                ready = await self.wait_for_zabbix_ready(client, stop_event=stop_event)
                if not ready:
                    return False

                result = await self.bootstrap_webhook_and_action(client)
                logger.info(
                    "Auto-configuração do Zabbix concluída com sucesso: Media Type ID=%s, Action ID=%s",
                    result.get("mediatype_id"),
                    result.get("action_id"),
                )
                return True
        except asyncio.CancelledError:
            logger.info("Tarefa de auto-configuração do Zabbix cancelada.")
            return False
        except Exception:
            logger.exception("Falha inesperada durante auto-configuração do Webhook do Zabbix")
            return False


def get_zabbix_bootstrapper(
    client: ZabbixClient | None = None,
) -> ZabbixWebhookBootstrapper:
    """Factory helper para instanciar o ZabbixWebhookBootstrapper."""
    return ZabbixWebhookBootstrapper(client=client)
