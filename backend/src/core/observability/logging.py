"""Configuração de logging estruturado em formato JSON com metadados automáticos."""

from __future__ import annotations

import json
import logging
import sys
from datetime import UTC, datetime
from typing import Any

from src.core.config import get_settings
from src.core.observability.context import get_request_id, get_user_id


# Campos padrão do LogRecord que não devem ser incluídos como extra
_STANDARD_LOG_RECORD_ATTRS = {
    "name",
    "msg",
    "args",
    "levelname",
    "levelno",
    "pathname",
    "filename",
    "module",
    "exc_info",
    "exc_text",
    "stack_info",
    "lineno",
    "funcName",
    "created",
    "msecs",
    "relativeCreated",
    "thread",
    "threadName",
    "processName",
    "process",
    "message",
    "asctime",
}


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

        # Anexa campos extras do log record (structured logging via extra={})
        extra_fields = {
            k: v
            for k, v in record.__dict__.items()
            if k not in _STANDARD_LOG_RECORD_ATTRS
            and not k.startswith("_")
            and not callable(v)
        }
        if extra_fields:
            payload.update(extra_fields)

        return json.dumps(payload, default=str, ensure_ascii=False)


def _replace_handlers(logger: logging.Logger, handler: logging.Handler) -> None:
    """Substitui todos os handlers de um logger pelo handler JSON."""
    logger.handlers = [handler]
    logger.propagate = False


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

    # Ajusta verbosidade de bibliotecas de terceiros - usa o mesmo handler JSON
    _replace_handlers(logging.getLogger("uvicorn.access"), handler)
    logging.getLogger("uvicorn.access").setLevel(logging.INFO)

    _replace_handlers(logging.getLogger("uvicorn.error"), handler)
    logging.getLogger("uvicorn.error").setLevel(log_level)

    # SQLAlchemy: desabilita echo (já feito em session.py) e define nível WARNING
    logging.getLogger("sqlalchemy.engine").setLevel(logging.WARNING)
    logging.getLogger("sqlalchemy.pool").setLevel(logging.WARNING)
    logging.getLogger("sqlalchemy.dialects").setLevel(logging.WARNING)

    # Redis: reduz verbosidade
    logging.getLogger("redis").setLevel(logging.WARNING)
    logging.getLogger("redis.asyncio").setLevel(logging.WARNING)

    # AsyncPG: reduz verbosidade do listener
    logging.getLogger("asyncpg").setLevel(logging.WARNING)


def get_logger(name: str = "infrawatch") -> logging.Logger:
    """Retorna logger configurado para a aplicação."""
    return logging.getLogger(name)
