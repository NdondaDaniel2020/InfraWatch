"""Módulo legado para compatibilidade retroativa.

Importe preferencialmente de `src.contexts.alerting.api.dependencies`.
"""

from src.contexts.alerting.api.dependencies import (
    IncidentServiceDep,
    get_glpi_client,
    get_incident_service,
    verify_zabbix_webhook_token,
)

__all__ = [
    "IncidentServiceDep",
    "get_glpi_client",
    "get_incident_service",
    "verify_zabbix_webhook_token",
]
