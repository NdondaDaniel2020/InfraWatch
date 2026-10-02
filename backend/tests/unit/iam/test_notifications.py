"""Testes unitários e de integração para o subsistema de Notificações In-App e Streaming SSE.

Valida:
1. Persistência de notificações via NotificationRepository e NotificationModel.
2. Emissão em tempo real e isolamento por usuário via SSEBroadcaster.broadcast_to_user.
3. Catch-Up Sync após reconexão SSE por since_id e since_timestamp.
4. Operações REST da API (/sync, /unread-count, listagem paginada, marcar lida e marcar todas como lidas).
5. Isolamento estrito de visibilidade entre múltiplos usuários.
"""

from __future__ import annotations

from collections.abc import AsyncGenerator

import httpx
import pytest
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.pool import StaticPool

from src.api.dependencies.auth import AuthenticatedUser
from src.api.main import app
from src.contexts.iam.domain.enums import UserRole
from src.contexts.iam.domain.models import NotificationModel, UserModel
from src.contexts.iam.repositories.notification_repository import NotificationRepository
from src.contexts.iam.security.tokens import create_access_token
from src.contexts.iam.services.notification_service import NotificationService
from src.core.database.base_model import Base
from src.core.database.session import get_db_session
from src.core.domain.entity import generate_uuid7
from src.core.messaging.sse_broadcaster import SSEBroadcaster


@pytest.fixture
async def db_session() -> AsyncGenerator[AsyncSession, None]:
    """Cria uma sessão assíncrona SQLite em memória com o schema completo."""
    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    session_factory = async_sessionmaker(engine, expire_on_commit=False)
    async with session_factory() as session:
        yield session

    await engine.dispose()


@pytest.fixture
def mock_broadcaster() -> SSEBroadcaster:
    """Instância isolada de SSEBroadcaster para validação de entrega."""
    return SSEBroadcaster()


class TestSSEBroadcasterUserDelivery:
    """Testa o envio direcionado a conexões de um usuário específico em SSEBroadcaster."""

    async def test_broadcast_to_user_delivers_only_to_target_user(self) -> None:
        broadcaster = SSEBroadcaster()

        user1 = AuthenticatedUser(
            id=generate_uuid7(),
            email="user1@infrawatch.ao",
            role=UserRole.NOC_OPERATOR,
        )
        user2 = AuthenticatedUser(
            id=generate_uuid7(),
            email="user2@infrawatch.ao",
            role=UserRole.NOC_OPERATOR,
        )

        # Conecta user1 e user2
        conn1_id, queue1 = await broadcaster.connect(user1)
        conn2_id, queue2 = await broadcaster.connect(user2)

        event = {"event_type": "alert.critical", "message": "High CPU"}

        # Dispara evento apenas para user1
        delivered = await broadcaster.broadcast_to_user(user_id=user1.id, event=event)
        assert delivered == 1

        # queue1 deve ter recebido o evento
        assert not queue1.empty()
        received = queue1.get_nowait()
        assert received["event_type"] == "alert.critical"

        # queue2 não deve ter recebido nada
        assert queue2.empty()

        # Limpeza
        await broadcaster.disconnect(conn1_id)
        await broadcaster.disconnect(conn2_id)

    async def test_broadcast_to_user_delivers_to_multiple_tabs(self) -> None:
        broadcaster = SSEBroadcaster()

        user = AuthenticatedUser(
            id=generate_uuid7(),
            email="multi_tab@infrawatch.ao",
            role=UserRole.NOC_OPERATOR,
        )

        conn1_id, queue1 = await broadcaster.connect(user)
        conn2_id, queue2 = await broadcaster.connect(user)

        event = {"event_type": "ticket.assigned", "ticket_id": 42}
        delivered = await broadcaster.broadcast_to_user(user_id=user.id, event=event)

        assert delivered == 2
        assert queue1.get_nowait()["ticket_id"] == 42
        assert queue2.get_nowait()["ticket_id"] == 42

        await broadcaster.disconnect(conn1_id)
        await broadcaster.disconnect(conn2_id)


