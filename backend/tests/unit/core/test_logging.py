"""Testes unitários para o sistema de logging estruturado em JSON e padronização Uvicorn/ASGI."""

import json
import logging
import logging.config
import uuid

import pytest

from src.core.observability.context import (
    request_id_ctx,
    set_request_id,
    set_user_id,
    user_id_ctx,
)
from src.core.observability.logging import (
    JSONFormatter,
    get_logger,
    get_uvicorn_log_config,
    setup_logging,
)


def test_json_formatter_standard_fields():
    """Valida geração de campos padrão em JSON estruturado."""
    formatter = JSONFormatter(service_name="test-service")
    record = logging.LogRecord(
        name="test.logger",
        level=logging.INFO,
        pathname="test.py",
        lineno=42,
        msg="Operação realizada com sucesso",
        args=(),
        exc_info=None,
    )

    formatted = formatter.format(record)
    data = json.loads(formatted)

    assert data["level"] == "INFO"
    assert data["logger"] == "test.logger"
    assert data["service"] == "test-service"
    assert data["message"] == "Operação realizada com sucesso"
    assert "timestamp" in data


def test_json_formatter_context_injection():
    """Valida injeção de request_id e user_id a partir de contextvars."""
    req_token = set_request_id("req-uuid-12345")
    user_uuid = uuid.uuid4()
    user_token = set_user_id(user_uuid)

    try:
        formatter = JSONFormatter(service_name="test-service")
        record = logging.LogRecord(
            name="test.logger",
            level=logging.WARNING,
            pathname="test.py",
            lineno=10,
            msg="Alerta com contexto",
            args=(),
            exc_info=None,
        )

        data = json.loads(formatter.format(record))
        assert data["request_id"] == "req-uuid-12345"
        assert data["user_id"] == str(user_uuid)
    finally:
        request_id_ctx.reset(req_token)
        user_id_ctx.reset(user_token)


def test_json_formatter_strips_ansi_codes():
    """Valida remoção de sequências de escape ANSI em mensagens coloridas."""
    formatter = JSONFormatter()
    ansi_msg = "\x1b[32mINFO\x1b[0m:     Mensagem com cores \x1b[1mimportantes\x1b[0m"
    record = logging.LogRecord(
        name="uvicorn",
        level=logging.INFO,
        pathname="server.py",
        lineno=1,
        msg=ansi_msg,
        args=(),
        exc_info=None,
    )

    data = json.loads(formatter.format(record))
    assert "\x1b" not in data["message"]
    assert data["message"] == "INFO:     Mensagem com cores importantes"


def test_json_formatter_extracts_uvicorn_access_fields():
    """Valida extração inteligente de metadados de acesso emitidos pelo uvicorn.access."""
    formatter = JSONFormatter(service_name="infrawatch-api")
    record = logging.LogRecord(
        name="uvicorn.access",
        level=logging.INFO,
        pathname="access.py",
        lineno=1,
        msg='%s - "%s" %d',
        args=("192.168.1.50", "GET /api/v1/devices HTTP/1.1", 200),
        exc_info=None,
    )

    data = json.loads(formatter.format(record))
    assert data["logger"] == "uvicorn.access"
    assert data["client_host"] == "192.168.1.50"
    assert data["status_code"] == 200
    assert '192.168.1.50 - "GET /api/v1/devices HTTP/1.1" 200' in data["message"]


def test_json_formatter_with_exception():
    """Valida serialização de traceback de exceção no campo exception."""
    formatter = JSONFormatter()
    try:
        raise ValueError("Erro de teste para logging")
    except ValueError:
        import sys
        exc_info = sys.exc_info()

    record = logging.LogRecord(
        name="test.error",
        level=logging.ERROR,
        pathname="test.py",
        lineno=1,
        msg="Falha na execução",
        args=(),
        exc_info=exc_info,
    )

    data = json.loads(formatter.format(record))
    assert data["level"] == "ERROR"
    assert "exception" in data
    assert "ValueError: Erro de teste para logging" in data["exception"]


def test_setup_logging_configures_low_level_uvicorn_handlers():
    """Valida que setup_logging substitui handlers de uvicorn, uvicorn.error, uvicorn.access e uvicorn.asgi."""
    setup_logging(service_name="test-api")

    loggers_to_check = [
        "uvicorn",
        "uvicorn.error",
        "uvicorn.access",
        "uvicorn.asgi",
        "gunicorn",
        "gunicorn.error",
    ]

    for logger_name in loggers_to_check:
        logger = logging.getLogger(logger_name)
        assert len(logger.handlers) == 1, f"Logger {logger_name} deve possuir exatamente 1 handler"
        handler = logger.handlers[0]
        assert isinstance(handler.formatter, JSONFormatter)
        assert logger.propagate is False


def test_get_uvicorn_log_config_dict_config_compatibility():
    """Valida que get_uvicorn_log_config retorna dicionário válido para dictConfig."""
    config = get_uvicorn_log_config(service_name="infrawatch-api", log_level="INFO")

    assert config["version"] == 1
    assert "json" in config["formatters"]
    assert "uvicorn" in config["loggers"]
    assert "uvicorn.error" in config["loggers"]
    assert "uvicorn.access" in config["loggers"]

    # Deve aplicar sem erros via logging.config.dictConfig
    logging.config.dictConfig(config)
    u_logger = logging.getLogger("uvicorn")
    assert u_logger.level == logging.INFO
    assert len(u_logger.handlers) >= 1
    assert isinstance(u_logger.handlers[0].formatter, JSONFormatter)


def test_get_logger_returns_named_logger():
    """Valida fábrica utilitária get_logger."""
    logger = get_logger("infrawatch.test")
    assert logger.name == "infrawatch.test"
