"""Utilitários criptográficos para emissão, decodificação e validação de tokens JWT e tokens opacos.

Implementa os padrões de segurança:
- Access Token: JWT assinado com algoritmo simétrico configurável (HS256) e claims sub, org_id, role, jti, iat, exp.
- Refresh Token: Token opaco de alta entropia gerado com secrets.token_urlsafe e persistido via hash SHA-256.
"""

from __future__ import annotations

import hashlib
import secrets
from datetime import UTC, datetime, timedelta
from typing import Any
from uuid import UUID, uuid4

import jwt

from src.core.config import get_settings
from src.core.exceptions import InvalidTokenError, TokenExpiredError


def generate_opaque_token(nbytes: int = 48) -> str:
    """Gera um token opaco de alta entropia URL-safe (ex.: 64 caracteres)."""
    return secrets.token_urlsafe(nbytes)


def hash_token(token: str) -> str:
    """Gera o hash SHA-256 em hexadecimal de um token para persistência e indexação seguras."""
    return hashlib.sha256(token.strip().encode("utf-8")).hexdigest()


hash_opaque_token = hash_token


def create_access_token(
    *,
    user_id: UUID | str,
    role: str,
    org_id: UUID | str | None = None,
    expires_delta: timedelta | None = None,
    extra_claims: dict[str, Any] | None = None,
) -> tuple[str, str]:
    """Cria e assina um JWT Access Token com as claims de identidade e autorização.

    Retorna uma tupla contendo (token_jwt, jti).
    """
    settings = get_settings()
    now = datetime.now(UTC)
    expiry = now + (expires_delta or timedelta(minutes=settings.JWT_ACCESS_MINUTES))
    jti = uuid4().hex

    payload: dict[str, Any] = {
        "sub": str(user_id),
        "role": str(role),
        "org_id": str(org_id) if org_id is not None else None,
        "jti": jti,
        "type": "access",
        "iat": int(now.timestamp()),
        "exp": int(expiry.timestamp()),
    }

    if extra_claims:
        # Não sobrescrever claims protegidas
        for k, v in extra_claims.items():
            if k not in payload:
                payload[k] = v

    token = jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.ALGORITHM)
    return token, jti


def decode_access_token(token: str) -> dict[str, Any]:
    """Decodifica e valida assinatura e expiração de um Access Token JWT.

    Lança:
    - TokenExpiredError: Se o token estiver expirado.
    - InvalidTokenError: Se a assinatura, formato ou tipo for inválido.
    """
    settings = get_settings()
    try:
        payload = jwt.decode(
            token,
            settings.SECRET_KEY,
            algorithms=[settings.ALGORITHM],
            options={"require": ["exp", "iat", "sub", "jti"]},
        )
    except jwt.ExpiredSignatureError as exc:
        raise TokenExpiredError("O token de acesso expirou.") from exc
    except jwt.InvalidTokenError as exc:
        raise InvalidTokenError(f"Token inválido: {exc}") from exc

    if payload.get("type") != "access":
        raise InvalidTokenError("O token apresentado não é um Access Token válido.")

    return payload


def create_mfa_pending_token(
    user_id: UUID | str,
    expires_delta: timedelta | None = None,
) -> str:
    """Cria um token JWT temporário (3 min) para validação intermediária de MFA."""
    settings = get_settings()
    now = datetime.now(UTC)
    expiry = now + (expires_delta or timedelta(minutes=3))
    payload = {
        "sub": str(user_id),
        "type": "mfa_pending",
        "iat": int(now.timestamp()),
        "exp": int(expiry.timestamp()),
        "jti": uuid4().hex,
    }
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def decode_mfa_pending_token(token: str) -> dict[str, Any]:
    """Decodifica e valida assinatura e expiração de um token intermediário mfa_pending."""
    settings = get_settings()
    try:
        payload = jwt.decode(
            token,
            settings.SECRET_KEY,
            algorithms=[settings.ALGORITHM],
            options={"require": ["exp", "iat", "sub"]},
        )
    except jwt.ExpiredSignatureError as exc:
        raise TokenExpiredError("O token intermediário de MFA expirou.") from exc
    except jwt.InvalidTokenError as exc:
        raise InvalidTokenError(f"Token de MFA inválido: {exc}") from exc

    if payload.get("type") != "mfa_pending":
        raise InvalidTokenError("Tipo de token inválido para validação de MFA.")

    return payload
