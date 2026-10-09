"""Serviço de sanitização de dados e mascaramento de topologia para clientes (ADR-012).

Garante que usuários com papel CLIENT_VIEWER tenham informações sensíveis de
infraestrutura interna (IPs de gerência, comunidades SNMP, roteadores internos e BGP)
estritamente mascaradas ou omitidas.
"""

from __future__ import annotations

import ipaddress
import logging
from collections.abc import Mapping
from copy import deepcopy
from typing import TYPE_CHECKING, Any, TypeVar

if TYPE_CHECKING:
    from src.contexts.iam.api.dependencies.auth import AuthenticatedUser

from src.contexts.iam.domain.enums import UserRole

logger = logging.getLogger("infrawatch.iam.sanitizer")

MASKED_IP = "***.***.***.***"
MASKED_SECRET = "********"

# Campos estritamente confidenciais de engenharia de rede da RCS
SENSITIVE_SECRET_FIELDS = {
    "snmp_community",
    "snmp_v3_auth_key",
    "snmp_v3_priv_key",
    "router_internal_id",
    "bgp_peer_password",
    "tacacs_key",
}

SENSITIVE_IP_FIELDS = {
    "management_ip",
    "loopback_ip",
    "internal_ip",
    "gateway_management_ip",
}

T = TypeVar("T", bound=Any)


def is_private_ip(ip_str: str) -> bool:
    """Verifica se um endereço IP pertence a faixas privadas (RFC 1918 / RFC 4193)."""
    try:
        ip = ipaddress.ip_address(ip_str.strip())
        return ip.is_private or ip.is_loopback or ip.is_link_local
    except ValueError:
        return False


def mask_management_ip(ip_str: str | None) -> str | None:
    """Mascara o IP de gerência interna caso seja um IP privado."""
    if not ip_str:
        return ip_str
    if is_private_ip(ip_str):
        return MASKED_IP
    return ip_str


class TopologySanitizer:
    """Sanitizador defensivo de dados de topologia e telemetria de rede."""

    @classmethod
    def sanitize(cls, data: T, role: UserRole | str) -> T:
        """Sanitiza recursivamente estruturas de dados caso o usuário seja CLIENT_VIEWER.

        Usuários operacionais (SUPER_ADMIN, NOC_OPERATOR) e ORG_ADMIN mantêm
        visibilidade total dos dados técnicos.
        """
        role_str = role.value if isinstance(role, UserRole) else str(role)
        if role_str != UserRole.CLIENT_VIEWER:
            return data

        # Deepcopy para evitar efeitos colaterais nos objetos originais em memória
        cloned = deepcopy(data)
        return cls._sanitize_node(cloned)

    @classmethod
    def _sanitize_node(cls, node: Any) -> Any:
        if isinstance(node, dict):
            sanitized_dict: dict[str, Any] = {}
            for key, value in node.items():
                lower_key = key.lower()
                if lower_key in SENSITIVE_SECRET_FIELDS:
                    sanitized_dict[key] = MASKED_SECRET
                elif lower_key in SENSITIVE_IP_FIELDS:
                    sanitized_dict[key] = mask_management_ip(str(value)) if value else value
                else:
                    sanitized_dict[key] = cls._sanitize_node(value)
            return sanitized_dict

        if isinstance(node, list):
            return [cls._sanitize_node(item) for item in node]

        if isinstance(node, tuple):
            return tuple(cls._sanitize_node(item) for item in node)

        if isinstance(node, Mapping):
            return {k: cls._sanitize_node(v) for k, v in node.items()}

        return node

    @classmethod
    def sanitize_for_user(cls, data: T, user: AuthenticatedUser) -> T:
        """Atalho de sanitização baseado no usuário autenticado."""
        return cls.sanitize(data, user.role)
