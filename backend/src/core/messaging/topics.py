"""Constantes canônicas de tópicos e mapeamento declarativo de eventos para streams do Redis."""

from enum import StrEnum


class StreamTopics(StrEnum):
    """Nomes canônicos dos Redis Streams utilizados no InfraWatch."""

    INCIDENTS = "stream:incidents"
    INVENTORY_CHANGES = "stream:inventory:changes"
    IAM_EVENTS = "stream:iam:events"
    INCIDENTS_DLQ = "stream:incidents:dlq"
    INVENTORY_CHANGES_DLQ = "stream:inventory:changes:dlq"
    IAM_EVENTS_DLQ = "stream:iam:events:dlq"
    PROBES_ONDEMAND = "stream:probes:ondemand"
    SSE_BROADCAST = "stream:sse:broadcast"


EVENT_STREAM_MAPPING: dict[str, str] = {
    # Bounded Context: Inventory
    "DeviceCreated": StreamTopics.INVENTORY_CHANGES,
    "DeviceUpdated": StreamTopics.INVENTORY_CHANGES,
    "DeviceDeleted": StreamTopics.INVENTORY_CHANGES,
    "DevicePaused": StreamTopics.INVENTORY_CHANGES,
    "DeviceResumed": StreamTopics.INVENTORY_CHANGES,
    # Bounded Context: Alerting / Incident
    "IncidentTriggered": StreamTopics.INCIDENTS,
    "IncidentTriggeredEvent": StreamTopics.INCIDENTS,
    "DeviceDegraded": StreamTopics.INCIDENTS,
    "DeviceDegradedEvent": StreamTopics.INCIDENTS,
    "IncidentResolved": StreamTopics.INCIDENTS,
    "IncidentResolvedEvent": StreamTopics.INCIDENTS,
    "IncidentAcknowledged": StreamTopics.INCIDENTS,
    "IncidentAcknowledgedEvent": StreamTopics.INCIDENTS,
    # Bounded Context: IAM
    "PasswordResetRequestedEvent": StreamTopics.IAM_EVENTS,
    "PasswordChangedEvent": StreamTopics.IAM_EVENTS,
    "PasswordResetCompletedEvent": StreamTopics.IAM_EVENTS,
    "EmailVerificationRequestedEvent": StreamTopics.IAM_EVENTS,
    "EmailVerifiedEvent": StreamTopics.IAM_EVENTS,
    "AccountLockedEvent": StreamTopics.IAM_EVENTS,
    "BackupCodeUsedEvent": StreamTopics.IAM_EVENTS,
    "ProfileUpdatedEvent": StreamTopics.IAM_EVENTS,
    "RolesChangedEvent": StreamTopics.IAM_EVENTS,
    "AccountDeactivatedEvent": StreamTopics.IAM_EVENTS,
}

# Mapeamento de retenção granular de mensagens (MAXLEN) por tópico do Redis Streams.
# Tópicos não listados explicitamente adotam o valor de Settings.REDIS_STREAM_MAXLEN (padrão: 10.000).
TOPIC_MAXLEN_MAPPING: dict[str, int] = {
    # Streams voláteis e de telemetria transitória: 5.000 mensagens
    StreamTopics.PROBES_ONDEMAND: 5_000,
    StreamTopics.SSE_BROADCAST: 5_000,
    # Streams canônicos de eventos e incidentes operacionais: 10.000 a 20.000 mensagens
    StreamTopics.INCIDENTS: 20_000,
    StreamTopics.INVENTORY_CHANGES: 10_000,
    StreamTopics.IAM_EVENTS: 10_000,
    # Dead Letter Queues (DLQ): 50.000 mensagens para garantir retenção forense prolongada
    StreamTopics.INCIDENTS_DLQ: 50_000,
    StreamTopics.INVENTORY_CHANGES_DLQ: 50_000,
    StreamTopics.IAM_EVENTS_DLQ: 50_000,
}


def get_topic_maxlen(topic: str, default_maxlen: int | None = None) -> int:
    """Retorna o limite de mensagens (MAXLEN) específico para o tópico ou o valor padrão do barramento."""
    if topic in TOPIC_MAXLEN_MAPPING:
        return TOPIC_MAXLEN_MAPPING[topic]

    # Suporte a sufixo genérico :dlq caso um novo tópico não mapeado seja criado
    if str(topic).endswith(":dlq"):
        return 50_000

    from src.core.config import get_settings

    return default_maxlen if default_maxlen is not None else get_settings().REDIS_STREAM_MAXLEN

