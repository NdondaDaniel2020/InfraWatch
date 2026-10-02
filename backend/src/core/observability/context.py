"""Armazenamento de contexto assíncrono para correlation ID e usuário autenticado."""

from __future__ import annotations

import contextvars

request_id_ctx: contextvars.ContextVar[str | None] = contextvars.ContextVar(
    "request_id_ctx", default=None
)
user_id_ctx: contextvars.ContextVar[str | None] = contextvars.ContextVar(
    "user_id_ctx", default=None
)


def get_request_id() -> str | None:
    """Retorna o ID da requisição/correlação associado à corrotina atual."""
    return request_id_ctx.get()


def set_request_id(request_id: str | None) -> contextvars.Token[str | None]:
    """Define o correlation ID no contexto assíncrono."""
    return request_id_ctx.set(request_id)


def get_user_id() -> str | None:
    """Retorna o ID do usuário autenticado no contexto atual."""
    return user_id_ctx.get()


def set_user_id(user_id: str | None) -> contextvars.Token[str | None]:
    """Define o ID do usuário no contexto assíncrono."""
    return user_id_ctx.set(user_id)
