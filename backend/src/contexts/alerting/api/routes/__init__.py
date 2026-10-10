"""Roteadores da camada de API do contexto de Alerting."""

from src.contexts.alerting.api.routes.incidents import router as incidents_router
from src.contexts.alerting.api.routes.zabbix_webhook import router as zabbix_webhook_router

__all__ = ["incidents_router", "zabbix_webhook_router"]
