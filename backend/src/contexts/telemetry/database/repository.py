"""Repositório assíncrono para operações de persistência e agregação de telemetria."""

from __future__ import annotations

from typing import Any
from uuid import UUID

from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from src.contexts.telemetry.database.models import MetricModel
from src.contexts.telemetry.domain.models import Metric


class TelemetryRepository:
    """Repositório SQLAlchemy / TimescaleDB para a tabela `metrics`."""

    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def save(self, metric: Metric) -> MetricModel:
        """Persiste uma amostra de telemetria."""
        model = MetricModel(
            id=metric.id,
            device_id=metric.device_id,
            metric_type=metric.metric_type.value
            if hasattr(metric.metric_type, "value")
            else str(metric.metric_type),
            value=metric.value,
            packet_loss=metric.packet_loss,
            timestamp=metric.timestamp,
        )
        self.session.add(model)
        await self.session.flush()
        return model

    async def save_batch(self, metrics: list[Metric]) -> None:
        """Persiste um lote de amostras telemétricas."""
        if not metrics:
            return
        models = [
            MetricModel(
                id=m.id,
                device_id=m.device_id,
                metric_type=m.metric_type.value
                if hasattr(m.metric_type, "value")
                else str(m.metric_type),
                value=m.value,
                packet_loss=m.packet_loss,
                timestamp=m.timestamp,
            )
            for m in metrics
        ]
        self.session.add_all(models)
        await self.session.flush()

    async def insert_metrics_batch(self, batch: list[dict[str, Any]]) -> None:
        """Executa inserção de alto desempenho em lote de registros brutos de métricas."""
        if not batch:
            return
        insert_sql = text("""
            INSERT INTO metrics (device_id, organization_id, metric_type, value, packet_loss, status, timestamp)
            VALUES (:device_id, :organization_id, :metric_type, :value, :packet_loss, :status, :timestamp)
        """)
        await self.session.execute(insert_sql, batch)

    async def get_latest_metrics_by_devices(self, device_ids: list[UUID]) -> list[MetricModel]:
        """Recupera os registros de métricas mais recentes para um conjunto de dispositivos."""
        if not device_ids:
            return []

        latest_subq = (
            select(
                MetricModel.device_id,
                func.max(MetricModel.timestamp).label("max_ts"),
            )
            .where(MetricModel.device_id.in_(device_ids))
            .group_by(MetricModel.device_id)
            .subquery()
        )
        metrics_stmt = select(MetricModel).join(
            latest_subq,
            (MetricModel.device_id == latest_subq.c.device_id)
            & (MetricModel.timestamp == latest_subq.c.max_ts),
        )
        result = await self.session.execute(metrics_stmt)
        return list(result.scalars().all())

    async def get_recent_metrics_for_device(
        self, device_id: UUID, limit: int = 50
    ) -> list[MetricModel]:
        """Recupera amostras cronológicas recentes de um dispositivo."""
        stmt = (
            select(MetricModel)
            .where(MetricModel.device_id == device_id)
            .order_by(MetricModel.timestamp.desc())
            .limit(limit)
        )
        result = await self.session.execute(stmt)
        return list(result.scalars().all())

    async def get_timescale_buckets(
        self,
        device_id: UUID,
        interval_sql: str = "INTERVAL '10 minutes'",
        limit_buckets: int = 60,
    ) -> list[dict[str, Any]]:
        """Recupera série temporal de métricas agregadas por time_bucket do TimescaleDB."""
        dialect_name = self.session.bind.dialect.name if self.session.bind else ""
        if dialect_name == "sqlite":
            return []

        query_sql = f"""
            SELECT 
                time_bucket({interval_sql}, timestamp) AS bucket,
                MIN(value) as min_rtt,
                AVG(value) as avg_rtt,
                MAX(value) as max_rtt,
                AVG(packet_loss) as avg_loss
            FROM metrics
            WHERE device_id = :dev_id AND metric_type = 'latency_ms'
            GROUP BY bucket
            ORDER BY bucket DESC
            LIMIT :limit_b;
        """
        result = await self.session.execute(
            text(query_sql),
            {"dev_id": device_id, "limit_b": limit_buckets},
        )
        rows = list(reversed(result.fetchall()))
        return [
            {
                "bucket": r.bucket,
                "min_rtt": r.min_rtt,
                "avg_rtt": r.avg_rtt,
                "max_rtt": r.max_rtt,
                "avg_loss": r.avg_loss,
            }
            for r in rows
        ]


__all__ = ["TelemetryRepository"]
