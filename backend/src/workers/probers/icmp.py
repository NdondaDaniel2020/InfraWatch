"""Motor de sondagem via Ping (ICMP).

Utiliza o utilitário nativo de sistema operacional `ping` envelopado
em asyncio.create_subprocess_exec para não depender de pacotes de terceiros
ou privilégios root.
"""

import asyncio
import re
from typing import Optional

from src.workers.probers.base import BaseProber, ProbeResult
from src.workers.scheduler.in_memory_inventory import ProbeTarget


class IcmpProber(BaseProber):
    """Sonda de conectividade executando ping do sistema de forma assíncrona."""

    def __init__(self, packets: int = 3):
        self.packets = packets

    async def probe(self, target: ProbeTarget, timeout_ms: int = 2000) -> ProbeResult:
        """Executa ping (3 pacotes por padrão)."""
        # Formata argumentos dependendo do OS e timeout
        timeout_s = max(1, timeout_ms // 1000)
        
        args = ["-c", str(self.packets), "-W", str(timeout_s), target.ip_address]
        
        try:
            # Em Mac/Linux `ping` funciona de forma semelhante
            proc = await asyncio.create_subprocess_exec(
                "ping",
                *args,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            
            # Limita a execução no asyncio
            stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=timeout_s * 2.0)
            output = stdout.decode("utf-8", errors="ignore")
            
            # Analisa o output
            return self._parse_ping_output(target, output, proc.returncode)

        except TimeoutError:
            return ProbeResult(
                device_id=target.device_id,
                target_name=target.name,
                status="TIMEOUT",
                latency_ms=0.0,
                packet_loss_pct=100.0,
                error_message="Tempo limite do comando de ping excedido",
            )
        except Exception as e:
            return ProbeResult(
                device_id=target.device_id,
                target_name=target.name,
                status="ERROR",
                latency_ms=0.0,
                packet_loss_pct=100.0,
                error_message=f"Falha ao executar ping: {str(e)}",
            )

    def _parse_ping_output(self, target: ProbeTarget, output: str, returncode: Optional[int]) -> ProbeResult:
        """Analisa a saída padrão do comando ping."""
        # Se 100% loss ou erro
        if returncode != 0 and "100% packet loss" in output or "100.0% packet loss" in output:
            return ProbeResult(
                device_id=target.device_id,
                target_name=target.name,
                status="DOWN",
                latency_ms=0.0,
                packet_loss_pct=100.0,
            )

        # Expressões regulares para latência e perda
        loss_match = re.search(r"(\d+(?:\.\d+)?)%\s*packet loss", output)
        latency_match = re.search(r"(?:rtt|round-trip)\s+min/avg/max/(?:mdev|stddev)\s+=\s+[\d\.]+/(?P<avg>[\d\.]+)/", output)

        loss = float(loss_match.group(1)) if loss_match else 100.0
        latency = float(latency_match.group("avg")) if latency_match else 0.0

        if loss == 100.0:
            status = "DOWN"
        elif loss > 0.0:
            status = "DEGRADED"
        else:
            status = "UP"

        return ProbeResult(
            device_id=target.device_id,
            target_name=target.name,
            status=status,
            latency_ms=latency,
            packet_loss_pct=loss,
        )
