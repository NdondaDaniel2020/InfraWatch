"""Middleware ASGI para sanitização e resolução segura do IP de clientes (ADR-023).

Valida se a conexão direta provém de proxies reversos homologados (Nginx, Traefik,
Cloudflare, etc.) antes de confiar nos cabeçalhos X-Forwarded-For ou X-Real-IP,
neutralizando ataques de IP spoofing que tentam contornar rate limiters.
"""

import ipaddress
import logging
from collections.abc import Sequence
from typing import Any

from starlette.datastructures import Headers
from starlette.types import ASGIApp, Receive, Scope, Send

from src.core.config import get_settings

logger = logging.getLogger("infrawatch.security.trusted_proxy")

NetworkType = ipaddress.IPv4Network | ipaddress.IPv6Network


def parse_trusted_proxies(
    proxies: str | Sequence[str] | None = None,
) -> tuple[list[NetworkType], bool]:
    """Converte lista ou string separada por vírgula em redes IP estruturadas.

    Retorna uma tupla contendo a lista de redes validadas e uma flag booleana
    indicando se todos os proxies são confiáveis (caso '*' seja informado).
    """
    if proxies is None:
        proxies = get_settings().FORWARDED_ALLOW_IPS

    if isinstance(proxies, str):
        raw_items = [p.strip() for p in proxies.split(",") if p.strip()]
    else:
        raw_items = [p.strip() for p in proxies if p.strip()]

    trust_all = False
    networks: list[NetworkType] = []

    for item in raw_items:
        if item == "*":
            trust_all = True
            continue
        try:
            # strict=False aceita IPs individuais como sub-redes /32 ou /128
            net = ipaddress.ip_network(item, strict=False)
            networks.append(net)
        except ValueError:
            logger.warning("Rede ou IP inválido ignorado na configuração de proxies: %s", item)

    return networks, trust_all


class TrustedProxyMiddleware:
    """Middleware ASGI para validação de proxies e sanitização de headers de IP."""

    def __init__(
        self,
        app: ASGIApp,
        trusted_proxies: str | Sequence[str] | None = None,
    ) -> None:
        self.app = app
        self.trusted_networks, self.trust_all = parse_trusted_proxies(trusted_proxies)

    def is_trusted_proxy(self, ip_str: str) -> bool:
        """Verifica se o IP de origem imediata pertence à lista de proxies autorizados."""
        if self.trust_all:
            return True
        try:
            ip = ipaddress.ip_address(ip_str)
            return any(ip in net for net in self.trusted_networks)
        except ValueError:
            return False

    def extract_client_ip(self, scope: Scope) -> str:
        """Extrai de forma segura o endereço IP real do cliente.

        Se a conexão direta (client.host) não for de um proxy confiável,
        quaisquer cabeçalhos de encaminhamento (X-Forwarded-For, X-Real-IP) são
        estritamente ignorados para evitar spoofing.
        """
        client = scope.get("client")
        direct_ip: str = client[0] if client and len(client) > 0 else "127.0.0.1"

        # Se a conexão imediata não for de um proxy confiável, não confia em headers
        if not self.is_trusted_proxy(direct_ip):
            return direct_ip

        headers = Headers(scope=scope)

        # 1. Verifica X-Forwarded-For (pega o IP mais à esquerda na cadeia)
        xff = headers.get("x-forwarded-for")
        if xff:
            for part in xff.split(","):
                candidate = part.strip()
                try:
                    ipaddress.ip_address(candidate)
                    return candidate
                except ValueError:
                    continue

        # 2. Verifica X-Real-IP
        x_real_ip = headers.get("x-real-ip")
        if x_real_ip:
            candidate = x_real_ip.strip()
            try:
                ipaddress.ip_address(candidate)
                return candidate
            except ValueError:
                pass

        # 3. Fallback para a conexão direta
        return direct_ip

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> Any:
        if scope["type"] in ("http", "websocket"):
            resolved_ip = self.extract_client_ip(scope)

            # Injeta o IP sanitizado no state da requisição
            state = scope.setdefault("state", {})
            state["client_ip"] = resolved_ip

            # Atualiza scope["client"] para que bibliotecas externas leiam o IP real
            client = scope.get("client")
            port = client[1] if client and len(client) > 1 else 0
            scope["client"] = (resolved_ip, port)

        return await self.app(scope, receive, send)
