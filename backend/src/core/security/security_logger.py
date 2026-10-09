"""Logger especializado para telemetria de segurança e trilha de auditoria."""

from __future__ import annotations

import json
import logging
from datetime import UTC, datetime
from typing import Any

from src.core.config import get_settings
from src.core.observability.context import get_request_id, get_user_id

SECURITY_LOGGER_NAME = "infrawatch.security"


class _SecurityJsonFormatter(logging.Formatter):
    """Formata registros de segurança como linhas JSON únicas e filtráveis aderentes ao padrão canônico."""

    def format(self, record: logging.LogRecord) -> str:
        event_message = record.getMessage()
        payload: dict[str, Any] = {
            "timestamp": datetime.fromtimestamp(record.created, tz=UTC).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "service": "infrawatch-api",
            "message": event_message,
            "event": event_message,
        }

        # Injeta correlation ID do contexto assíncrono se presente
        request_id = get_request_id()
        if request_id:
            payload["request_id"] = request_id

        # Injeta ID do usuário autenticado a partir do contexto se disponível
        ctx_user_id = get_user_id()
        if ctx_user_id:
            payload["user_id"] = ctx_user_id

        # Injeta campos específicos de segurança (podendo sobrescrever user_id se fornecido explicitamente)
        payload.update(getattr(record, "security_fields", {}))

        return json.dumps(payload, default=str, ensure_ascii=False)


def get_security_logger() -> logging.Logger:
    """Retorna o logger de segurança com formatação estruturada JSON."""
    settings = get_settings()
    level = logging.DEBUG if settings.DEBUG else logging.INFO

    logger = logging.getLogger(SECURITY_LOGGER_NAME)
    logger.setLevel(level)
    logger.propagate = False

    if not logger.handlers:
        import sys

        handler = logging.StreamHandler(sys.stdout)
        handler.setLevel(level)
        handler.setFormatter(_SecurityJsonFormatter())
        logger.addHandler(handler)

    return logger


def log_security_event(
    event: str,
    *,
    user_id: str | None = None,
    ip: str | None = None,
    metadata: dict[str, Any] | None = None,
    level: int = logging.INFO,
) -> None:
    """Registra evento canônico de segurança sanitizado.

    Garante que apenas metadados seguros (como user_id, IP e propriedades públicas)
    sejam gravados. Senhas, hashes e segredos sensíveis nunca devem ser informados.
    """
    fields: dict[str, Any] = {}
    if user_id is not None:
        fields["user_id"] = str(user_id)
    if ip is not None:
        fields["ip"] = ip
    if metadata:
        # Prevenção contra vazamento acidental de campos sensíveis
        sanitized_meta = {
            k: v
            for k, v in metadata.items()
            if k.lower() not in {"password", "token", "secret", "hashed_password", "hash"}
        }
        fields.update(sanitized_meta)

    get_security_logger().log(level, event, extra={"security_fields": fields})
