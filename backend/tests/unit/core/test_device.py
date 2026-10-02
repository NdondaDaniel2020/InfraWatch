"""Testes unitários para o módulo core/device.py (parse_user_agent e extract_client_ip)."""

from __future__ import annotations

from unittest.mock import MagicMock

from src.core.web.device import extract_client_ip, parse_user_agent


def test_parse_user_agent_empty_and_unknown() -> None:
    """Valida comportamento para strings vazias, None ou desconhecidas."""
    assert parse_user_agent(None) == "Dispositivo Desconhecido"
    assert parse_user_agent("") == "Dispositivo Desconhecido"
    assert parse_user_agent("   ") == "Dispositivo Desconhecido"
    assert parse_user_agent("CustomBot/1.0 (Testing)") == "CustomBot/1.0 Testing"


def test_parse_user_agent_desktop_browsers() -> None:
    """Valida identificação de navegadores em sistemas operacionais desktop."""
    # Chrome no macOS
    chrome_mac = (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    )
    assert parse_user_agent(chrome_mac) == "Chrome no macOS"

    # Firefox no Windows
    firefox_win = "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/119.0"
    assert parse_user_agent(firefox_win) == "Firefox no Windows"

    # Edge no Windows
    edge_win = (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0"
    )
    assert parse_user_agent(edge_win) == "Edge no Windows"

    # Opera no Linux
    opera_linux = (
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36 OPR/105.0.0.0"
    )
    assert parse_user_agent(opera_linux) == "Opera no Linux"

    # Safari no macOS
    safari_mac = (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 "
        "(KHTML, like Gecko) Version/17.1 Safari/605.1.15"
    )
    assert parse_user_agent(safari_mac) == "Safari no macOS"


def test_parse_user_agent_mobile_devices() -> None:
    """Valida identificação de dispositivos móveis iOS e Android."""
    # Safari no iPhone
    iphone_safari = (
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_1 like Mac OS X) AppleWebKit/605.1.15 "
        "(KHTML, like Gecko) Version/17.1 Mobile/15E148 Safari/604.1"
    )
    assert parse_user_agent(iphone_safari) == "Safari no iPhone"

    # Safari no iPad
    ipad_safari = (
        "Mozilla/5.0 (iPad; CPU OS 17_1 like Mac OS X) AppleWebKit/605.1.15 "
        "(KHTML, like Gecko) Version/17.1 Mobile/15E148 Safari/604.1"
    )
    assert parse_user_agent(ipad_safari) == "Safari no iPad"

    # Chrome no Android
    chrome_android = (
        "Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/120.0.6099.144 Mobile Safari/537.36"
    )
    assert parse_user_agent(chrome_android) == "Chrome no Android"


def test_parse_user_agent_cli_and_dev_tools() -> None:
    """Valida clientes de desenvolvimento como cURL e Postman."""
    assert parse_user_agent("curl/8.4.0") == "cURL"
    assert parse_user_agent("PostmanRuntime/7.36.0 (Macintosh)") == "Postman (macOS)"
    assert parse_user_agent("PostmanRuntime/7.36.0") == "Postman"


def test_extract_client_ip_scenarios() -> None:
    """Valida resolução de IP considerando prioridade de proxy reverso e conexão."""
    # 1. Requisição vazia / None
    assert extract_client_ip(None) is None

    # 2. Prioridade máxima: IP validado no request.state.client_ip
    req_state = MagicMock()
    req_state.state.client_ip = "192.0.2.1"
    assert extract_client_ip(req_state) == "192.0.2.1"

    # 3. Cabeçalho X-Forwarded-For com múltiplos saltos
    req_xff = MagicMock()
    req_xff.state = object()  # sem client_ip
    req_xff.headers = {"x-forwarded-for": "203.0.113.195, 70.41.3.18, 150.172.238.178"}
    assert extract_client_ip(req_xff) == "203.0.113.195"

    # 4. Cabeçalho X-Real-IP
    req_xreal = MagicMock()
    req_xreal.state = object()
    req_xreal.headers = {"x-real-ip": "198.51.100.42"}
    assert extract_client_ip(req_xreal) == "198.51.100.42"

    # 5. Conexão direta cliente
    req_direct = MagicMock()
    req_direct.state = object()
    req_direct.headers = {}
    req_direct.client.host = "10.0.0.55"
    assert extract_client_ip(req_direct) == "10.0.0.55"
