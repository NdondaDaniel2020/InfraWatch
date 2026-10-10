"""Camada de persistência relacional do contexto de Alerting."""

from src.contexts.alerting.database.models import IncidentModel
from src.contexts.alerting.database.repository import IncidentRepository

__all__ = ["IncidentModel", "IncidentRepository"]
