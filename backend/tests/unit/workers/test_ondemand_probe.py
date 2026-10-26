"""Testes unitários do fluxo de sondas on-demand no ProbeWorkerDaemon."""

from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest

from src.workers.daemons.probe_worker import ProbeWorkerDaemon
from src.workers.probers.base import ProbeResult
from src.workers.probers.ondemand_command import OnDemandProbeCommand


def test_ondemand_probe_command_serialization():
    cmd = OnDemandProbeCommand(
        probe_id="test-probe-123",
        node_id="test-node-456",
        ip_address="192.168.1.100",
        timeout_ms=3000,
        organization_id="org-789",
    )
    serialized = cmd.to_dict()
    assert serialized["probe_id"] == "test-probe-123"
    assert serialized["timeout_ms"] == "3000"

    deserialized = OnDemandProbeCommand.from_dict(serialized)
    assert deserialized.probe_id == cmd.probe_id
    assert deserialized.timeout_ms == 3000
    assert deserialized.ip_address == "192.168.1.100"


def test_ondemand_probe_command_bytes_deserialization():
    raw_redis_dict = {
        b"probe_id": b"probe-abc",
        b"node_id": b"node-xyz",
        b"ip_address": b"10.0.0.1",
        b"timeout_ms": b"5000",
        b"organization_id": b"org-123",
    }
    cmd = OnDemandProbeCommand.from_dict(raw_redis_dict)
    assert cmd.probe_id == "probe-abc"
    assert cmd.node_id == "node-xyz"
    assert cmd.ip_address == "10.0.0.1"
    assert cmd.timeout_ms == 5000


@pytest.mark.asyncio
async def test_execute_ondemand_probe_broadcasts_and_publishes():
    mock_bus = MagicMock()
    mock_bus.publish = AsyncMock(return_value=True)

    mock_session_factory = MagicMock()

    daemon = ProbeWorkerDaemon(
        event_bus=mock_bus,
        session_factory=mock_session_factory,
    )

    cmd = OnDemandProbeCommand(
        probe_id="p-123",
        node_id=str(uuid4()),
        ip_address="127.0.0.1",
        timeout_ms=2000,
        organization_id=str(uuid4()),
    )

    mock_probe_result = ProbeResult(
        device_id=uuid4(),
        target_name="test-target",
        status="UP",
        latency_ms=1.5,
        packet_loss_pct=0.0,
    )

    with (
        patch("src.workers.probers.icmp.IcmpProber.probe", new_callable=AsyncMock) as mock_icmp,
        patch("src.workers.daemons.probe_worker.get_sse_broadcaster") as mock_get_sse,
    ):
        mock_icmp.return_value = mock_probe_result
        mock_sse = MagicMock()
        mock_sse.broadcast = AsyncMock(return_value=1)
        mock_get_sse.return_value = mock_sse

        await daemon._execute_ondemand_probe(cmd)

        mock_icmp.assert_awaited_once()
        mock_sse.broadcast.assert_awaited_once()
        mock_bus.publish.assert_awaited_once_with(
            "stream:sse:broadcast",
            {
                "event_type": "probe_result",
                "probe_id": "p-123",
                "node_id": cmd.node_id,
                "status": "UP",
                "rtt_ms": 1.5,
                "packet_loss": 0.0,
                "error": None,
                "organization_id": cmd.organization_id,
            },
        )