class TestNotificationRepositoryAndService:
    """Valida métodos de NotificationRepository e NotificationService."""

    async def test_create_and_notify_user(
        self,
        db_session: AsyncSession,
        mock_broadcaster: SSEBroadcaster,
    ) -> None:
        user_id = generate_uuid7()
        user_auth = AuthenticatedUser(
            id=user_id,
            email="repo_user@infrawatch.ao",
            role=UserRole.NOC_OPERATOR,
        )
        _conn_id, queue = await mock_broadcaster.connect(user_auth)

        service = NotificationService(db_session, broadcaster=mock_broadcaster)
        notif = await service.notify_user(
            user_id=user_id,
            event_type="incident.created",
            title="Incidente Crítico",
            message="Switch SW-CORE-01 inacessível.",
            details={"severity": "CRITICAL"},
        )
        await db_session.commit()

        assert notif.id is not None
        assert notif.user_id == user_id
        assert notif.event_type == "incident.created"
        assert notif.read is False

        # Verifica se o evento chegou à fila SSE do usuário
        assert not queue.empty()
        sse_payload = queue.get_nowait()
        assert sse_payload["event_type"] == "notification.created"
        assert sse_payload["notification"]["id"] == notif.id
        assert sse_payload["notification"]["title"] == "Incidente Crítico"

    async def test_list_notifications_pagination_and_unread_count(
        self,
        db_session: AsyncSession,
    ) -> None:
        user_id = generate_uuid7()
        repo = NotificationRepository(db_session)

        # Cria 5 notificações, sendo 2 lidas e 3 não lidas
        for i in range(1, 6):
            n = await repo.create(
                user_id=user_id,
                event_type="test.event",
                title=f"Notif {i}",
                message=f"Msg {i}",
            )
            if i <= 2:
                n.read = True

        await db_session.commit()

        # Contagem de não lidas
        unread_count = await repo.count_unread(user_id)
        assert unread_count == 3

        # Listagem paginada (todas)
        items, total = await repo.list_notifications(user_id, unread_only=False, limit=3, offset=0)
        assert total == 5
        assert len(items) == 3

        # Listagem apenas não lidas
        unread_items, unread_total = await repo.list_notifications(
            user_id, unread_only=True, limit=10, offset=0
        )
        assert unread_total == 3
        assert len(unread_items) == 3
        assert all(not n.read for n in unread_items)

    async def test_mark_as_read_and_mark_all(
        self,
        db_session: AsyncSession,
    ) -> None:
        user_id = generate_uuid7()
        other_user_id = generate_uuid7()
        repo = NotificationRepository(db_session)

        n1 = await repo.create(
            user_id=user_id,
            event_type="t.e",
            title="N1",
            message="M1",
        )
        _n2 = await repo.create(
            user_id=user_id,
            event_type="t.e",
            title="N2",
            message="M2",
        )
        await db_session.commit()

        # Usuário alheio tenta marcar n1 como lida -> deve falhar (None)
        marked_other = await repo.mark_as_read(n1.id, other_user_id)
        assert marked_other is None

        # Usuário correto marca n1 como lida
        marked = await repo.mark_as_read(n1.id, user_id)
        assert marked is not None
        assert marked.read is True

        # Marca todas como lidas (restava n2)
        marked_count = await repo.mark_all_as_read(user_id)
        assert marked_count == 1
        assert await repo.count_unread(user_id) == 0

    async def test_catch_up_sync(
        self,
        db_session: AsyncSession,
    ) -> None:
        user_id = generate_uuid7()
        repo = NotificationRepository(db_session)

        ids = []
        for i in range(1, 6):
            n = await repo.create(
                user_id=user_id,
                event_type="sync.event",
                title=f"Sync {i}",
                message=f"Msg {i}",
            )
            ids.append(n.id)
        await db_session.commit()

        service = NotificationService(db_session)

        # Sincroniza desde o id #2 com limite 2
        items, has_more, last_id = await service.sync_notifications(
            user_id=user_id,
            since_id=ids[1],
            limit=2,
        )
        assert len(items) == 2
        assert items[0].id == ids[2]
        assert items[1].id == ids[3]
        assert has_more is True
        assert last_id == ids[3]

        # Sincroniza desde o id final
        items_end, has_more_end, last_id_end = await service.sync_notifications(
            user_id=user_id,
            since_id=ids[-1],
        )
        assert len(items_end) == 0
        assert has_more_end is False
        assert last_id_end == ids[-1]


