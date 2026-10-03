"""Gerenciador de partições mensais da tabela de métricas.

Cria preventivamente a partição do próximo mês e expurga
partições com mais de ``retention_days`` dias.
Executa como rotina periódica (worker) ou sob demanda.
"""

import asyncio
import logging
from datetime import datetime, timezone

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

logger = logging.getLogger("infrawatch.workers.partition_manager")


def _partition_name(year: int, month: int) -> str:
    return f"metrics_y{year}m{month:02d}"


def _next_month(year: int, month: int) -> tuple[int, int]:
    if month == 12:
        return year + 1, 1
    return year, month + 1


def _prev_months(year: int, month: int, count: int) -> list[tuple[int, int]]:
    """Retorna os últimos ``count`` meses anteriores a (year, month)."""
    result = []
    y, m = year, month
    for _ in range(count):
        m -= 1
        if m == 0:
            m = 12
            y -= 1
        result.append((y, m))
    return result


class PartitionManager:
    """Cria e expurga partições mensais da tabela ``metrics``."""

    def __init__(
        self,
        session_factory: async_sessionmaker[AsyncSession],
        retention_months: int = 2,
    ) -> None:
        self._session_factory = session_factory
        self._retention_months = retention_months

    async def ensure_partition(self, year: int, month: int) -> bool:
        """Cria a partição para o mês indicado, se não existir.

        Returns:
            True se a partição foi criada, False se já existia.
        """
        name = _partition_name(year, month)
        ny, nm = _next_month(year, month)
        start = f"{year}-{month:02d}-01T00:00:00+00:00"
        end = f"{ny}-{nm:02d}-01T00:00:00+00:00"

        create_sql = text(f"""
            CREATE TABLE IF NOT EXISTS {name} PARTITION OF metrics
            FOR VALUES FROM ('{start}') TO ('{end}');
        """)

        async with self._session_factory() as session, session.begin():
            # Verifica se já existe via pg_class
            check = await session.execute(
                text("SELECT 1 FROM pg_class WHERE relname = :name"),
                {"name": name},
            )
            if check.scalar() is not None:
                logger.debug("Partição %s já existe", name)
                return False

            await session.execute(create_sql)
            logger.info("Partição %s criada com sucesso", name)
            return True

    async def ensure_upcoming_partitions(self, months_ahead: int = 2) -> int:
        """Cria partições para os próximos ``months_ahead`` meses."""
        now = datetime.now(timezone.utc)
        year, month = now.year, now.month
        created = 0

        for _ in range(months_ahead):
            if await self.ensure_partition(year, month):
                created += 1
            year, month = _next_month(year, month)

        return created

    async def purge_old_partitions(self) -> int:
        """Remove partições mais antigas que ``retention_months``.

        Usa DROP TABLE direto — liberação instantânea de espaço em disco
        sem locks prolongados que ocorreriam com DELETE.

        Returns:
            Número de partições removidas.
        """
        now = datetime.now(timezone.utc)
        old_months = _prev_months(now.year, now.month, count=12)
        dropped = 0

        async with self._session_factory() as session, session.begin():
            for oy, om in old_months:
                # Só remove se estiver fora da janela de retenção
                months_ago = (now.year - oy) * 12 + (now.month - om)
                if months_ago <= self._retention_months:
                    continue

                name = _partition_name(oy, om)
                # Verifica existência antes de dropar
                check = await session.execute(
                    text("SELECT 1 FROM pg_class WHERE relname = :name"),
                    {"name": name},
                )
                if check.scalar() is None:
                    continue

                await session.execute(text(f"DROP TABLE IF EXISTS {name};"))
                logger.info("Partição expirada %s removida (DROP TABLE)", name)
                dropped += 1

        return dropped

    async def run_maintenance(self) -> dict[str, int]:
        """Executa ciclo completo: criar próximas partições + expurgar antigas."""
        created = await self.ensure_upcoming_partitions(months_ahead=2)
        dropped = await self.purge_old_partitions()
        return {"created": created, "dropped": dropped}

    async def run_periodic(
        self,
        interval_hours: float = 24.0,
        stop_event: asyncio.Event | None = None,
    ) -> None:
        """Loop periódico de manutenção de partições."""
        logger.info("Iniciando loop de manutenção de partições (intervalo=%.1fh)", interval_hours)

        while stop_event is None or not stop_event.is_set():
            try:
                stats = await self.run_maintenance()
                logger.info(
                    "Manutenção de partições: %d criadas, %d expurgadas",
                    stats["created"], stats["dropped"],
                )

                try:
                    await asyncio.wait_for(
                        stop_event.wait() if stop_event else asyncio.sleep(interval_hours * 3600),
                        timeout=interval_hours * 3600,
                    )
                except asyncio.TimeoutError:
                    pass

            except asyncio.CancelledError:
                break
            except Exception:
                logger.exception("Erro na manutenção de partições")
                await asyncio.sleep(60.0)
