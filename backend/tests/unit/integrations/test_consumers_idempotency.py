"""Testes unitários de idempotência e deduplicação para consumidores com efeitos colaterais.

Valida:
1. GlpiTicketConsumer: Impede abertura repetida de tickets no GLPI em reentregas via XAUTOCLAIM e valida tag [event_id:<uuid>].
2. IamEmailConsumer: Impede reenvio de e-mails transacionais (reset de senha) em reentregas.
3. AlertNotificationConsumer: Impede disparos redundantes de alertas em reentregas.
4. Incident.resolve(): Suporta encerramento idempotente sem exceções não tratadas.
"""

from unittest.mock import AsyncMock, patch
from uuid import uuid4

import pytest
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from src.contexts.alerting.consumers.alert_notification_consumer import (
    AlertNotificationConsumer,
)
from src.contexts.alerting.consumers.glpi_ticket_consumer import (
    GlpiTicketConsumer,
)
from src.contexts.alerting.domain.incident import (
    Incident,
    IncidentAlreadyResolvedError,
)
from src.contexts.iam.consumers.iam_email_consumer import (
    IamEmailConsumer,
)
from src.core.database.base_model import Base
from src.core.messaging.idempotency import IdempotencyGuard
from src.core.messaging.in_memory_bus import InMemoryEventBus


@pytest.fixture
async def db_session_factory():
    engine = create_async_engine("sqlite+aiosqlite:///:memory:", echo=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    factory = async_sessionmaker(bind=engine, expire_on_commit=False)
    yield factory
    await engine.dispose()


@pytest.fixture
async def idempotency_guard(db_session_factory):
    return IdempotencyGuard(session_factory=db_session_factory)


# ============================================================================
# 1. GlpiTicketConsumer Idempotency
# ============================================================================


@pytest.mark.asyncio
async def test_glpi_ticket_consumer_deduplicates_redelivered_events(idempotency_guard) -> None:
    event_bus = InMemoryEventBus()
    consumer = GlpiTicketConsumer(
        event_bus=event_bus,  # type: ignore[arg-type]
        glpi_base_url="http://mock-glpi/apirest.php",
        glpi_app_token="mock_app_token",
        glpi_user_token="mock_user_token",
        idempotency_guard=idempotency_guard,
    )

    event_id = uuid4()
    payload = {
        "event_id": str(event_id),
        "event_type": "IncidentTriggeredEvent",
        "severity": "CRITICAL",
        "device_name": "Switch-Core-01",
        "device_ip": "10.0.0.1",
        "occurred_at": "2026-10-31T22:00:00Z",
    }

    mock_client_instance = AsyncMock()
    mock_client_instance.open_ticket.return_value = 12345
    mock_client_instance.__aenter__.return_value = mock_client_instance
    mock_client_instance.__aexit__.return_value = None

    with patch(
        "src.contexts.alerting.consumers.glpi_ticket_consumer.GlpiClient",
        return_value=mock_client_instance,
    ):
        # 1. Primeira entrega: deve abrir o chamado no GLPI
        await consumer._handle_event("IncidentTriggeredEvent", payload)
        assert mock_client_instance.open_ticket.await_count == 1

        # Verifica tag de correlação no título do chamado
        ticket_arg = mock_client_instance.open_ticket.await_args[0][0]
        assert f"[event_id:{event_id}]" in ticket_arg.name
        assert f"[event_id:{event_id}]" in ticket_arg.content

        # 2. Reentrega via XAUTOCLAIM (mesmo event_id): NÃO deve abrir novo chamado
        await consumer._handle_event("IncidentTriggeredEvent", payload)
        assert mock_client_instance.open_ticket.await_count == 1  # Mantém contagem em 1

    await event_bus.close()


# ============================================================================
# 2. IamEmailConsumer Idempotency
# ============================================================================


@pytest.mark.asyncio
async def test_iam_email_consumer_deduplicates_redelivered_events(idempotency_guard) -> None:
    event_bus = InMemoryEventBus()
    consumer = IamEmailConsumer(
        event_bus=event_bus,  # type: ignore[arg-type]
        idempotency_guard=idempotency_guard,
    )

    event_id = uuid4()
    payload = {
        "event_id": str(event_id),
        "event_type": "PasswordResetRequestedEvent",
        "email": "noc.admin@infrawatch.ao",
        "reset_token": "token-xyz-123",
    }

    with patch(
        "src.contexts.iam.consumers.iam_email_consumer.email_service.send_password_reset_email",
        new_callable=AsyncMock,
    ) as mock_send_email:
        # 1. Primeira entrega: deve enviar o e-mail
        await consumer.handle("stream:iam:events", payload)
        assert mock_send_email.await_count == 1

        # 2. Reentrega: deve descartar de forma idempotente sem disparar e-mail
        await consumer.handle("stream:iam:events", payload)
        assert mock_send_email.await_count == 1

    await event_bus.close()


# ============================================================================
# 3. AlertNotificationConsumer Idempotency
# ============================================================================


@pytest.mark.asyncio
async def test_alert_notification_consumer_deduplicates_redelivered_events(idempotency_guard) -> None:
    event_bus = InMemoryEventBus()
    mock_dispatcher = AsyncMock()
    mock_dispatcher.dispatch_by_severity.return_value = {"telegram": True, "webhook": True}

    consumer = AlertNotificationConsumer(
        event_bus=event_bus,  # type: ignore[arg-type]
        dispatcher=mock_dispatcher,
        idempotency_guard=idempotency_guard,
    )

    event_id = uuid4()
    payload = {
        "event_id": str(event_id),
        "event_type": "IncidentTriggeredEvent",
        "severity": "CRITICAL",
        "device_name": "Firewall-Border-01",
        "device_ip": "192.168.10.1",
        "reason": "Perda total de pacotes.",
    }

    # 1. Primeira entrega: deve despachar notificação
    await consumer.handle("stream:incidents", payload)
    assert mock_dispatcher.dispatch_by_severity.await_count == 1

    # 2. Reentrega: não deve chamar o dispatcher novamente
    await consumer.handle("stream:incidents", payload)
    assert mock_dispatcher.dispatch_by_severity.await_count == 1

    await event_bus.close()


# ============================================================================
# 4. Incident.resolve Idempotency
# ============================================================================


def test_incident_resolve_idempotent_support() -> None:
    incident = Incident(device_id=uuid4(), title="Incidente Idempotente")

    # 1. Primeira resolução
    downtime_1 = incident.resolve(root_cause="Fibra óptica reconectada", idempotent=True)
    assert incident.status.value == "RESOLVED"

    # 2. Segunda resolução com idempotent=True não deve lançar exceção
    downtime_2 = incident.resolve(root_cause="Fibra óptica reconectada", idempotent=True)
    assert downtime_1 == downtime_2

    # 3. Resolução com idempotent=False ainda lança exceção (compatibilidade)
    with pytest.raises(IncidentAlreadyResolvedError):
        incident.resolve(root_cause="Tentativa sem idempotent", idempotent=False)
