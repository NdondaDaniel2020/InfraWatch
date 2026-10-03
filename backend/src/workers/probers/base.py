"""Executores abstratos de sondagem de rede.

Define os tipos de resultados devolvidos pelos motores de monitoramento.
"""

from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Optional
from uuid import UUID

from src.workers.scheduler.in_memory_inventory import ProbeTarget


@dataclass
class ProbeResult:
    """Resultado unificado de qualquer execução de sonda (ICMP, TCP, HTTP)."""

    device_id: UUID
    target_name: str
    status: str  # "UP", "DEGRADED", "DOWN", "TIMEOUT", "ERROR"
    latency_ms: float
    packet_loss_pct: float
    error_message: Optional[str] = None
    extra_data: Optional[dict] = None


class BaseProber(ABC):
    """Classe base para executores de sondagem.

    Todas as implementações devem fornecer um método assíncrono `probe`
    capaz de ser executado de forma concorrente em um pool.
    """

    @abstractmethod
    async def probe(self, target: ProbeTarget, timeout_ms: int = 2000) -> ProbeResult:
        """Executa a sondagem no dispositivo alvo."""
        ...
