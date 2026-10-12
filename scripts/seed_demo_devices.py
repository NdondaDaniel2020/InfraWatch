"""Script de Seed para cadastrar serviços locais e contêineres como ativos de monitoramento.

Cadastra dispositivos de teste para validar todos os 4 probers (TCP, HTTP, ICMP, DOCKER):
1. PostgreSQL Database (TCP :5432)
2. Redis Cache & Streams (TCP :6379)
3. Backend FastAPI API (HTTP :8000)
4. Frontend Vite Web (HTTP :3000)
5. Localhost Gateway (ICMP Ping)
6. Contêiner infrawatch-postgres (Docker Engine API)
7. Contêiner infrawatch-redis (Docker Engine API)
"""

from __future__ import annotations

import asyncio
import logging
import sys
from datetime import UTC, datetime
from pathlib import Path
from typing import Any
from uuid import UUID

# Garante inclusão do diretório backend no sys.path
BASE_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BASE_DIR / "backend"))

from sqlalchemy import select  # noqa: E402
from src.contexts.iam.database.models import OrganizationModel  # noqa: E402
from src.contexts.inventory.database.models import DeviceModel  # noqa: E402
from src.core.database.session import get_session_factory  # noqa: E402
from src.core.domain.entity import generate_uuid7  # noqa: E402

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("infrawatch.seed")


DEMO_DEVICES: list[dict[str, Any]] = [
    {
        "name": "PostgreSQL Database",
        "hostname": "localhost",
        "ip_address": "127.0.0.1",
        "port": 5432,
        "protocol": "tcp",
        "category": "DATABASE",
        "interval_seconds": 10,
        "thresholds": {"max_latency_ms": 50.0, "max_loss_percent": 0.0},
    },
    {
        "name": "Redis Cache & Streams",
        "hostname": "localhost",
        "ip_address": "127.0.0.1",
        "port": 6379,
        "protocol": "tcp",
        "category": "DATABASE",
        "interval_seconds": 10,
        "thresholds": {"max_latency_ms": 30.0, "max_loss_percent": 0.0},
    },
    {
        "name": "InfraWatch Backend API",
        "hostname": "localhost",
        "ip_address": "127.0.0.1",
        "port": 8000,
        "protocol": "http",
        "category": "SERVER",
        "interval_seconds": 10,
        "thresholds": {"max_latency_ms": 200.0, "max_loss_percent": 0.0},
    },
    {
        "name": "InfraWatch Frontend Web",
        "hostname": "localhost",
        "ip_address": "127.0.0.1",
        "port": 3000,
        "protocol": "http",
        "category": "SERVER",
        "interval_seconds": 15,
        "thresholds": {"max_latency_ms": 300.0, "max_loss_percent": 0.0},
    },
    {
        "name": "Localhost Gateway",
        "hostname": "localhost",
        "ip_address": "127.0.0.1",
        "port": 0,
        "protocol": "icmp",
        "category": "ROUTER",
        "interval_seconds": 10,
        "thresholds": {"max_latency_ms": 10.0, "max_loss_percent": 0.0},
    },
    {
        "name": "infrawatch-postgres",
        "hostname": "docker",
        "ip_address": "infrawatch-postgres",
        "port": 0,
        "protocol": "docker",
        "category": "CONTAINER",
        "interval_seconds": 10,
        "thresholds": {"max_latency_ms": 100.0, "max_loss_percent": 0.0},
    },
    {
        "name": "infrawatch-redis",
        "hostname": "docker",
        "ip_address": "infrawatch-redis",
        "port": 0,
        "protocol": "docker",
        "category": "CONTAINER",
        "interval_seconds": 10,
        "thresholds": {"max_latency_ms": 100.0, "max_loss_percent": 0.0},
    },
    # === Nós da Topologia Containerlab (Lab de Rede) ===
    {
        "name": "Router FRR (Core Router)",
        "hostname": "router01",
        "ip_address": "172.28.0.10",
        "port": 0,
        "protocol": "icmp",
        "category": "ROUTER",
        "interval_seconds": 10,
        "thresholds": {"max_latency_ms": 10.0, "max_loss_percent": 0.0},
    },
    {
        "name": "Web Server 01 (Nginx)",
        "hostname": "web01",
        "ip_address": "172.28.0.21",
        "port": 80,
        "protocol": "http",
        "category": "SERVER",
        "interval_seconds": 10,
        "thresholds": {"max_latency_ms": 50.0, "max_loss_percent": 0.0},
    },
    {
        "name": "Web Server 02 (Nginx)",
        "hostname": "web02",
        "ip_address": "172.28.0.22",
        "port": 80,
        "protocol": "http",
        "category": "SERVER",
        "interval_seconds": 10,
        "thresholds": {"max_latency_ms": 50.0, "max_loss_percent": 0.0},
    },
    {
        "name": "DNS Server (CoreDNS)",
        "hostname": "dns01",
        "ip_address": "172.28.0.53",
        "port": 53,
        "protocol": "tcp",
        "category": "SERVER",
        "interval_seconds": 10,
        "thresholds": {"max_latency_ms": 20.0, "max_loss_percent": 0.0},
    },
    {
        "name": "SNMP Simulator Gateway",
        "hostname": "snmpsim",
        "ip_address": "172.28.0.11",
        "port": 0,
        "protocol": "icmp",
        "category": "ROUTER",
        "interval_seconds": 10,
        "thresholds": {"max_latency_ms": 10.0, "max_loss_percent": 0.0},
    },
    {
        "name": "clab-router01-container",
        "hostname": "docker",
        "ip_address": "clab-infrawatch-lab-router01",
        "port": 0,
        "protocol": "docker",
        "category": "CONTAINER",
        "interval_seconds": 10,
        "thresholds": {"max_latency_ms": 100.0, "max_loss_percent": 0.0},
    },
]


