"""Módulo Web transversal (Middlewares, Error Handlers, Device, Lifespan e Paginação)."""

from src.core.web.client_info import extract_client_ip, parse_user_agent
from src.core.web.error_handlers import register_exception_handlers
from src.core.web.lifespan import lifespan
from src.core.web.middleware import setup_middlewares
from src.core.web.pagination import (
    PAGE_DEFAULT,
    PAGE_SIZE_DEFAULT,
    PAGE_SIZE_MAX,
    PaginatedResponse,
    PaginationParams,
    PaginationParamsDep,
    get_pagination_params,
)

__all__ = [
    "PAGE_DEFAULT",
    "PAGE_SIZE_DEFAULT",
    "PAGE_SIZE_MAX",
    "PaginatedResponse",
    "PaginationParams",
    "PaginationParamsDep",
    "extract_client_ip",
    "get_pagination_params",
    "lifespan",
    "parse_user_agent",
    "register_exception_handlers",
    "setup_middlewares",
]

