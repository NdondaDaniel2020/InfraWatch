"""Rotas da aplicação."""

from src.api.routes.zabbix_webhook import router as zabbix_webhook_router

__all__ = ["zabbix_webhook_router"]
