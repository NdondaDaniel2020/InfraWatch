"""Camada de domínio pura do contexto de Alerting."""

from src.contexts.alerting.domain.evaluator import (
    EvaluationResult,
    FailureEvaluator,
)
from src.contexts.alerting.domain.events import (
    DeviceDegradedEvent,
    IncidentAcknowledgedEvent,
    IncidentResolvedEvent,
    IncidentTriggeredEvent,
)
from src.contexts.alerting.domain.exceptions import (
    IncidentAlreadyAcknowledgedError,
    IncidentAlreadyResolvedError,
    IncidentDomainError,
    IncidentNotFoundError,
    InvalidIncidentTransitionError,
)
from src.contexts.alerting.domain.incident import (
    Incident,
    IncidentSeverity,
    IncidentStatus,
)
from src.contexts.alerting.domain.state_machine import (
    DeviceHealthStatus,
    HealthStateMachine,
    InvalidStateTransitionError,
)

__all__ = [
    "DeviceDegradedEvent",
    "DeviceHealthStatus",
    "EvaluationResult",
    "FailureEvaluator",
    "HealthStateMachine",
    "Incident",
    "IncidentAcknowledgedEvent",
    "IncidentAlreadyAcknowledgedError",
    "IncidentAlreadyResolvedError",
    "IncidentDomainError",
    "IncidentNotFoundError",
    "IncidentResolvedEvent",
    "IncidentSeverity",
    "IncidentStatus",
    "IncidentTriggeredEvent",
    "InvalidIncidentTransitionError",
    "InvalidStateTransitionError",
]
