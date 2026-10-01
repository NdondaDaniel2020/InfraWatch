"""Testes unitários para TrustedProxyMiddleware e injeção de dependência get_client_ip (ADR-023).

Valida os critérios de aceite da Issue #11:
1. Cabeçalho X-Forwarded-For forjado por cliente direto é ignorado.
2. IP real do cliente atrás de proxy reverso homologado é extraído com exatidão.
3. Tratamento seguro de cabeçalho X-Real-IP, múltiplos saltos e IPv6.
"""

import httpx
import pytest
from fastapi import FastAPI, Request

from src.api.dependencies.ip_resolver import ClientIPDep, get_client_ip
from src.api.middleware.trusted_proxy import (
    TrustedProxyMiddleware,
    parse_trusted_proxies,
)


def create_test_app(trusted_proxies: str = "127.0.0.1,::1,10.0.0.0/8,172.16.0.0/12") -> FastAPI:
    """Cria uma aplicação FastAPI mínima configurada com o middleware de proxies confiáveis."""
    app = FastAPI()
    app.add_middleware(TrustedProxyMiddleware, trusted_proxies=trusted_proxies)

    @app.get("/api/test-ip")
    async def ip_endpoint(
        request: Request,
        client_ip: ClientIPDep,
    ) -> dict[str, str]:
        return {
            "dep_ip": client_ip,
            "state_ip": getattr(request.state, "client_ip", ""),
            "client_host": request.client.host if request.client else "",
        }

    return app


@pytest.mark.asyncio
async def test_untrusted_direct_client_ignores_forged_x_forwarded_for() -> None:
    """Garante que atacante direto forjando X-Forwarded-For tem o cabeçalho sumariamente ignorado."""
    app = create_test_app()
    untrusted_direct_ip = "203.0.113.50"

    transport = httpx.ASGITransport(app=app, client=(untrusted_direct_ip, 54321))
    async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as client:
        response = await client.get(
            "/api/test-ip",
            headers={"X-Forwarded-For": "1.1.1.1, 10.0.0.1"},
        )

    assert response.status_code == 200
    data = response.json()
    # O IP extraído DEVE ser o IP da conexão direta, NUNCA o cabeçalho forjado
    assert data["dep_ip"] == untrusted_direct_ip
    assert data["state_ip"] == untrusted_direct_ip
    assert data["client_host"] == untrusted_direct_ip


@pytest.mark.asyncio
async def test_untrusted_direct_client_ignores_forged_x_real_ip() -> None:
    """Garante que atacante direto forjando X-Real-IP tem o cabeçalho ignorado."""
    app = create_test_app()
    untrusted_direct_ip = "198.51.100.22"

    transport = httpx.ASGITransport(app=app, client=(untrusted_direct_ip, 45123))
    async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as client:
        response = await client.get(
            "/api/test-ip",
            headers={"X-Real-IP": "8.8.8.8"},
        )

    assert response.status_code == 200
    data = response.json()
    assert data["dep_ip"] == untrusted_direct_ip
    assert data["state_ip"] == untrusted_direct_ip
    assert data["client_host"] == untrusted_direct_ip


@pytest.mark.asyncio
async def test_trusted_proxy_extracts_leftmost_ip_from_x_forwarded_for() -> None:
    """Garante que requisição vinda de proxy homologado extrai o IP real do cliente (mais à esquerda)."""
    app = create_test_app()
    trusted_proxy_ip = "10.0.0.1"  # Presente na rede confiável 10.0.0.0/8
    real_client_ip = "187.30.20.10"

    transport = httpx.ASGITransport(app=app, client=(trusted_proxy_ip, 10000))
    async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as client:
        response = await client.get(
            "/api/test-ip",
            headers={"X-Forwarded-For": f"{real_client_ip}, 70.41.3.18, {trusted_proxy_ip}"},
        )

    assert response.status_code == 200
    data = response.json()
    assert data["dep_ip"] == real_client_ip
    assert data["state_ip"] == real_client_ip
    assert data["client_host"] == real_client_ip


