"""Testes unitários para injeção de dependência e schemas de Paginação Padronizada."""

from __future__ import annotations

from pydantic import BaseModel

from src.api.dependencies.pagination import (
    PAGE_DEFAULT,
    PAGE_SIZE_DEFAULT,
    PAGE_SIZE_MAX,
    PaginationParams,
    get_pagination_params,
)
from src.api.schemas.pagination import PaginatedResponse


class ItemSample(BaseModel):
    id: int
    name: str


def test_pagination_params_defaults_and_properties() -> None:
    """Valida valores padrão e propriedades computadas de PaginationParams."""
    params = PaginationParams(page=1, page_size=20)
    assert params.page == 1
    assert params.page_size == 20
    assert params.offset == 0
    assert params.limit == 20

    # Página 3 com 15 itens por página -> offset deve ser 30
    p3 = PaginationParams(page=3, page_size=15)
    assert p3.offset == 30
    assert p3.limit == 15


def test_get_pagination_params_function() -> None:
    """Valida a factory de injeção de dependência com defaults de configuração."""
    params = get_pagination_params()
    assert params.page == PAGE_DEFAULT
    assert params.page_size == PAGE_SIZE_DEFAULT
    assert params.page_size <= PAGE_SIZE_MAX

    custom = get_pagination_params(page=4, page_size=50)
    assert custom.page == 4
    assert custom.page_size == 50
    assert custom.offset == 150


def test_paginated_response_calculations() -> None:
    """Valida o schema PaginatedResponse e seus campos calculados."""
    sample_items = [ItemSample(id=1, name="Servidor A"), ItemSample(id=2, name="Servidor B")]

    # Cenário 1: coleção vazia
    empty_resp = PaginatedResponse[ItemSample](
        items=[],
        total=0,
        page=1,
        page_size=20,
    )
    assert empty_resp.total_pages == 0
    assert not empty_resp.has_next
    assert not empty_resp.has_prev

    # Cenário 2: primeira página de múltiplos lotes (total=45, page_size=10 -> 5 páginas)
    page1 = PaginatedResponse[ItemSample](
        items=sample_items,
        total=45,
        page=1,
        page_size=10,
    )
    assert page1.total_pages == 5
    assert page1.has_next is True
    assert page1.has_prev is False

    # Cenário 3: página intermediária (página 3 de 5)
    page3 = PaginatedResponse[ItemSample](
        items=sample_items,
        total=45,
        page=3,
        page_size=10,
    )
    assert page3.total_pages == 5
    assert page3.has_next is True
    assert page3.has_prev is True

    # Cenário 4: última página (página 5 de 5)
    page5 = PaginatedResponse[ItemSample](
        items=sample_items,
        total=45,
        page=5,
        page_size=10,
    )
    assert page5.total_pages == 5
    assert page5.has_next is False
    assert page5.has_prev is True
