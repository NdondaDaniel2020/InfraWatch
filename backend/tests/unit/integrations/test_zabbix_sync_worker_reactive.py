"""Testes unitários para o ZabbixSyncWorker reativo e resiliente.

Valida:
- Carga inicial de catálogo em memória RAM a partir do PostgreSQL (load_initial_hosts_from_db)
- Reatividade a eventos de inventário em tempo real (DeviceCreated, DeviceUpdated, DeviceDeleted, DevicePaused)
- Loop de consumo do Redis Streams (consume_inventory_events) com ACK resiliente
- Loop de reconciliação periódica (self-healing fallback)
- Execução de sync_once com controle de concorrência via asyncio.Semaphore
- Comportamento seguro quando ZABBIX_ENABLED está desabilitado
- Push de hosts para Zabbix (host.create/host.update)
"""

import asyncio
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest

from src.contexts.inventory.database.models import DeviceModel
from src.core.messaging.resilient_bus import ResilientEventBus
from src.integrations.zabbix.client import ZabbixClient
from src.workers.daemons.zabbix_sync_worker import ZabbixSyncWorker, ZabbixTarget


@pytest.fixture
def mock_session_factory():
    """Mock da session factory assíncrona do SQLAlchemy."""
    session = AsyncMock()
    session_maker = MagicMock()
    session_maker.return_value.__aenter__.return_value = session
    session_maker.return_value.__aexit__.return_value = None
    return session_maker, session


@pytest.fixture
def mock_event_bus():
    """Mock do ResilientEventBus."""
    bus = AsyncMock(spec=ResilientEventBus)
    bus.consume_batch = AsyncMock(return_value=[])
    bus.ack = AsyncMock()
    return bus


# ---------------------------------------------------------------------------
# Testes de Carga Inicial (load_initial_hosts_from_db)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_load_initial_hosts_from_db(mock_session_factory):
    """Valida carga inicial no catálogo em memória filtrando apenas dispositivos com zabbix_host_id."""
    session_maker, session = mock_session_factory

    dev_zabbix = DeviceModel(
        id=uuid4(),
        organization_id=uuid4(),
        name="Router Edge",
        ip_address="192.168.1.1",
        port=161,
        protocol="snmp",
        category="ROUTER",
        thresholds={"zabbix_host_id": "10500"},
        is_paused=False,
    )
    dev_no_zabbix = DeviceModel(
        id=uuid4(),
        organization_id=uuid4(),
        name="Switch Core",
        ip_address="192.168.1.2",
        port=161,
        protocol="snmp",
        category="SWITCH",
        thresholds={},
        is_paused=False,
    )

    mock_scalars = MagicMock()
    mock_scalars.all.return_value = [dev_zabbix, dev_no_zabbix]
    mock_result = MagicMock()
    mock_result.scalars.return_value = mock_scalars
    session.execute.return_value = mock_result

    worker = ZabbixSyncWorker(session_factory=session_maker)
    count = await worker.load_initial_hosts_from_db()

    assert count == 1
    assert dev_zabbix.id in worker._monitored_hosts
    target = worker._monitored_hosts[dev_zabbix.id]
    assert target.zabbix_host_id == "10500"
    assert target.name == "Router Edge"
    assert dev_no_zabbix.id not in worker._monitored_hosts


# ---------------------------------------------------------------------------
# Testes de Reatividade a Eventos (handle_inventory_event)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_handle_inventory_event_device_created():
    """Valida que DeviceCreated com zabbix_host_id adiciona o ativo ao catálogo em memória."""
    worker = ZabbixSyncWorker()
    dev_id = uuid4()
    org_id = uuid4()

    payload = {
        "aggregate_id": str(dev_id),
        "organization_id": str(org_id),
        "name": "Firewall Fortinet",
        "thresholds": {"zabbix_host_id": "10600"},
        "is_paused": False,
    }

    await worker.handle_inventory_event("DeviceCreated", payload)

    assert dev_id in worker._monitored_hosts
    target = worker._monitored_hosts[dev_id]
    assert target.zabbix_host_id == "10600"
    assert target.name == "Firewall Fortinet"
    assert target.organization_id == org_id


@pytest.mark.asyncio
async def test_handle_inventory_event_device_updated_removes_if_no_zabbix_id():
    """Valida que remover o zabbix_host_id em DeviceUpdated elimina o ativo da memória."""
    worker = ZabbixSyncWorker()
    dev_id = uuid4()
    org_id = uuid4()

    # Preenche memória
    worker._monitored_hosts[dev_id] = ZabbixTarget(
        device_id=dev_id,
        organization_id=org_id,
        zabbix_host_id="10600",
        name="Firewall Fortinet",
    )

    # Evento de atualização sem zabbix_host_id
    payload = {
        "aggregate_id": str(dev_id),
        "organization_id": str(org_id),
        "name": "Firewall Fortinet (Modificado)",
        "thresholds": {},
        "is_paused": False,
    }

    await worker.handle_inventory_event("DeviceUpdated", payload)

    assert dev_id not in worker._monitored_hosts


