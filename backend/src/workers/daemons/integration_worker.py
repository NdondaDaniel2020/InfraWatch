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
from src.contexts.iam.consumers.iam_email_consumer import IamEmailConsumer
from src.contexts.system.services.dynamic_settings_provider import (
    DynamicSettingsProvider,
    get_dynamic_settings_provider,
)
from src.core.config import get_settings
from src.core.messaging.resilient_bus import ResilientEventBus
from src.core.messaging.topics import StreamTopics
from src.core.observability.logging import setup_logging

logger = logging.getLogger("infrawatch.workers.integration")


class IntegrationWorker:
    """Orquestrador assíncrono de consumidores de integração em background."""

    def __init__(
        self,
        event_bus: ResilientEventBus | None = None,
        notification_consumer: AlertNotificationConsumer | None = None,
        glpi_consumer: GlpiTicketConsumer | None = None,
        email_consumer: IamEmailConsumer | None = None,
        dynamic_provider: DynamicSettingsProvider | None = None,
    ) -> None:
        self._settings = get_settings()
        self._dynamic_provider = dynamic_provider or get_dynamic_settings_provider()
        self._event_bus = event_bus or ResilientEventBus()
        self._stop_event = asyncio.Event()
        self._glpi_task: asyncio.Task[None] | None = None

        self._notification_consumer = notification_consumer or AlertNotificationConsumer(
            event_bus=self._event_bus,
            consumer_name="integration-notification-consumer",
        )

        self._email_consumer = email_consumer or IamEmailConsumer(
            event_bus=self._event_bus,
            consumer_name="integration-email-consumer",
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

    async def _apply_glpi_settings(self) -> None:
        """Resolve a configuração ativa do GLPI via DynamicSettingsProvider."""
        try:
            cfg = await self._dynamic_provider.get_glpi_config()
            if cfg.get("enabled") and cfg.get("configured"):
                if self._glpi_consumer is None:
                    logger.info("Instanciando GlpiTicketConsumer dinamicamente com parâmetros ativos...")
                    self._glpi_consumer = GlpiTicketConsumer(
                        event_bus=self._event_bus,
                        glpi_base_url=cfg["base_url"],
                        glpi_app_token=cfg["app_token"],
                        glpi_user_token=cfg["user_token"],
                        consumer_name="integration-glpi-consumer",
                    )
                else:
                    self._glpi_consumer.update_credentials(
                        base_url=cfg["base_url"],
                        app_token=cfg["app_token"],
                        user_token=cfg["user_token"],
                    )
        except Exception as exc:
            logger.warning("Falha ao resolver configurações dinâmicas do GLPI: %s", exc)

    async def _settings_listener_loop(self) -> None:
        """Monitora alterações de configurações corporativas via Redis Stream."""
        topic = StreamTopics.SYSTEM_SETTINGS_CHANGED
        group = "cg:integration_worker_settings"
        consumer_name = f"integration-settings-{id(self)}"

        while not self._stop_event.is_set():
            try:
                messages = await self._event_bus.consume_batch(
                    topic=topic,
                    group=group,
                    consumer_name=consumer_name,
                    batch_size=10,
                    timeout_ms=2000,
                )
                if not messages:
                    continue

                acked_ids: list[str] = []
                for msg_id, payload in messages:
                    acked_ids.append(msg_id)
                    cat = payload.get("category", "")
                    if cat in ("glpi", ""):
                        self._dynamic_provider.invalidate_cache("glpi")
                        await self._apply_glpi_settings()
                        if (
                            self._glpi_consumer is not None
                            and not self._stop_event.is_set()
                            and (self._glpi_task is None or self._glpi_task.done())
                        ):
                            logger.info("Iniciando loop do GlpiTicketConsumer após ativação dinâmica...")
                            self._glpi_task = asyncio.create_task(
                                self._glpi_consumer.consume_loop(self._stop_event),
                                name="glpi-ticket-consumer-loop",
                            )

                if acked_ids:
                    await self._event_bus.ack(topic, group, *acked_ids)
            except asyncio.CancelledError:
                break
            except Exception:
                logger.warning("Falha temporária ao ler stream de configurações do sistema; aguardando...")
                await asyncio.sleep(2.0)

    def stop(self) -> None:
        """Sinaliza encerramento gracioso para todos os consumidores."""
        logger.info("Sinalizando encerramento gracioso do IntegrationWorker...")
        self._stop_event.set()

    async def run(self) -> None:
        """Executa os loops de consumo em paralelo até receber sinal de parada."""
        logger.info("Iniciando IntegrationWorker...")
        tasks: list[asyncio.Task[None]] = []

        await self._apply_glpi_settings()

        notif_task = asyncio.create_task(
            self._notification_consumer.consume_loop(self._stop_event),
            name="alert-notification-consumer-loop",
        )
        tasks.append(notif_task)

        email_task = asyncio.create_task(
            self._email_consumer.consume_loop(self._stop_event),
            name="iam-email-consumer-loop",
        )
        tasks.append(email_task)

        if self._glpi_consumer is not None and (self._glpi_task is None or self._glpi_task.done()):
            logger.info("Iniciando GlpiTicketConsumer (integração GLPI ativa)...")
            self._glpi_task = asyncio.create_task(
                self._glpi_consumer.consume_loop(self._stop_event),
                name="glpi-ticket-consumer-loop",
            )
            tasks.append(self._glpi_task)
        elif self._glpi_task is not None and not self._glpi_task.done():
            tasks.append(self._glpi_task)
        else:
            logger.info(
                "Integração GLPI desabilitada ou sem tokens configurados. GlpiTicketConsumer não iniciado."
            )

        settings_watcher_task = asyncio.create_task(
            self._settings_listener_loop(),
            name="integration-settings-watcher-loop",
        )
        tasks.append(settings_watcher_task)

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
