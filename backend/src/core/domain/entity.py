"""Primitiva base de Entidade (DDD) para o InfraWatch.

Entidades possuem identidade única e contínua expressa por um identificador UUIDv7,
sendo diferenciadas exclusivamente por seu ID e não por seus atributos transitórios.
"""

import os
import time
from abc import ABC
from datetime import UTC, datetime
from uuid import UUID


def generate_uuid7() -> UUID:
    """Gera um UUIDv7 compatível com RFC 9562 para ordenação cronológica e indexação B-Tree.

    Prioriza a biblioteca `uuid6` se disponível, com fallback puro segundo a RFC 9562.
    """
    try:
        import uuid6  # type: ignore[import-untyped]

        return uuid6.uuid7()
    except ImportError:
        ns = time.time_ns()
        ms = ns // 1_000_000
        rand_bytes = os.urandom(10)

        # 48 bits de timestamp Unix em milissegundos
        b0 = (ms >> 40) & 0xFF
        b1 = (ms >> 32) & 0xFF
        b2 = (ms >> 24) & 0xFF
        b3 = (ms >> 16) & 0xFF
        b4 = (ms >> 8) & 0xFF
        b5 = ms & 0xFF

        # 4 bits de versão (UUIDv7 = 0b0111 = 0x70) + 12 bits de entropia
        b6 = 0x70 | (rand_bytes[0] & 0x0F)
        b7 = rand_bytes[1]

        # 2 bits de variante (RFC 4122/9562 = 0b10xxxxxx = 0x80) + 62 bits de entropia
        b8 = 0x80 | (rand_bytes[2] & 0x3F)
        b9 = rand_bytes[3]
        b10 = rand_bytes[4]
        b11 = rand_bytes[5]
        b12 = rand_bytes[6]
        b13 = rand_bytes[7]
        b14 = rand_bytes[8]
        b15 = rand_bytes[9]

        return UUID(
            bytes=bytes([b0, b1, b2, b3, b4, b5, b6, b7, b8, b9, b10, b11, b12, b13, b14, b15])
        )


class Entity(ABC):
    """Classe base abstrata para todas as Entidades de Domínio.

    Regras de Negócio:
    - Cada entidade possui um identificador único imutável `id: UUID` (UUIDv7).
    - `created_at`: Carimbo de data/hora em UTC no momento da instanciação.
    - A igualdade e o hash são estritamente orientados à identidade (`self.id == other.id`).
    """

    def __init__(self, id: UUID | None = None, created_at: datetime | None = None) -> None:
        self._id: UUID = id if id is not None else generate_uuid7()
        self._created_at: datetime = created_at if created_at is not None else datetime.now(UTC)

    @property
    def id(self) -> UUID:
        """Identificador único da entidade."""
        return self._id

    @property
    def created_at(self) -> datetime:
        """Data e hora de criação da entidade em UTC."""
        return self._created_at

    def __eq__(self, other: object) -> bool:
        """Duas entidades são consideradas iguais se e somente se possuem o mesmo identificador."""
        if not isinstance(other, Entity):
            return False
        return self.id == other.id

    def __hash__(self) -> int:
        """O hash da entidade é derivado do seu identificador único."""
        return hash(self.id)

    def __repr__(self) -> str:
        return f"<{self.__class__.__name__}(id={self.id})>"
