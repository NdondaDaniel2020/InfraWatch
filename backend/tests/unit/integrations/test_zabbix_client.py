"""Testes unitários para o conector Zabbix JSON-RPC e ZabbixSyncWorker.

Valida:
- Construção de payloads e envelopes JSON-RPC 2.0
- Autenticação via login/senha e via API Token Bearer
- Consulta de versão da API (apiinfo.version)
- Consulta de hosts e itens (host.get, item.get)
- Consolidação e cálculo de métricas de hardware (CPU %, RAM %, Disco %)
- Resiliência com retentativas automáticas em erros transitórios
- Tratamento de falhas de conexão sem propagação de exceções destrutivas
- Sincronização e persistência de telemetria no ZabbixSyncWorker
"""

from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import httpx
import pytest

from src.integrations.zabbix.client import (
    ZabbixAuthError,
    ZabbixClient,
    ZabbixConnectionError,
)
from src.integrations.zabbix.schemas import (
    JsonRpcRequest,
    ZabbixHostMetrics,
    ZabbixItem,
)
from src.workers.daemons.zabbix_sync_worker import ZabbixSyncWorker


def make_jsonrpc_response(result: object = None, error: dict | None = None, status_code: int = 200) -> MagicMock:
    """Helper para mockar respostas HTTP com payload JSON-RPC 2.0."""
    mock = MagicMock(spec=httpx.Response)
    mock.status_code = status_code
    body = {"jsonrpc": "2.0", "id": 1}
    if error:
        body["error"] = error
    else:
        body["result"] = result

    mock.json.return_value = body
    mock.raise_for_status = MagicMock()
    if status_code >= 400:
        mock.raise_for_status.side_effect = httpx.HTTPStatusError(
            message=f"HTTP {status_code}",
            request=MagicMock(),
            response=mock,
        )
    return mock


# ---------------------------------------------------------------------------
# Testes de Schemas e Envelopes JSON-RPC
# ---------------------------------------------------------------------------


def test_jsonrpc_request_serialization():
    """Valida a serialização correta de uma requisição JSON-RPC 2.0."""
    req = JsonRpcRequest(
        method="host.get",
        params={"output": "extend"},
        id=42,
        auth="test-token",
    )
    dumped = req.model_dump(exclude_none=True)
    assert dumped["jsonrpc"] == "2.0"
    assert dumped["method"] == "host.get"
    assert dumped["params"] == {"output": "extend"}
    assert dumped["id"] == 42
    assert dumped["auth"] == "test-token"


def test_zabbix_item_float_parsing():
    """Valida conversão segura de valores de texto para float em ZabbixItem."""
    item_valid = ZabbixItem(itemid="1", key_="system.cpu.util", lastvalue=" 42.5000 ")
    assert item_valid.parse_float_value() == 42.5

    item_none = ZabbixItem(itemid="2", key_="system.cpu.util", lastvalue=None)
    assert item_none.parse_float_value() is None

    item_invalid = ZabbixItem(itemid="3", key_="system.cpu.util", lastvalue="invalid")
    assert item_invalid.parse_float_value() is None


# ---------------------------------------------------------------------------
# Testes do ZabbixClient (API JSON-RPC)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_zabbix_get_api_version():
    """Valida chamada do método apiinfo.version sem necessidade de autenticação."""
    # Mesmo com api_token configurado, apiinfo.version não pode enviar header Authorization
    client = ZabbixClient(
        api_url="http://zabbix.test/api_jsonrpc.php",
        api_token="token_that_must_not_be_sent_to_apiinfo_version",
    )

    mock_resp = make_jsonrpc_response(result="7.0.0")
    with patch("httpx.AsyncClient.post", new_callable=AsyncMock, return_value=mock_resp) as mock_post:
        version = await client.get_api_version()
        assert version == "7.0.0"
        mock_post.assert_called_once()
        sent_json = mock_post.call_args[1]["json"]
        sent_headers = mock_post.call_args[1]["headers"]
        assert sent_json["method"] == "apiinfo.version"
        assert "auth" not in sent_json or sent_json["auth"] is None
        assert "Authorization" not in sent_headers


