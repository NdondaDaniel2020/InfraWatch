"""Re-exportações públicas do pacote de dependências da API de Alerting."""

from src.contexts.alerting.api.dependencies.auth import (
    AuthTokenDep,
    ZabbixWebhookAuthDep,
    verify_zabbix_webhook_token,
)
from src.contexts.alerting.api.dependencies.services import (
    IncidentServiceDep,
    ZabbixWebhookServiceDep,
    get_glpi_client,
    get_incident_service,
    get_zabbix_webhook_service,
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
