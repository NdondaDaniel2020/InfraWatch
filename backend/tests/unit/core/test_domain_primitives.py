"""Suíte de testes unitários para as primitivas de domínio DDD do InfraWatch.

Cobre validações completas de:
- Entity (identidade única UUIDv7, igualdade, hash e representação)
- ValueObject (imutabilidade estrita, FrozenInstanceError e igualdade estrutural)
- DomainEvent (serialização UTC, metadados RFC 9562 e imutabilidade)
- AggregateRoot (acumulação de eventos, exposição imutável e ciclo de limpeza)
"""

import unittest
from dataclasses import FrozenInstanceError, dataclass
from datetime import UTC, datetime
from uuid import UUID

from src.core.domain import AggregateRoot, DomainEvent, Entity, ValueObject, generate_uuid7

# ---------------------------------------------------------------------------
# Modelos Concretos de Teste (Stubs de Domínio)
# ---------------------------------------------------------------------------


class Device(Entity):
    """Stub de Entidade para testes."""

    def __init__(
        self, name: str, id: UUID | None = None, created_at: datetime | None = None
    ) -> None:
        super().__init__(id=id, created_at=created_at)
        self.name = name


@dataclass(frozen=True)
class IpAddress(ValueObject):
    """Stub de Objeto de Valor para testes."""

    octets: str
    port: int = 80


@dataclass(frozen=True)
class DeviceCreated(DomainEvent):
    """Stub de Evento de Domínio para testes."""

    hostname: str = ""
    ip: str = ""


class NetworkSwitch(AggregateRoot):
    """Stub de Raiz de Agregação para testes."""

    def __init__(self, hostname: str, ip: str, id: UUID | None = None) -> None:
        super().__init__(id=id)
        self.hostname = hostname
        self.ip = ip

    def register(self) -> None:
        self.add_domain_event(DeviceCreated(hostname=self.hostname, ip=self.ip))


# ---------------------------------------------------------------------------
# Test Cases
# ---------------------------------------------------------------------------


class TestEntityPrimitives(unittest.TestCase):
    """Testes unitários para a classe base Entity."""

    def test_uuid7_generation_and_rfc_compliance(self):
        """Verifica se o gerador de UUIDv7 produz IDs com version=7 e ordenação temporal."""
        id1 = generate_uuid7()
        id2 = generate_uuid7()
        self.assertIsInstance(id1, UUID)
        self.assertEqual(id1.version, 7)
        self.assertEqual(id2.version, 7)
        # Em UUIDv7, identificadores gerados sequencialmente são monotonicamente ordenáveis
        self.assertLessEqual(id1.int, id2.int)

    def test_entity_creation_defaults(self):
        """Verifica se a entidade é criada com id UUIDv7 e created_at em UTC."""
        entity = Device(name="Core-Switch-01")
        self.assertIsInstance(entity.id, UUID)
        self.assertEqual(entity.id.version, 7)
        self.assertIsInstance(entity.created_at, datetime)
        self.assertIsNotNone(entity.created_at.tzinfo)

    def test_entities_with_same_id_are_equal_regardless_of_attributes(self):
        """Critério de Aceite: Duas entidades com mesmo id são iguais mesmo com atributos distintos."""
        shared_id = generate_uuid7()
        device_a = Device(name="Switch-Floor-1", id=shared_id)
        device_b = Device(name="Switch-Floor-2", id=shared_id)
        self.assertEqual(device_a, device_b)

    def test_entities_with_different_ids_are_not_equal(self):
        """Duas entidades com ids distintos são desiguais."""
        device_a = Device(name="Switch-01")
        device_b = Device(name="Switch-01")
        self.assertNotEqual(device_a, device_b)

    def test_entity_not_equal_to_non_entity(self):
        """Entidade comparada a objetos de outros tipos deve retornar False."""
        device = Device(name="Router-01")
        self.assertNotEqual(device, "Router-01")
        self.assertNotEqual(device, None)
        self.assertFalse(device == 12345)

    def test_entity_hash_consistency(self):
        """Garante que o hash da entidade baseia-se em seu id e permite uso em sets e dicts."""
        shared_id = generate_uuid7()
        device_a = Device(name="Router-A", id=shared_id)
        device_b = Device(name="Router-B", id=shared_id)

        device_set = {device_a, device_b}
        self.assertEqual(len(device_set), 1)
        self.assertEqual(hash(device_a), hash(device_b))

    def test_entity_representation(self):
        """Verifica formatação do __repr__."""
        device = Device(name="Firewall-01")
        self.assertIn("Device", repr(device))
        self.assertIn(str(device.id), repr(device))


