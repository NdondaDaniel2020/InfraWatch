"""Módulo de segurança e gerenciamento de tokens JWT para o InfraWatch."""

import uuid
from datetime import UTC, datetime, timedelta
from typing import Any

import jwt
from jwt.exceptions import InvalidTokenError

from src.core.config import get_settings


def create_access_token(
    data: dict[str, Any],
    expires_delta: timedelta | None = None,
) -> str:
    """Cria um token de acesso JWT assinado com claims informadas."""
    settings = get_settings()
    payload = dict(data)
    now = datetime.now(UTC)
    expire = now + (expires_delta or timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES))
    payload["exp"] = expire
    payload["iat"] = now
    payload["type"] = "access"
    if "jti" not in payload:
        payload["jti"] = uuid.uuid4().hex

    return jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def decode_access_token(token: str) -> dict[str, Any]:
    """Decodifica e valida assinatura e expiração de um token de acesso JWT."""
    settings = get_settings()
    payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
    if payload.get("type") != "access":
        raise InvalidTokenError("Tipo de token inválido")
    return payload
