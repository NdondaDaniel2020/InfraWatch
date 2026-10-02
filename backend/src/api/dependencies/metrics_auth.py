"""Dependência de autenticação para o endpoint de telemetria /metrics (ADR-025).

Exige autenticação HTTP Basic Auth (ou Bearer Token de serviço) dedicada ao
scraper do Prometheus, evitando exposição pública de métricas de infraestrutura.
"""

from __future__ import annotations

import secrets
from typing import Annotated

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPBasic, HTTPBasicCredentials

from src.core.config import get_settings

security = HTTPBasic(auto_error=False)


async def verify_metrics_auth(
    request: Request,
    credentials: Annotated[HTTPBasicCredentials | None, Depends(security)] = None,
) -> None:
    """Valida as credenciais do scraper de métricas do Prometheus."""
    settings = get_settings()

    if not settings.METRICS_REQUIRE_AUTH:
        return

    # 1. Verifica se foi enviado Bearer Token de serviço no header Authorization
    auth_header = request.headers.get("Authorization")
    if auth_header and auth_header.startswith("Bearer "):
        token = auth_header.removeprefix("Bearer ").strip()
        expected_secret = settings.PROMETHEUS_METRICS_PASSWORD
        if secrets.compare_digest(token.encode("utf-8"), expected_secret.encode("utf-8")):
            return

    # 2. Verifica HTTP Basic Auth
    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Autenticação obrigatória para acesso às métricas de telemetria.",
            headers={"WWW-Authenticate": 'Basic realm="Prometheus Metrics"'},
        )

    expected_user = settings.PROMETHEUS_METRICS_USER.encode("utf-8")
    expected_pass = settings.PROMETHEUS_METRICS_PASSWORD.encode("utf-8")

    is_user_valid = secrets.compare_digest(credentials.username.encode("utf-8"), expected_user)
    is_pass_valid = secrets.compare_digest(credentials.password.encode("utf-8"), expected_pass)

    if not (is_user_valid and is_pass_valid):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Credenciais inválidas para o scraper de métricas.",
            headers={"WWW-Authenticate": 'Basic realm="Prometheus Metrics"'},
        )
