"""Testes de integração para o endpoint de Server-Sent Events (SSE).

Valida:
1. Autenticação estrita (Header Bearer e query param ?token=)
2. Transmissão de eventos em tempo real com baixa latência (<100ms)
3. Heartbeat periódico (: ping) para keep-alive
4. Isolamento multitenancy estrito entre organizações (Client A vs Client B)
"""

import time

import httpx
import pytest

from src.contexts.iam.api.dependencies.auth import AuthenticatedUser, get_current_user
from src.contexts.iam.api.routes.sse import sse_event_stream_generator
from src.contexts.iam.security.tokens import create_access_token
from src.core.messaging.sse_broadcaster import get_sse_broadcaster
from src.main import app


def generate_token(
    user_id: str = "user-123",
    email: str = "operator@infrawatch.ao",
    role: str = "NOC_OPERATOR",
    organization_id: str | None = None,
) -> str:
    """Gera token JWT válido para testes."""
    return create_access_token(
        data={
            "sub": user_id,
            "email": email,
            "role": role,
            "organization_id": organization_id,
        }
    )


@pytest.fixture
def broadcaster():
    """Retorna o broadcaster SSE limpo antes do teste."""
    b = get_sse_broadcaster()
    b._connections.clear()
    return b


class TestSSEStreamEndpoint:
    """Suíte de testes de integração para o endpoint GET /api/v1/events/stream."""

    async def test_sse_stream_unauthorized_without_token(self) -> None:
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app), base_url="http://testserver"
        ) as client:
            response = await client.get("/api/v1/events/stream")
            assert response.status_code == 401
            assert "Autenticação necessária" in response.json()["detail"]

    async def test_sse_stream_unauthorized_with_invalid_token(self) -> None:
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app), base_url="http://testserver"
        ) as client:
            response = await client.get(
                "/api/v1/events/stream",
                headers={"Authorization": "Bearer token_completamente_invalido"},
            )
            assert response.status_code == 401
            assert "inválido" in response.json()["detail"]

    async def test_sse_auth_dependency_supports_both_query_and_header(self) -> None:
        token = generate_token(user_id="user-dual", organization_id="org-dual")

        # Via Header
        user_from_header = await get_current_user(
            token_bearer=None, token_query=None, authorization=f"Bearer {token}"
        )
        assert user_from_header.id == "user-dual"
        assert user_from_header.organization_id == "org-dual"

        # Via Query Param
        user_from_query = await get_current_user(
            token_bearer=None, token_query=token, authorization=None
        )
        assert user_from_query.id == "user-dual"
        assert user_from_query.organization_id == "org-dual"

    async def test_sse_stream_receives_broadcast_event_under_100ms(self, broadcaster) -> None:
        """Critério de aceite: Cliente conectado recebe eventos publicados em menos de 100ms."""
        user = AuthenticatedUser(
            id="user-speed",
            email="speed@infrawatch.ao",
            role="CLIENT_VIEWER",
            organization_id="org-speed",
        )
        test_payload = {
            "event_type": "DeviceLatencyMeasured",
            "device_id": "sw-core-01",
            "latency_ms": 4.2,
            "organization_id": "org-speed",
        }

        gen = sse_event_stream_generator(user=user, ping_interval_seconds=1.0)
        try:
            # 1. Handshake inicial de conexão
            handshake = await anext(gen)
            assert ": connected" in handshake
            assert broadcaster.active_connections_count == 1

            # 2. Dispara evento e mede latência de entrega
            start_time = time.monotonic()
            delivered = await broadcaster.broadcast(test_payload)
            assert delivered == 1

            event_chunk = await anext(gen)
            elapsed_ms = (time.monotonic() - start_time) * 1000.0

            assert elapsed_ms < 100.0
            assert "event: DeviceLatencyMeasured" in event_chunk
            assert '"latency_ms": 4.2' in event_chunk
        finally:
            await gen.aclose()

        assert broadcaster.active_connections_count == 0

    async def test_sse_stream_transmits_heartbeat_ping(self, broadcaster) -> None:
        """Critério de aceite: Heartbeat (: ping) é transmitido mantendo a conexão aberta."""
        user = AuthenticatedUser(
            id="user-heartbeat",
            email="ping@infrawatch.ao",
            role="NOC_OPERATOR",
        )
        gen = sse_event_stream_generator(user=user, ping_interval_seconds=0.05)
        try:
            handshake = await anext(gen)
            assert ": connected" in handshake

            # Sem eventos, aguarda heartbeat keep-alive
            ping_chunk = await anext(gen)
            assert ": ping" in ping_chunk
        finally:
            await gen.aclose()

        assert broadcaster.active_connections_count == 0

    async def test_sse_multitenancy_isolation(self, broadcaster) -> None:
        """Critério de aceite: Usuário do cliente A não recebe eventos transmitidos exclusivamente para o cliente B."""
        user_a = AuthenticatedUser(
            id="user-a",
            email="client_a@empresa.ao",
            role="CLIENT_VIEWER",
            organization_id="org-alpha",
        )
        user_b = AuthenticatedUser(
            id="user-b",
            email="client_b@empresa.ao",
            role="CLIENT_VIEWER",
            organization_id="org-beta",
        )

        gen_a = sse_event_stream_generator(user=user_a, ping_interval_seconds=1.0)
        gen_b = sse_event_stream_generator(user=user_b, ping_interval_seconds=1.0)

        try:
            await anext(gen_a)
            await anext(gen_b)
            assert broadcaster.active_connections_count == 2

            # Dispara evento exclusivo para org-alpha
            alpha_event = {
                "event_type": "SecretAlphaIncident",
                "organization_id": "org-alpha",
                "incident_id": "inc-alpha-99",
            }
            delivered = await broadcaster.broadcast(alpha_event, organization_id="org-alpha")
            assert delivered == 1  # Apenas Cliente A qualificado

            chunk_a = await anext(gen_a)
            assert "SecretAlphaIncident" in chunk_a
            assert "inc-alpha-99" in chunk_a

            # Dispara evento exclusivo para org-beta
            beta_event = {
                "event_type": "BetaAlarmTriggered",
                "organization_id": "org-beta",
                "severity": "CRITICAL",
            }
            delivered_b = await broadcaster.broadcast(beta_event, organization_id="org-beta")
            assert delivered_b == 1

            chunk_b = await anext(gen_b)
            assert "BetaAlarmTriggered" in chunk_b
            assert "SecretAlphaIncident" not in chunk_b
        finally:
            await gen_a.aclose()
            await gen_b.aclose()

        assert broadcaster.active_connections_count == 0
