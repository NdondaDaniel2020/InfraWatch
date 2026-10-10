"""Roteamento de webhook do Zabbix exportado para a camada de rotas de API da aplicação.

Implementação e contratos residem no Bounded Context: Alerting
(src.contexts.alerting.api.routes.zabbix_webhook).
"""

from src.contexts.alerting.api.routes.zabbix_webhook import (
    AuthTokenDep,
    handle_zabbix_webhook,
    router,
    verify_zabbix_webhook_token,
)

__all__ = ["AuthTokenDep", "handle_zabbix_webhook", "router", "verify_zabbix_webhook_token"]