class TestNotificationAPIRoutes:
    """Testes dos endpoints HTTP /api/v1/notifications."""

    @pytest.fixture
    async def api_db(self) -> AsyncGenerator[async_sessionmaker[AsyncSession], None]:
        engine = create_async_engine(
            "sqlite+aiosqlite:///:memory:",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )

        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)

        session_factory = async_sessionmaker(engine, expire_on_commit=False)
        yield session_factory
        await engine.dispose()

    @pytest.fixture
    async def seeded_test_user(
        self,
        api_db: async_sessionmaker[AsyncSession],
    ) -> tuple[UserModel, str]:
        async with api_db() as session:
            user = UserModel(
                id=generate_uuid7(),
                email="notif_api_user@infrawatch.ao",
                hashed_password="not-a-real-hash",
                full_name="Notification Tester",
                role=UserRole.NOC_OPERATOR,
                is_active=True,
                is_verified=True,
            )
            session.add(user)
            await session.commit()
            await session.refresh(user)

        token = create_access_token(
            data={
                "sub": str(user.id),
                "email": user.email,
                "role": user.role,
                "token_type": "access",
            }
        )
        return user, token

    async def test_unauthenticated_request_rejected(self) -> None:
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app), base_url="http://testserver"
        ) as client:
            resp = await client.get("/api/v1/notifications")
            assert resp.status_code == 401

    async def test_list_notifications_endpoint(
        self,
        api_db: async_sessionmaker[AsyncSession],
        seeded_test_user: tuple[UserModel, str],
    ) -> None:
        user, token = seeded_test_user

        # Popula 3 notificações
        async with api_db() as session:
            for i in range(1, 4):
                session.add(
                    NotificationModel(
                        user_id=user.id,
                        event_type="test.alert",
                        title=f"Alerta {i}",
                        message=f"Mensagem {i}",
                        read=(i == 1),
                    )
                )
            await session.commit()

        async def _override_get_db():
            async with api_db() as session:
                yield session

        app.dependency_overrides[get_db_session] = _override_get_db

        try:
            async with httpx.AsyncClient(
                transport=httpx.ASGITransport(app=app), base_url="http://testserver"
            ) as client:
                headers = {"Authorization": f"Bearer {token}"}
                resp = await client.get(
                    "/api/v1/notifications?page=1&page_size=10", headers=headers
                )
                assert resp.status_code == 200
                data = resp.json()
                assert data["total"] == 3
                assert len(data["items"]) == 3
                assert data["unread_count"] == 2

                # Teste do endpoint /unread-count
                resp_count = await client.get("/api/v1/notifications/unread-count", headers=headers)
                assert resp_count.status_code == 200
                assert resp_count.json()["unread_count"] == 2
        finally:
            app.dependency_overrides.pop(get_db_session, None)

    async def test_sync_notifications_endpoint(
        self,
        api_db: async_sessionmaker[AsyncSession],
        seeded_test_user: tuple[UserModel, str],
    ) -> None:
        user, token = seeded_test_user
        n_ids: list[int] = []

        async with api_db() as session:
            for i in range(1, 5):
                n = NotificationModel(
                    user_id=user.id,
                    event_type="sync.notice",
                    title=f"Notice {i}",
                    message=f"Body {i}",
                )
                session.add(n)
                await session.flush()
                n_ids.append(n.id)
            await session.commit()

        async def _override_get_db():
            async with api_db() as session:
                yield session

        app.dependency_overrides[get_db_session] = _override_get_db

        try:
            async with httpx.AsyncClient(
                transport=httpx.ASGITransport(app=app), base_url="http://testserver"
            ) as client:
                headers = {"Authorization": f"Bearer {token}"}

                # Catch-up desde o primeiro item com limit=2
                resp = await client.get(
                    f"/api/v1/notifications/sync?since_id={n_ids[0]}&limit=2",
                    headers=headers,
                )
                assert resp.status_code == 200
                body = resp.json()
                assert body["total"] == 2
                assert body["has_more"] is True
                assert body["last_id"] == n_ids[2]
                assert [e["id"] for e in body["events"]] == [n_ids[1], n_ids[2]]
        finally:
            app.dependency_overrides.pop(get_db_session, None)

    async def test_mark_as_read_endpoints(
        self,
        api_db: async_sessionmaker[AsyncSession],
        seeded_test_user: tuple[UserModel, str],
    ) -> None:
        user, token = seeded_test_user
        notif_id: int = 0

        async with api_db() as session:
            n = NotificationModel(
                user_id=user.id,
                event_type="read.test",
                title="Para ler",
                message="Conteúdo",
                read=False,
            )
            session.add(n)
            await session.flush()
            notif_id = n.id
            await session.commit()

        async def _override_get_db():
            async with api_db() as session:
                yield session

        app.dependency_overrides[get_db_session] = _override_get_db

        try:
            async with httpx.AsyncClient(
                transport=httpx.ASGITransport(app=app), base_url="http://testserver"
            ) as client:
                headers = {"Authorization": f"Bearer {token}"}

                # Marcar notificação existente como lida
                resp = await client.patch(
                    f"/api/v1/notifications/{notif_id}/read",
                    headers=headers,
                )
                assert resp.status_code == 200
                assert resp.json()["read"] is True

                # Marcar notificação inexistente -> 404
                resp_404 = await client.patch(
                    "/api/v1/notifications/999999/read",
                    headers=headers,
                )
                assert resp_404.status_code == 404

                # Marcar todas como lidas
                resp_all = await client.post(
                    "/api/v1/notifications/read-all",
                    headers=headers,
                )
                assert resp_all.status_code == 200
                assert "marked_as_read" in resp_all.json()
        finally:
            app.dependency_overrides.pop(get_db_session, None)
