"""Middleware para rastreabilidade e correlação de requisições assíncronas (X-Request-ID)."""

from __future__ import annotations

import uuid

from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import Response

from src.core.observability.context import (
    request_id_ctx,
    set_request_id,
    set_user_id,
    user_id_ctx,
)


class CorrelationIDMiddleware(BaseHTTPMiddleware):
    """Extrai ou gera correlation ID (X-Request-ID) e injeta no contexto assíncrono e na resposta."""

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        raw_request_id = request.headers.get("X-Request-ID")
        request_id = raw_request_id.strip() if raw_request_id else uuid.uuid4().hex

        token_req = set_request_id(request_id)
        token_user = set_user_id(None)
        try:
            response = await call_next(request)
            response.headers["X-Request-ID"] = request_id
            return response
        finally:
            request_id_ctx.reset(token_req)
            user_id_ctx.reset(token_user)
