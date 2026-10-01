"""Domain layer primitives for DDD (Domain-Driven Design)."""
from src.core.domain.aggregate import AggregateRoot
from src.core.domain.entity import Entity, generate_uuid7
from src.core.domain.events import DomainEvent
from src.core.domain.value_object import ValueObject

__all__ = [
    "Entity",
    "generate_uuid7",
    "ValueObject",
    "DomainEvent",
    "AggregateRoot",
]
