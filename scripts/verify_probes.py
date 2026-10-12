#!/usr/bin/env python3
"""Script de verificação pontual dos probers do InfraWatch."""
import asyncio
import os
import sys
from pathlib import Path

# Ajustar PYTHONPATH
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backend"))

# Carregar senhas dos secrets se existirem
secrets_dir = Path(__file__).resolve().parent.parent / "secrets"
if (secrets_dir / "postgres_password.txt").exists():
    os.environ.setdefault("POSTGRES_PASSWORD", (secrets_dir / "postgres_password.txt").read_text().strip())
if (secrets_dir / "redis_password.txt").exists():
    os.environ.setdefault("REDIS_PASSWORD", (secrets_dir / "redis_password.txt").read_text().strip())

os.environ.setdefault("POSTGRES_HOST", "localhost")
os.environ.setdefault("POSTGRES_PORT", "5432")
os.environ.setdefault("POSTGRES_DB", "infrawatch_db")
os.environ.setdefault("POSTGRES_USER", "infrawatch_user")
os.environ.setdefault("REDIS_HOST", "localhost")
os.environ.setdefault("REDIS_PORT", "6379")

from sqlalchemy import select, text
from src.core.database.session import get_session_factory
from src.core.messaging.resilient_bus import ResilientEventBus
from src.contexts.telemetry.services.batch_writer import MetricsBatchWriter
from src.workers.daemons.probe_worker import ProbeWorkerDaemon
from src.contexts.inventory.database.models import DeviceModel
from src.contexts.telemetry.database.models import MetricModel


async def run_verification():
    session_factory = get_session_factory()
    redis_url = f"redis://:{os.environ.get('REDIS_PASSWORD', '')}@{os.environ['REDIS_HOST']}:{os.environ['REDIS_PORT']}/0"
    
    event_bus = ResilientEventBus()
    
    batch_writer = MetricsBatchWriter(session_factory=session_factory, batch_size=10, flush_interval_seconds=2.0)
    
    worker = ProbeWorkerDaemon(
        event_bus=event_bus,
        session_factory=session_factory,
        batch_writer=batch_writer,
        max_concurrent_probes=10,
    )
    
    print("\n🔍 Carregando alvos do banco de dados no agendador...")
    targets = await worker.fetch_devices_from_db()
    print(f"📦 {len(targets)} dispositivos encontrados no banco de dados.")
    await worker.schedule.reconcile(targets)
    
    print("🚀 Disparando ciclo de sondagem...")
    await worker._schedule_tick()
    
    print("💾 Descarregando métricas para o PostgreSQL via BatchWriter...")
    inserted = await batch_writer.flush()
    print(f"✅ {inserted} métricas descarregadas com sucesso.")
    
    # Consulta métricas no banco
    async with session_factory() as session:
        metrics_result = await session.execute(
            text("SELECT metric_type, value, status, timestamp, device_id FROM metrics ORDER BY timestamp DESC LIMIT 15")
        )
        metrics = metrics_result.fetchall()
        
        devices_result = await session.execute(
            select(DeviceModel).order_by(DeviceModel.name)
        )
        devices = devices_result.scalars().all()
    
    print("\n======================================================")
    print("📊 MÉTRICAS COLETADAS NO POSTGRESQL (Últimas 15)")
    print("======================================================")
    for m in metrics:
        print(f"Tipo: {m.metric_type:<15} | Valor: {m.value:>8.2f} | Status: {m.status:<5} | Device: {m.device_id}")
        
    print("\n======================================================")
    print("🖥️ ESTADO OPERACIONAL DOS DISPOSITIVOS (Inventory)")
    print("======================================================")
    for d in devices:
        print(f"Nome: {d.name:<25} | Protocolo: {d.protocol:<6} | Status: {d.status}")
    print("======================================================\n")
    
    await event_bus.close()


if __name__ == "__main__":
    asyncio.run(run_verification())
