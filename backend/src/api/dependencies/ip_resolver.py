"""Dependência FastAPI para extração do IP do cliente sanitizado (ADR-023)."""

from typing import Annotated

from fastapi import Depends, Request


def get_client_ip(request: Request) -> str:
    """Extrai o IP sanitizado do cliente a partir do estado da requisição ou da conexão direta.

    Garante que cabeçalhos como X-Forwarded-For só são considerados se já tiverem
    sido validados e sanitizados pelo TrustedProxyMiddleware.
    """
    # 1. Prioriza o IP sanitizado pelo TrustedProxyMiddleware
    client_ip = getattr(request.state, "client_ip", None)
    if client_ip:
        return str(client_ip)

    # 2. Conexão direta se disponível
    if request.client and request.client.host:
        return request.client.host

    # 3. Fallback seguro
    return "127.0.0.1"


ClientIPDep = Annotated[str, Depends(get_client_ip)]