@pytest.mark.asyncio
async def test_zabbix_login_success():
    """Valida autenticação com sucesso via user.login."""
    client = ZabbixClient(
        api_url="http://zabbix.test/api_jsonrpc.php",
        username="Admin",
        password="zabbix_password",
    )

    mock_resp = make_jsonrpc_response(result="session_token_xyz_123")
    with patch("httpx.AsyncClient.post", new_callable=AsyncMock, return_value=mock_resp):
        token = await client.login("Admin", "zabbix_password")
        assert token == "session_token_xyz_123"
        assert client._auth_token == "session_token_xyz_123"


@pytest.mark.asyncio
async def test_zabbix_login_failure():
    """Valida que credenciais incorretas lançam ZabbixAuthError."""
    client = ZabbixClient(api_url="http://zabbix.test/api_jsonrpc.php")

    error_payload = {
        "code": -32602,
        "message": "Invalid params.",
        "data": "Login name or password is incorrect.",
    }
    mock_resp = make_jsonrpc_response(error=error_payload)
    with (
        patch("httpx.AsyncClient.post", new_callable=AsyncMock, return_value=mock_resp),
        pytest.raises(ZabbixAuthError, match="Erro de autenticação Zabbix"),
    ):
        await client.login("Admin", "wrong_password")


@pytest.mark.asyncio
async def test_zabbix_invalid_api_token_triggers_auth_error():
    """Valida que token inválido/expirado com resposta 'Session terminated' lança ZabbixAuthError."""
    client = ZabbixClient(
        api_url="http://zabbix.test/api_jsonrpc.php",
        api_token="invalid_or_fake_token",
    )

    error_payload = {
        "code": -32602,
        "message": "Invalid params.",
        "data": "Session terminated, re-login, please.",
    }
    mock_resp = make_jsonrpc_response(error=error_payload)
    with (
        patch("httpx.AsyncClient.post", new_callable=AsyncMock, return_value=mock_resp),
        pytest.raises(ZabbixAuthError, match="Erro de autenticação Zabbix"),
    ):
        async with client:
            await client.get_hosts()


@pytest.mark.asyncio
async def test_zabbix_api_token_header():
    """Valida que um API Token permanente é enviado no cabeçalho Authorization."""
    client = ZabbixClient(
        api_url="http://zabbix.test/api_jsonrpc.php",
        api_token="permanent_bearer_token",
    )

    mock_resp = make_jsonrpc_response(result=[{"hostid": "10084", "host": "srv-prod-01"}])
    with patch("httpx.AsyncClient.post", new_callable=AsyncMock, return_value=mock_resp):
        async with client:
            hosts = await client.get_hosts(hostids=["10084"])
            assert len(hosts) == 1
            assert hosts[0].hostid == "10084"
            assert hosts[0].host == "srv-prod-01"


