"""Implementação em memória do Barramento de Eventos (InMemoryEventBus).

Projetado para testes unitários isolados, ambientes de desenvolvimento sem infraestrutura
e como mecanismo de fallback para o ResilientEventBus.
"""

import asyncio
import inspect
import logging
from collections import defaultdict
from collections.abc import Callable
from datetime import UTC, datetime
from typing import Any
from uuid import UUID

import uuid6

from src.core.domain.events import DomainEvent
from src.core.messaging.interfaces import EventBus, EventHandler, HandlerType

logger = logging.getLogger(__name__)


class InMemoryEventBus(EventBus):
    """Barramento de eventos thread-safe e assíncrono baseado em asyncio.Queue."""

    def __init__(self) -> None:
        # topic -> lista de todas as mensagens (message_id, payload)
        self._streams: dict[str, list[tuple[str, dict[str, Any]]]] = defaultdict(list)
        # topic -> group -> asyncio.Queue com mensagens novas
        self._group_queues: dict[str, dict[str, asyncio.Queue[tuple[str, dict[str, Any]]]]] = (
            defaultdict(lambda: defaultdict(asyncio.Queue))
        )
        # topic -> group -> message_id -> (consumer_name, timestamp, payload) [Pending Entries List - PEL]
        self._pel: dict[str, dict[str, dict[str, tuple[str, datetime, dict[str, Any]]]]] = (
            defaultdict(lambda: defaultdict(dict))
        )
        self._consumer_tasks: list[asyncio.Task[None]] = []
        self._is_closed: bool = False
        self._lock = asyncio.Lock()

    def _normalize_event(self, event: DomainEvent | dict[str, Any]) -> dict[str, Any]:
        """Converte DomainEvent ou dicionário em formato serializável padrão."""
        if isinstance(event, DomainEvent):
            return event.to_dict()
        if isinstance(event, dict):
            # Garante que tipos como UUID e datetime sejam normalizados
            normalized: dict[str, Any] = {}
            for k, v in event.items():
                if isinstance(v, UUID):
                    normalized[k] = str(v)
                elif isinstance(v, datetime):
                    normalized[k] = v.isoformat()
                else:
                    normalized[k] = v
            return normalized
        raise TypeError(f"Evento inválido: {type(event)}. Esperado DomainEvent ou dict.")

    async def publish(self, topic: str, event: DomainEvent | dict[str, Any]) -> bool:
        """Publica um evento no tópico em memória e distribui para as filas dos grupos."""
        if self._is_closed:
            logger.warning("Tentativa de publicação em InMemoryEventBus já encerrado.")
            return False

        try:
            payload = self._normalize_event(event)
            message_id = str(uuid6.uuid7())

            async with self._lock:
                # 1. Registra no stream permanente em memória
                self._streams[topic].append((message_id, payload))

                # 2. Despacha para cada fila de grupo registrada
                for group_queue in self._group_queues[topic].values():
                    group_queue.put_nowait((message_id, payload))

            logger.debug(
                "Evento %s publicado em memória no tópico '%s' (tipo=%s)",
                message_id,
                topic,
                payload.get("event_type", "unknown"),
            )
            return True
        except Exception:
            logger.exception("Falha ao publicar evento em memória no tópico '%s'", topic)
            return False

    def _get_group_queue(self, topic: str, group: str) -> asyncio.Queue[tuple[str, dict[str, Any]]]:
        """Obtém ou cria a fila assíncrona do grupo, alimentando com mensagens históricas se for nova."""
        group_exists = group in self._group_queues[topic]
        queue = self._group_queues[topic][group]
        if not group_exists:
            # Novo grupo: alimenta com todas as mensagens anteriores registradas no stream
            for msg in self._streams[topic]:
                queue.put_nowait(msg)
        return queue

    async def consume_batch(
        self,
        topic: str,
        group: str,
        consumer_name: str,
        batch_size: int = 20,
        timeout_ms: int = 2000,
    ) -> list[tuple[str, dict[str, Any]]]:
        """Lê um lote de mensagens da fila do grupo e as adiciona ao PEL."""
        if self._is_closed:
            return []

        queue = self._get_group_queue(topic, group)

        results: list[tuple[str, dict[str, Any]]] = []
        timeout_seconds = timeout_ms / 1000.0

        try:
            # Se a fila estiver vazia e tiver timeout, espera a primeira mensagem
            if queue.empty() and timeout_seconds > 0:
                first_msg = await asyncio.wait_for(queue.get(), timeout=timeout_seconds)
                results.append(first_msg)
                queue.task_done()

            # Pega o restante disponível imediatamente sem bloquear
            while len(results) < batch_size and not queue.empty():
                msg = queue.get_nowait()
                results.append(msg)
                queue.task_done()
        except (TimeoutError, asyncio.QueueEmpty):
            pass

        # Registra mensagens consumidas no PEL
        now = datetime.now(UTC)
        for msg_id, payload in results:
            self._pel[topic][group][msg_id] = (consumer_name, now, payload)

        return results

    async def ack(self, topic: str, group: str, *message_ids: str) -> int:
        """Confirma mensagens e as remove do PEL em memória."""
        acked_count = 0
        group_pel = self._pel[topic][group]
        for msg_id in message_ids:
            if msg_id in group_pel:
                del group_pel[msg_id]
                acked_count += 1
        return acked_count

    async def _invoke_handler(
        self, handler: HandlerType, topic: str, payload: dict[str, Any]
    ) -> None:
        """Invoca o handler com suporte a EventHandler ou corrotinas com 1 ou 2 parâmetros."""
        if isinstance(handler, EventHandler):
            await handler.handle(topic, payload)
        elif isinstance(handler, Callable):
            sig = inspect.signature(handler)
            if len(sig.parameters) == 1:
                await handler(payload)  # type: ignore[call-arg]
            else:
                await handler(topic, payload)  # type: ignore[call-arg]

    async def subscribe(
        self,
        topic: str,
        group: str,
        consumer_name: str,
        handler: HandlerType,
        batch_size: int = 20,
    ) -> None:
        """Inicia uma tarefa assíncrona em background que consome mensagens e chama o handler."""
        if self._is_closed:
            raise RuntimeError("Não é possível registrar assinantes em um EventBus encerrado.")

        async def _consumer_loop() -> None:
            logger.info(
                "Consumidor '%s' registrado no grupo '%s' para tópico '%s'",
                consumer_name,
                group,
                topic,
            )
            while not self._is_closed:
                try:
                    batch = await self.consume_batch(
                        topic=topic,
                        group=group,
                        consumer_name=consumer_name,
                        batch_size=batch_size,
                        timeout_ms=500,
                    )
                    for msg_id, payload in batch:
                        try:
                            await self._invoke_handler(handler, topic, payload)
                            await self.ack(topic, group, msg_id)
                        except Exception:
                            logger.exception(
                                "Erro ao processar mensagem %s no handler de '%s'",
                                msg_id,
                                topic,
                            )
                except asyncio.CancelledError:
                    break
                except Exception:
                    logger.exception("Erro inesperado no loop do consumidor em memória.")
                    await asyncio.sleep(0.5)

        task = asyncio.create_task(
            _consumer_loop(), name=f"InMemoryConsumer-{topic}-{group}-{consumer_name}"
        )
        self._consumer_tasks.append(task)

    async def close(self) -> None:
        """Encerra o barramento em memória e cancela consumidores ativos."""
        self._is_closed = True
        for task in self._consumer_tasks:
            if not task.done():
                task.cancel()
        if self._consumer_tasks:
            await asyncio.gather(*self._consumer_tasks, return_exceptions=True)
            self._consumer_tasks.clear()
        logger.info("InMemoryEventBus encerrado.")