class TestValueObjectPrimitives(unittest.TestCase):
    """Testes unitários para a classe base ValueObject."""

    def test_value_objects_with_same_values_are_equal(self):
        """Critério de Aceite: Dois ValueObjects com os mesmos valores são considerados iguais."""
        vo1 = IpAddress(octets="10.0.0.1", port=443)
        vo2 = IpAddress(octets="10.0.0.1", port=443)
        self.assertEqual(vo1, vo2)
        self.assertEqual(hash(vo1), hash(vo2))

    def test_value_objects_with_different_values_are_not_equal(self):
        """Dois ValueObjects com valores distintos são desiguais."""
        vo1 = IpAddress(octets="10.0.0.1", port=80)
        vo2 = IpAddress(octets="10.0.0.2", port=80)
        self.assertNotEqual(vo1, vo2)

    def test_value_object_immutability_raises_frozen_instance_error(self):
        """Critério de Aceite: Tentativa de alterar atributo de ValueObject lança FrozenInstanceError."""
        vo = IpAddress(octets="192.168.1.1", port=80)
        with self.assertRaises(FrozenInstanceError):
            vo.octets = "192.168.1.2"  # type: ignore[misc]

        with self.assertRaises(FrozenInstanceError):
            vo.port = 8080  # type: ignore[misc]


class TestDomainEventPrimitives(unittest.TestCase):
    """Testes unitários para a classe base DomainEvent."""

    def test_domain_event_defaults_and_metadata(self):
        """Verifica se DomainEvent inicializa com event_id UUIDv7, timestamp UTC e event_type."""
        event = DeviceCreated(hostname="core-gw", ip="172.16.0.1")
        self.assertIsInstance(event.event_id, UUID)
        self.assertEqual(event.event_id.version, 7)
        self.assertIsInstance(event.occurred_at, datetime)
        self.assertEqual(event.occurred_at.tzinfo, UTC)
        self.assertEqual(event.event_type, "DeviceCreated")
        self.assertIsNone(event.aggregate_id)

    def test_domain_event_immutability(self):
        """DomainEvents devem ser imutáveis e disparar erro em tentativa de mutação."""
        event = DeviceCreated(hostname="server-01", ip="10.10.10.1")
        with self.assertRaises(FrozenInstanceError):
            event.hostname = "server-02"  # type: ignore[misc]

    def test_domain_event_to_dict_serialization(self):
        """Verifica se to_dict() converte adequadamente campos complexos (UUID, Datetime)."""
        event = DeviceCreated(hostname="gw-edge", ip="10.0.0.254")
        serialized = event.to_dict()

        self.assertIsInstance(serialized, dict)
        self.assertEqual(serialized["event_type"], "DeviceCreated")
        self.assertEqual(serialized["hostname"], "gw-edge")
        self.assertEqual(serialized["ip"], "10.0.0.254")
        self.assertIsInstance(serialized["event_id"], str)
        self.assertIsInstance(serialized["occurred_at"], str)
        self.assertIn("T", serialized["occurred_at"])  # Formato ISO-8601


class TestAggregateRootPrimitives(unittest.TestCase):
    """Testes unitários para a classe base AggregateRoot."""

    def test_aggregate_inherits_entity_identity(self):
        """AggregateRoot herda atributos e igualdade de identidade de Entity."""
        shared_id = generate_uuid7()
        agg1 = NetworkSwitch(hostname="sw1", ip="10.0.0.1", id=shared_id)
        agg2 = NetworkSwitch(hostname="sw2", ip="10.0.0.2", id=shared_id)
        self.assertEqual(agg1, agg2)
        self.assertEqual(agg1.id, shared_id)

    def test_domain_events_lifecycle_and_encapsulation(self):
        """Verifica o ciclo completo de acumulação, associação e limpeza de eventos."""
        switch = NetworkSwitch(hostname="sw-distribution-01", ip="10.1.1.1")
        self.assertEqual(switch.domain_events, ())

        # Dispara evento
        switch.register()
        events = switch.domain_events
        self.assertEqual(len(events), 1)
        self.assertIsInstance(events[0], DeviceCreated)
        # Deve ter associado automaticamente o aggregate_id
        self.assertEqual(events[0].aggregate_id, switch.id)

        # Imutabilidade da visão externa: não pode alterar a lista interna via domain_events
        self.assertIsInstance(events, tuple)

        # Limpeza
        switch.clear_domain_events()
        self.assertEqual(len(switch.domain_events), 0)

    def test_pull_domain_events_utility(self):
        """Verifica se pull_domain_events retorna os eventos e esvazia a coleção atômica."""
        switch = NetworkSwitch(hostname="sw-access-01", ip="10.2.2.1")
        switch.register()
        self.assertEqual(len(switch.domain_events), 1)

        pulled = switch.pull_domain_events()
        self.assertEqual(len(pulled), 1)
        self.assertEqual(len(switch.domain_events), 0)


if __name__ == "__main__":
    unittest.main()
