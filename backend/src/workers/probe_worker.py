"""Loop principal do Daemon de Sondas (Probe Worker).

Inicializa o cache em memória, o consumidor de streams e executa
loops assíncronos em paralelo (consumo de eventos e execução de sondas).
Possui rotina de reconciliação periódica com o banco de dados.
"""

import asyncio
import logging
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from src.contexts.inventory.database.models import DeviceModel
from src.core.database.session import get_session_factory
from src.core.messaging.resilient_bus import ResilientEventBus
from src.workers.consumers.inventory_changes_consumer import InventoryChangesConsumer
from src.workers.scheduler.in_memory_inventory import InMemorySchedule, ProbeTarget

logger = logging.getLogger("infrawatch.workers.probe_worker")


class ProbeWorkerDaemon:
    """Daemon do Probe Worker que orquestra agendamento, consumo e sondagem."""

    def __init__(
        self,
        event_bus: ResilientEventBus,
        session_factory: async_sessionmaker[AsyncSession],
        reconciliation_interval_seconds: int = 300,
    ) -> None:
        self.schedule = InMemorySchedule()
        self.event_bus = event_bus
        self.session_factory = session_factory
        self.reconciliation_interval = reconciliation_interval_seconds
        
        # O consumer alimenta o schedule em tempo real via Redis Streams
        self.consumer = InventoryChangesConsumer(
            schedule=self.schedule,
            event_bus=self.event_bus,
            consumer_name="probe-worker-1",
        )
        
        self._stop_event = asyncio.Event()

    async def fetch_devices_from_db(self) -> list[ProbeTarget]:
        """Busca dispositivos do banco para carga inicial e reconciliação."""
        async with self.session_factory() as session:
            # Em um cenário real de dezenas de milhares de dispositivos, 
            # usaríamos yield e fetchmany. Por simplicidade iteramos todos de uma vez.
            stmt = select(DeviceModel)
            result = await session.execute(stmt)
            models = result.scalars().all()
            return [ProbeTarget.from_db_row(m) for m in models]

    async def _reconciliation_loop(self) -> None:
        """Loop que roda periodicamente para curar divergências de estado."""
        logger.info("Iniciando loop de reconciliação (intervalo=%ds)", self.reconciliation_interval)
        
        while not self._stop_event.is_set():
            try:
                # Aguarda o intervalo ou interrupção
                try:
                    await asyncio.wait_for(self._stop_event.wait(), timeout=self.reconciliation_interval)
                    if self._stop_event.is_set():
                        break
                except asyncio.TimeoutError:
                    pass  # Tempo expirou, hora de reconciliar
                
                logger.debug("Executando reconciliação com o banco de dados...")
                db_targets = await self.fetch_devices_from_db()
                await self.schedule.reconcile(db_targets)
                
            except asyncio.CancelledError:
                break
            except Exception:
                logger.exception("Erro durante rotina de reconciliação")
                await asyncio.sleep(10.0)

    async def _scheduler_loop(self) -> None:
        """Loop dummy de execução das sondas. (A execução real fica para issue futura)."""
        logger.info("Iniciando loop agendador de sondas")
        
        while not self._stop_event.is_set():
            try:
                # Aqui entrará a lógica de avaliar timers e despachar execuções
                active = await self.schedule.get_active_targets()
                logger.debug("Loop agendador: %d alvos ativos", len(active))
                
                await asyncio.sleep(5.0)
            except asyncio.CancelledError:
                break
            except Exception:
                logger.exception("Erro no loop do agendador")
                await asyncio.sleep(1.0)

    async def run(self) -> None:
        """Inicia todos os serviços e tarefas do daemon."""
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

        try:
            # Executa até ser interrompido
            await asyncio.gather(
                consumer_task,
                reconciliation_task,
                scheduler_task,
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
                return_exceptions=True
            )
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
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    )
    try:
        asyncio.run(run_standalone())
    except (KeyboardInterrupt, SystemExit):
        pass
