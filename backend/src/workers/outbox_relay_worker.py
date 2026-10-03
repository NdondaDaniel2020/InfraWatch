"""Worker assíncrono de Transactional Outbox Relay para o InfraWatch.

Responsável por ler eventos pendentes na tabela outbox_events com concorrência segura
(FOR UPDATE SKIP LOCKED), despachar para o barramento de eventos (Redis Streams/Bus)
e atualizar os estados de entrega (At-Least-Once Delivery).
"""

import asyncio
import logging
from collections.abc import Awaitable, Callable
from typing import Any, Protocol

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from src.core.database.outbox_repository import OutboxRepository
from src.core.database.session import get_session_factory
from src.core.messaging.resilient_bus import ResilientEventBus

logger = logging.getLogger(__name__)


class EventPublisher(Protocol):
    """Protocolo abstrato para publicação de eventos no barramento."""

    async def publish(self, event_type: str, payload: dict[str, Any]) -> None:
        """Publica o evento com seu payload no canal ou stream correspondente."""
        ...


PublishCallback = Callable[[str, dict[str, Any]], Awaitable[None]]


class OutboxRelayWorker:
    """Worker de segundo plano que despacha eventos da tabela outbox para o barramento."""

    def __init__(
        self,
        publisher: EventPublisher | PublishCallback,
        session_factory: async_sessionmaker[AsyncSession] | None = None,
        batch_size: int = 50,
        max_retries: int = 5,
    ) -> None:
        self.publisher = publisher
        self.session_factory = session_factory or get_session_factory()
        self.batch_size = batch_size
        self.max_retries = max_retries
        self.wake_signal = asyncio.Event()

    async def _listen_for_notifications(self, stop_event: asyncio.Event | None = None) -> None:
        import asyncpg

        from src.core.config import get_settings
        settings = get_settings()
        
        while stop_event is None or not stop_event.is_set():
            conn = None
            try:
                # asyncpg aceita o formato postgresql:// nativo
                conn = await asyncpg.connect(settings.DATABASE_URL.replace("+asyncpg", ""))
                await conn.add_listener("outbox_events_wake", lambda *args: self.wake_signal.set())
                
                while stop_event is None or not stop_event.is_set():
                    await asyncio.sleep(2.0)
            except asyncio.CancelledError:
                break
            except Exception as exc:
                logger.error("Erro no listener do Outbox: %s", exc)
                await asyncio.sleep(5.0)
            finally:
                if conn and not conn.is_closed():
                    await conn.close()

    async def _dispatch_event(self, event_type: str, payload: dict[str, Any]) -> None:
        """Chama o publicador (seja classe compatível com EventPublisher ou função assíncrona)."""
        if hasattr(self.publisher, "publish"):
            await self.publisher.publish(event_type, payload)
        else:
            await self.publisher(event_type, payload)  # type: ignore[operator]

    async def process_batch(self) -> int:
        """Processa um lote de eventos pendentes.

        Retorna a quantidade de eventos processados neste ciclo.
        """
        async with self.session_factory() as session, session.begin():
            pending_events = await OutboxRepository.fetch_pending_events(
                session=session,
                limit=self.batch_size,
            )

            if not pending_events:
                return 0

            processed_count = 0
            for event in pending_events:
                try:
                    # 1. Despacha para o barramento externo (Redis Streams, etc.)
                    await self._dispatch_event(event.event_type, event.payload)

                    # 2. Marca como publicado com sucesso
                    await OutboxRepository.mark_as_published(session, event.id)
                    processed_count += 1
                except Exception as exc:
                    logger.exception(
                        "Falha ao despachar evento %s (tipo=%s)",
                        event.id,
                        event.event_type,
                    )
                    # 3. Registra erro e incrementa tentativas
                    await OutboxRepository.mark_as_failed(
                        session=session,
                        event_id=event.id,
                        error=str(exc),
                        max_retries=self.max_retries,
                    )

            return processed_count

    async def run_forever(
        self,
        max_idle: float = 30.0,
        stop_event: asyncio.Event | None = None,
    ) -> None:
        """Executa o loop contínuo de relay de eventos com wakeup via banco de dados."""
        logger.info("Iniciando loop do OutboxRelayWorker com LISTEN/NOTIFY (max_idle=%.1fs)...", max_idle)
        
        listener_task = asyncio.create_task(self._listen_for_notifications(stop_event))
        
        try:
            while stop_event is None or not stop_event.is_set():
                try:
                    self.wake_signal.clear()
                    processed = await self.process_batch()
                    
                    if processed == 0:
                        try:
                            await asyncio.wait_for(self.wake_signal.wait(), timeout=max_idle)
                        except TimeoutError:
                            pass
                    elif processed == self.batch_size:
                        # Pode haver mais eventos aguardando, agenda próxima execução imediatamente
                        self.wake_signal.set()
                        
                except asyncio.CancelledError:
                    logger.info("OutboxRelayWorker interrompido graciosamente.")
                    break
                except Exception as exc:
                    logger.critical(
                        "Erro inesperado no loop do OutboxRelayWorker: %s", exc, exc_info=True
                    )
                    await asyncio.sleep(5.0)
        finally:
            listener_task.cancel()
            import contextlib
            with contextlib.suppress(asyncio.CancelledError):
                await listener_task


async def run_standalone() -> None:
    """Ponto de entrada para execução do OutboxRelayWorker como processo independente (CLI/Docker)."""
    from src.core.config import get_settings

    settings = get_settings()
    event_bus = ResilientEventBus()
    worker = OutboxRelayWorker(
        publisher=event_bus,
        session_factory=get_session_factory(),
        batch_size=settings.OUTBOX_RELAY_BATCH_SIZE,
    )
    try:
        # Usamos o interval como max_idle no fallback do listen/notify
        await worker.run_forever(max_idle=settings.OUTBOX_RELAY_POLL_INTERVAL_SECONDS)
    finally:
        await event_bus.close()


if __name__ == "__main__":
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    )
    try:
        asyncio.run(run_standalone())
    except (KeyboardInterrupt, SystemExit):
        logger.info("Processo OutboxRelayWorker finalizado.")
