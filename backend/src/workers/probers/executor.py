"""Executor de sondagem com controle de concorrência.

Coordena a execução dos diferentes tipos de probers (ICMP, HTTP, TCP)
com limite global de concorrência para proteger o OS (Too many open files).
"""

import asyncio
from typing import Dict

from src.workers.probers.base import BaseProber, ProbeResult
from src.workers.probers.http import HttpProber
from src.workers.probers.icmp import IcmpProber
from src.workers.probers.tcp import TcpProber
from src.workers.scheduler.in_memory_inventory import ProbeTarget


class ProbeExecutor:
    """Fábrica e despachante central de sondagens."""

    def __init__(self, max_concurrent: int = 250):
        # Semáforo global assíncrono (evita "Too many open files" e esgotamento do loop)
        self.semaphore = asyncio.Semaphore(max_concurrent)
        
        # Instancia os probers (eles são thread-safe / coroutine-safe por natureza)
        self.probers: Dict[str, BaseProber] = {
            "icmp": IcmpProber(),
            "http": HttpProber(),
            "https": HttpProber(),
            "tcp": TcpProber(),
        }

    async def execute(self, target: ProbeTarget, timeout_ms: int = 2000) -> ProbeResult:
        """Executa a sonda apropriada respeitando o semáforo de concorrência."""
        protocol = target.protocol.lower()
        prober = self.probers.get(protocol)
        
        # Fallback para ping (ICMP) se o protocolo não for específico (ou tcp genérico)
        if not prober:
            if target.port > 0:
                prober = self.probers["tcp"]
            else:
                prober = self.probers["icmp"]

        async with self.semaphore:
            return await prober.probe(target, timeout_ms=timeout_ms)