@pytest.mark.asyncio
async def test_zabbix_get_host_hardware_metrics():
    """Valida consolidação de métricas de CPU, RAM e Disco a partir dos itens do Zabbix."""
    client = ZabbixClient(
        api_url="http://zabbix.test/api_jsonrpc.php",
        api_token="fake_token",
    )

    sample_items = [
        {
            "itemid": "101",
            "name": "CPU utilization",
            "key_": "system.cpu.util[,idle]",
            "lastvalue": "18.75",
            "units": "%",
            "lastclock": "1710000000",
            "status": "0",
        },
        {
            "itemid": "102",
            "name": "Memory utilization",
            "key_": "vm.memory.util",
            "lastvalue": "64.20",
            "units": "%",
            "lastclock": "1710000000",
            "status": "0",
        },
        {
            "itemid": "103",
            "name": "Total memory",
            "key_": "vm.memory.size[total]",
            "lastvalue": "17179869184",
            "units": "B",
            "lastclock": "1710000000",
            "status": "0",
        },
        {
            "itemid": "104",
            "name": "Used memory",
            "key_": "vm.memory.size[used]",
            "lastvalue": "11029476016",
            "units": "B",
            "lastclock": "1710000000",
            "status": "0",
        },
        {
            "itemid": "105",
            "name": "Root filesystem space utilization",
            "key_": "vfs.fs.size[/,pused]",
            "lastvalue": "51.30",
            "units": "%",
            "lastclock": "1710000000",
            "status": "0",
        },
    ]

    mock_resp = make_jsonrpc_response(result=sample_items)
    with patch("httpx.AsyncClient.post", new_callable=AsyncMock, return_value=mock_resp):
        metrics = await client.get_host_hardware_metrics(hostid="10084")
        assert metrics.hostid == "10084"
        assert metrics.cpu_utilization_pct == 18.75
        assert metrics.memory_utilization_pct == 64.20
        assert metrics.disk_utilization_pct == 51.30
        assert metrics.memory_total_bytes == 17179869184.0
        assert metrics.memory_used_bytes == 11029476016.0
        assert metrics.has_hardware_telemetry is True


@pytest.mark.asyncio
async def test_zabbix_retry_on_transient_error():
    """Valida retentativa automática em caso de erro transitório de rede."""
    client = ZabbixClient(api_url="http://zabbix.test/api_jsonrpc.php")

    # Primeira tentativa: TimeoutException; Segunda: Sucesso
    timeout_exc = httpx.ConnectTimeout("Connection timed out")
    success_resp = make_jsonrpc_response(result="7.0.0")

    with (
        patch("httpx.AsyncClient.post", new_callable=AsyncMock, side_effect=[timeout_exc, success_resp]),
        patch("asyncio.sleep", new_callable=AsyncMock),
    ):
        version = await client.get_api_version()
        assert version == "7.0.0"


@pytest.mark.asyncio
async def test_zabbix_definitive_connection_failure():
    """Valida que após esgotadas as 3 retentativas é lançado ZabbixConnectionError."""
    client = ZabbixClient(api_url="http://zabbix.test/api_jsonrpc.php")

    timeout_exc = httpx.ConnectTimeout("Connection timed out")

    with (
        patch("httpx.AsyncClient.post", new_callable=AsyncMock, side_effect=timeout_exc),
        patch("asyncio.sleep", new_callable=AsyncMock),
        pytest.raises(ZabbixConnectionError, match="Falha definitiva ao comunicar com Zabbix"),
    ):
        await client.get_api_version()



# ---------------------------------------------------------------------------
# Testes do ZabbixSyncWorker
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_zabbix_sync_worker_records_telemetry():
    """Valida que o worker salva registros de telemetria no banco e cacheia no Redis."""
    mock_metrics = ZabbixHostMetrics(
        hostid="10084",
        cpu_utilization_pct=25.0,
        memory_utilization_pct=50.0,
        disk_utilization_pct=75.0,
    )

    mock_client = AsyncMock(spec=ZabbixClient)
    mock_client.get_host_hardware_metrics.return_value = mock_metrics

    mock_session = AsyncMock()
    mock_session.add_all = MagicMock()
    mock_session.commit = AsyncMock()

    mock_redis = AsyncMock()
    mock_redis.set = AsyncMock()

    worker = ZabbixSyncWorker(client=mock_client)
    device_id = uuid4()
    org_id = uuid4()

    with patch("src.workers.daemons.zabbix_sync_worker.get_redis_client", return_value=mock_redis):
        result = await worker.sync_device_metrics(
            session=mock_session,
            client=mock_client,
            device_id=device_id,
            org_id=org_id,
            zabbix_host_id="10084",
        )

        assert result is not None
        mock_session.add_all.assert_called_once()
        saved_records = mock_session.add_all.call_args[0][0]
        assert len(saved_records) == 3

        metric_types = {r.metric_type for r in saved_records}
        assert metric_types == {"cpu_usage_pct", "memory_usage_pct", "disk_usage_pct"}

        mock_session.commit.assert_awaited_once()
        mock_redis.set.assert_awaited_once()


