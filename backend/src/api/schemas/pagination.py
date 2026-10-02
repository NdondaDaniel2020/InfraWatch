"""Envelope genérico para respostas paginadas da API."""

from __future__ import annotations

import math

from pydantic import BaseModel, Field, computed_field


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
