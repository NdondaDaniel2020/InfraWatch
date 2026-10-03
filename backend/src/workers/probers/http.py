"""Motor de sondagem HTTP/HTTPS.

Utiliza httpx para realizar requisições HTTP e HTTPS. Se a conexão
for HTTPS e houver um certificado atrelado à porta (ex 443), os dias
restantes de validade são calculados.
"""

import asyncio
import ssl
import time
from datetime import datetime, UTC
from urllib.parse import urlparse
import socket

import httpx

from src.workers.probers.base import BaseProber, ProbeResult
from src.workers.scheduler.in_memory_inventory import ProbeTarget


class HttpProber(BaseProber):
    """Sonda de conectividade web via protocolo HTTP/HTTPS."""

    def __init__(self) -> None:
        pass

    async def probe(self, target: ProbeTarget, timeout_ms: int = 2000) -> ProbeResult:
        """Executa a sondagem HTTP."""
        url = f"{target.protocol}://{target.ip_address}:{target.port}"
        timeout_s = timeout_ms / 1000.0

        start_time = time.perf_counter()
        
        try:
            async with httpx.AsyncClient(verify=False, timeout=timeout_s) as client:
                response = await client.get(url, headers={"User-Agent": "InfraWatch-Probe/1.0"})
                
            latency_ms = (time.perf_counter() - start_time) * 1000
            
            # Se for HTTPS, extrai a validade do TLS se possível, independente do httpx
            tls_days_left = None
            if target.protocol.lower() == "https":
                try:
                    tls_days_left = await self._get_cert_validity_days(target.ip_address, target.port, timeout_s)
                except Exception:
                    pass  # Falha silenciosa em caso de erro na coleta do cert (foco do prober é Uptime)

            status = "UP" if response.status_code < 400 else "DEGRADED"
            
            return ProbeResult(
                device_id=target.device_id,
                target_name=target.name,
                status=status,
                latency_ms=latency_ms,
                packet_loss_pct=0.0,
                extra_data={
                    "status_code": response.status_code,
                    "tls_days_left": tls_days_left,
                }
            )

        except httpx.TimeoutException:
            return ProbeResult(
                device_id=target.device_id,
                target_name=target.name,
                status="TIMEOUT",
                latency_ms=0.0,
                packet_loss_pct=100.0,
                error_message="Tempo limite da requisição HTTP excedido"
            )
        except Exception as e:
            return ProbeResult(
                device_id=target.device_id,
                target_name=target.name,
                status="DOWN",
                latency_ms=0.0,
                packet_loss_pct=100.0,
                error_message=f"Falha de conexão: {str(e)}"
            )

    async def _get_cert_validity_days(self, host: str, port: int, timeout: float) -> int | None:
        """Coleta assíncrona da data de expiração do certificado TLS."""
        
        loop = asyncio.get_running_loop()
        
        def _get_cert() -> dict | None:
            context = ssl.create_default_context()
            context.check_hostname = False
            context.verify_mode = ssl.CERT_NONE
            
            with socket.create_connection((host, port), timeout=timeout) as sock:
                with context.wrap_socket(sock, server_hostname=host) as ssock:
                    return ssock.getpeercert(binary_form=False)
                    
        try:
            cert = await asyncio.wait_for(loop.run_in_executor(None, _get_cert), timeout=timeout)
            if cert and "notAfter" in cert:
                # "notAfter": "Oct 11 08:34:00 2026 GMT"
                not_after = datetime.strptime(cert["notAfter"], "%b %d %H:%M:%S %Y %Z").replace(tzinfo=UTC)
                days_left = (not_after - datetime.now(UTC)).days
                return max(0, days_left)
        except Exception:
            return None
        return None
