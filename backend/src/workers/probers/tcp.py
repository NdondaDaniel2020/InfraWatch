"""Motor de sondagem TCP Port.

Abre uma conexão socket pura assíncrona (TCP 3-way handshake)
para validar se a porta alvo está escutando, medindo o tempo total do RTT.
"""

import asyncio
import time

from src.workers.probers.base import BaseProber, ProbeResult
from src.workers.scheduler.in_memory_inventory import ProbeTarget


class TcpProber(BaseProber):
    """Sonda de conectividade de sockets (TCP)."""

    async def probe(self, target: ProbeTarget, timeout_ms: int = 2000) -> ProbeResult:
        """Tenta abrir uma conexão TCP com a porta informada."""
        timeout_s = timeout_ms / 1000.0
        start_time = time.perf_counter()

        try:
            reader, writer = await asyncio.wait_for(
                asyncio.open_connection(target.ip_address, target.port),
                timeout=timeout_s
            )
            
            latency_ms = (time.perf_counter() - start_time) * 1000
            
            # Fecha imediatamente a conexão
            writer.close()
            await writer.wait_closed()
            
            return ProbeResult(
                device_id=target.device_id,
                target_name=target.name,
                status="UP",
                latency_ms=latency_ms,
                packet_loss_pct=0.0
            )

        except TimeoutError:
            return ProbeResult(
                device_id=target.device_id,
                target_name=target.name,
                status="TIMEOUT",
                latency_ms=0.0,
                packet_loss_pct=100.0,
                error_message="Tempo limite da conexao TCP excedido"
            )
        except ConnectionRefusedError:
            return ProbeResult(
                device_id=target.device_id,
                target_name=target.name,
                status="DOWN",
                latency_ms=0.0,
                packet_loss_pct=100.0,
                error_message="Conexao recusada pela porta (Closed)"
            )
        except Exception as e:
            return ProbeResult(
                device_id=target.device_id,
                target_name=target.name,
                status="ERROR",
                latency_ms=0.0,
                packet_loss_pct=100.0,
                error_message=f"Falha ao estabelecer socket: {str(e)}"
            )
