"""Implementação do Barramento de Eventos com Redis Streams (RedisStreamsEventBus).

Utiliza recursos de alta performance do Redis 7+:
- XADD com ID automático (*)
- Consumer Groups persistentes via XGROUP CREATE (mkstream=True)
- Leitura em lotes com XREADGROUP e confirmação explícita com XACK
- Resgate de mensagens pendentes em workers inativos via XAUTOCLAIM
"""

import asyncio
import inspect
import json
import logging
from collections.abc import Callable
from datetime import datetime
from typing import Any
from uuid import UUID

import redis.asyncio as aioredis
from redis.exceptions import ConnectionError as RedisConnectionError
from redis.exceptions import RedisError, ResponseError

from src.core.config import get_settings
from src.core.domain.events import DomainEvent
from src.core.messaging.interfaces import EventBus, EventHandler, HandlerType

logger = logging.getLogger(__name__)


class RedisStreamsEventBus(EventBus):
    """Barramento de eventos distribuído baseado em Redis Streams."""

    def __init__(
        self,
        redis_client: aioredis.Redis | None = None,
        redis_url: str | None = None,
    ) -> None:
        self.redis_url = redis_url or get_settings().REDIS_URL
        self._redis = redis_client
        self._owns_client = redis_client is None
        self._consumer_tasks: list[asyncio.Task[None]] = []
        self._known_groups: set[tuple[str, str]] = set()
        self._is_closed: bool = False

    async def _get_client(self) -> aioredis.Redis:
        """Obtém ou instancia o cliente Redis assíncrono."""
        if self._redis is None:
            self._redis = aioredis.from_url(
                self.redis_url,
                decode_responses=True,
                encoding="utf-8",
            )
        return self._redis

    def _normalize_event(self, event: DomainEvent | dict[str, Any]) -> dict[str, Any]:
        """Converte DomainEvent ou dict para dicionário com valores primitivos."""
        if isinstance(event, DomainEvent):
            return event.to_dict()
        if isinstance(event, dict):
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

    async def ensure_consumer_group(self, topic: str, group: str) -> None:
        """Garante a criação do Consumer Group no stream especificado (id='0', mkstream=True)."""
        key = (topic, group)
        if key in self._known_groups:
            return

        client = await self._get_client()
        try:
            # Cria o grupo a partir do início do stream ('0') com criação automática da stream
            await client.xgroup_create(name=topic, groupname=group, id="0", mkstream=True)
            self._known_groups.add(key)
            logger.info("Consumer Group '%s' criado para o stream '%s'", group, topic)
        except ResponseError as exc:
            if "BUSYGROUP" in str(exc):
                # Grupo já existia previamente
                self._known_groups.add(key)
            else:
                logger.error("Erro ao criar consumer group '%s' em '%s': %s", group, topic, exc)
                raise

    async def publish(self, topic: str, event: DomainEvent | dict[str, Any]) -> bool:
        """Publica um evento no Redis Stream usando XADD com ID automático (*)."""
        if self._is_closed:
            logger.warning("Tentativa de publicação em RedisStreamsEventBus já encerrado.")
            return False

        try:
            payload_dict = self._normalize_event(event)
            event_type = str(payload_dict.get("event_type", "UnknownEvent"))
            event_id = str(payload_dict.get("event_id", ""))

            fields = {
                "event_id": event_id,
                "event_type": event_type,
                "payload": json.dumps(payload_dict),
            }

            client = await self._get_client()
            msg_id = await client.xadd(name=topic, fields=fields, id="*")
            logger.debug(
                "Evento %s publicado no Redis Stream '%s' com ID %s",
                event_type,
                topic,
                msg_id,
            )
            return True
        except (RedisConnectionError, ConnectionRefusedError) as exc:
            logger.error("Falha de conexão com Redis ao publicar no tópico '%s': %s", topic, exc)
            raise
        except RedisError as exc:
            logger.error("Erro do Redis ao publicar no tópico '%s': %s", topic, exc)
            raise

    def _parse_message(self, raw_fields: dict[str, Any]) -> dict[str, Any]:
        """Extrai o dicionário de payload a partir dos campos do stream."""
        if "payload" in raw_fields:
            try:
                return json.loads(raw_fields["payload"])
            except json.JSONDecodeError:
                return raw_fields
        return raw_fields

    async def claim_pending_messages(
        self,
        topic: str,
        group: str,
        consumer_name: str,
        min_idle_ms: int = 60000,
        batch_size: int = 20,
    ) -> list[tuple[str, dict[str, Any]]]:
        """Resgata mensagens presas no PEL (Pending Entries List) de workers que caíram via XAUTOCLAIM."""
        client = await self._get_client()
        try:
            # xautoclaim retorna: (next_start_id, [(id, fields), ...], [deleted_ids...])
            autoclaim_res = await client.xautoclaim(
                name=topic,
                groupname=group,
                consumername=consumer_name,
                min_idle_time=min_idle_ms,
                start_id="0-0",
                count=batch_size,
            )
            claimed_messages: list[tuple[str, dict[str, Any]]] = []
            if autoclaim_res and len(autoclaim_res) >= 2:
                for item in autoclaim_res[1]:
                    if isinstance(item, (list, tuple)) and len(item) == 2:
                        msg_id, fields = item
                        claimed_messages.append((str(msg_id), self._parse_message(fields)))
            if claimed_messages:
                logger.info(
                    "XAUTOCLAIM resgatou %d mensagens órfãs no tópico '%s' (grupo=%s)",
                    len(claimed_messages),
                    topic,
                    group,
                )
            return claimed_messages
        except ResponseError as exc:
            # Comandos não suportados ou streams vazios
            logger.debug("XAUTOCLAIM ignorado: %s", exc)
            return []
        except (RedisConnectionError, ConnectionRefusedError):
            raise
        except (RedisError, TimeoutError) as exc:
            logger.warning("Falha ao executar XAUTOCLAIM em '%s': %s", topic, exc)
            return []

    async def consume_batch(
        self,
        topic: str,
        group: str,
        consumer_name: str,
        batch_size: int = 20,
        timeout_ms: int = 2000,
    ) -> list[tuple[str, dict[str, Any]]]:
        """Consome lote de mensagens via XREADGROUP com suporte a recuperação de mensagens órfãs."""
        if self._is_closed:
            return []

        await self.ensure_consumer_group(topic, group)
        client = await self._get_client()

        # 1. Tenta resgatar mensagens que ficaram presas no PEL por mais de 60 segundos
        try:
            claimed = await self.claim_pending_messages(
                topic=topic,
                group=group,
                consumer_name=consumer_name,
                min_idle_ms=60000,
                batch_size=batch_size,
            )
            if claimed:
                return claimed
        except (RedisConnectionError, ConnectionRefusedError):
            raise
        except (RedisError, TimeoutError) as exc:
            logger.debug("Falha secundária em autoclaim: %s", exc)

        # 2. Lê mensagens novas para este consumer group (id='>')
        try:
            read_res = await client.xreadgroup(
                groupname=group,
                consumername=consumer_name,
                streams={topic: ">"},
                count=batch_size,
                block=timeout_ms,
            )
        except (RedisConnectionError, ConnectionRefusedError):
            raise
        except (RedisError, TimeoutError) as exc:
            logger.error("Erro ao ler XREADGROUP em '%s': %s", topic, exc)
            return []

        results: list[tuple[str, dict[str, Any]]] = []
        if not read_res:
            return results

        # read_res formato: [[stream_name, [(msg_id, fields_dict), ...]]]
        for stream_entry in read_res:
            if len(stream_entry) >= 2:
                messages = stream_entry[1]
                for msg_id, fields in messages:
                    results.append((str(msg_id), self._parse_message(fields)))

        return results

    async def ack(self, topic: str, group: str, *message_ids: str) -> int:
        """Confirma manualmente (XACK) as mensagens processadas com sucesso."""
        if not message_ids:
            return 0
        client = await self._get_client()
        try:
            acked_count = await client.xack(topic, group, *message_ids)
            return int(acked_count)
        except (RedisError, TimeoutError) as exc:
            logger.error("Erro ao executar XACK em '%s' (grupo=%s): %s", topic, group, exc)
            return 0

    async def _invoke_handler(
        self, handler: HandlerType, topic: str, payload: dict[str, Any]
    ) -> None:
        """Invoca o handler registrado."""
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
        """Inicia um worker em background para consumir e processar mensagens do stream."""
        if self._is_closed:
            raise RuntimeError("Não é possível registrar assinantes em um EventBus encerrado.")

        await self.ensure_consumer_group(topic, group)

        async def _consumer_loop() -> None:
            logger.info(
                "Iniciando consumidor Redis Streams '%s' no grupo '%s' para stream '%s'",
                consumer_name,
                group,
                topic,
            )
            while not self._is_closed:
                try:
                    messages = await self.consume_batch(
                        topic=topic,
                        group=group,
                        consumer_name=consumer_name,
                        batch_size=batch_size,
                        timeout_ms=1000,
                    )
                    for msg_id, payload in messages:
                        try:
                            await self._invoke_handler(handler, topic, payload)
                            await self.ack(topic, group, msg_id)
                        except Exception:
                            logger.exception(
                                "Falha no processamento da mensagem %s no stream '%s'",
                                msg_id,
                                topic,
                            )
                except asyncio.CancelledError:
                    break
                except (RedisConnectionError, ConnectionRefusedError) as exc:
                    logger.warning(
                        "Conexão perdida no loop do Redis Streams: %s. Aguardando...", exc
                    )
                    await asyncio.sleep(2.0)
                except Exception:
                    logger.exception("Erro não esperado no loop de consumo do Redis Streams.")
                    await asyncio.sleep(1.0)

        task = asyncio.create_task(
            _consumer_loop(),
            name=f"RedisConsumer-{topic}-{group}-{consumer_name}",
        )
        self._consumer_tasks.append(task)

    async def close(self) -> None:
        """Encerra graciosamente consumidores ativos e a conexão com o Redis."""
        self._is_closed = True
        for task in self._consumer_tasks:
            if not task.done():
                task.cancel()
        if self._consumer_tasks:
            await asyncio.gather(*self._consumer_tasks, return_exceptions=True)
            self._consumer_tasks.clear()

        if self._redis is not None and self._owns_client:
            await self._redis.aclose()
            self._redis = None
        logger.info("RedisStreamsEventBus encerrado.")
