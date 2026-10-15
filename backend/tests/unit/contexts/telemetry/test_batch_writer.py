from unittest.mock import MagicMock
from uuid import uuid4

import pytest

from src.contexts.telemetry.services.batch_writer import MetricsBatchWriter
from src.workers.probers.base import ProbeResult


@pytest.mark.asyncio
async def test_batch_writer_enqueue_handles_non_numeric_extra_data() -> None:
    session_factory = MagicMock()
    writer = MetricsBatchWriter(session_factory=session_factory, batch_size=100)

    device_id = uuid4()
    org_id = uuid4()

    probe_result = ProbeResult(
        device_id=device_id,
        target_name="test-container",
        status="UP",
        latency_ms=15.5,
        packet_loss_pct=0.0,
        extra_data={
            "container_id": "abc123def456",  # string não numérica -> ignorada
            "container_status": "running",  # string não numérica -> ignorada
            "cpu_usage_pct": 12.5,  # float -> aceito
            "memory_usage_pct": 45.0,  # float -> aceito
            "restart_count": 0,  # int -> aceito como float
            "oom_killed": False,  # bool -> aceito como 0.0
        },
    )

    writer.enqueue(probe_result, organization_id=org_id)

    # 1 métrica de latência + 1 perda de pacotes + 4 métricas numéricas extras = 6 pontos
    assert writer.pending_count == 6

    # Verifica os tipos enfileirados
    metric_types = [p["metric_type"] for p in writer._buffer]
    assert "latency_ms" in metric_types
    assert "packet_loss" in metric_types
    assert "cpu_usage_pct" in metric_types
    assert "memory_usage_pct" in metric_types
    assert "restart_count" in metric_types
    assert "oom_killed" in metric_types
    assert "container_id" not in metric_types
    assert "container_status" not in metric_types
