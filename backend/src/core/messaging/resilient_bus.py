"""Orquestrador do Barramento Resiliente de Eventos (ResilientEventBus).

Implementa tolerância a falhas através de fallback transparente:
- Utiliza RedisStreamsEventBus como broker primário de alta performance
- Detecta falhas de conexão (ConnectionError/ConnectionRefusedError) e comuta instantaneamente para InMemoryEventBus
- Mantém buffer de reconciliação para replay de eventos perdidos ao restabelecer a conectividade
- Monitora a saúde do broker primário para retornar automaticamente ao Redis quando operacional
"""

import asyncio
import logging
from collections import deque
from typing import Any

from redis.exceptions import ConnectionError as RedisConnectionError
from redis.exceptions import RedisError

from src.core.domain.events import DomainEvent
from src.core.messaging.in_memory_bus import InMemoryEventBus
from src.core.messaging.interfaces import EventBus, HandlerType
from src.core.messaging.redis_streams_bus import RedisStreamsEventBus

logger = logging.getLogger(__name__)


class ResilientEventBus(EventBus):
    """EventBus resiliente que alterna dinamicamente entre Redis Streams e fallback em memória."""

    def __init__(
        self,
        primary_bus: EventBus | None = None,
        fallback_bus: EventBus | None = None,
        reconnect_interval_seconds: float = 3.0,
        buffer_capacity: int = 2000,
    ) -> None:
        self.primary_bus = primary_bus or RedisStreamsEventBus()
        self.fallback_bus = fallback_bus or InMemoryEventBus()
        self.reconnect_interval_seconds = reconnect_interval_seconds
        self.buffer_capacity = buffer_capacity

        self._is_primary_healthy: bool = True
        self._reconciliation_buffer: deque[tuple[str, dict[str, Any]]] = deque(
            maxlen=buffer_capacity
        )
        self._lock = asyncio.Lock()
        self._health_check_task: asyncio.Task[None] | None = None
        self._is_closed: bool = False

    @property
    def is_primary_healthy(self) -> bool:
        """Indica se o barramento primário (Redis Streams) está operacional."""
        return self._is_primary_healthy

    @property
    def pending_reconciliation_count(self) -> int:
        """Quantidade de mensagens no buffer de reconciliação aguardando replay."""
        return len(self._reconciliation_buffer)

    def _normalize_event(self, event: DomainEvent | dict[str, Any]) -> dict[str, Any]:
        """Normaliza evento para payload em dicionário."""
        if isinstance(event, DomainEvent):
            return event.to_dict()
        return dict(event)

    async def _start_health_checker_if_needed(self) -> None:
        """Inicia tarefa de sondagem e reconexão periódica se o primário estiver caído."""
        if self._health_check_task is None or self._health_check_task.done():
            self._health_check_task = asyncio.create_task(
                self._probe_and_reconcile_loop(),
                name="ResilientEventBus-HealthChecker",
            )

    async def _probe_and_reconcile_loop(self) -> None:
        """Loop que testa a restauração da conectividade com o Redis e drena o buffer."""
        logger.info("Iniciando monitoramento de reconexão do broker primário...")
        while not self._is_closed and not self._is_primary_healthy:
            await asyncio.sleep(self.reconnect_interval_seconds)
            try:
                # Testa conectividade com o cliente Redis do barramento primário
                if isinstance(self.primary_bus, RedisStreamsEventBus):
                    client = await self.primary_bus._get_client()
                    await client.ping()
                else:
                    # Barramento genérico: testa publicar mensagem de probe
                    probe_payload = {"event_type": "HealthCheckProbe", "payload": {}}
                    await self.primary_bus.publish("__healthcheck__", probe_payload)

                # Se o ping/publish tiver sucesso, o primário foi restaurado!
                logger.info(
                    "Conexão com broker primário restabelecida! Drenando buffer de reconciliação (%d itens)...",
                    len(self._reconciliation_buffer),
                )
                async with self._lock:
                    await self._drain_reconciliation_buffer()
                    self._is_primary_healthy = True
                break
            except (RedisConnectionError, ConnectionRefusedError, OSError):
                logger.debug("Broker primário ainda inacessível. Nova tentativa em breve...")
            except asyncio.CancelledError:
                break
            except Exception:
                logger.exception("Erro inesperado durante sondagem de saúde do broker primário.")

    async def _drain_reconciliation_buffer(self) -> None:
        """Reenvia eventos acumulados no buffer para o barramento primário."""
        while self._reconciliation_buffer:
            topic, payload = self._reconciliation_buffer.popleft()
            try:
                await self.primary_bus.publish(topic, payload)
            except (RedisError, OSError):
                # Se falhar durante a drenagem, recoloca no buffer e interrompe
                self._reconciliation_buffer.appendleft((topic, payload))
                self._is_primary_healthy = False
                logger.warning("Falha ao drenar buffer para broker primário. Abortando ciclo.")
                break

    async def publish(self, topic: str, event: DomainEvent | dict[str, Any]) -> bool:
        """Publica mensagem com chaveamento transparente para fallback em caso de falha de conexão."""
        if self._is_closed:
            logger.warning("Tentativa de publicação em ResilientEventBus já encerrado.")
            return False

        payload_dict = self._normalize_event(event)

        if self._is_primary_healthy:
            try:
                # Tenta publicar no broker primário (Redis Streams)
                published = await self.primary_bus.publish(topic, payload_dict)
                if published:
                    return True
            except (RedisConnectionError, ConnectionRefusedError, OSError) as exc:
                logger.warning(
                    "Falha de conexão com broker primário (%s). Comutando imediatamente para fallback em memória.",
                    exc,
                )
                async with self._lock:
                    self._is_primary_healthy = False
                    self._reconciliation_buffer.append((topic, payload_dict))
                    await self._start_health_checker_if_needed()
        else:
            # Primário já conhecido como indisponível: armazena no buffer de reconciliação
            async with self._lock:
                self._reconciliation_buffer.append((topic, payload_dict))
                await self._start_health_checker_if_needed()

        # Publica no fallback em memória para assegurar entrega imediata aos consumidores locais
        return await self.fallback_bus.publish(topic, payload_dict)

    async def consume_batch(
        self,
        topic: str,
        group: str,
        consumer_name: str,
        batch_size: int = 20,
        timeout_ms: int = 2000,
    ) -> list[tuple[str, dict[str, Any]]]:
        """Consome mensagens do primário se saudável; caso contrário, consome do fallback."""
        if self._is_closed:
            return []

        if self._is_primary_healthy:
            try:
                return await self.primary_bus.consume_batch(
                    topic=topic,
                    group=group,
                    consumer_name=consumer_name,
                    batch_size=batch_size,
                    timeout_ms=timeout_ms,
                )
            except (RedisConnectionError, ConnectionRefusedError, OSError):
                async with self._lock:
                    self._is_primary_healthy = False
                    await self._start_health_checker_if_needed()

        return await self.fallback_bus.consume_batch(
            topic=topic,
            group=group,
            consumer_name=consumer_name,
            batch_size=batch_size,
            timeout_ms=timeout_ms,
        )

    async def ack(self, topic: str, group: str, *message_ids: str) -> int:
        """Confirma mensagens no barramento apropriado."""
        if self._is_primary_healthy:
            try:
                return await self.primary_bus.ack(topic, group, *message_ids)
            except (RedisConnectionError, ConnectionRefusedError, OSError):
                async with self._lock:
                    self._is_primary_healthy = False
                    await self._start_health_checker_if_needed()

        return await self.fallback_bus.ack(topic, group, *message_ids)

    async def subscribe(
        self,
        topic: str,
        group: str,
        consumer_name: str,
        handler: HandlerType,
        batch_size: int = 20,
    ) -> None:
        """Registra o manipulador em ambos os barramentos para garantir entrega durante e pós comutação."""
        if self._is_closed:
            raise RuntimeError("Não é possível registrar assinantes em um EventBus encerrado.")

        # Inscreve no fallback
        await self.fallback_bus.subscribe(
            topic=topic,
            group=group,
            consumer_name=consumer_name,
            handler=handler,
            batch_size=batch_size,
        )

        # Inscreve no primário (se o primário estiver ou vier a ficar disponível)
        try:
            await self.primary_bus.subscribe(
                topic=topic,
                group=group,
                consumer_name=consumer_name,
                handler=handler,
                batch_size=batch_size,
            )
        except (RedisConnectionError, ConnectionRefusedError, OSError):
            logger.warning(
                "Falha ao registrar subscriber no broker primário. Assinatura ativa apenas no fallback."
            )
            async with self._lock:
                self._is_primary_healthy = False
                await self._start_health_checker_if_needed()

    async def check_and_recover(self) -> bool:
        """Força verificação síncrona do estado do primário e drena reconciliação se recuperado."""
        try:
            if isinstance(self.primary_bus, RedisStreamsEventBus):
                client = await self.primary_bus._get_client()
                await client.ping()
            else:
                probe_payload = {"event_type": "HealthCheckProbe", "payload": {}}
                await self.primary_bus.publish("__healthcheck__", probe_payload)

            async with self._lock:
                await self._drain_reconciliation_buffer()
                self._is_primary_healthy = True
            return True
        except (RedisConnectionError, ConnectionRefusedError, OSError):
            async with self._lock:
                self._is_primary_healthy = False
            return False

    async def close(self) -> None:
        """Encerra ambos os barramentos e as rotinas de verificação de integridade."""
        self._is_closed = True
        if self._health_check_task and not self._health_check_task.done():
            self._health_check_task.cancel()

        await asyncio.gather(
            self.primary_bus.close(),
            self.fallback_bus.close(),
            return_exceptions=True,
        )
        logger.info("ResilientEventBus encerrado.")
