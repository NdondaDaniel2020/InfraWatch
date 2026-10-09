"""Módulo de identificação de dispositivos e resolução de IP de rede (compatibilidade e coesão)."""

from src.core.web.client_info import extract_client_ip, parse_user_agent

__all__ = [
    "extract_client_ip",
    "parse_user_agent",
]
