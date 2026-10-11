"""Loop principal do Daemon de Sondas (Probe Worker).

Inicializa o cache em memória, o consumidor de streams e executa
loops assíncronos em paralelo:
  1. Consumo de mutações cadastrais (InventoryChangesConsumer).
  2. Reconciliação periódica com o PostgreSQL (_reconciliation_loop).
  3. Agendamento e execução de sondas concorrentes (_scheduler_loop).
  4. Descarga em lote de telemetria (_telemetry_flush_loop).
"""

from __future__ import annotations

import asyncio
import logging
import time
from datetime import UTC, datetime
from typing import Any
from uuid import UUID

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from src.contexts.alerting.domain.evaluator import FailureEvaluator
from src.contexts.inventory.consumers.inventory_changes_consumer import (
    InventoryChangesConsumer,
)
from src.contexts.inventory.database.models import DeviceModel
from src.contexts.telemetry.services.batch_writer import MetricsBatchWriter
from src.core.database.outbox_repository import OutboxRepository
from src.core.database.session import get_session_factory
from src.core.messaging.resilient_bus import ResilientEventBus
from src.workers.probers.executor import ProbeExecutor
from src.workers.scheduler.in_memory_inventory import InMemorySchedule, ProbeTarget

logger = logging.getLogger("infrawatch.workers.probe_worker")


