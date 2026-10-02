"""Injeção de dependência e envelope genérico para respostas paginadas do sistema."""

from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Annotated

from fastapi import Depends, Query
from pydantic import BaseModel, Field, computed_field

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


class PaginatedResponse[T](BaseModel):
    """Envelope padronizado para coleções paginadas retornadas pela API.

    Contém os itens da página corrente, metadados de totalização,
    número da página e tamanho do lote solicitado.
    """

    items: list[T] = Field(..., description="Lista de registros da página atual.")
    total: int = Field(..., ge=0, description="Quantidade total de registros encontrados.")
    page: int = Field(..., ge=1, description="Número da página atual (1-based).")
    page_size: int = Field(..., ge=1, description="Quantidade máxima de itens por página.")

    @computed_field  # type: ignore[prop-decorator]
    @property
    def total_pages(self) -> int:
        """Total de páginas disponíveis calculado dinamicamente."""
        if self.page_size <= 0:
            return 0
        return max(1, math.ceil(self.total / self.page_size)) if self.total > 0 else 0

    @computed_field  # type: ignore[prop-decorator]
    @property
    def has_next(self) -> bool:
        """Indica se há uma próxima página de resultados."""
        return self.page < self.total_pages

    @computed_field  # type: ignore[prop-decorator]
    @property
    def has_prev(self) -> bool:
        """Indica se há uma página anterior de resultados."""
        return self.page > 1


__all__ = [
    "PAGE_DEFAULT",
    "PAGE_SIZE_DEFAULT",
    "PAGE_SIZE_MAX",
    "PaginatedResponse",
    "PaginationParams",
    "PaginationParamsDep",
    "get_pagination_params",
]
