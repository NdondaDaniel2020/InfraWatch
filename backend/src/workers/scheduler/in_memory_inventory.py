"""Cronograma em memória de dispositivos para o Probe Worker (ADR-001).

Mantém o inventário de dispositivos ativos inteiramente em RAM para evitar
carga excessiva no PostgreSQL. Atualizações chegam via Redis Streams e uma
rotina periódica de reconciliação garante consistência eventual.
"""

import asyncio
import logging
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any
from uuid import UUID

logger = logging.getLogger("infrawatch.workers.scheduler")


@dataclass
class ProbeTarget:
    """Representação leve de um dispositivo para agendamento de sondas.

    Contém apenas os campos necessários para o worker decidir
    quando e como executar a sondagem — sem dados sensíveis.
    """

    device_id: UUID
    organization_id: UUID
    name: str
    ip_address: str
    port: int
    protocol: str
    category: str
    interval_seconds: int
    is_paused: bool = False
    status: str = "UP"
    updated_at: datetime = field(default_factory=lambda: datetime.now(UTC))

    @classmethod
    def from_db_row(cls, row: Any) -> "ProbeTarget":
        """Constrói a partir de uma linha do banco de dados (SQLAlchemy Row ou Model)."""
        return cls(
            device_id=row.id,
            organization_id=row.organization_id,
            name=row.name,
            ip_address=row.ip_address,
            port=row.port,
            protocol=row.protocol,
            category=row.category,
            interval_seconds=row.interval_seconds,
            is_paused=row.is_paused,
            status=row.status,
            updated_at=getattr(row, "updated_at", datetime.now(UTC)),
        )

    @classmethod
    def from_event(cls, payload: dict) -> "ProbeTarget":
        """Constrói a partir do payload de um evento do Redis Stream."""
        return cls(
            device_id=UUID(payload["aggregate_id"]),
            organization_id=UUID(payload["organization_id"]),
            name=payload.get("name", ""),
            ip_address=payload.get("ip_address", ""),
            port=int(payload.get("port", 0)),
            protocol=payload.get("protocol", ""),
            category=payload.get("category", ""),
            interval_seconds=int(payload.get("interval_seconds", 60)),
        )


class InMemorySchedule:
    """Cache em memória thread-safe do inventário de dispositivos ativos.

    Utiliza ``asyncio.Lock`` para garantir atomicidade das operações
    de mutação (add, update, remove) em ambiente assíncrono concorrente.
    """

    def __init__(self) -> None:
        self._devices: dict[UUID, ProbeTarget] = {}
        self._lock = asyncio.Lock()

    @property
    def count(self) -> int:
        """Número de dispositivos no cronograma."""
        return len(self._devices)

    async def add_or_update(self, target: ProbeTarget) -> None:
        """Adiciona ou atualiza um dispositivo no cronograma."""
        async with self._lock:
            self._devices[target.device_id] = target
            logger.debug("Dispositivo %s adicionado/atualizado no schedule", target.device_id)

    async def remove(self, device_id: UUID) -> bool:
        """Remove um dispositivo do cronograma. Retorna True se existia."""
        async with self._lock:
            removed = self._devices.pop(device_id, None)
            if removed:
                logger.debug("Dispositivo %s removido do schedule", device_id)
            return removed is not None

    async def pause(self, device_id: UUID) -> None:
        """Marca um dispositivo como pausado."""
        async with self._lock:
            target = self._devices.get(device_id)
            if target:
                target.is_paused = True
                target.status = "PAUSED"

    async def resume(self, device_id: UUID) -> None:
        """Retoma o monitoramento de um dispositivo."""
        async with self._lock:
            target = self._devices.get(device_id)
            if target:
                target.is_paused = False
                target.status = "UP"

    async def get(self, device_id: UUID) -> ProbeTarget | None:
        """Obtém um dispositivo pelo ID."""
        async with self._lock:
            return self._devices.get(device_id)

    async def get_active_targets(self) -> list[ProbeTarget]:
        """Retorna todos os dispositivos ativos (não pausados e não em manutenção)."""
        async with self._lock:
            return [
                t for t in self._devices.values()
                if not t.is_paused and t.status not in ("PAUSED", "MAINTENANCE")
            ]

    async def get_all(self) -> list[ProbeTarget]:
        """Retorna todos os dispositivos do cronograma."""
        async with self._lock:
            return list(self._devices.values())

    async def bulk_load(self, targets: list[ProbeTarget]) -> None:
        """Carrega múltiplos dispositivos de uma vez (usado na inicialização e reconciliação)."""
        async with self._lock:
            for target in targets:
                self._devices[target.device_id] = target
            logger.info("Bulk load: %d dispositivos carregados no schedule", len(targets))

    async def reconcile(self, db_targets: list[ProbeTarget]) -> dict[str, int]:
        """Reconcilia o cache local com os dados do banco de dados.

        Compara timestamps ``updated_at`` e corrige divergências:
        - Adiciona dispositivos que existem no DB mas não na memória.
        - Atualiza dispositivos cujo ``updated_at`` é mais recente no DB.
        - Remove dispositivos que não existem mais no DB.

        Returns:
            Dicionário com contagem de operações: added, updated, removed.
        """
        db_map = {t.device_id: t for t in db_targets}
        stats = {"added": 0, "updated": 0, "removed": 0}

        async with self._lock:
            # Adicionar/Atualizar
            for device_id, db_target in db_map.items():
                local = self._devices.get(device_id)
                if local is None:
                    self._devices[device_id] = db_target
                    stats["added"] += 1
                elif db_target.updated_at > local.updated_at:
                    self._devices[device_id] = db_target
                    stats["updated"] += 1

            # Remover dispositivos que não existem mais no DB
            stale_ids = set(self._devices.keys()) - set(db_map.keys())
            for stale_id in stale_ids:
                del self._devices[stale_id]
                stats["removed"] += 1

        if any(stats.values()):
            logger.info(
                "Reconciliação concluída: +%d adicionados, ~%d atualizados, -%d removidos",
                stats["added"], stats["updated"], stats["removed"],
            )

        return stats
