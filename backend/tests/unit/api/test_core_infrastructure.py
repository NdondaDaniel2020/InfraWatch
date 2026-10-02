"""Testes unitários e de integração para a infraestrutura core (Middlewares, Error Handlers, ContextVars e Métricas)."""

from __future__ import annotations

import json
from unittest.mock import patch

import pytest
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient

from src.api.middleware import setup_middlewares
from src.core.error_handlers import register_exception_handlers
from src.core.exceptions import (
    AuthenticationError,
    EmailAlreadyExistsError,
    NotFoundError,
)
from src.core.observability.context import (
    get_request_id,
    get_user_id,
    request_id_ctx,
    set_request_id,
    set_user_id,
    user_id_ctx,
)
from src.core.observability.logging import JSONFormatter
from src.core.security.security_logger import (
    SECURITY_LOGGER_NAME,
    get_security_logger,
    log_security_event,
)


@pytest.fixture
def test_app() -> FastAPI:
    """Cria uma aplicação de teste com middlewares e error handlers registrados."""
    app = FastAPI()
    setup_middlewares(app)
    register_exception_handlers(app)

    @app.get("/test/success")
    async def success_endpoint() -> dict[str, str]:
        return {"status": "ok"}

    @app.get("/test/domain-error")
    async def domain_error_endpoint() -> None:
        raise NotFoundError("Recurso de teste não localizado.")

    @app.get("/test/auth-error")
    async def auth_error_endpoint() -> None:
        raise AuthenticationError("Credenciais de teste inválidas.")

    @app.get("/test/conflict-error")
    async def conflict_error_endpoint() -> None:
        raise EmailAlreadyExistsError("E-mail já existente.")

    @app.get("/test/http-error")
    async def http_error_endpoint() -> None:
        raise HTTPException(status_code=403, detail="Acesso restrito.")

    @app.get("/test/unhandled-error")
    async def unhandled_error_endpoint() -> None:
        raise RuntimeError("Falha inesperada não tratada.")

    return app


def test_correlation_id_middleware_with_provided_id(test_app: FastAPI) -> None:
    """Valida se o correlation ID fornecido no header é propagado na resposta."""
    client = TestClient(test_app)
    custom_id = "trace-uuid-12345"
    response = client.get("/test/success", headers={"X-Request-ID": custom_id})
    assert response.status_code == 200
    assert response.headers.get("X-Request-ID") == custom_id


def test_correlation_id_middleware_generated_automatically(test_app: FastAPI) -> None:
    """Valida se um novo correlation ID é gerado quando ausente na requisição."""
    client = TestClient(test_app)
    response = client.get("/test/success")
    assert response.status_code == 200
    request_id = response.headers.get("X-Request-ID")
    assert request_id is not None
    assert len(request_id) > 10


def test_security_headers_middleware(test_app: FastAPI) -> None:
    """Verifica se todos os cabeçalhos defensivos de segurança OWASP são aplicados."""
    client = TestClient(test_app)
    response = client.get("/test/success")
    assert response.status_code == 200
    assert response.headers["X-Frame-Options"] == "DENY"
    assert response.headers["X-Content-Type-Options"] == "nosniff"
    assert response.headers["Referrer-Policy"] == "no-referrer"
    assert "max-age=31536000" in response.headers["Strict-Transport-Security"]


def test_error_handler_domain_exceptions(test_app: FastAPI) -> None:
    """Valida o formato canônico de erro JSON para exceções de domínio."""
    client = TestClient(test_app)

    # 1. NotFoundError (404)
    res_404 = client.get("/test/domain-error", headers={"X-Request-ID": "req-404"})
    assert res_404.status_code == 404
    data_404 = res_404.json()
    assert data_404["status"] == 404
    assert data_404["error"]["type"] == "NotFoundError"
    assert data_404["error"]["code"] == "NOT_FOUND"
    assert "Recurso de teste não localizado." in data_404["error"]["message"]
    assert data_404["request_id"] == "req-404"

    # 2. AuthenticationError (401)
    res_401 = client.get("/test/auth-error")
    assert res_401.status_code == 401
    data_401 = res_401.json()
    assert data_401["error"]["code"] == "AUTHENTICATION_FAILED"
    assert res_401.headers.get("WWW-Authenticate") == "Bearer"

    # 3. EmailAlreadyExistsError (409)
    res_409 = client.get("/test/conflict-error")
    assert res_409.status_code == 409
    data_409 = res_409.json()
    assert data_409["error"]["code"] == "EMAIL_ALREADY_EXISTS"


