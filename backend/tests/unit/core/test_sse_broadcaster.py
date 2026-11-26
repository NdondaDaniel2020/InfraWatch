"""Testes unitários para SSEBroadcaster (transmissão de eventos em tempo real)."""

from __future__ import annotations

from datetime import UTC, datetime
from unittest.mock import MagicMock
from uuid import uuid4

import pytest

from src.contexts.iam.domain.authenticated_user import AuthenticatedUser
from src.contexts.iam.domain.enums import UserRole
from src.core.domain.events import DomainEvent
from src.core.messaging.sse_broadcaster import (
    SSEBroadcaster,
    get_sse_broadcaster,
)


@pytest.fixture
def broadcaster():
    return SSEBroadcaster()


@pytest.mark.asyncio
async def test_sse_broadcaster_connection_lifecycle(broadcaster: SSEBroadcaster) -> None:
    """Valida conexão, desconexão e contagem de conexões ativas."""
    user = AuthenticatedUser(
        id=str(uuid4()),
        email="sse@corp.ao",
        role=UserRole.CLIENT_VIEWER.value,
        organization_id=str(uuid4()),
    )

    assert broadcaster.active_connections_count == 0

    conn_id, queue = await broadcaster.connect(user, max_queue_size=10)
    assert broadcaster.active_connections_count == 1
    assert queue.maxsize == 10

    await broadcaster.disconnect(conn_id)
    assert broadcaster.active_connections_count == 0


@pytest.mark.asyncio
async def test_sse_broadcaster_normalize_event(broadcaster: SSEBroadcaster) -> None:
    """Valida normalização de DomainEvent, dict com tipos complexos e erro de tipo."""
    uid = uuid4()
    now = datetime.now(UTC)

    # 1. Dict com UUID e datetime
    dict_event = {"id": uid, "time": now, "str_val": "abc"}
    norm_dict = broadcaster._normalize_event(dict_event)
    assert norm_dict["id"] == str(uid)
    assert norm_dict["time"] == now.isoformat()
    assert norm_dict["str_val"] == "abc"

    # 2. DomainEvent mock
    mock_event = MagicMock(spec=DomainEvent)
    mock_event.to_dict.return_value = {"event_type": "DeviceCreated", "aggregate_id": "123"}
    norm_event = broadcaster._normalize_event(mock_event)
    assert norm_event["event_type"] == "DeviceCreated"

    # 3. Tipo inválido
    with pytest.raises(TypeError, match="Esperado DomainEvent ou dict"):
        broadcaster._normalize_event("string_invalida")  # type: ignore


@pytest.mark.asyncio
async def test_sse_broadcaster_multitenant_broadcast(broadcaster: SSEBroadcaster) -> None:
    """Valida broadcast com isolamento de tenant e fila cheia (drop oldest)."""
    org1 = str(uuid4())
    org2 = str(uuid4())

    user_org1 = AuthenticatedUser(
        id=str(uuid4()),
        email="user1@org1.ao",
        role=UserRole.CLIENT_VIEWER.value,
        organization_id=org1,
    )
    user_org2 = AuthenticatedUser(
        id=str(uuid4()),
        email="user2@org2.ao",
        role=UserRole.CLIENT_VIEWER.value,
        organization_id=org2,
    )
    user_super = AuthenticatedUser(
        id=str(uuid4()),
        email="admin@global.ao",
        role=UserRole.SUPER_ADMIN.value,
        organization_id=None,
    )

    _, q1 = await broadcaster.connect(user_org1, max_queue_size=2)
    _, q2 = await broadcaster.connect(user_org2, max_queue_size=2)
    _, q_super = await broadcaster.connect(user_super, max_queue_size=2)

    # 1. Evento direcionado para org1 -> q1 e q_super recebem, q2 não recebe
    delivered = await broadcaster.broadcast({"event_type": "Org1Alert"}, organization_id=org1)
    assert delivered == 2
    assert q1.qsize() == 1
    assert q2.qsize() == 0
    assert q_super.qsize() == 1

    # 2. Evento global -> todos recebem
    delivered_global = await broadcaster.broadcast({"event_type": "GlobalMaintenance"})
    assert delivered_global == 3

    # 3. Teste de fila cheia (drop oldest) na fila de q1 (capacidade 2)
    await broadcaster.broadcast({"event_type": "Overflow1"}, organization_id=org1)
    # A fila q1 estava em 2, drop oldest faz caber o novo mantendo em 2
    assert q1.qsize() == 2


@pytest.mark.asyncio
async def test_sse_broadcaster_broadcast_to_user(broadcaster: SSEBroadcaster) -> None:
    """Valida broadcast direcionado a um usuário específico por user_id."""
    u1_id = uuid4()
    u2_id = uuid4()

    user1_tab1 = AuthenticatedUser(
        id=str(u1_id),
        email="u1@corp.ao",
        role=UserRole.CLIENT_VIEWER.value,
        organization_id=str(uuid4()),
    )
    user1_tab2 = AuthenticatedUser(
        id=str(u1_id),
        email="u1@corp.ao",
        role=UserRole.CLIENT_VIEWER.value,
        organization_id=str(uuid4()),
    )
    user2 = AuthenticatedUser(
        id=str(u2_id),
        email="u2@corp.ao",
        role=UserRole.CLIENT_VIEWER.value,
        organization_id=str(uuid4()),
    )

    _, q1 = await broadcaster.connect(user1_tab1)
    _, q2 = await broadcaster.connect(user1_tab2)
    _, q3 = await broadcaster.connect(user2)

    delivered = await broadcaster.broadcast_to_user(u1_id, {"msg": "Ola"})
    assert delivered == 2
    assert q1.qsize() == 1
    assert q2.qsize() == 1
    assert q3.qsize() == 0

    # Singleton
    singleton = get_sse_broadcaster()
    assert isinstance(singleton, SSEBroadcaster)
