"""Módulo legado para compatibilidade retroativa.

Importe preferencialmente de `src.contexts.alerting.api.dependencies`.
"""

from src.contexts.alerting.api.dependencies import (
    AuthTokenDep,
    IncidentServiceDep,
    ZabbixWebhookAuthDep,
    ZabbixWebhookServiceDep,
    get_glpi_client,
    get_incident_service,
    get_zabbix_webhook_service,
    verify_zabbix_webhook_token,
)

__all__ = [
    "AuthTokenDep",
    "IncidentServiceDep",
    "ZabbixWebhookAuthDep",
    "ZabbixWebhookServiceDep",
    "get_glpi_client",
    "get_incident_service",
    "get_zabbix_webhook_service",
    "verify_zabbix_webhook_token",
]
