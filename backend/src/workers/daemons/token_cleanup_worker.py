"""Worker assíncrono para expurgo periódico de tokens expirados e revogados (ADR-024).

Executa a limpeza no banco de dados sob um lock distribuído Redis não-bloqueante
(SET NX EX), garantindo que apenas uma réplica da aplicação execute o processo,
evitando contenção de escrita e locks destrutivos nas tabelas de identidade.
"""

import asyncio
import logging
from datetime import UTC, datetime, timedelta

import redis.asyncio as aioredis
from sqlalchemy import and_, delete, or_
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from src.contexts.iam.database.models import RefreshTokenModel
from src.core.database.session import get_session_factory
from src.core.redis.distributed_lock import redis_distributed_lock

logger = logging.getLogger("infrawatch.workers.token_cleanup")


class TokenCleanupWorker:
    """Worker periódico para limpeza de refresh tokens revogados ou expirados."""

    def __init__(
        self,
        redis_client: aioredis.Redis,
        session_factory: async_sessionmaker[AsyncSession] | None = None,
        interval_seconds: int = 3600,
        lock_timeout: int = 300,
        retention_days: int = 7,
    ) -> None:
        """Inicializa o worker de limpeza de tokens.

        Args:
            redis_client: Cliente Redis para o lock distribuído.
            session_factory: Fábrica de sessões do banco de dados SQLAlchemy.
            interval_seconds: Intervalo entre execuções sucessivas do worker.
            lock_timeout: Tempo de vida (TTL) do lock distribuído em segundos.
            retention_days: Quantidade de dias para manter tokens revogados para auditoria.
        """
        self.redis_client = redis_client
        self.session_factory = session_factory or get_session_factory()
        self.interval_seconds = interval_seconds
        self.lock_timeout = lock_timeout
        self.retention_days = retention_days
        self._running = False
        self._task: asyncio.Task[None] | None = None

    async def cleanup_expired_tokens(self, session: AsyncSession) -> int:
        """Executa a deleção em lote de tokens expirados e revogados obsoletos.

        Retorna a quantidade de registros removidos.
        """
        now = datetime.now(UTC)
        revoked_cutoff = now - timedelta(days=self.retention_days)

        stmt = delete(RefreshTokenModel).where(
            or_(
                RefreshTokenModel.expires_at < now,
                and_(
                    RefreshTokenModel.is_revoked.is_(True),
                    RefreshTokenModel.revoked_at < revoked_cutoff,
                ),
            )
        )
        result = await session.execute(stmt)
        deleted_count = int(result.rowcount or 0)
        return deleted_count

    async def run_once(self) -> int | None:
        """Tenta adquirir o lock distribuído e executar um ciclo de limpeza.

        Retorna:
            int: Quantidade de tokens excluídos se o lock foi adquirido.
            None: Se o lock não pôde ser adquirido porque outra réplica já está em execução.
        """
        async with redis_distributed_lock(
            redis_client=self.redis_client,
            key="token_cleanup",
            timeout=self.lock_timeout,
            blocking=False,
        ) as lock:
            if not lock.acquired:
                logger.debug(
                    "Lock distribuído 'token_cleanup' retido por outra instância; ignorando ciclo."
                )
                return None

            logger.info("Lock distribuído adquirido. Iniciando expurgo de tokens obsoletos...")
            async with self.session_factory() as session, session.begin():
                deleted = await self.cleanup_expired_tokens(session)

            logger.info("Expurgo de tokens concluído com sucesso: %d registros removidos.", deleted)
            return deleted

    async def run_forever(self) -> None:
        """Loop principal do worker executado em segundo plano."""
        self._running = True
        logger.info(
            "Worker de limpeza periódica de tokens iniciado (intervalo: %ds, TTL lock: %ds)",
            self.interval_seconds,
            self.lock_timeout,
        )
        try:
            while self._running:
                try:
                    await self.run_once()
                except Exception:
                    logger.exception("Erro durante a execução do expurgo de tokens")

                await asyncio.sleep(self.interval_seconds)
        except asyncio.CancelledError:
            logger.info("Worker de limpeza periódica de tokens cancelado.")
        finally:
            self._running = False

    def start(self) -> asyncio.Task[None]:
        """Inicia o loop assíncrono do worker como uma Task."""
        if self._task is None or self._task.done():
            self._task = asyncio.create_task(self.run_forever())
        return self._task

    async def stop(self) -> None:
        """Para a execução do worker de forma graciosa."""
        self._running = False
        if self._task and not self._task.done():
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
            self._task = None


async def run_standalone() -> None:
    """Ponto de entrada para execução do TokenCleanupWorker como processo independente (CLI/Docker)."""
    from src.core.config import get_settings

    settings = get_settings()
    redis_client = aioredis.from_url(settings.REDIS_URL, decode_responses=True)
    worker = TokenCleanupWorker(
        redis_client=redis_client,
        session_factory=get_session_factory(),
        interval_seconds=settings.TOKEN_CLEANUP_INTERVAL_SECONDS,
        lock_timeout=settings.TOKEN_CLEANUP_LOCK_TIMEOUT_SECONDS,
        retention_days=settings.TOKEN_CLEANUP_RETENTION_DAYS,
    )
    try:
        await worker.run_forever()
    finally:
        await redis_client.aclose()


if __name__ == "__main__":
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    )
    try:
        asyncio.run(run_standalone())
    except (KeyboardInterrupt, SystemExit):
        logger.info("Processo TokenCleanupWorker finalizado.")
