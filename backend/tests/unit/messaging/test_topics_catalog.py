"""Testes unitários de integridade para o catálogo de tópicos e mapeamento declarativo."""

import pytest

from src.core.messaging.topics import EVENT_STREAM_MAPPING, StreamTopics
from src.workers.daemons.outbox_relay_worker import OutboxRelayWorker


def test_stream_topics_enum_conventions() -> None:
    """Garante que todos os tópicos no enum StreamTopics começam com o prefixo 'stream:'."""
    for topic in StreamTopics:
        assert isinstance(topic.value, str)
        assert topic.value.startswith("stream:"), f"Tópico {topic.name} não inicia com 'stream:'"


def test_stream_topics_dlq_consistency() -> None:
    """Garante que as constantes de DLQ correspondem estritamente ao sufixo ':dlq' do stream correspondente."""
    assert StreamTopics.INCIDENTS_DLQ == f"{StreamTopics.INCIDENTS}:dlq"
    assert StreamTopics.INVENTORY_CHANGES_DLQ == f"{StreamTopics.INVENTORY_CHANGES}:dlq"
    assert StreamTopics.IAM_EVENTS_DLQ == f"{StreamTopics.IAM_EVENTS}:dlq"


def test_event_stream_mapping_values_are_valid_stream_topics() -> None:
    """Garante que todo valor registrado no dicionário EVENT_STREAM_MAPPING é membro válido de StreamTopics."""
    valid_topics = set(StreamTopics)
    for event_name, stream_target in EVENT_STREAM_MAPPING.items():
        assert (
            stream_target in valid_topics
        ), f"Evento '{event_name}' mapeado para stream desconhecido '{stream_target}'"


@pytest.mark.parametrize(
    ("event_type", "expected_target"),
    [
        ("DeviceCreated", StreamTopics.INVENTORY_CHANGES),
        ("IncidentTriggeredEvent", StreamTopics.INCIDENTS),
        ("PasswordResetRequestedEvent", StreamTopics.IAM_EVENTS),
    ],
)
def test_resolve_stream_topic_from_worker_matches_catalog(
    event_type: str,
    expected_target: str,
) -> None:
    """Valida que OutboxRelayWorker.resolve_stream_topic resolve corretamente usando o catálogo."""
    resolved = OutboxRelayWorker.resolve_stream_topic(event_type)
    assert resolved == expected_target


def test_resolve_stream_topic_unknown_event_fallback() -> None:
    """Valida que evento não mapeado faz fallback transparente para o próprio event_type."""
    unmapped = "CustomTelemetryV2Event"
    resolved = OutboxRelayWorker.resolve_stream_topic(unmapped)
    assert resolved == unmapped
