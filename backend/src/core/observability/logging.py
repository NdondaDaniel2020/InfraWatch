"""Configuração de logging estruturado em formato JSON com metadados automáticos."""

from __future__ import annotations

import json
import logging
import re
import sys
from datetime import UTC, datetime
from typing import Any

from src.core.config import get_settings
from src.core.observability.context import get_request_id, get_user_id

_ANSI_ESCAPE_RE = re.compile(r"\x1b\[[0-9;]*[mK]")

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
    # Atributos internos do Python 3.12+ e Uvicorn
    "taskName",
    "color_message",
}


class JSONFormatter(logging.Formatter):
    """Formatador de logs estruturados em JSON para ambientes corporativos e Docker/K8s."""

    def __init__(self, service_name: str = "infrawatch-api") -> None:
        super().__init__()
        self.service_name = service_name

    def format(self, record: logging.LogRecord) -> str:
        service = getattr(record, "service", None) or self.service_name
        message = record.getMessage()
        if "\x1b" in message:
            message = _ANSI_ESCAPE_RE.sub("", message)

        payload: dict[str, Any] = {
            "timestamp": datetime.fromtimestamp(record.created, tz=UTC).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "service": service,
            "message": message,
        }

        # Extração inteligente de campos de requisição HTTP emitidos pelo uvicorn.access
        if record.name == "uvicorn.access" and record.args and isinstance(record.args, tuple):
            if len(record.args) >= 3:
                payload.setdefault("client_host", record.args[0])
                payload.setdefault("status_code", record.args[-1])

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


def get_uvicorn_log_config(
    service_name: str = "infrawatch-api",
    log_level: str | None = None,
) -> dict[str, Any]:
    """Retorna configuração de logging compatível com dictConfig para o Uvicorn emitir JSON estruturado."""
    if log_level is None:
        settings = get_settings()
        env_level = getattr(settings, "LOG_LEVEL", "INFO").upper()
        log_level = "DEBUG" if settings.DEBUG else env_level

    return {
        "version": 1,
        "disable_existing_loggers": False,
        "formatters": {
            "json": {
                "()": "src.core.observability.logging.JSONFormatter",
                "service_name": service_name,
            },
        },
        "handlers": {
            "default": {
                "class": "logging.StreamHandler",
                "formatter": "json",
                "stream": "ext://sys.stdout",
            },
            "access": {
                "class": "logging.StreamHandler",
                "formatter": "json",
                "stream": "ext://sys.stdout",
            },
        },
        "loggers": {
            "": {
                "handlers": ["default"],
                "level": log_level,
            },
            "uvicorn": {
                "handlers": ["default"],
                "level": log_level,
                "propagate": False,
            },
            "uvicorn.error": {
                "handlers": ["default"],
                "level": log_level,
                "propagate": False,
            },
            "uvicorn.access": {
                "handlers": ["access"],
                "level": log_level,
                "propagate": False,
            },
            "uvicorn.asgi": {
                "handlers": ["default"],
                "level": log_level,
                "propagate": False,
            },
        },
    }


def setup_logging(service_name: str = "infrawatch-api") -> None:
    """Configura o root logger e os servidores ASGI para emitir logs JSON estruturados."""
    settings = get_settings()
    env_level = getattr(settings, "LOG_LEVEL", "INFO").upper()
    default_level = logging.DEBUG if settings.DEBUG else logging.INFO
    log_level = getattr(logging, env_level, default_level)

    handler = logging.StreamHandler(sys.stdout)
    handler.setLevel(log_level)
    handler.setFormatter(JSONFormatter(service_name=service_name))

    root_logger = logging.getLogger()
    root_logger.handlers = [handler]
    root_logger.setLevel(log_level)

    # Substitui handlers de todos os loggers de baixo nível do Uvicorn e Gunicorn
    for logger_name in (
        "uvicorn",
        "uvicorn.error",
        "uvicorn.access",
        "uvicorn.asgi",
        "gunicorn",
        "gunicorn.error",
        "gunicorn.access",
    ):
        target_logger = logging.getLogger(logger_name)
        _replace_handlers(target_logger, handler)
        target_logger.setLevel(log_level)

    # Silencia bibliotecas de rede e assíncronas ruidosas
    logging.getLogger("asyncio").setLevel(logging.WARNING)
    logging.getLogger("httpx").setLevel(logging.WARNING)
    logging.getLogger("httpcore").setLevel(logging.WARNING)

    # SQLAlchemy: desabilita echo e define nível WARNING
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

