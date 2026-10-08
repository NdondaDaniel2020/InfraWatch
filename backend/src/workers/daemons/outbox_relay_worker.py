"""Worker assíncrono de Transactional Outbox Relay para o InfraWatch.

Responsável por ler eventos pendentes na tabela outbox_events com concorrência segura
(FOR UPDATE SKIP LOCKED), despachar para o barramento de eventos (Redis Streams/Bus)
e atualizar os estados de entrega (At-Least-Once Delivery).
"""

import asyncio
import contextlib
import logging
import random
import uuid
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
        worker_id: str | None = None,
    ) -> None:
        self.publisher = publisher
        self.session_factory = session_factory or get_session_factory()
        self.batch_size = batch_size
        self.max_retries = max_retries
        self.worker_id = worker_id or f"outbox-{uuid.uuid4().hex[:8]}"
        self.wake_signal = asyncio.Event()
        self.is_listener_healthy = False
        self._log = logging.LoggerAdapter(logger, {"worker_id": self.worker_id})

    async def _listen_for_notifications(self, stop_event: asyncio.Event | None = None) -> None:
        """Mantém uma conexão dedicada via asyncpg escutando NOTIFY no canal outbox_events_wake.

        Se a conexão cair ou falhar, realiza tentativas periódicas de reconexão.
        Durante qualquer indisponibilidade, o loop principal continuará processando via polling de fallback.
        """
        import asyncpg

        from src.core.config import get_settings

        settings = get_settings()

        raw_dsn = settings.DATABASE_URL
        if not raw_dsn.startswith(("postgresql://", "postgresql+", "postgres://")):
            self.is_listener_healthy = False
            self._log.info(
                "Dialeto não-PostgreSQL detectado (%s). LISTEN desativado, operando exclusivamente via Polling.",
                raw_dsn.split(":", 1)[0],
            )
            return

        backoff = 1.0
        while stop_event is None or not stop_event.is_set():
            conn = None
            try:
                # asyncpg aceita o formato postgresql:// nativo (remove driver SQLAlchemy se presente)
                dsn = settings.DATABASE_URL.replace("+asyncpg", "")
                conn = await asyncpg.connect(dsn)
                await conn.add_listener("outbox_events_wake", lambda *args: self.wake_signal.set())
                self.is_listener_healthy = True
                backoff = 1.0
                self._log.info("LISTEN ativo no canal 'outbox_events_wake'.")

                # Mantém vivo e monitora enquanto stop_event não for acionado
                while stop_event is None or not stop_event.is_set():
                    await asyncio.sleep(1.0)
            except asyncio.CancelledError:
                break
            except Exception as exc:  # noqa: BLE001
                self.is_listener_healthy = False
                self._log.warning(
                    "Listener PostgreSQL desconectado (%s). "
                    "Operando com Polling de Fallback. Reconectando em %.1fs...",
                    exc,
                    backoff,
                )
                try:
                    await asyncio.wait_for(
                        stop_event.wait() if stop_event else asyncio.sleep(backoff),
                        timeout=backoff,
                    )
                except (TimeoutError, asyncio.CancelledError):
                    pass
                backoff = min(backoff * 2.0, 30.0)
            finally:
                self.is_listener_healthy = False
                if conn and not conn.is_closed():
                    with contextlib.suppress(Exception):
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
                except Exception as exc:  # noqa: BLE001
                    self._log.exception(
                        "Falha ao despachar evento",
                        extra={"event_id": str(event.id), "event_type": event.event_type},
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
        poll_interval: float = 30.0,
        stop_event: asyncio.Event | None = None,
        max_idle: float | None = None,
    ) -> None:
        """Executa o loop contínuo de relay de eventos com LISTEN/NOTIFY e Polling de Fallback.

        Args:
            poll_interval: Intervalo máximo (segundos) entre varreduras quando ocioso (fallback).
            stop_event: Evento para sinalizar parada graciosa.
            max_idle: Alias para compatibilidade retroativa com poll_interval.
        """
        fallback_timeout = max_idle if max_idle is not None else poll_interval
        self._log.info(
            "Iniciando loop do OutboxRelayWorker com LISTEN/NOTIFY e Fallback de Polling",
            extra={"poll_interval_seconds": fallback_timeout},
        )

        # Garante que wake_signal exista
        if self.wake_signal is None:
            self.wake_signal = asyncio.Event()

        listener_task = asyncio.create_task(self._listen_for_notifications(stop_event))

        try:
            while stop_event is None or not stop_event.is_set():
                try:
                    processed = await self.process_batch()

                    if processed == 0:
                        # Sem eventos pendentes: aguarda NOTIFY ou acorda após o timeout de polling
                        # Aplica jitter aleatório (±10%) para evitar que múltiplas réplicas colidam (Thundering Herd)
                        jitter_ratio = random.uniform(0.9, 1.1)
                        current_timeout = max(0.01, fallback_timeout * jitter_ratio)
                        try:
                            await asyncio.wait_for(
                                self.wake_signal.wait(),
                                timeout=current_timeout,
                            )
                            self._log.debug("OutboxRelayWorker acordado via NOTIFY (Fast-Path).")
                        except TimeoutError:
                            # Timeout disparado -> Polling de Fallback
                            self._log.debug(
                                "OutboxRelayWorker acordado via timeout de polling (Slow-Path/Fallback: %.2fs).",
                                current_timeout,
                            )
                        finally:
                            # Limpa o sinal consumido para a próxima iteração
                            self.wake_signal.clear()
                    elif processed >= self.batch_size:
                        # Lote cheio: pode haver mais eventos aguardando, acorda imediatamente sem esperar
                        self.wake_signal.set()
                    else:
                        # Processou alguns eventos mas sobrou capacidade: limpa sinal para esperar novos
                        self.wake_signal.clear()

                except asyncio.CancelledError:
                    self._log.info("OutboxRelayWorker interrompido graciosamente.")
                    break
                except Exception as exc:  # noqa: BLE001
                    self._log.critical(
                        "Erro inesperado no loop do OutboxRelayWorker",
                        extra={"error": str(exc)},
                        exc_info=True,
                    )
                    await asyncio.sleep(5.0)
        finally:
            listener_task.cancel()
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
    from src.core.observability.logging import setup_logging

    setup_logging()
    try:
        asyncio.run(run_standalone())
    except (KeyboardInterrupt, SystemExit):
        logger.info("Processo OutboxRelayWorker finalizado.")
