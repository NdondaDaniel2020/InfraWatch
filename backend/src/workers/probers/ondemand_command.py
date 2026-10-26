"""Contrato de comando assíncrono para execução de sondas on-demand.

Utilizado para comunicação via Redis Stream ('stream:probes:ondemand')
entre a API REST de topologia e o daemon ProbeWorker.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass
class OnDemandProbeCommand:
    """Comando de disparo de sonda sob demanda disparado por operador."""

    probe_id: str
    node_id: str
    ip_address: str
    timeout_ms: int = 5000
    organization_id: str = ""

    def to_dict(self) -> dict[str, str]:
        """Serializa os campos em strings para compatibilidade estrita com Redis Streams."""
        return {
            "probe_id": self.probe_id,
            "node_id": self.node_id,
            "ip_address": self.ip_address,
            "timeout_ms": str(self.timeout_ms),
            "organization_id": self.organization_id,
        }

    @classmethod
    def from_dict(cls, data: dict[str, str | bytes]) -> OnDemandProbeCommand:
        """Desserializa do formato Redis Streams decodificando bytes para str."""
        decoded = {
            (k.decode() if isinstance(k, bytes) else k): (
                v.decode() if isinstance(v, bytes) else str(v)
            )
            for k, v in data.items()
        }
        return cls(
            probe_id=decoded.get("probe_id", ""),
            node_id=decoded.get("node_id", ""),
            ip_address=decoded.get("ip_address", ""),
            timeout_ms=int(decoded.get("timeout_ms", "5000")),
            organization_id=decoded.get("organization_id", ""),
        )