class ProbeWorkerDaemon:
    """Daemon do Probe Worker que orquestra agendamento, sondagem e avaliação analítica."""

    def __init__(
        self,
        event_bus: ResilientEventBus,
        session_factory: async_sessionmaker[AsyncSession],
        reconciliation_interval_seconds: int = 300,
        max_concurrent_probes: int = 250,
        probe_timeout_ms: int = 2000,
        telemetry_flush_interval_seconds: float = 5.0,
        executor: ProbeExecutor | None = None,
        batch_writer: MetricsBatchWriter | None = None,
    ) -> None:
        self.schedule = InMemorySchedule()
        self.event_bus = event_bus
        self.session_factory = session_factory
        self.reconciliation_interval = reconciliation_interval_seconds
        self.probe_timeout_ms = probe_timeout_ms

        self.executor = executor or ProbeExecutor(max_concurrent=max_concurrent_probes)
        self.batch_writer = batch_writer or MetricsBatchWriter(
            session_factory=self.session_factory,
            flush_interval_seconds=telemetry_flush_interval_seconds,
        )

        # Motores de avaliação isolados por dispositivo (evita cross-contamination de baseline)
        self._evaluators: dict[UUID, FailureEvaluator] = {}
        self._last_probed: dict[UUID, float] = {}

        # O consumer alimenta o schedule em tempo real via Redis Streams
        self.consumer = InventoryChangesConsumer(
            schedule=self.schedule,
            event_bus=self.event_bus,
            consumer_name="probe-worker-1",
        )

        self._stop_event = asyncio.Event()

    def get_evaluator(self, device_id: UUID) -> FailureEvaluator:
        """Recupera ou instancia um FailureEvaluator dedicado ao dispositivo."""
        if device_id not in self._evaluators:
            self._evaluators[device_id] = FailureEvaluator()
        return self._evaluators[device_id]

    def stop(self) -> None:
        """Sinaliza parada graciosa de todas as tarefas em background."""
        self._stop_event.set()

    async def fetch_devices_from_db(self) -> list[ProbeTarget]:
        """Busca dispositivos do banco para carga inicial e reconciliação."""
        async with self.session_factory() as session:
            stmt = select(DeviceModel)
            result = await session.execute(stmt)
            models = result.scalars().all()
            return [ProbeTarget.from_db_row(m) for m in models]

    async def _reconciliation_loop(self) -> None:
        """Loop que roda periodicamente para curar divergências de estado."""
        logger.info("Iniciando loop de reconciliação (intervalo=%ds)", self.reconciliation_interval)

        while not self._stop_event.is_set():
            try:
                try:
                    await asyncio.wait_for(
                        self._stop_event.wait(), timeout=self.reconciliation_interval
                    )
                    if self._stop_event.is_set():
                        break
                except TimeoutError:
                    pass

                logger.debug("Executando reconciliação com o banco de dados...")
                db_targets = await self.fetch_devices_from_db()
                await self.schedule.reconcile(db_targets)

                # Limpeza preventiva de avaliadores de ativos removidos
                current_ids = {t.device_id for t in db_targets}
                self._evaluators = {k: v for k, v in self._evaluators.items() if k in current_ids}
                self._last_probed = {k: v for k, v in self._last_probed.items() if k in current_ids}

            except asyncio.CancelledError:
                break
            except Exception:
                logger.exception("Erro durante rotina de reconciliação")
                await asyncio.sleep(10.0)

    async def _schedule_tick(self) -> None:
        """Executa um ciclo único de checagem e disparo de sondas."""
        active_targets = await self.schedule.get_active_targets()
        now = time.monotonic()
        due_targets: list[ProbeTarget] = []

        for target in active_targets:
            if target.is_paused:
                continue
            if getattr(target, "status", None) in ("PAUSED", "MAINTENANCE"):
                continue

            last = self._last_probed.get(target.device_id, 0.0)
            if (now - last) >= target.interval_seconds:
                due_targets.append(target)
                self._last_probed[target.device_id] = now

        if not due_targets:
            return

        logger.debug("Despachando sondas para %d alvos prontos", len(due_targets))
        tasks = [self._probe_and_evaluate(target) for target in due_targets]
        await asyncio.gather(*tasks, return_exceptions=True)

    async def _probe_and_evaluate(self, target: ProbeTarget) -> None:
        """Executa sonda, bufferiza métricas, avalia integridade e propaga mudanças."""
        try:
            # 1. Executa a sonda com controle de concorrência (Semaphore)
            result = await self.executor.execute(target, timeout_ms=self.probe_timeout_ms)

            # 2. Bufferiza métricas para descarga em lote na tabela particionada
            self.batch_writer.enqueue(result, organization_id=target.organization_id)

            # 3. Avalia o resultado na máquina de estados / motor analítico
            evaluator = self.get_evaluator(target.device_id)
            eval_result = evaluator.evaluate(
                latency_ms=result.latency_ms,
                packet_loss_pct=result.packet_loss_pct,
                device_id=target.device_id,
                organization_id=target.organization_id,
                device_name=target.name,
                device_ip=target.ip_address,
                last_probe_details=result.extra_data,
                protocol=target.protocol,
            )

            # 4. Atualiza o status em RAM e no PostgreSQL se houver transição
            if eval_result.status_changed:
                logger.info(
                    "Transição de saúde no ativo '%s' (%s): %s -> %s (Motivo: %s)",
                    target.name,
                    target.device_id,
                    eval_result.previous_status.value,
                    eval_result.status.value,
                    eval_result.reason,
                )
                await self.schedule.update_status(target.device_id, eval_result.status.value)
                target.status = eval_result.status.value
                await self._update_device_db_status(target.device_id, eval_result.status.value)

            # 5. Persiste e publica eventos analíticos (se houver)
            if eval_result.events:
                await self._persist_and_publish_events(eval_result.events)

        except Exception:
            logger.exception(
                "Falha ao executar ciclo de sonda no ativo '%s' (%s)",
                target.name,
                target.device_id,
            )

    async def _update_device_db_status(self, device_id: UUID, new_status: str) -> None:
        """Atualiza o status operacional do dispositivo no PostgreSQL."""
        try:
            async with self.session_factory() as session:
                stmt = (
                    update(DeviceModel)
                    .where(DeviceModel.id == device_id)
                    .values(status=new_status, updated_at=datetime.now(UTC))
                )
                await session.execute(stmt)
                await session.commit()
        except Exception:
            logger.exception("Falha ao persistir status atualizado do ativo %s no banco", device_id)

    async def _persist_and_publish_events(self, events: list[Any]) -> None:
        """Persiste eventos no Transactional Outbox e publica no Redis Stream stream:incidents."""
        if not events:
            return

        try:
            async with self.session_factory() as session:
                for event in events:
                    OutboxRepository.add_event(session, event, aggregate_type="Device")
                await session.commit()
        except Exception:
            logger.exception("Falha ao persistir eventos analíticos no Transactional Outbox")

        for event in events:
            try:
                await self.event_bus.publish("stream:incidents", event)
            except Exception:
                logger.exception(
                    "Falha ao publicar evento %s no stream:incidents", type(event).__name__
                )

    async def _telemetry_flush_loop(self) -> None:
        """Loop periódico para descarregar o buffer de telemetria no PostgreSQL."""
        logger.info("Iniciando loop de descarga de telemetria...")
        while not self._stop_event.is_set():
            try:
                try:
                    await asyncio.wait_for(
                        self._stop_event.wait(), timeout=self.batch_writer._flush_interval
                    )
                    if self._stop_event.is_set():
                        break
                except TimeoutError:
                    pass

                flushed = await self.batch_writer.flush()
                if flushed > 0:
                    logger.debug("Telemetria descarregada: %d registros persistidos", flushed)
            except asyncio.CancelledError:
                break
            except Exception:
                logger.exception("Erro ao descarregar buffer de telemetria")
                await asyncio.sleep(2.0)

    async def _scheduler_loop(self) -> None:
        """Loop contínuo de agendamento e execução de sondas."""
        logger.info("Iniciando loop agendador de sondas...")

        while not self._stop_event.is_set():
            try:
                await self._schedule_tick()
            except asyncio.CancelledError:
                break
            except Exception:
                logger.exception("Erro no loop do agendador de sondas")
                await asyncio.sleep(1.0)

            try:
                await asyncio.wait_for(self._stop_event.wait(), timeout=1.0)
            except TimeoutError:
                pass

    async def run(self) -> None:
        """Inicia todos os serviços e tarefas do daemon com tolerância a falhas."""
        logger.info("Inicializando ProbeWorkerDaemon...")

        # 1. Carga Inicial do Banco
        try:
            logger.info("Realizando carga inicial do banco de dados...")
            initial_targets = await self.fetch_devices_from_db()
            await self.schedule.bulk_load(initial_targets)
            logger.info("Carga inicial concluída com %d dispositivos.", len(initial_targets))
        except Exception:
            logger.exception("Falha na carga inicial. Daemon abortando.")
            return

        # 2. Inicializar Tarefas em Background
        consumer_task = asyncio.create_task(self.consumer.consume_loop(self._stop_event))
        reconciliation_task = asyncio.create_task(self._reconciliation_loop())
        scheduler_task = asyncio.create_task(self._scheduler_loop())
        flush_task = asyncio.create_task(self._telemetry_flush_loop())

        try:
            await asyncio.gather(
                consumer_task,
                reconciliation_task,
                scheduler_task,
                flush_task,
            )
        except asyncio.CancelledError:
            logger.info("Sinal de desligamento recebido. Parando ProbeWorkerDaemon...")
        finally:
            self._stop_event.set()
            # Aguarda tarefas terminarem
            await asyncio.gather(
                consumer_task,
                reconciliation_task,
                scheduler_task,
                flush_task,
                return_exceptions=True,
            )
            # Flush final de drenagem de telemetria pendente
            try:
                await self.batch_writer.flush()
            except Exception:
                logger.exception("Erro no flush final de drenagem de telemetria")
            logger.info("ProbeWorkerDaemon desligado graciosamente.")


async def run_standalone() -> None:
    """Ponto de entrada para execução do ProbeWorkerDaemon via CLI."""
    event_bus = ResilientEventBus()
    worker = ProbeWorkerDaemon(
        event_bus=event_bus,
        session_factory=get_session_factory(),
    )

    try:
        await worker.run()
    finally:
        await event_bus.close()


if __name__ == "__main__":
    from src.core.observability.logging import setup_logging

    setup_logging()
    try:
        asyncio.run(run_standalone())
    except (KeyboardInterrupt, SystemExit):
        pass
