"""Utilitários de identificação amigável de dispositivos e resolução de IP de rede."""

from __future__ import annotations

import re
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from fastapi import Request


def extract_client_ip(request: Request | None) -> str | None:
    """Extrai o IP real do cliente com suporte a proxies reversos e middleware confiável."""
    if not request:
        return None

    # 1. IP validado previamente pelo TrustedProxyMiddleware no estado da requisição
    if hasattr(request, "state") and getattr(request.state, "client_ip", None):
        return str(request.state.client_ip)

    # 2. Cabeçalho padrão de balanceadores de carga / proxies reversos
    forwarded_for = request.headers.get("x-forwarded-for")
    if forwarded_for:
        ip = forwarded_for.split(",")[0].strip()
        if ip:
            return ip

    real_ip = request.headers.get("x-real-ip")
    if real_ip:
        return real_ip.strip()

    if request.client and request.client.host:
        return request.client.host

    return None


def parse_user_agent(user_agent: str | None) -> str:
    """Realiza o parsing do User-Agent para gerar um identificador amigável de dispositivo."""
    if not user_agent or not user_agent.strip():
        return "Dispositivo Desconhecido"

    ua = user_agent.lower()

    # 1. Identificar Sistema Operacional / Dispositivo
    os_name = "Sistema Desconhecido"
    if "iphone" in ua:
        os_name = "iPhone"
    elif "ipad" in ua:
        os_name = "iPad"
    elif "android" in ua:
        os_name = "Android"
    elif "macintosh" in ua or "mac os" in ua:
        os_name = "macOS"
    elif "windows" in ua:
        os_name = "Windows"
    elif "linux" in ua:
        os_name = "Linux"
    elif "cros" in ua:
        os_name = "ChromeOS"

    # 2. Identificar Navegador ou Cliente
    browser = "Navegador"
    if "postmanruntime" in ua:
        return f"Postman ({os_name})" if os_name != "Sistema Desconhecido" else "Postman"
    if "curl" in ua:
        return "cURL"
    if "edg" in ua:
        browser = "Edge"
    elif "opr" in ua or "opera" in ua:
        browser = "Opera"
    elif "chrome" in ua and "chromium" not in ua and "edg" not in ua:
        browser = "Chrome"
    elif "firefox" in ua:
        browser = "Firefox"
    elif "safari" in ua and "chrome" not in ua:
        browser = "Safari"

    if os_name == "Sistema Desconhecido" and browser == "Navegador":
        clean_ua = re.sub(r"[^a-zA-Z0-9\.\-/_ ]", "", user_agent)
        return clean_ua[:30].strip() or "Dispositivo Desconhecido"

    if os_name == "Sistema Desconhecido":
        return browser

    if browser == "Navegador":
        return os_name

    return f"{browser} no {os_name}"