def test_error_handler_http_exception(test_app: FastAPI) -> None:
    """Valida o formato canônico para HTTPException do FastAPI."""
    client = TestClient(test_app)
    response = client.get("/test/http-error")
    assert response.status_code == 403
    data = response.json()
    assert data["status"] == 403
    assert data["error"]["type"] == "HTTPException"
    assert data["error"]["message"] == "Acesso restrito."


def test_error_handler_unhandled_exception(test_app: FastAPI) -> None:
    """Valida se exceções não tratadas retornam HTTP 500 sem expor detalhes internos."""
    client = TestClient(test_app, raise_server_exceptions=False)
    response = client.get("/test/unhandled-error")
    assert response.status_code == 500
    data = response.json()
    assert data["status"] == 500
    assert data["error"]["type"] == "InternalServerError"
    assert "erro interno" in data["error"]["message"]


def test_context_vars_getters_and_setters() -> None:
    """Valida o funcionamento isolado das contextvars de request_id e user_id."""
    assert get_request_id() is None
    assert get_user_id() is None

    token_req = set_request_id("ctx-trace-123")
    token_user = set_user_id("user-uuid-abc")

    assert get_request_id() == "ctx-trace-123"
    assert get_user_id() == "user-uuid-abc"

    request_id_ctx.reset(token_req)
    user_id_ctx.reset(token_user)

    assert get_request_id() is None
    assert get_user_id() is None


def test_security_logger_and_event() -> None:
    """Valida a emissão estruturada de logs de segurança com sanitização de campos."""
    logger = get_security_logger()
    assert logger.name == SECURITY_LOGGER_NAME

    with patch.object(logger, "log") as mock_log:
        log_security_event(
            "LOGIN_ATTEMPT",
            user_id="user-123",
            ip="192.168.1.1",
            metadata={"browser": "Firefox", "password": "sensitivedata!", "token": "jwtsecret"},
        )
        assert mock_log.called
        call_args = mock_log.call_args
        event_name = call_args[0][1]
        extra_fields = call_args[1]["extra"]["security_fields"]

        assert event_name == "LOGIN_ATTEMPT"
        assert extra_fields["user_id"] == "user-123"
        assert extra_fields["ip"] == "192.168.1.1"
        assert extra_fields["browser"] == "Firefox"
        # Garante que campos sensíveis foram sanitizados e eliminados
        assert "password" not in extra_fields
        assert "token" not in extra_fields


def test_json_formatter_with_context() -> None:
    """Valida o formatador JSON com injeção automática de contexto assíncrono."""
    formatter = JSONFormatter()
    token_req = set_request_id("req-test-999")
    token_user = set_user_id("user-test-777")

    try:
        import logging

        record = logging.LogRecord(
            name="test.logger",
            level=logging.INFO,
            pathname="test.py",
            lineno=10,
            msg="Mensagem de teste de telemetria",
            args=(),
            exc_info=None,
        )
        formatted_json = formatter.format(record)
        data = json.loads(formatted_json)

        assert data["level"] == "INFO"
        assert data["message"] == "Mensagem de teste de telemetria"
        assert data["request_id"] == "req-test-999"
        assert data["user_id"] == "user-test-777"
        assert data["service"] == "infrawatch-api"
    finally:
        request_id_ctx.reset(token_req)
        user_id_ctx.reset(token_user)
