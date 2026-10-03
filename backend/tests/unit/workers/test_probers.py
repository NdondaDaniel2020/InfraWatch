"""Testes unitários dos executores assíncronos de rede (Probers)."""

import asyncio
from unittest.mock import AsyncMock, patch
from uuid import uuid4

import pytest
import httpx

from src.workers.scheduler.in_memory_inventory import ProbeTarget
from src.workers.probers.icmp import IcmpProber
from src.workers.probers.http import HttpProber
from src.workers.probers.tcp import TcpProber


@pytest.fixture
def dummy_target():
    return ProbeTarget(
        device_id=uuid4(),
        organization_id=uuid4(),
        name="Teste Router",
        ip_address="127.0.0.1",
        port=80,
        protocol="http",
        category="ROUTER",
        interval_seconds=60,
    )


# ---------------- ICMP PROBER TESTS ----------------

@pytest.mark.asyncio
async def test_icmp_prober_success(dummy_target):
    prober = IcmpProber(packets=1)
    
    mock_proc = AsyncMock()
    # Mock para saída saudável
    mock_proc.communicate.return_value = (
        b"3 packets transmitted, 3 received, 0% packet loss, time 2002ms\nrtt min/avg/max/mdev = 1.0/1.5/2.0/0.5 ms\n",
        b""
    )
    mock_proc.returncode = 0

    with patch("asyncio.create_subprocess_exec", return_value=mock_proc) as mock_exec:
        result = await prober.probe(dummy_target)
        
        mock_exec.assert_called_once()
        assert result.status == "UP"
        assert result.latency_ms == 1.5
        assert result.packet_loss_pct == 0.0


@pytest.mark.asyncio
async def test_icmp_prober_down(dummy_target):
    prober = IcmpProber(packets=1)
    
    mock_proc = AsyncMock()
    mock_proc.communicate.return_value = (
        b"3 packets transmitted, 0 received, 100% packet loss, time 2002ms\n",
        b""
    )
    mock_proc.returncode = 1

    with patch("asyncio.create_subprocess_exec", return_value=mock_proc):
        result = await prober.probe(dummy_target)
        assert result.status == "DOWN"
        assert result.packet_loss_pct == 100.0


@pytest.mark.asyncio
async def test_icmp_prober_timeout(dummy_target):
    prober = IcmpProber(packets=1)
    
    mock_proc = AsyncMock()
    mock_proc.communicate.side_effect = asyncio.TimeoutError()

    with patch("asyncio.create_subprocess_exec", return_value=mock_proc):
        result = await prober.probe(dummy_target)
        assert result.status == "TIMEOUT"
        assert "limite" in result.error_message


# ---------------- HTTP PROBER TESTS ----------------

@pytest.mark.asyncio
async def test_http_prober_success(dummy_target):
    prober = HttpProber()
    dummy_target.protocol = "http"
    
    mock_response = AsyncMock()
    mock_response.status_code = 200
    
    with patch("httpx.AsyncClient.get", return_value=mock_response):
        result = await prober.probe(dummy_target)
        
        assert result.status == "UP"
        assert result.extra_data["status_code"] == 200
        assert result.packet_loss_pct == 0.0
        assert result.latency_ms >= 0


@pytest.mark.asyncio
async def test_http_prober_degraded_on_error_code(dummy_target):
    prober = HttpProber()
    
    mock_response = AsyncMock()
    mock_response.status_code = 500
    
    with patch("httpx.AsyncClient.get", return_value=mock_response):
        result = await prober.probe(dummy_target)
        
        assert result.status == "DEGRADED"
        assert result.extra_data["status_code"] == 500


@pytest.mark.asyncio
async def test_http_prober_timeout(dummy_target):
    prober = HttpProber()
    
    with patch("httpx.AsyncClient.get", side_effect=httpx.TimeoutException("timeout")):
        result = await prober.probe(dummy_target)
        assert result.status == "TIMEOUT"


# ---------------- TCP PROBER TESTS ----------------

@pytest.mark.asyncio
async def test_tcp_prober_success(dummy_target):
    prober = TcpProber()
    
    mock_reader = AsyncMock()
    mock_writer = AsyncMock()
    
    with patch("asyncio.open_connection", return_value=(mock_reader, mock_writer)):
        result = await prober.probe(dummy_target)
        assert result.status == "UP"
        assert result.latency_ms >= 0
        mock_writer.close.assert_called_once()
        mock_writer.wait_closed.assert_called_once()


@pytest.mark.asyncio
async def test_tcp_prober_refused(dummy_target):
    prober = TcpProber()
    
    with patch("asyncio.open_connection", side_effect=ConnectionRefusedError()):
        result = await prober.probe(dummy_target)
        assert result.status == "DOWN"
        assert "recusada" in result.error_message


@pytest.mark.asyncio
async def test_tcp_prober_timeout(dummy_target):
    prober = TcpProber()
    
    with patch("asyncio.wait_for", side_effect=asyncio.TimeoutError()):
        result = await prober.probe(dummy_target)
        assert result.status == "TIMEOUT"
