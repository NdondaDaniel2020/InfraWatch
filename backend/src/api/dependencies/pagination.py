"""Injeção de dependência de paginação padronizada para endpoints da API."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Annotated

from fastapi import Depends, Query

from src.core.config import get_settings

_settings = get_settings()

PAGE_DEFAULT = 1
PAGE_SIZE_DEFAULT = getattr(_settings, "PAGE_SIZE_DEFAULT", 20)
PAGE_SIZE_MAX = getattr(_settings, "PAGE_SIZE_MAX", 100)


@dataclass(frozen=True)
class PaginationParams:
    """Parâmetros resolvidos de paginação (1-based page, bounded page_size)."""

    page: int
    page_size: int

    @property
    def offset(self) -> int:
        """Cálculo do offset para consultas relacionais: (page - 1) * page_size."""
        return (self.page - 1) * self.page_size

    @property
    def limit(self) -> int:
        """Alias para page_size utilizado nas cláusulas SQL LIMIT."""
        return self.page_size


def get_pagination_params(
    page: Annotated[int, Query(ge=1, description="Número da página (1-based).")] = PAGE_DEFAULT,
    page_size: Annotated[
        int,
        Query(
            ge=1,
            le=PAGE_SIZE_MAX,
            description="Quantidade de registros por página.",
        ),
    ] = PAGE_SIZE_DEFAULT,
) -> PaginationParams:
    """Valida e extrai os parâmetros query 'page' e 'page_size'."""
    return PaginationParams(page=page, page_size=page_size)


PaginationParamsDep = Annotated[PaginationParams, Depends(get_pagination_params)]
