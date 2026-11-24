"""Entidades puras de domínio para o Bounded Context Telemetry."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime
from enum import Enum
from uuid import UUID, uuid4


class MetricType(str, Enum):
    """Tipos de métricas e grandezas telemétricas suportadas."""

    LATENCY_MS = "latency_ms"
    PACKET_LOSS = "packet_loss"
    JITTER = "jitter"
    CPU_USAGE = "cpu_usage"
    MEMORY_USAGE = "memory_usage"
    BANDWIDTH_IN = "bandwidth_in"
    BANDWIDTH_OUT = "bandwidth_out"


@dataclass(frozen=True)
class TelemetryBucket:
    """Bucket analítico agregado retornado pelo TimescaleDB."""

    timestamp: datetime
    min_value: float
    avg_value: float
    max_value: float
    avg_packet_loss: float


class Metric:
    """Entidade pura de domínio representando uma amostra de telemetria."""

    def __init__(
        self,
        device_id: UUID,
        metric_type: MetricType | str,
        value: float,
        timestamp: datetime | None = None,
        packet_loss: float = 0.0,
        jitter: float | None = None,
        id: UUID | None = None,
    ) -> None:
        self.id = id or uuid4()
        self.device_id = device_id
        self.metric_type = MetricType(metric_type) if isinstance(metric_type, str) else metric_type
        self.value = float(value)
        self.timestamp = timestamp or datetime.now(UTC)
        self.packet_loss = float(packet_loss)
        self.jitter = float(jitter) if jitter is not None else None

    def __repr__(self) -> str:
        return f"<Metric {self.metric_type.value}={self.value} device={self.device_id} at={self.timestamp}>"
