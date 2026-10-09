"""Camada de domínio pura do contexto de Alerting."""

from src.contexts.alerting.domain.evaluator import (
    EvaluationResult,
    FailureEvaluator,
)
from src.contexts.alerting.domain.events import (
    DeviceDegradedEvent,
    IncidentResolvedEvent,
    IncidentTriggeredEvent,
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
    "IncidentResolvedEvent",
    "IncidentTriggeredEvent",
    "InvalidStateTransitionError",
]