@pytest.mark.asyncio
async def test_handle_inventory_event_device_paused_or_deleted():
    """Valida remoção imediata da memória quando um ativo é pausado ou deletado."""
    worker = ZabbixSyncWorker()
    dev1 = uuid4()
    dev2 = uuid4()
    org = uuid4()

    worker._monitored_hosts[dev1] = ZabbixTarget(
        device_id=dev1,
        organization_id=org,
        zabbix_host_id="10001",
        name="Host 1",
    )
    worker._monitored_hosts[dev2] = ZabbixTarget(
        device_id=dev2,
        organization_id=org,
        zabbix_host_id="10002",
        name="Host 2",
    )

    # Pausa dev1
    await worker.handle_inventory_event(
        "DevicePaused",
        {"aggregate_id": str(dev1)},
    )
    assert dev1 not in worker._monitored_hosts
    assert dev2 in worker._monitored_hosts

    # Deleta dev2
    await worker.handle_inventory_event(
        "DeviceDeleted",
        {"device_id": str(dev2)},
    )
    assert dev2 not in worker._monitored_hosts


# ---------------------------------------------------------------------------
# Testes de Loop de Consumo do Redis Streams (consume_inventory_events)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_consume_inventory_events_loop(mock_event_bus):
    """Valida consumo de lote de eventos com confirmação ACK."""
    dev_id = uuid4()
    mock_event_bus.consume_batch.side_effect = [
        [
            (
                "msg-1",
                {
                    "event_type": "DeviceCreated",
                    "aggregate_id": str(dev_id),
                    "thresholds": {"zabbix_host_id": "10999"},
                    "name": "New Server",
                },
            )
        ],
        asyncio.CancelledError(),
    ]

    worker = ZabbixSyncWorker(event_bus=mock_event_bus)
    stop_event = asyncio.Event()

    await worker.consume_inventory_events(stop_event)

    assert dev_id in worker._monitored_hosts
    mock_event_bus.ack.assert_awaited_once_with(
        "stream:inventory:changes",
        "cg:zabbix_sync_workers",
        "msg-1",
    )


# ---------------------------------------------------------------------------
# Testes de Loop de Reconciliação (self-healing fallback)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_reconciliation_loop_calls_load_hosts():
    """Valida que o loop de reconciliação executa a recarga periódica de ativos."""
    worker = ZabbixSyncWorker(reconciliation_interval=0.01)
    worker.load_initial_hosts_from_db = AsyncMock(return_value=1)

    stop_event = asyncio.Event()

    async def _trigger_and_stop():
        await asyncio.sleep(0.03)
        stop_event.set()

    await asyncio.gather(
        worker._reconciliation_loop(stop_event),
        _trigger_and_stop(),
    )

    assert worker.load_initial_hosts_from_db.call_count >= 1


# ---------------------------------------------------------------------------
# Testes de Push para Zabbix (host.create/host.update)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_push_host_to_zabbix_create_new():
    """Valida criação de novo host no Zabbix via host.create."""
    worker = ZabbixSyncWorker()
    dev_id = uuid4()
    org_id = uuid4()

    mock_client = AsyncMock(spec=ZabbixClient)
    mock_client.__aenter__.return_value = mock_client
    mock_client.__aexit__.return_value = None
    mock_client.call.return_value = {"hostids": ["10999"]}

    worker._get_zabbix_client = MagicMock(return_value=mock_client)

    hostid = await worker.push_host_to_zabbix(
        device_id=dev_id,
        org_id=org_id,
        name="New Server",
        ip_address="192.168.1.100",
        protocol="snmp",
        zabbix_host_id=None,
    )

    assert hostid == "10999"
    mock_client.call.assert_called_once()
    call_args = mock_client.call.call_args
    assert call_args[0][0] == "host.create"
    params = call_args[1]["params"]
    assert params["host"] == "New Server"
    assert params["interfaces"][0]["ip"] == "192.168.1.100"
    assert "templates" in params


@pytest.mark.asyncio
async def test_push_host_to_zabbix_update_existing():
    """Valida atualização de host existente no Zabbix via host.update."""
    worker = ZabbixSyncWorker()
    dev_id = uuid4()
    org_id = uuid4()

    mock_client = AsyncMock(spec=ZabbixClient)
    mock_client.__aenter__.return_value = mock_client
    mock_client.__aexit__.return_value = None
    mock_client.call.return_value = {"hostids": ["10600"]}

    worker._get_zabbix_client = MagicMock(return_value=mock_client)

    hostid = await worker.push_host_to_zabbix(
        device_id=dev_id,
        org_id=org_id,
        name="Updated Server",
        ip_address="192.168.1.101",
        protocol="snmp",
        zabbix_host_id="10600",
    )

    assert hostid == "10600"
    mock_client.call.assert_called_once()
    call_args = mock_client.call.call_args
    assert call_args[0][0] == "host.update"
    params = call_args[1]["params"]
    assert params["hostid"] == "10600"
    assert params["host"] == "Updated Server"
    assert params["interfaces"][0]["ip"] == "192.168.1.101"


