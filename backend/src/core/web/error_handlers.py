"""Tratamento global e padronizado de exceções para a API e Core do InfraWatch."""

from __future__ import annotations

import logging
from collections.abc import Sequence
from typing import Any

from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from src.core.exceptions import InfraWatchException
from src.core.observability.context import get_request_id

logger = logging.getLogger("infrawatch.core.errors")


def _error_payload(
    request: Request,
    *,
    exc_type: str,
    message: str,
    status_code: int,
    code: str | None = None,
    details: Any | None = None,
) -> dict[str, Any]:
    """Constrói o envelope padronizado de resposta de erro para clientes da API."""
    payload: dict[str, Any] = {
        "detail": message,
        "error": {
            "type": exc_type,
            "message": message,
        },
        "status": status_code,
        "path": str(request.url.path),
        "method": request.method,
    }

    if code is not None:
        payload["error"]["code"] = code

    if details is not None:
        payload["error"]["details"] = details

    request_id = get_request_id()
    if request_id:
        payload["request_id"] = request_id

    return payload


async def handle_infrawatch_exception(
    request: Request,
    exc: InfraWatchException,
) -> JSONResponse:
    """Converte exceções de domínio do InfraWatch em respostas JSON canônicas com HTTP Status e Code."""
    level = logging.ERROR if exc.status_code >= 500 else logging.WARNING
    logger.log(
        level,
        "InfraWatchException [%s]: %s",
        exc.code,
        exc.message,
        extra={
            "error_type": exc.__class__.__name__,
            "error_code": exc.code,
            "status_code": exc.status_code,
            "method": request.method,
            "path": request.url.path,
        },
    )
    content = _error_payload(
        request,
        exc_type=exc.__class__.__name__,
        message=exc.message,
        status_code=exc.status_code,
        code=exc.code,
        details=exc.payload or None,
    )
    return JSONResponse(
        status_code=exc.status_code,
        content=content,
        headers=exc.headers or None,
    )


async def handle_http_exception(
    request: Request,
    exc: HTTPException,
) -> JSONResponse:
    """Padroniza exceções nativas HTTPException disparadas pelo FastAPI ou Starlette."""
    detail = getattr(exc, "detail", "Erro na requisição.")
    level = logging.ERROR if exc.status_code >= 500 else logging.WARNING
    logger.log(
        level,
        "HTTPException %s: %s",
        exc.status_code,
        detail,
        extra={
            "error_type": "HTTPException",
            "status_code": exc.status_code,
            "method": request.method,
            "path": request.url.path,
        },
    )
    content = _error_payload(
        request,
        exc_type="HTTPException",
        message=str(detail),
        status_code=exc.status_code,
    )
    headers = getattr(exc, "headers", None)
    return JSONResponse(status_code=exc.status_code, content=content, headers=headers)


def _normalize_validation_details(
    errors: Sequence[Any],
) -> list[dict[str, str]]:
    """Achata erros de validação Pydantic em uma estrutura limpa de lista {'field', 'message'}."""
    location_parts = {"body", "query", "path", "header", "cookie"}
    normalized: list[dict[str, str]] = []

    for error in errors:
        loc = error.get("loc", [])
        field = ".".join(str(part) for part in loc if part not in location_parts)
        message = error.get("msg", "")
        message = message.removeprefix("Value error, ")
        normalized.append({"field": field or "request", "message": message})

    return normalized


async def handle_validation_error(
    request: Request,
    exc: RequestValidationError,
) -> JSONResponse:
    """Trata erros de validação de schemas Pydantic devolvendo formato estruturado 422."""
    validation_details = _normalize_validation_details(exc.errors())
    logger.warning(
        "Erro de validação na requisição (422)",
        extra={
            "error_type": "RequestValidationError",
            "status_code": 422,
            "error_code": "VALIDATION_ERROR",
            "method": request.method,
            "path": request.url.path,
            "validation_details": validation_details,
        },
    )
    content = _error_payload(
        request,
        exc_type="RequestValidationError",
        message="Erro de validação nos dados fornecidos.",
        status_code=422,
        code="VALIDATION_ERROR",
        details=validation_details,
    )
    return JSONResponse(status_code=422, content=content)


async def handle_generic_exception(
    request: Request,
    exc: Exception,
) -> JSONResponse:
    """Captura exceções inesperadas, registrando stack trace sem vazar detalhes aos clientes."""
    logger.exception(
        "Exceção não tratada durante requisição",
        extra={
            "error_type": exc.__class__.__name__,
            "status_code": 500,
            "error_code": "INTERNAL_SERVER_ERROR",
            "method": request.method,
            "path": request.url.path,
        },
    )
    content = _error_payload(
        request,
        exc_type="InternalServerError",
        message="Ocorreu um erro interno no servidor.",
        status_code=500,
        code="INTERNAL_SERVER_ERROR",
    )
    return JSONResponse(status_code=500, content=content)


def register_exception_handlers(app: FastAPI) -> None:
    """Registra os manipuladores globais de erro na aplicação FastAPI."""
    app.add_exception_handler(InfraWatchException, handle_infrawatch_exception)  # type: ignore[arg-type]
    app.add_exception_handler(HTTPException, handle_http_exception)  # type: ignore[arg-type]
    app.add_exception_handler(RequestValidationError, handle_validation_error)  # type: ignore[arg-type]
    app.add_exception_handler(Exception, handle_generic_exception)