@pytest.mark.asyncio
async def test_zabbix_sync_worker_resilience_on_zabbix_error():
    """Valida critério de aceite: indisponibilidade do Zabbix não afeta o monitoramento nem lança exceção."""
    mock_client = AsyncMock(spec=ZabbixClient)
    mock_client.get_host_hardware_metrics.side_effect = ZabbixConnectionError("Zabbix host offline")

    mock_session = AsyncMock()
    worker = ZabbixSyncWorker(client=mock_client)

    result = await worker.sync_device_metrics(
        session=mock_session,
        client=mock_client,
        device_id=uuid4(),
        org_id=uuid4(),
        zabbix_host_id="10084",
    )

    # Não deve lançar exceção, deve retornar None e não gravar métricas
    assert result is None
    mock_session.add_all.assert_not_called()


# ---------------------------------------------------------------------------
# Testes de Startup Heartbeat
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_zabbix_send_startup_heartbeat_success():
    """Valida envio de batimento cardíaco (startup heartbeat) com sucesso."""
    client = ZabbixClient(api_url="http://zabbix.test/api_jsonrpc.php", api_token="valid_token")

    hosts_resp = make_jsonrpc_response(result=[{"hostid": "10084", "host": "srv-prod-01"}])
    version_resp = make_jsonrpc_response(result="7.0.0")
    items_resp = make_jsonrpc_response(result=[{"itemid": "50740"}])
    push_resp = make_jsonrpc_response(result={"response": "success", "data": [{"itemid": 50740}]})

    with patch(
        "httpx.AsyncClient.post",
        new_callable=AsyncMock,
        side_effect=[version_resp, hosts_resp, items_resp, push_resp],
    ):
        res = await client.send_startup_heartbeat(
            app_name="InfraWatch",
            version="0.1.0",
            environment="production",
        )
        assert res["status"] == "ok"
        assert res["api_version"] == "7.0.0"
        assert res["hosts_count"] == 1
        assert res["item_id"] == "50740"
        assert res["heartbeat_pushed"] is True


@pytest.mark.asyncio
async def test_zabbix_send_startup_heartbeat_graceful_on_push_error():
    """Valida que falha em history.push (ex: erro no servidor) não invalida o heartbeat."""
    client = ZabbixClient(api_url="http://zabbix.test/api_jsonrpc.php", api_token="valid_token")

    version_resp = make_jsonrpc_response(result="7.0.0")
    hosts_resp = make_jsonrpc_response(result=[{"hostid": "10084", "host": "srv-prod-01"}])
    items_resp = make_jsonrpc_response(result=[{"itemid": "50740"}])
    push_err = make_jsonrpc_response(error={"code": -32602, "message": "Failed to push"})

    with patch(
        "httpx.AsyncClient.post",
        new_callable=AsyncMock,
        side_effect=[version_resp, hosts_resp, items_resp, push_err],
    ):
        res = await client.send_startup_heartbeat()
        assert res["status"] == "ok"
        assert res["api_version"] == "7.0.0"
        assert res["hosts_count"] == 1
        assert res["item_id"] == "50740"
        assert res["heartbeat_pushed"] is False


@pytest.mark.asyncio
async def test_zabbix_send_startup_heartbeat_without_hosts():
    """Valida comportamento seguro quando nenhum host está cadastrado."""
    client = ZabbixClient(api_url="http://zabbix.test/api_jsonrpc.php", api_token="valid_token")

    version_resp = make_jsonrpc_response(result="6.4.0")
    hosts_resp = make_jsonrpc_response(result=[])

    with patch("httpx.AsyncClient.post", new_callable=AsyncMock, side_effect=[version_resp, hosts_resp]):
        res = await client.send_startup_heartbeat()
        assert res["status"] == "ok"
        assert res["api_version"] == "6.4.0"
        assert res["hosts_count"] == 0
        assert res["heartbeat_pushed"] is False

