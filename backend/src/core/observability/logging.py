"""Configuração de logging estruturado em formato JSON com metadados automáticos."""

from __future__ import annotations

import json
import logging
import sys
from datetime import UTC, datetime
from typing import Any

from src.core.config import get_settings
from src.core.observability.context import get_request_id, get_user_id


class JSONFormatter(logging.Formatter):
    """Formatador de logs estruturados em JSON para ambientes corporativos e Docker/K8s."""

    def format(self, record: logging.LogRecord) -> str:
        payload: dict[str, Any] = {
            "timestamp": datetime.fromtimestamp(record.created, tz=UTC).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "service": "infrawatch-api",
            "message": record.getMessage(),
        }

        # Injeta correlation ID do contexto assíncrono se presente
        request_id = get_request_id()
        if request_id:
            payload["request_id"] = request_id

        # Injeta ID do usuário autenticado se presente
        user_id = get_user_id()
        if user_id:
            payload["user_id"] = user_id

        # Anexa detalhes de exceção quando houver
        if record.exc_info:
            payload["exception"] = self.formatException(record.exc_info)

        # Anexa campos adicionais de segurança ou auditoria
        extra_fields = getattr(record, "security_fields", None)
        if isinstance(extra_fields, dict):
            payload.update(extra_fields)

        return json.dumps(payload, default=str, ensure_ascii=False)


def setup_logging() -> None:
    """Configura o root logger para emitir logs JSON estruturados."""
    settings = get_settings()
    log_level = logging.DEBUG if settings.DEBUG else logging.INFO

    handler = logging.StreamHandler(sys.stdout)
    handler.setLevel(log_level)
    handler.setFormatter(JSONFormatter())

    root_logger = logging.getLogger()
    root_logger.handlers = [handler]
    root_logger.setLevel(log_level)

    # Ajusta verbosidade de bibliotecas de terceiros
    logging.getLogger("uvicorn.access").handlers = [handler]
    logging.getLogger("uvicorn.error").handlers = [handler]
    logging.getLogger("sqlalchemy.engine").setLevel(logging.WARNING)


def get_logger(name: str = "infrawatch") -> logging.Logger:
    """Retorna logger configurado para a aplicação."""
    return logging.getLogger(name)
