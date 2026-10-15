"""Re-exportações públicas do pacote de dependências da API de Alerting."""

from src.contexts.alerting.api.dependencies.auth import verify_zabbix_webhook_token
from src.contexts.alerting.api.dependencies.services import (
    IncidentServiceDep,
    get_glpi_client,
    get_incident_service,
)

__all__ = [
    "IncidentServiceDep",
    "get_glpi_client",
    "get_incident_service",
    "verify_zabbix_webhook_token",
]
