"""Dependências FastAPI para injeção de parâmetros de paginação."""

from __future__ import annotations

from src.core.web.pagination import (
    PaginationParams,
    PaginationParamsDep,
    get_pagination_params,
)

__all__ = [
    "PaginationParams",
    "PaginationParamsDep",
    "get_pagination_params",
]
