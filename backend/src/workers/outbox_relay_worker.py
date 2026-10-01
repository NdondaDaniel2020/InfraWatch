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

from src.core.database.session import get_session_factory
from src.core.events.outbox_repository import OutboxRepository

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
        poll_interval: float = 1.0,
        stop_event: asyncio.Event | None = None,
    ) -> None:
        """Executa o loop contínuo de pooling e relay de eventos com suporte a cancelamento gracioso."""
        logger.info("Iniciando loop do OutboxRelayWorker (intervalo=%.1fs)...", poll_interval)
        while stop_event is None or not stop_event.is_set():
            try:
                processed = await self.process_batch()
                if processed == 0:
                    await asyncio.sleep(poll_interval)
            except asyncio.CancelledError:
                logger.info("OutboxRelayWorker interrompido graciosamente.")
                break
            except Exception as exc:
                logger.critical(
                    "Erro inesperado no loop do OutboxRelayWorker: %s", exc, exc_info=True
                )
                await asyncio.sleep(poll_interval)
