"""Máquina de estados finita de saúde de dispositivos de rede.

Define os estados operacionais possíveis (UP, DEGRADED, DOWN, MAINTENANCE),
as transições permitidas e as regras de validação para preservar a integridade
das métricas de monitoramento.
"""

from __future__ import annotations

from enum import Enum
from typing import ClassVar


class DeviceHealthStatus(str, Enum):
    """Estados operacionais de saúde de um dispositivo monitorado."""

    UP = "UP"
    DEGRADED = "DEGRADED"
    DOWN = "DOWN"
    MAINTENANCE = "MAINTENANCE"


class InvalidStateTransitionError(ValueError):
    """Lançada quando uma transição de estado não permitida é requisitada."""

    def __init__(
        self,
        from_state: DeviceHealthStatus | str,
        to_state: DeviceHealthStatus | str,
        reason: str | None = None,
    ) -> None:
        self.from_state = from_state
        self.to_state = to_state
        msg = f"Transição de estado inválida: de '{from_state}' para '{to_state}'."
        if reason:
            msg += f" Motivo: {reason}."
        super().__init__(msg)


class HealthStateMachine:
    """Máquina de estados para validação de transições de integridade de ativos.

    Matriz de Transições:
      • UP -> {UP, DEGRADED, DOWN, MAINTENANCE}
      • DEGRADED -> {DEGRADED, UP, DOWN, MAINTENANCE}
      • DOWN -> {DOWN, UP, DEGRADED, MAINTENANCE}
      • MAINTENANCE -> {MAINTENANCE, UP}
    """

    # Matriz estrita de transições válidas
    _VALID_TRANSITIONS: ClassVar[dict[DeviceHealthStatus, set[DeviceHealthStatus]]] = {
        DeviceHealthStatus.UP: {
            DeviceHealthStatus.UP,
            DeviceHealthStatus.DEGRADED,
            DeviceHealthStatus.DOWN,
            DeviceHealthStatus.MAINTENANCE,
        },
        DeviceHealthStatus.DEGRADED: {
            DeviceHealthStatus.DEGRADED,
            DeviceHealthStatus.UP,
            DeviceHealthStatus.DOWN,
            DeviceHealthStatus.MAINTENANCE,
        },
        DeviceHealthStatus.DOWN: {
            DeviceHealthStatus.DOWN,
            DeviceHealthStatus.UP,
            DeviceHealthStatus.DEGRADED,
            DeviceHealthStatus.MAINTENANCE,
        },
        DeviceHealthStatus.MAINTENANCE: {
            DeviceHealthStatus.MAINTENANCE,
            DeviceHealthStatus.UP,
        },
    }

    @classmethod
    def _coerce_status(cls, state: DeviceHealthStatus | str) -> DeviceHealthStatus:
        """Converte strings em instâncias de DeviceHealthStatus se necessário."""
        if isinstance(state, DeviceHealthStatus):
            return state
        try:
            return DeviceHealthStatus(state.upper())
        except (ValueError, AttributeError):
            raise InvalidStateTransitionError(state, "UNKNOWN", f"Estado '{state}' não reconhecido")

    def can_transition(
        self,
        from_state: DeviceHealthStatus | str,
        to_state: DeviceHealthStatus | str,
    ) -> bool:
        """Verifica se uma transição de estado é permitida pela matriz de transições."""
        try:
            src = self._coerce_status(from_state)
            dst = self._coerce_status(to_state)
        except InvalidStateTransitionError:
            return False

        allowed_destinations = self._VALID_TRANSITIONS.get(src, set())
        return dst in allowed_destinations

    def transition(
        self,
        from_state: DeviceHealthStatus | str,
        to_state: DeviceHealthStatus | str,
    ) -> DeviceHealthStatus:
        """Valida e executa a transição entre estados.

        Retorna o novo estado destino ou lança ``InvalidStateTransitionError``.
        """
        src = self._coerce_status(from_state)
        dst = self._coerce_status(to_state)

        if not self.can_transition(src, dst):
            raise InvalidStateTransitionError(
                src,
                dst,
                f"Estado '{src.value}' não pode transicionar diretamente para '{dst.value}'",
            )

        return dst
