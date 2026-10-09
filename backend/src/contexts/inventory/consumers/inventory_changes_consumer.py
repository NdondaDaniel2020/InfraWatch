"""Consumer do Redis Streams para mutações de inventário (ADR-001).

Consome eventos do stream ``stream:inventory:changes`` via Consumer Group
``cg:probe_workers`` e atualiza o ``InMemorySchedule`` do Probe Worker
em tempo real. Cada mensagem processada é confirmada com XACK.
"""

from __future__ import annotations

import asyncio
import logging
from typing import Any

from src.core.messaging.resilient_bus import ResilientEventBus
from src.workers.scheduler.in_memory_inventory import InMemorySchedule, ProbeTarget

logger = logging.getLogger("infrawatch.inventory.consumers.changes")

# Mapeamento evento -> ação no schedule
STREAM_TOPIC = "stream:inventory:changes"
CONSUMER_GROUP = "cg:probe_workers"


class InventoryChangesConsumer:
    """Consumer de mutações de dispositivos via Redis Streams.

    Processa eventos publicados pelo Outbox Relay Worker e aplica
    as mutações correspondentes no cache em memória do Probe Worker.
    """

    def __init__(
        self,
        schedule: InMemorySchedule,
        event_bus: ResilientEventBus,
        consumer_name: str = "probe-worker-1",
        batch_size: int = 20,
        poll_timeout_ms: int = 2000,
    ) -> None:
        self.schedule = schedule
        self.event_bus = event_bus
        self.consumer_name = consumer_name
        self.batch_size = batch_size
        self.poll_timeout_ms = poll_timeout_ms

    async def _handle_event(self, event_type: str, payload: dict[str, Any]) -> None:
        """Aplica a mutação correspondente ao evento no schedule em memória."""
        from uuid import UUID

        aggregate_id = payload.get("aggregate_id")
        if not aggregate_id:
            logger.warning("Evento %s sem aggregate_id, ignorando", event_type)
            return

        device_id = UUID(aggregate_id) if isinstance(aggregate_id, str) else aggregate_id

        if event_type == "DeviceCreated":
            target = ProbeTarget.from_event(payload)
            await self.schedule.add_or_update(target)
            logger.info("DeviceCreated -> schedule.add(%s)", device_id)

        elif event_type == "DeviceUpdated":
            existing = await self.schedule.get(device_id)
            if existing:
                # Atualiza campos que vieram no payload
                if payload.get("name"):
                    existing.name = payload["name"]
                if payload.get("ip_address"):
                    existing.ip_address = payload["ip_address"]
                if payload.get("port"):
                    existing.port = int(payload["port"])
                if payload.get("protocol"):
                    existing.protocol = payload["protocol"]
                await self.schedule.add_or_update(existing)
            logger.info("DeviceUpdated -> schedule.update(%s)", device_id)

        elif event_type == "DevicePaused":
            await self.schedule.pause(device_id)
            logger.info("DevicePaused -> schedule.pause(%s)", device_id)

        elif event_type == "DeviceResumed":
            await self.schedule.resume(device_id)
            logger.info("DeviceResumed -> schedule.resume(%s)", device_id)

        elif event_type in ("DeviceMaintenanceStarted", "DeviceMaintenanceToggled"):
            existing = await self.schedule.get(device_id)
            if existing:
                existing.status = "MAINTENANCE"
                await self.schedule.add_or_update(existing)
            logger.info("%s -> schedule.maintenance(%s)", event_type, device_id)

        elif event_type == "DeviceStatusChanged":
            existing = await self.schedule.get(device_id)
            if existing:
                existing.status = payload.get("new_status", existing.status)
                await self.schedule.add_or_update(existing)
            logger.info(
                "DeviceStatusChanged -> schedule.status(%s, %s)",
                device_id,
                payload.get("new_status"),
            )

        else:
            logger.debug("Evento %s não tratado pelo consumer de inventário", event_type)

    async def consume_loop(self, stop_event: asyncio.Event | None = None) -> None:
        """Loop contínuo de consumo do Redis Stream com XREADGROUP e XACK."""
        logger.info(
            "Iniciando consumer '%s' no stream '%s' (grupo '%s')",
            self.consumer_name,
            STREAM_TOPIC,
            CONSUMER_GROUP,
        )

        while stop_event is None or not stop_event.is_set():
            try:
                messages = await self.event_bus.consume_batch(
                    topic=STREAM_TOPIC,
                    group=CONSUMER_GROUP,
                    consumer_name=self.consumer_name,
                    batch_size=self.batch_size,
                    timeout_ms=self.poll_timeout_ms,
                )

                if not messages:
                    continue

                message_ids = []
                for msg_id, payload in messages:
                    try:
                        event_type = payload.get("event_type", "Unknown")
                        await self._handle_event(event_type, payload)
                        message_ids.append(msg_id)
                    except Exception:
                        logger.exception(
                            "Erro ao processar evento %s (msg_id=%s)",
                            payload.get("event_type"),
                            msg_id,
                        )

                # XACK em lote para todos os eventos processados com sucesso
                if message_ids:
                    await self.event_bus.ack(STREAM_TOPIC, CONSUMER_GROUP, *message_ids)

            except asyncio.CancelledError:
                logger.info("Consumer '%s' interrompido graciosamente", self.consumer_name)
                break
            except Exception:
                logger.exception("Erro inesperado no loop do consumer de inventário")
                await asyncio.sleep(2.0)


__all__ = [
    "CONSUMER_GROUP",
    "STREAM_TOPIC",
    "InventoryChangesConsumer",
]
