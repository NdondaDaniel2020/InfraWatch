"""Worker assíncrono para integração corporativa (Notificações Multicanal e GLPI ITSM).

Consome eventos de incidentes via Redis Streams e despacha:
1. Notificações multicanal (Telegram, WhatsApp, Email, Webhook) via AlertNotificationConsumer.
2. Abertura automática de chamados no GLPI ITSM via GlpiTicketConsumer (quando GLPI_ENABLED=True).
"""

from __future__ import annotations

import asyncio
import logging
import signal

from src.contexts.alerting.consumers.alert_notification_consumer import (
    AlertNotificationConsumer,
)
from src.contexts.alerting.consumers.glpi_ticket_consumer import GlpiTicketConsumer
from src.core.config import get_settings
from src.core.messaging.resilient_bus import ResilientEventBus
from src.core.observability.logging import setup_logging

logger = logging.getLogger("infrawatch.workers.integration")


class IntegrationWorker:
    """Orquestrador assíncrono de consumidores de integração em background."""

    def __init__(
        self,
        event_bus: ResilientEventBus | None = None,
        notification_consumer: AlertNotificationConsumer | None = None,
        glpi_consumer: GlpiTicketConsumer | None = None,
    ) -> None:
        self._settings = get_settings()
        self._event_bus = event_bus or ResilientEventBus()
        self._stop_event = asyncio.Event()

        self._notification_consumer = notification_consumer or AlertNotificationConsumer(
            event_bus=self._event_bus,
            consumer_name="integration-notification-consumer",
        )

        if glpi_consumer is not None:
            self._glpi_consumer: GlpiTicketConsumer | None = glpi_consumer
        elif (
            self._settings.GLPI_ENABLED
            and bool(self._settings.GLPI_APP_TOKEN)
            and bool(self._settings.GLPI_USER_TOKEN)
        ):
            self._glpi_consumer = GlpiTicketConsumer(
                event_bus=self._event_bus,
                glpi_base_url=self._settings.GLPI_BASE_URL,
                glpi_app_token=self._settings.GLPI_APP_TOKEN,
                glpi_user_token=self._settings.GLPI_USER_TOKEN,
                consumer_name="integration-glpi-consumer",
            )
        else:
            self._glpi_consumer = None

    @property
    def is_glpi_enabled(self) -> bool:
        """Indica se o consumer GLPI está ativo."""
        return self._glpi_consumer is not None

    def stop(self) -> None:
        """Sinaliza encerramento gracioso para todos os consumidores."""
        logger.info("Sinalizando encerramento gracioso do IntegrationWorker...")
        self._stop_event.set()

    async def run(self) -> None:
        """Executa os loops de consumo em paralelo até receber sinal de parada."""
        logger.info("Iniciando IntegrationWorker...")
        tasks: list[asyncio.Task[None]] = []

        notif_task = asyncio.create_task(
            self._notification_consumer.consume_loop(self._stop_event),
            name="alert-notification-consumer-loop",
        )
        tasks.append(notif_task)

        if self._glpi_consumer is not None:
            logger.info("Iniciando GlpiTicketConsumer (integração GLPI ativa)...")
            glpi_task = asyncio.create_task(
                self._glpi_consumer.consume_loop(self._stop_event),
                name="glpi-ticket-consumer-loop",
            )
            tasks.append(glpi_task)
        else:
            logger.info(
                "Integração GLPI desabilitada ou sem tokens configurados. GlpiTicketConsumer não iniciado."
            )

        try:
            await asyncio.gather(*tasks)
        except asyncio.CancelledError:
            logger.info("Tarefas do IntegrationWorker canceladas.")
        finally:
            self.stop()
            for t in tasks:
                if not t.done():
                    t.cancel()
            await asyncio.gather(*tasks, return_exceptions=True)
            await self._event_bus.close()
            logger.info("IntegrationWorker finalizado com sucesso.")


async def main() -> None:
    """Ponto de entrada para execução via CLI ou Docker container."""
    setup_logging()
    worker = IntegrationWorker()

    loop = asyncio.get_running_loop()

    def handle_signal() -> None:
        logger.info("Sinal de término recebido pelo processo.")
        worker.stop()

    for sig in (signal.SIGINT, signal.SIGTERM):
        try:
            loop.add_signal_handler(sig, handle_signal)
        except NotImplementedError:
            pass

    await worker.run()


if __name__ == "__main__":
    asyncio.run(main())
