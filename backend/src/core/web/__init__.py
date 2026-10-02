"""Módulo Web transversal (Middlewares, Error Handlers, Device e Paginação)."""

from src.core.web.device import extract_client_ip, parse_user_agent
from src.core.web.error_handlers import register_exception_handlers
from src.core.web.middleware import setup_middlewares
from src.core.web.pagination import (
    PaginatedResponse,
    PaginationParams,
    PaginationParamsDep,
    get_pagination_params,
)

__all__ = [
    "PaginatedResponse",
    "PaginationParams",
    "PaginationParamsDep",
    "extract_client_ip",
    "get_pagination_params",
    "parse_user_agent",
    "register_exception_handlers",
    "setup_middlewares",
]
