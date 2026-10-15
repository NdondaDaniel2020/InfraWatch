"""Agregador de rotas da camada Web do Bounded Context Alerting."""

from fastapi import APIRouter

from src.contexts.alerting.api.routes.incidents import router as incidents_router
from src.contexts.alerting.api.routes.zabbix_webhook import router as zabbix_webhook_router

router = APIRouter()

router.include_router(incidents_router)
router.include_router(zabbix_webhook_router)

__all__ = ["router"]