async def ensure_demo_organization(session: Any) -> UUID:
    """Busca ou cria a organização padrão do laboratório."""
    stmt = select(OrganizationModel).where(OrganizationModel.slug == "infrawatch-lab")
    result = await session.execute(stmt)
    org = result.scalars().first()

    if org:
        logger.info("Organização de laboratório encontrada: %s (%s)", org.name, org.id)
        return org.id

    org_id = generate_uuid7()
    org = OrganizationModel(
        id=org_id,
        name="InfraWatch Lab Demo",
        slug="infrawatch-lab",
        contact_email="lab@infrawatch.internal",
        tier="ENTERPRISE",
        is_active=True,
    )
    session.add(org)
    await session.commit()
    logger.info("Organização de laboratório criada: %s (%s)", org.name, org_id)
    return org_id


async def seed_devices() -> None:
    """Executa o cadastro idempotente dos dispositivos de demonstração."""
    session_factory = get_session_factory()

    async with session_factory() as session:
        org_id = await ensure_demo_organization(session)

        created_count = 0
        updated_count = 0

        for item in DEMO_DEVICES:
            stmt = select(DeviceModel).where(
                DeviceModel.organization_id == org_id,
                DeviceModel.name == item["name"],
            )
            result = await session.execute(stmt)
            existing = result.scalars().first()

            now = datetime.now()

            if existing:
                existing.hostname = item["hostname"]
                existing.ip_address = item["ip_address"]
                existing.port = item["port"]
                existing.protocol = item["protocol"]
                existing.category = item["category"]
                existing.interval_seconds = item["interval_seconds"]
                existing.thresholds = item["thresholds"]
                existing.is_paused = False
                existing.status = "UP"
                existing.updated_at = now
                updated_count += 1
                logger.info("Dispositivo atualizado: %s [%s]", item["name"], item["protocol"].upper())
            else:
                new_device = DeviceModel(
                    id=generate_uuid7(),
                    organization_id=org_id,
                    name=item["name"],
                    hostname=item["hostname"],
                    ip_address=item["ip_address"],
                    port=item["port"],
                    protocol=item["protocol"],
                    category=item["category"],
                    interval_seconds=item["interval_seconds"],
                    thresholds=item["thresholds"],
                    is_paused=False,
                    status="UP",
                    created_at=now,
                    updated_at=now,
                )
                session.add(new_device)
                created_count += 1
                logger.info("Dispositivo cadastrado: %s [%s]", item["name"], item["protocol"].upper())

        await session.commit()
        logger.info(
            "Seed concluído com sucesso: %d cadastrados, %d atualizados.",
            created_count,
            updated_count,
        )


def main() -> None:
    try:
        asyncio.run(seed_devices())
    except Exception as exc:
        logger.exception("Falha ao executar seed de dispositivos: %s", exc)
        sys.exit(1)


if __name__ == "__main__":
    main()
