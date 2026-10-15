"""Re-exportações públicas do pacote de dependências da API de Telemetria."""

from src.contexts.telemetry.api.dependencies.services import (
    HeartbeatServiceDep,
    get_heartbeat_service,
)

__all__ = [
    "HeartbeatServiceDep",
    "get_heartbeat_service",
]
