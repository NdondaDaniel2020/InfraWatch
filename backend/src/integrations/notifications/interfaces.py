"""Interfaces e modelos de dados para notificações multicanal (ADR-022, ADR-023)."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import UTC, datetime
from enum import Enum
from typing import Any, Protocol, runtime_checkable
from uuid import UUID


class AlertSeverity(str, Enum):
    """Níveis de severidade de alerta para roteamento de canais."""

    INFO = "INFO"
    DEGRADED = "DEGRADED"
    CRITICAL = "CRITICAL"
    RESOLVED = "RESOLVED"


@dataclass(frozen=True)
class AlertMessage:
    """Payload padronizado de mensagem de alerta multicanal."""

    title: str
    description: str
    severity: AlertSeverity
    device_id: UUID | None = None
    device_name: str | None = None
    device_ip: str | None = None
    timestamp: datetime = field(default_factory=lambda: datetime.now(UTC))
    downtime_minutes: float | None = None
    extra_data: dict[str, Any] = field(default_factory=dict)

    def format_summary(self) -> str:
        """Retorna sumário formatado para texto simples."""
        parts = [f"[{self.severity.value}] {self.title}"]
        if self.device_name:
            ip_str = f" ({self.device_ip})" if self.device_ip else ""
            parts.append(f"Ativo: {self.device_name}{ip_str}")
        parts.append(self.description)
        if self.downtime_minutes is not None and self.downtime_minutes > 0:
            parts.append(f"Tempo de indisponibilidade: {self.downtime_minutes:.1f} minutos")
        return "\n".join(parts)


@runtime_checkable
class NotificationChannel(Protocol):
    """Protocolo padronizado para provedores de envio de mensagens (Strategy Pattern)."""

    name: str

    async def send(self, alert: AlertMessage, recipient: str | None = None) -> bool:
        """Despacha a mensagem de alerta para o canal configurado.

        Returns:
            bool: True se despachado com sucesso, False caso contrário.
        """
        ...

    async def is_available(self) -> bool:
        """Verifica se as credenciais e o canal estão devidamente configurados."""
        ...
