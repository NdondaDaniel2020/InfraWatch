"""Serviço de Idempotência e Deduplicação Persistente para Consumidores de Mensageria.

Garante que eventos de domínio reentregues via XAUTOCLAIM no Redis Streams
não provoquem duplicação de efeitos colaterais externos (ITSM GLPI, SMTP, Webhooks).
Combina cache rápido no Redis (TTL 24h) com persistência definitiva ACID no PostgreSQL.
"""

from __future__ import annotations

import logging
from datetime import UTC, datetime
from typing import TYPE_CHECKING
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from src.core.database.models.processed_event import ProcessedEventModel
from src.core.database.session import get_session_factory

if TYPE_CHECKING:
    import redis.asyncio as aioredis
    from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

logger = logging.getLogger("infrawatch.core.messaging.idempotency")

DEFAULT_IDEMPOTENCY_TTL = 86400  # 24 horas em segundos


class IdempotencyGuard:
    """Guardião de idempotência para verificação e registro de eventos processados."""

    def __init__(
        self,
        redis_client: aioredis.Redis | None = None,
        session_factory: async_sessionmaker[AsyncSession] | None = None,
        ttl_seconds: int = DEFAULT_IDEMPOTENCY_TTL,
    ) -> None:
        self._redis = redis_client
        self._session_factory = session_factory
        self._ttl_seconds = ttl_seconds

    def _get_session_factory(self) -> async_sessionmaker[AsyncSession]:
        if self._session_factory is not None:
            return self._session_factory
        return get_session_factory()

    @staticmethod
    def _to_uuid(event_id: UUID | str) -> UUID:
        if isinstance(event_id, UUID):
            return event_id
        return UUID(str(event_id).strip())

    @staticmethod
    def _cache_key(consumer_name: str, event_id: UUID) -> str:
        return f"idempotency:{consumer_name}:{event_id}"

    async def is_processed(
        self,
        event_id: UUID | str,
        consumer_name: str,
        session: AsyncSession | None = None,
    ) -> bool:
        """Verifica se o evento já foi processado pelo consumidor informado.

        Checa primeiramente o cache em memória (Redis). Em caso de miss ou ausência de Redis,
        realiza a consulta definitiva na tabela `processed_events` do PostgreSQL.
        """
        try:
            event_uuid = self._to_uuid(event_id)
        except (ValueError, AttributeError):
            logger.warning("Identificador de evento inválido para checagem de idempotência: %s", event_id)
            return False

        cache_key = self._cache_key(consumer_name, event_uuid)

        # 1. Checagem em memória via Redis Cache
        if self._redis is not None:
            try:
                cached = await self._redis.get(cache_key)
                if cached:
                    logger.debug("Idempotency HIT no cache Redis para chave %s", cache_key)
                    return True
            except Exception:
                logger.warning("Falha ao consultar cache Redis de idempotência; usando fallback de banco", exc_info=True)

        # 2. Checagem definitiva no PostgreSQL
        if session is not None:
            found = await self._check_in_db(session, event_uuid, consumer_name)
        else:
            session_factory = self._get_session_factory()
            async with session_factory() as db_session:
                found = await self._check_in_db(db_session, event_uuid, consumer_name)

        # Se encontrado no banco, popula o cache Redis para acelerar consultas subsequentes
        if found and self._redis is not None:
            try:
                await self._redis.set(cache_key, "1", ex=self._ttl_seconds)
            except Exception:  # noqa: BLE001 - Falha de cache não impede o fluxo
                logger.warning("Falha ao popular cache Redis de idempotência para chave %s", cache_key)

        return found

    async def _check_in_db(
        self,
        session: AsyncSession,
        event_uuid: UUID,
        consumer_name: str,
    ) -> bool:
        stmt = select(ProcessedEventModel.event_id).where(
            ProcessedEventModel.event_id == event_uuid,
            ProcessedEventModel.consumer_name == consumer_name,
        )
        result = await session.execute(stmt)
        return result.scalar_one_or_none() is not None

    async def mark_processed(
        self,
        event_id: UUID | str,
        consumer_name: str,
        session: AsyncSession | None = None,
    ) -> None:
        """Marca o evento como processado de forma persistente no PostgreSQL e no Redis Cache."""
        try:
            event_uuid = self._to_uuid(event_id)
        except (ValueError, AttributeError):
            logger.warning("Identificador de evento inválido para registro de idempotência: %s", event_id)
            return

        cache_key = self._cache_key(consumer_name, event_uuid)

        # 1. Persistência ACID no banco de dados
        record = ProcessedEventModel(
            event_id=event_uuid,
            consumer_name=consumer_name,
            processed_at=datetime.now(UTC),
        )

        if session is not None:
            try:
                await session.merge(record)
                await session.flush()
            except IntegrityError:
                # Chave primária já existente — operação idempotente
                logger.debug("Registro de evento %s já existente na sessão", event_uuid)
        else:
            session_factory = self._get_session_factory()
            async with session_factory() as db_session, db_session.begin():
                try:
                    await db_session.merge(record)
                except IntegrityError:
                    logger.debug("Registro de evento %s já existente no banco", event_uuid)

        # 2. Atualização no cache Redis
        if self._redis is not None:
            try:
                await self._redis.set(cache_key, "1", ex=self._ttl_seconds)
            except Exception:  # noqa: BLE001 - Falha de cache não anula a gravação no banco
                logger.warning("Falha ao registrar idempotência no cache Redis para chave %s", cache_key)


_default_guard: IdempotencyGuard | None = None


def get_idempotency_guard(
    redis_client: aioredis.Redis | None = None,
    session_factory: async_sessionmaker[AsyncSession] | None = None,
) -> IdempotencyGuard:
    """Retorna instância padrão do IdempotencyGuard."""
    global _default_guard
    if _default_guard is None or redis_client is not None or session_factory is not None:
        _default_guard = IdempotencyGuard(
            redis_client=redis_client,
            session_factory=session_factory,
        )
    return _default_guard
