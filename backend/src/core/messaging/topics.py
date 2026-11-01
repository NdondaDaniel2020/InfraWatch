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