@pytest.mark.asyncio
async def test_trusted_proxy_extracts_x_real_ip_when_no_forwarded_for() -> None:
    """Garante que proxy homologado que envia apenas X-Real-IP tem o IP do cliente extraído."""
    app = create_test_app()
    trusted_proxy_ip = "172.16.5.2"  # Presente na rede confiável 172.16.0.0/12
    real_client_ip = "177.10.5.2"

    transport = httpx.ASGITransport(app=app, client=(trusted_proxy_ip, 20000))
    async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as client:
        response = await client.get(
            "/api/test-ip",
            headers={"X-Real-IP": real_client_ip},
        )

    assert response.status_code == 200
    data = response.json()
    assert data["dep_ip"] == real_client_ip
    assert data["state_ip"] == real_client_ip
    assert data["client_host"] == real_client_ip


@pytest.mark.asyncio
async def test_trusted_proxy_falls_back_to_direct_ip_if_headers_invalid() -> None:
    """Garante fallback para o IP do proxy caso o cabeçalho encaminhado possua valor inválido."""
    app = create_test_app()
    trusted_proxy_ip = "127.0.0.1"

    transport = httpx.ASGITransport(app=app, client=(trusted_proxy_ip, 30000))
    async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as client:
        response = await client.get(
            "/api/test-ip",
            headers={"X-Forwarded-For": "not-an-ip, malicious;payload"},
        )

    assert response.status_code == 200
    data = response.json()
    assert data["dep_ip"] == trusted_proxy_ip
    assert data["state_ip"] == trusted_proxy_ip


@pytest.mark.asyncio
async def test_trusted_proxy_wildcard_trusts_all_proxies() -> None:
    """Garante que configuração de wildcard '*' confia em qualquer proxy upstream."""
    app = create_test_app(trusted_proxies="*")
    arbitrary_proxy_ip = "192.0.2.1"
    real_client_ip = "203.0.113.99"

    transport = httpx.ASGITransport(app=app, client=(arbitrary_proxy_ip, 40000))
    async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as client:
        response = await client.get(
            "/api/test-ip",
            headers={"X-Forwarded-For": real_client_ip},
        )

    assert response.status_code == 200
    data = response.json()
    assert data["dep_ip"] == real_client_ip
    assert data["state_ip"] == real_client_ip


@pytest.mark.asyncio
async def test_trusted_proxy_ipv6_loopback_and_forwarding() -> None:
    """Garante suporte completo a conexões diretas e encaminhadas via IPv6."""
    app = create_test_app(trusted_proxies="::1,2001:db8::/32")
    trusted_ipv6_proxy = "::1"
    client_ipv6 = "2001:db8:85a3::8a2e:370:7334"

    transport = httpx.ASGITransport(app=app, client=(trusted_ipv6_proxy, 50000))
    async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as client:
        response = await client.get(
            "/api/test-ip",
            headers={"X-Forwarded-For": client_ipv6},
        )

    assert response.status_code == 200
    data = response.json()
    assert data["dep_ip"] == client_ipv6


def test_parse_trusted_proxies_handles_invalid_entries_gracefully() -> None:
    """Garante que entradas inválidas na string de configuração são descartadas sem erro fatal."""
    networks, trust_all = parse_trusted_proxies("127.0.0.1, invalid-network-format, 10.0.0.0/8")
    assert trust_all is False
    assert len(networks) == 2
    assert str(networks[0]) == "127.0.0.1/32"
    assert str(networks[1]) == "10.0.0.0/8"


def test_parse_trusted_proxies_wildcard() -> None:
    """Garante identificação correta da flag trust_all em caso de wildcard."""
    _, trust_all = parse_trusted_proxies("127.0.0.1, *")
    assert trust_all is True


def test_get_client_ip_fallback_without_client() -> None:
    """Garante fallback defensivo quando request não possui client nem state.client_ip."""

    class DummyRequest:
        state = object()
        client = None

    # Sem state.client_ip e sem client
    resolved = get_client_ip(DummyRequest())  # type: ignore[arg-type]
    assert resolved == "127.0.0.1"
