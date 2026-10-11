"""Buffer assíncrono para descarga em lote de medições de telemetria.

Acumula ``ProbeResult`` em memória e descarrega para o PostgreSQL quando
o buffer atinge ``batch_size`` registros ou o intervalo ``flush_interval``
expira — o que acontecer primeiro.

Utiliza ``executemany`` para maximizar a taxa de inserção via asyncpg.
"""

import asyncio
import logging
import time
from collections import deque
from datetime import datetime, UTC
from typing import Any
from uuid import UUID

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from src.workers.probers.base import ProbeResult

logger = logging.getLogger("infrawatch.telemetry.batch_writer")


class MetricsBatchWriter:
    """Buffer assíncrono que acumula pontos de telemetria e descarrega em lote."""

    def __init__(
        self,
        session_factory: async_sessionmaker[AsyncSession],
        batch_size: int = 1000,
        flush_interval_seconds: float = 5.0,
    ) -> None:
        self._session_factory = session_factory
        self._batch_size = batch_size
        self._flush_interval = flush_interval_seconds
        self._buffer: deque[dict[str, Any]] = deque()
        self._lock = asyncio.Lock()
        self._flush_event = asyncio.Event()

    @property
    def pending_count(self) -> int:
        """Quantidade de pontos pendentes no buffer."""
        return len(self._buffer)

    @property
    def flush_interval(self) -> float:
        """Intervalo (em segundos) entre cada descarga automática do buffer."""
        return self._flush_interval

    def enqueue(self, result: ProbeResult, organization_id: UUID) -> None:
        """Adiciona um resultado de sondagem ao buffer.

        Gera múltiplos registros de métricas a partir de um único ProbeResult:
        latência, perda de pacotes e, opcionalmente, dados extras (status_code, tls_days).
        """
        now = datetime.now(UTC)
        base = {
            "device_id": str(result.device_id),
            "organization_id": str(organization_id),
            "status": result.status,
            "timestamp": now,
        }

        # Métrica principal: latência
        self._buffer.append({
            **base,
            "metric_type": "latency_ms",
            "value": result.latency_ms,
            "packet_loss": result.packet_loss_pct,
        })

        # Métrica de perda de pacotes
        self._buffer.append({
            **base,
            "metric_type": "packet_loss",
            "value": result.packet_loss_pct,
            "packet_loss": result.packet_loss_pct,
        })

        # Métricas extras (TLS, status_code, etc.)
        if result.extra_data:
            for key, val in result.extra_data.items():
                if val is not None:
                    self._buffer.append({
                        **base,
                        "metric_type": key,
                        "value": float(val),
                        "packet_loss": 0.0,
                    })

        # Dispara flush se atingiu o tamanho do lote
        if len(self._buffer) >= self._batch_size:
            self._flush_event.set()

    async def flush(self) -> int:
        """Descarrega o buffer para o banco de dados.

        Returns:
            Número de registros inseridos.
        """
        async with self._lock:
            if not self._buffer:
                return 0

            # Copia e limpa o buffer atomicamente
            batch = list(self._buffer)
            self._buffer.clear()
            self._flush_event.clear()

        # Inserção em lote via executemany (asyncpg faz pipelining nativo)
        insert_sql = text("""
            INSERT INTO metrics (device_id, organization_id, metric_type, value, packet_loss, status, timestamp)
            VALUES (:device_id, :organization_id, :metric_type, :value, :packet_loss, :status, :timestamp)
        """)

        start = time.perf_counter()
        try:
            async with self._session_factory() as session, session.begin():
                await session.execute(insert_sql, batch)

            elapsed_ms = (time.perf_counter() - start) * 1000
            logger.info(
                "Flush concluído: %d métricas inseridas em %.1fms",
                len(batch), elapsed_ms,
            )
            return len(batch)

        except Exception:
            logger.exception("Erro ao descarregar lote de %d métricas. Re-enfileirando.", len(batch))
            # Re-enfileira para não perder dados
            async with self._lock:
                self._buffer.extendleft(reversed(batch))
            return 0

    async def run_flush_loop(self, stop_event: asyncio.Event | None = None) -> None:
        """Loop contínuo que descarrega o buffer por tempo ou volume."""
        logger.info(
            "Iniciando flush loop (batch_size=%d, interval=%.1fs)",
            self._batch_size, self._flush_interval,
        )

        while stop_event is None or not stop_event.is_set():
            try:
                # Aguarda: flush_event (buffer cheio) ou timeout (intervalo periódico)
                try:
                    await asyncio.wait_for(
                        self._flush_event.wait(),
                        timeout=self._flush_interval,
                    )
                except asyncio.TimeoutError:
                    pass  # Flush periódico por tempo

                await self.flush()

            except asyncio.CancelledError:
                # Flush final antes de encerrar
                logger.info("Flush loop interrompido. Descarregando buffer residual...")
                await self.flush()
                break
            except Exception:
                logger.exception("Erro inesperado no flush loop")
                await asyncio.sleep(1.0)
