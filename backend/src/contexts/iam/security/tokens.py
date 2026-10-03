"""Módulo canônico e unificado de segurança e tokens JWT/Opacos para o Bounded Context IAM (ADR-003, ADR-020)."""

from __future__ import annotations

import hashlib
import secrets
from datetime import UTC, datetime, timedelta
from typing import Any, Self
from uuid import UUID, uuid4

import jwt

from src.core.config import get_settings
from src.core.exceptions import (
    InvalidTokenError,
    TokenExpiredError,
)


class TokenResult(str):
    """String de token JWT que também desempacota como tupla (token, jti) para retrocompatibilidade."""

    jti: str

    def __new__(cls, token: str, jti: str) -> Self:
        obj = super().__new__(cls, token)
        obj.jti = jti
        return obj

    def __iter__(self):
        yield str(self)
        yield self.jti


def generate_opaque_token(nbytes: int = 48) -> str:
    """Gera um token opaco de alta entropia URL-safe (ex.: 64 caracteres)."""
    return secrets.token_urlsafe(nbytes)


def hash_token(token: str) -> str:
    """Gera o hash SHA-256 em hexadecimal de um token para persistência e indexação seguras."""
    return hashlib.sha256(token.strip().encode("utf-8")).hexdigest()


hash_opaque_token = hash_token


def create_access_token(
    user_id: UUID | str | None = None,
    role: str | None = None,
    org_id: UUID | str | None = None,
    expires_delta: timedelta | None = None,
    extra_claims: dict[str, Any] | None = None,
    *,
    data: dict[str, Any] | None = None,
) -> TokenResult:
    """Cria e assina um JWT Access Token com as claims de identidade e autorização.

    Suporta tanto invocação com parâmetros explícitos quanto payload (data={...}).
    Retorna TokenResult (str que desempacota como tupla (token_jwt, jti)).
    """
    settings = get_settings()
    now = datetime.now(UTC)
    expiry = now + (expires_delta or timedelta(minutes=settings.JWT_ACCESS_MINUTES))

    if isinstance(user_id, dict):
        data = user_id
        user_id = None

    if data is not None:
        payload = dict(data)
        jti = payload.get("jti") or uuid4().hex
        payload.setdefault("type", "access")
        payload.setdefault("iat", int(now.timestamp()))
        payload.setdefault("exp", int(expiry.timestamp()))
        payload.setdefault("jti", jti)
        if "organization_id" in payload and "org_id" not in payload:
            payload["org_id"] = payload["organization_id"]
        elif "org_id" in payload and "organization_id" not in payload:
            payload["organization_id"] = payload["org_id"]
        token = jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.ALGORITHM)
        return TokenResult(token, jti)

    jti = uuid4().hex
    payload = {
        "sub": str(user_id) if user_id is not None else "",
        "role": str(role) if role is not None else "",
        "org_id": str(org_id) if org_id is not None else None,
        "organization_id": str(org_id) if org_id is not None else None,
        "jti": jti,
        "type": "access",
        "iat": int(now.timestamp()),
        "exp": int(expiry.timestamp()),
    }

    if extra_claims:
        for k, v in extra_claims.items():
            if k not in payload:
                payload[k] = v

    token = jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.ALGORITHM)
    return TokenResult(token, jti)


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
            options={"require": ["exp"]},
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
    }
    return jwt.encode(payload, settings.MFA_PENDING_SECRET, algorithm=settings.ALGORITHM)


def decode_mfa_pending_token(token: str) -> dict[str, Any]:
    """Decodifica e valida assinatura e expiração de um token intermediário mfa_pending."""
    settings = get_settings()
    try:
        payload = jwt.decode(
            token,
            settings.MFA_PENDING_SECRET,
            algorithms=[settings.ALGORITHM],
            options={"require": ["exp", "sub"]},
        )
    except jwt.ExpiredSignatureError as exc:
        raise TokenExpiredError("O token intermediário de MFA expirou.") from exc
    except jwt.InvalidTokenError as exc:
        raise InvalidTokenError(f"Token de MFA inválido: {exc}") from exc

    if payload.get("type") != "mfa_pending":
        raise InvalidTokenError("Tipo de token inválido para validação de MFA.")

    return payload


__all__ = [
    "TokenResult",
    "create_access_token",
    "create_mfa_pending_token",
    "decode_access_token",
    "decode_mfa_pending_token",
    "generate_opaque_token",
    "hash_opaque_token",
    "hash_token",
]
