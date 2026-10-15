"""Injeção de dependências de autenticação para o contexto Alerting."""

from __future__ import annotations

import hmac
import logging
from typing import Annotated

from fastapi import Header, HTTPException, status

from src.core.config import get_settings

logger = logging.getLogger("infrawatch.alerting.dependencies.auth")


def verify_zabbix_webhook_token(
    x_zabbix_webhook_token: Annotated[
        str | None,
        Header(
            alias="X-Zabbix-Webhook-Token",
            description="Token secreto de autenticação do Webhook configurado no Zabbix",
        ),
    ] = None,
) -> str:
    """Valida o token do webhook em tempo constante para mitigar timing attacks."""
    try:
        from src.contexts.alerting.api.routes import zabbix_webhook as _zw_route

        settings = _zw_route.get_settings()
    except (AttributeError, TypeError, RuntimeError):
        settings = get_settings()

    expected_secret = settings.ZABBIX_WEBHOOK_SECRET

    if not expected_secret:
        logger.error("ZABBIX_WEBHOOK_SECRET não está configurado na aplicação.")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Autenticação de webhook do Zabbix não configurada no servidor.",
        )

    if not x_zabbix_webhook_token or not hmac.compare_digest(
        x_zabbix_webhook_token.strip(), expected_secret.strip()
    ):
        logger.warning("Tentativa de acesso com token de webhook do Zabbix inválido.")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token de webhook do Zabbix inválido ou ausente.",
        )

    return x_zabbix_webhook_token
