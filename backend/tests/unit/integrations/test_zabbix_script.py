import sys
from pathlib import Path
from unittest.mock import AsyncMock, patch

import pytest

root_dir = Path(__file__).resolve().parents[4]
if str(root_dir) not in sys.path:
    sys.path.insert(0, str(root_dir))

from scripts.test_zabbix import main

from src.integrations.zabbix import (
    ZabbixAuthError,
    ZabbixConnectionError,
    ZabbixHost,
    ZabbixHostMetrics,
    ZabbixItem,
)


@pytest.mark.asyncio
async def test_zabbix_script_success_flow(capsys):
    """Valida o fluxo completo de sucesso do script de teste do Zabbix."""
    mock_client = AsyncMock()
    mock_client.get_api_version.return_value = "7.0.0"
    mock_client.get_hosts.return_value = [
        ZabbixHost(hostid="10084", host="Zabbix server", name="Zabbix server", status="0", available="1")
    ]
    mock_client.get_items.return_value = [
        ZabbixItem(itemid="1", name="CPU", key_="system.cpu.util", lastvalue="15.5", units="%")
    ]
    mock_client.get_host_hardware_metrics.return_value = ZabbixHostMetrics(
        hostid="10084",
        cpu_utilization_pct=15.5,
        memory_utilization_pct=42.0,
        disk_utilization_pct=30.0,
    )

    with patch("scripts.test_zabbix.ZabbixClient", return_value=mock_client):
        # Configurar context manager assíncrono
        mock_client.__aenter__.return_value = mock_client
        mock_client.__aexit__.return_value = None

        await main()

    captured = capsys.readouterr()
    assert "InfraWatch - Teste de Integração Zabbix JSON-RPC" in captured.out
    assert "Versão do servidor Zabbix: 7.0.0" in captured.out
    assert "Encontrado(s) 1 host(s) no Zabbix" in captured.out
    assert "CPU Utilization    : 15.5%" in captured.out
    assert "Memory Utilization : 42.0%" in captured.out
    assert "Disk Utilization   : 30.0%" in captured.out
    assert "100% de sucesso" in captured.out


@pytest.mark.asyncio
async def test_zabbix_script_no_hosts_flow(capsys):
    """Valida o fluxo quando não há hosts retornados."""
    mock_client = AsyncMock()
    mock_client.get_api_version.return_value = "7.0.0"
    mock_client.get_hosts.return_value = []

    with patch("scripts.test_zabbix.ZabbixClient", return_value=mock_client):
        mock_client.__aenter__.return_value = mock_client
        mock_client.__aexit__.return_value = None

        await main()

    captured = capsys.readouterr()
    assert "Encontrado(s) 0 host(s) no Zabbix" in captured.out
    assert "Nenhum host cadastrado ainda" in captured.out
    assert "100% de sucesso" in captured.out


@pytest.mark.asyncio
async def test_zabbix_script_auth_error_handling(capsys):
    """Valida captura e tratamento de ZabbixAuthError."""
    mock_client = AsyncMock()
    mock_client.__aenter__.side_effect = ZabbixAuthError("Credenciais inválidas")

    with patch("scripts.test_zabbix.ZabbixClient", return_value=mock_client):
        with pytest.raises(SystemExit) as exc_info:
            await main()

        assert exc_info.value.code == 1

    captured = capsys.readouterr()
    assert "[ERRO DE AUTENTICAÇÃO]" in captured.out


@pytest.mark.asyncio
async def test_zabbix_script_connection_error_handling(capsys):
    """Valida captura e tratamento de ZabbixConnectionError."""
    mock_client = AsyncMock()
    mock_client.__aenter__.side_effect = ZabbixConnectionError("Host unreachable")

    with patch("scripts.test_zabbix.ZabbixClient", return_value=mock_client):
        with pytest.raises(SystemExit) as exc_info:
            await main()

        assert exc_info.value.code == 1

    captured = capsys.readouterr()
    assert "[ERRO DE CONEXÃO]" in captured.out
    assert "docker compose -f docker-compose.zabbix.yml up -d" in captured.out
