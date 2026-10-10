"""Exceções de negócio do contexto de Alerting e Gestão de Incidentes."""

from __future__ import annotations

from uuid import UUID


class IncidentDomainError(Exception):
    """Exceção base para regras de negócio do contexto de incidentes."""


class IncidentNotFoundError(IncidentDomainError):
    """Lançada quando um incidente solicitado não é encontrado no repositório."""

    def __init__(self, incident_id: UUID | str) -> None:
        self.incident_id = incident_id
        super().__init__(f"Incidente com identificador '{incident_id}' não foi encontrado.")


class IncidentAlreadyAcknowledgedError(IncidentDomainError):
    """Lançada quando uma tentativa de reconhecimento inválida ocorre."""

    def __init__(self, message: str = "O incidente já foi reconhecido anteriormente.") -> None:
        super().__init__(message)


class IncidentAlreadyResolvedError(IncidentDomainError):
    """Lançada quando operações de mutação são tentadas em incidentes já resolvidos."""

    def __init__(self, message: str = "O incidente já se encontra resolvido.") -> None:
        super().__init__(message)


class InvalidIncidentTransitionError(IncidentDomainError):
    """Lançada quando uma transição de status de incidente viola a máquina de estados."""

    def __init__(self, from_status: str, to_status: str, reason: str = "") -> None:
        msg = f"Transição inválida de incidente: '{from_status}' -> '{to_status}'."
        if reason:
            msg += f" Motivo: {reason}."
        super().__init__(msg)
