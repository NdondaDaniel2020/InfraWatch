"""Despachante central de notificações multicanal com roteamento por severidade."""

from __future__ import annotations

import asyncio
import logging
from collections.abc import Sequence
from typing import Any

from src.integrations.notifications.interfaces import (
    AlertMessage,
    AlertSeverity,
    NotificationChannel,
)

logger = logging.getLogger("infrawatch.notifications.dispatcher")

DEFAULT_SEVERITY_ROUTING: dict[AlertSeverity, list[str]] = {
    AlertSeverity.CRITICAL: ["telegram", "whatsapp", "webhook", "smtp"],
    AlertSeverity.DEGRADED: ["telegram", "webhook", "whatsapp"],
    AlertSeverity.RESOLVED: ["telegram", "webhook", "smtp"],
    AlertSeverity.INFO: ["telegram", "webhook"],
}


class NotificationDispatcher:
    """Gerencia e despacha alertas concorrentemente para múltiplos canais."""

    def __init__(
        self,
        channels: Sequence[NotificationChannel] | None = None,
        severity_routing: dict[AlertSeverity, list[str]] | None = None,
        max_retries: int = 2,
        retry_delay_seconds: float = 0.5,
        backoff_factor: float = 2.0,
    ) -> None:
        self._channels: dict[str, NotificationChannel] = {}
        self._routing = severity_routing or DEFAULT_SEVERITY_ROUTING
        self.max_retries = max(0, max_retries)
        self.retry_delay_seconds = max(0.0, retry_delay_seconds)
        self.backoff_factor = max(1.0, backoff_factor)

        if channels:
            for ch in channels:
                self.register_channel(ch)

    def register_channel(self, channel: NotificationChannel) -> None:
        """Registra um canal de notificação."""
        self._channels[channel.name] = channel
        logger.debug("Canal de notificação registrado: %s", channel.name)

    def get_channel(self, name: str) -> NotificationChannel | None:
        """Recupera um canal registrado pelo nome."""
        return self._channels.get(name)

    @property
    def registered_channels(self) -> list[str]:
        """Lista os nomes de todos os canais registrados."""
        return list(self._channels.keys())

    def get_target_channels_for_severity(self, severity: AlertSeverity) -> list[str]:
        """Retorna os canais configurados para a severidade fornecida."""
        return self._routing.get(severity, ["webhook"])

    async def _dispatch_single_channel(
        self,
        channel: NotificationChannel,
        alert: AlertMessage,
        recipient: str | None,
    ) -> tuple[str, bool]:
        """Executa o envio isolado para um único canal com retentativas e tratamento defensivo."""
        try:
            if not await channel.is_available():
                logger.debug(
                    "Canal '%s' não está disponível/configurado. Envio ignorado.",
                    channel.name,
                )
                return channel.name, False
        except Exception:
            logger.exception("Falha ao verificar disponibilidade do canal '%s'", channel.name)
            return channel.name, False

        delay = self.retry_delay_seconds
        total_attempts = self.max_retries + 1

        for attempt in range(1, total_attempts + 1):
            try:
                success = await channel.send(alert, recipient=recipient)
                if success:
                    return channel.name, True

                if attempt < total_attempts:
                    logger.warning(
                        "Tentativa %d/%d de envio no canal '%s' retornou False. Retentando em %.2fs...",
                        attempt,
                        total_attempts,
                        channel.name,
                        delay,
                    )
                    await asyncio.sleep(delay)
                    delay *= self.backoff_factor
                else:
                    logger.error(
                        "Todas as %d tentativas de envio no canal '%s' falharam (retorno False).",
                        total_attempts,
                        channel.name,
                    )
            except Exception as exc:
                if attempt < total_attempts:
                    logger.warning(
                        "Tentativa %d/%d no canal '%s' gerou exceção (%s). Retentando em %.2fs...",
                        attempt,
                        total_attempts,
                        channel.name,
                        exc,
                        delay,
                    )
                    await asyncio.sleep(delay)
                    delay *= self.backoff_factor
                else:
                    logger.exception(
                        "Todas as %d tentativas de envio no canal '%s' falharam por exceção não tratada.",
                        total_attempts,
                        channel.name,
                    )

        return channel.name, False

    async def dispatch(
        self,
        alert: AlertMessage,
        channels: Sequence[str] | None = None,
        recipients: dict[str, str] | None = None,
    ) -> dict[str, bool]:
        """Despacha concorrentemente o alerta para a lista de canais especificada ou roteada."""
        recipients = recipients or {}
        channel_names = (
            list(channels)
            if channels is not None
            else self.get_target_channels_for_severity(alert.severity)
        )

        active_tasks: list[Any] = []
        target_channel_objects: list[NotificationChannel] = []

        for name in channel_names:
            ch = self._channels.get(name)
            if ch is not None:
                target_channel_objects.append(ch)
                active_tasks.append(
                    self._dispatch_single_channel(
                        channel=ch,
                        alert=alert,
                        recipient=recipients.get(name),
                    )
                )
            else:
                logger.warning(
                    "Canal '%s' solicitado para envio, mas não está registrado no Dispatcher.",
                    name,
                )

        if not active_tasks:
            logger.info("Nenhum canal ativo ou registrado para despacho do alerta '%s'", alert.title)
            return {}

        results: Sequence[Any] = await asyncio.gather(
            *active_tasks, return_exceptions=True
        )

        dispatch_status: dict[str, bool] = {}
        for idx, result in enumerate(results):
            if isinstance(result, tuple):
                ch_name, is_success = result
                dispatch_status[ch_name] = is_success
            else:
                ch_name = target_channel_objects[idx].name
                logger.error("Falha inesperada no canal '%s': %s", ch_name, result)
                dispatch_status[ch_name] = False

        return dispatch_status

    async def dispatch_by_severity(
        self,
        alert: AlertMessage,
        recipients: dict[str, str] | None = None,
    ) -> dict[str, bool]:
        """Atalho semântico para despacho estritamente baseado na severidade do alerta."""
        return await self.dispatch(alert, channels=None, recipients=recipients)