@pytest.mark.asyncio
async def test_push_host_to_zabbix_handles_error():
    """Valida que erro no Zabbix não propaga exceção e retorna None."""
    worker = ZabbixSyncWorker()
    dev_id = uuid4()
    org_id = uuid4()

    mock_client = AsyncMock(spec=ZabbixClient)
    mock_client.__aenter__.return_value = mock_client
    mock_client.__aexit__.return_value = None
    from src.integrations.zabbix.client import ZabbixError

    mock_client.call.side_effect = ZabbixError("Connection refused")

    worker._get_zabbix_client = MagicMock(return_value=mock_client)

    hostid = await worker.push_host_to_zabbix(
        device_id=dev_id,
        org_id=org_id,
        name="Fail Server",
        ip_address="192.168.1.102",
        protocol="snmp",
        zabbix_host_id=None,
    )

    assert hostid is None


# ---------------------------------------------------------------------------
# Testes de Integração handle_inventory_event com Push
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_handle_inventory_event_device_created_triggers_push():
    """Valida que DeviceCreated dispara push_host_to_zabbix."""
    worker = ZabbixSyncWorker()
    dev_id = uuid4()
    org_id = uuid4()

    worker.push_host_to_zabbix = AsyncMock(return_value="10999")

    payload = {
        "aggregate_id": str(dev_id),
        "organization_id": str(org_id),
        "name": "Firewall Fortinet",
        "ip_address": "192.168.1.10",
        "protocol": "snmp",
        "thresholds": {"zabbix_host_id": "10600"},
        "is_paused": False,
    }

    await worker.handle_inventory_event("DeviceCreated", payload)

    assert dev_id in worker._monitored_hosts
    worker.push_host_to_zabbix.assert_awaited_once_with(
        device_id=dev_id,
        org_id=org_id,
        name="Firewall Fortinet",
        ip_address="192.168.1.10",
        protocol="snmp",
        zabbix_host_id="10600",
    )


@pytest.mark.asyncio
async def test_handle_inventory_event_device_updated_triggers_push():
    """Valida que DeviceUpdated dispara push_host_to_zabbix."""
    worker = ZabbixSyncWorker()
    dev_id = uuid4()
    org_id = uuid4()

    worker.push_host_to_zabbix = AsyncMock(return_value="10600")

    payload = {
        "aggregate_id": str(dev_id),
        "organization_id": str(org_id),
        "name": "Firewall Fortinet (Atualizado)",
        "ip_address": "192.168.1.11",
        "protocol": "snmp",
        "thresholds": {"zabbix_host_id": "10600"},
        "is_paused": False,
    }

    await worker.handle_inventory_event("DeviceUpdated", payload)

    worker.push_host_to_zabbix.assert_awaited_once_with(
        device_id=dev_id,
        org_id=org_id,
        name="Firewall Fortinet (Atualizado)",
        ip_address="192.168.1.11",
        protocol="snmp",
        zabbix_host_id="10600",
    )


# ---------------------------------------------------------------------------
# Testes de Sincronização Concorrente (sync_once)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_sync_once_concurrency_and_semaphore(mock_session_factory):
    """Valida que sync_once executa alvos em memória de forma concorrente respeitando o semáforo."""
    session_maker, _ = mock_session_factory
    mock_client = AsyncMock(spec=ZabbixClient)
    mock_client.__aenter__.return_value = mock_client
    mock_client.__aexit__.return_value = None

    worker = ZabbixSyncWorker(
        session_factory=session_maker,
        client=mock_client,
        max_concurrent=5,
    )

    # 3 alvos em memória
    for i in range(3):
        dev_id = uuid4()
        worker._monitored_hosts[dev_id] = ZabbixTarget(
            device_id=dev_id,
            organization_id=uuid4(),
            zabbix_host_id=f"1000{i}",
            name=f"Host {i}",
        )

    with patch("src.workers.daemons.zabbix_sync_worker.get_settings") as mock_settings:
        mock_settings.return_value.ZABBIX_ENABLED = True

        # Mock de sync_device_metrics para retornar sucesso
        worker.sync_device_metrics = AsyncMock(return_value=MagicMock())

        synced = await worker.sync_once()

        assert synced == 3
        assert worker.sync_device_metrics.call_count == 3


@pytest.mark.asyncio
async def test_sync_once_noop_when_zabbix_disabled():
    """Valida que sync_once não faz chamadas quando ZABBIX_ENABLED é falso."""
    worker = ZabbixSyncWorker()
    dev_id = uuid4()
    worker._monitored_hosts[dev_id] = ZabbixTarget(
        device_id=dev_id,
        organization_id=uuid4(),
        zabbix_host_id="10001",
    )

    with patch("src.workers.daemons.zabbix_sync_worker.get_settings") as mock_settings:
        mock_settings.return_value.ZABBIX_ENABLED = False
        worker.sync_device_metrics = AsyncMock()

        synced = await worker.sync_once()

        assert synced == 0
        worker.sync_device_metrics.assert_not_called()
