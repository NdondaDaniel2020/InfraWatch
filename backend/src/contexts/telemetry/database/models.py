"""Modelos SQLAlchemy para a tabela particionada de métricas de telemetria.

A tabela ``metrics`` é particionada por faixa de data (RANGE) no campo
``timestamp``. O SQLAlchemy não lida nativamente com particionamento —
a DDL real é emitida na migração Alembic via SQL puro.

Este modelo serve para consultas ORM, inserções em lote e type-hints.
"""

from datetime import datetime
from uuid import UUID

from sqlalchemy import DateTime, Float, Index, Integer, String, Uuid, text
from sqlalchemy.orm import Mapped, mapped_column

from src.core.database.base_model import Base


class MetricModel(Base):
    """Ponto de dado de telemetria coletado por uma sonda.

    Cada registro representa uma medição individual (latência, perda,
    jitter, etc.) vinculada a um dispositivo e um timestamp preciso.
    """

    __tablename__ = "metrics"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement="auto")
    device_id: Mapped[UUID] = mapped_column(Uuid, nullable=False, index=True)
    organization_id: Mapped[UUID] = mapped_column(Uuid, nullable=False)
    metric_type: Mapped[str] = mapped_column(
        String(50), nullable=False, comment="Tipo: latency_ms, packet_loss, jitter_ms, status_code, tls_days"
    )
    value: Mapped[float] = mapped_column(Float, nullable=False)
    packet_loss: Mapped[float] = mapped_column(Float, nullable=False, server_default=text("0.0"))
    status: Mapped[str] = mapped_column(
        String(20), nullable=False, server_default=text("'UP'"), comment="UP, DEGRADED, DOWN, TIMEOUT"
    )
    timestamp: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=text("now()"), primary_key=True
    )

    __table_args__ = (
        Index("ix_metrics_device_timestamp", "device_id", "timestamp"),
        Index("ix_metrics_org_timestamp", "organization_id", "timestamp"),
        # O particionamento é declarado na migração SQL pura, não aqui.
        # O SQLAlchemy precisa de pelo menos uma PK. Usamos (id, timestamp) composta
        # porque partições PostgreSQL exigem a coluna de partição na PK.
        {"comment": "Séries temporais de telemetria particionadas por mês (RANGE on timestamp)"},
    )

    def __repr__(self) -> str:
        return (
            f"<Metric(device={self.device_id}, type={self.metric_type}, "
            f"value={self.value}, ts={self.timestamp})>"
        )
