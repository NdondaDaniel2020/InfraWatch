"""Módulo de Seed de dados de demonstração e inicialização do InfraWatch.

Executa carga idempotente para inicialização de desenvolvimento, testes e NOC:
1. Organização padrão (infrawatch-lab).
2. Usuários RBAC com hash Argon2id (Super Admin, Operador NOC, Cliente Viewer).
3. Dispositivos de rede e infraestrutura (TCP, HTTP, ICMP, DOCKER).
4. Incidentes em múltiplos estados (TRIGGERED, ACKNOWLEDGED, RESOLVED).
5. Janelas de manutenção de teste (futuras e passadas).
6. Notificações in-app.
7. Séries temporais históricas de telemetria (24h).
"""

from __future__ import annotations

import logging
from datetime import UTC, datetime, timedelta
from typing import Any
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from src.contexts.alerting.database.models import IncidentModel
from src.contexts.alerting.domain.incident import IncidentSeverity, IncidentStatus
from src.contexts.iam.database.models import (
    NotificationModel,
    OrganizationModel,
    UserModel,
)
from src.contexts.iam.domain.enums import OrgTier, UserRole
from src.contexts.iam.security.password import password_hasher
from src.contexts.inventory.database.models import DeviceModel
from src.contexts.sla.database.models import MaintenanceWindowModel
from src.contexts.telemetry.database.models import MetricModel
from src.core.config import get_settings
from src.core.database.session import get_session_factory
from src.core.domain.entity import generate_uuid7

logger = logging.getLogger("infrawatch.seed")

DEMO_DEVICES: list[dict[str, Any]] = [
    {
        "name": "PostgreSQL Database",
        "hostname": "postgres",
        "ip_address": "postgres",
        "port": 5432,
        "protocol": "tcp",
        "category": "DATABASE",
        "interval_seconds": 10,
        "thresholds": {"max_latency_ms": 50.0, "max_loss_percent": 0.0},
    },
    {
        "name": "Redis Cache & Streams",
        "hostname": "redis",
        "ip_address": "redis",
        "port": 6379,
        "protocol": "tcp",
        "category": "DATABASE",
        "interval_seconds": 10,
        "thresholds": {"max_latency_ms": 30.0, "max_loss_percent": 0.0},
    },
    {
        "name": "InfraWatch Backend API",
        "hostname": "infrawatch-api",
        "ip_address": "infrawatch-api",
        "port": 8000,
        "protocol": "http",
        "category": "SERVER",
        "interval_seconds": 10,
        "thresholds": {"max_latency_ms": 200.0, "max_loss_percent": 0.0},
    },
    {
        "name": "InfraWatch Frontend Web",
        "hostname": "infrawatch-api",
        "ip_address": "infrawatch-api",
        "port": 3000,
        "protocol": "http",
        "category": "SERVER",
        "interval_seconds": 15,
        "thresholds": {"max_latency_ms": 300.0, "max_loss_percent": 0.0},
    },
    {
        "name": "Localhost Gateway",
        "hostname": "infrawatch-api",
        "ip_address": "infrawatch-api",
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
        "thresholds": {"max_latency_ms": 10.0, "max_loss_percent": 0.0, "zabbix_host_id": "10683"},
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


async def ensure_demo_organization(session: AsyncSession) -> UUID:
    """Busca ou cria a organização padrão do laboratório."""
    stmt = select(OrganizationModel).where(OrganizationModel.slug == "infrawatch-lab")
    result = await session.execute(stmt)
    org = result.scalars().first()

    if org:
        logger.info("Organização encontrada: %s (%s)", org.name, org.id)
        return org.id

    org_id = generate_uuid7()
    org = OrganizationModel(
        id=org_id,
        name="InfraWatch Lab Demo",
        slug="infrawatch-lab",
        contact_email="lab@infrawatch.internal",
        tier=OrgTier.ENTERPRISE_GOLD.value,
        is_active=True,
    )
    session.add(org)
    await session.flush()
    logger.info("Organização criada: %s (%s)", org.name, org_id)
    return org_id


async def ensure_demo_users(session: AsyncSession, org_id: UUID) -> dict[str, UserModel]:
    """Cadastra ou atualiza os usuários de demonstração com hash seguro Argon2."""
    settings = get_settings()

    demo_users_data: list[dict[str, str]] = [
        {
            "email": settings.ADMIN_EMAIL.strip().lower(),
            "full_name": "NOC Super Admin",
            "password": settings.ADMIN_PASSWORD,
            "role": UserRole.SUPER_ADMIN.value,
        },
        {
            "email": "operator@infrawatch.internal",
            "full_name": "Operador NOC 01",
            "password": "Operator#2026!Noc",
            "role": UserRole.NOC_OPERATOR.value,
        },
        {
            "email": "viewer@infrawatch.internal",
            "full_name": "Cliente Visualizador",
            "password": "Viewer#2026!Client",
            "role": UserRole.CLIENT_VIEWER.value,
        },
    ]

    users_map: dict[str, UserModel] = {}

    for item in demo_users_data:
        email = item["email"]
        stmt = select(UserModel).where(UserModel.email == email)
        result = await session.execute(stmt)
        user = result.scalars().first()

        if user:
            user.full_name = item["full_name"]
            user.role = item["role"]
            user.organization_id = org_id
            user.is_active = True
            user.is_verified = True
            logger.info("Usuário já existente atualizado: %s [%s]", email, item["role"])
        else:
            hashed_pwd = password_hasher.hash(item["password"])
            user = UserModel(
                id=generate_uuid7(),
                organization_id=org_id,
                email=email,
                hashed_password=hashed_pwd,
                full_name=item["full_name"],
                role=item["role"],
                is_active=True,
                is_verified=True,
            )
            session.add(user)
            logger.info("Usuário cadastrado com sucesso: %s [%s]", email, item["role"])

        users_map[email] = user

    await session.flush()
    return users_map


async def seed_devices(session: AsyncSession, org_id: UUID) -> dict[str, DeviceModel]:
    """Cadastra ou atualiza os dispositivos de demonstração de forma idempotente."""
    devices_map: dict[str, DeviceModel] = {}

    for item in DEMO_DEVICES:
        stmt = select(DeviceModel).where(
            DeviceModel.organization_id == org_id,
            DeviceModel.name == item["name"],
        )
        result = await session.execute(stmt)
        existing = result.scalars().first()

        now = datetime.now(UTC)

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
            devices_map[item["name"]] = existing
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
            devices_map[item["name"]] = new_device
            logger.info("Dispositivo cadastrado: %s [%s]", item["name"], item["protocol"].upper())

    await session.flush()
    return devices_map


async def seed_incidents(
    session: AsyncSession,
    org_id: UUID,
    devices: dict[str, DeviceModel],
    users: dict[str, UserModel],
) -> None:
    """Cadastra incidentes de demonstração em múltiplos estados (TRIGGERED, ACKNOWLEDGED, RESOLVED)."""
    now = datetime.now(UTC)
    operator = users.get("operator@infrawatch.internal")
    operator_id = operator.id if operator else None

    incidents_data: list[dict[str, Any]] = [
        {
            "device_name": "Web Server 02 (Nginx)",
            "title": "HTTP 502 Bad Gateway no Servidor Web 02",
            "severity": IncidentSeverity.CRITICAL.value,
            "status": IncidentStatus.TRIGGERED.value,
            "operator_id": None,
            "glpi_ticket_id": None,
            "root_cause": None,
            "started_at": now - timedelta(minutes=18),
            "acknowledged_at": None,
            "resolved_at": None,
            "downtime_minutes": 18,
        },
        {
            "device_name": "Router FRR (Core Router)",
            "title": "Latência elevada na rota eth1 do Core Router",
            "severity": IncidentSeverity.WARNING.value,
            "status": IncidentStatus.ACKNOWLEDGED.value,
            "operator_id": operator_id,
            "glpi_ticket_id": None,
            "root_cause": "Possível saturação de tráfego de interface em análise",
            "started_at": now - timedelta(hours=1, minutes=10),
            "acknowledged_at": now - timedelta(minutes=45),
            "resolved_at": None,
            "downtime_minutes": None,
        },
        {
            "device_name": "DNS Server (CoreDNS)",
            "title": "Queda no processo daemon do CoreDNS",
            "severity": IncidentSeverity.CRITICAL.value,
            "status": IncidentStatus.RESOLVED.value,
            "operator_id": operator_id,
            "glpi_ticket_id": 1042,
            "root_cause": "Reinício do container após estouro temporário de memória",
            "started_at": now - timedelta(hours=6),
            "acknowledged_at": now - timedelta(hours=5, minutes=50),
            "resolved_at": now - timedelta(hours=5, minutes=36),
            "downtime_minutes": 24,
        },
        {
            "device_name": "infrawatch-postgres",
            "title": "Pico de conexões simultâneas no PostgreSQL",
            "severity": IncidentSeverity.DEGRADED.value,
            "status": IncidentStatus.RESOLVED.value,
            "operator_id": operator_id,
            "glpi_ticket_id": 1043,
            "root_cause": "Transações presas por consulta pesada em relatório legado",
            "started_at": now - timedelta(days=1, hours=2),
            "acknowledged_at": now - timedelta(days=1, hours=1, minutes=50),
            "resolved_at": now - timedelta(days=1, hours=1, minutes=40),
            "downtime_minutes": 20,
        },
    ]

    for item in incidents_data:
        device = devices.get(item["device_name"])
        if not device:
            continue

        stmt = select(IncidentModel).where(
            IncidentModel.device_id == device.id,
            IncidentModel.title == item["title"],
        )
        result = await session.execute(stmt)
        existing = result.scalars().first()

        if existing:
            existing.status = item["status"]
            existing.severity = item["severity"]
            existing.operator_id = item["operator_id"]
            existing.glpi_ticket_id = item["glpi_ticket_id"]
            existing.root_cause = item["root_cause"]
            existing.downtime_minutes = item["downtime_minutes"]
            logger.info("Incidente atualizado: %s [%s]", item["title"], item["status"])
        else:
            incident = IncidentModel(
                id=generate_uuid7(),
                device_id=device.id,
                organization_id=org_id,
                operator_id=item["operator_id"],
                title=item["title"],
                severity=item["severity"],
                status=item["status"],
                glpi_ticket_id=item["glpi_ticket_id"],
                root_cause=item["root_cause"],
                started_at=item["started_at"],
                acknowledged_at=item["acknowledged_at"],
                resolved_at=item["resolved_at"],
                downtime_minutes=item["downtime_minutes"],
            )
            session.add(incident)
            logger.info("Incidente cadastrado: %s [%s]", item["title"], item["status"])

    await session.flush()


async def seed_maintenance_windows(
    session: AsyncSession,
    org_id: UUID,
    devices: dict[str, DeviceModel],
) -> None:
    """Cadastra janelas de manutenção de teste (futuras e passadas)."""
    now = datetime.now(UTC)
    router = devices.get("Router FRR (Core Router)")
    web01 = devices.get("Web Server 01 (Nginx)")

    windows: list[dict[str, Any]] = [
        {
            "device_id": router.id if router else None,
            "description": "Atualização Semestral de Firmware e Kernel do Core Router",
            "start_time": now + timedelta(days=2),
            "end_time": now + timedelta(days=2, hours=3),
            "is_approved": True,
        },
        {
            "device_id": web01.id if web01 else None,
            "description": "Manutenção Preventiva e Atualização de Certificados TLS",
            "start_time": now - timedelta(days=4),
            "end_time": now - timedelta(days=4, hours=2),
            "is_approved": True,
        },
    ]

    for item in windows:
        stmt = select(MaintenanceWindowModel).where(
            MaintenanceWindowModel.organization_id == org_id,
            MaintenanceWindowModel.description == item["description"],
        )
        result = await session.execute(stmt)
        existing = result.scalars().first()

        if existing:
            existing.is_approved = item["is_approved"]
            existing.start_time = item["start_time"]
            existing.end_time = item["end_time"]
            logger.info("Janela de manutenção atualizada: %s", item["description"])
        else:
            win = MaintenanceWindowModel(
                id=generate_uuid7(),
                device_id=item["device_id"],
                organization_id=org_id,
                description=item["description"],
                start_time=item["start_time"],
                end_time=item["end_time"],
                is_approved=item["is_approved"],
            )
            session.add(win)
            logger.info("Janela de manutenção cadastrada: %s", item["description"])

    await session.flush()


async def seed_notifications(session: AsyncSession, users: dict[str, UserModel]) -> None:
    """Cadastra notificações in-app de exemplo para os usuários."""
    now = datetime.now(UTC)
    settings = get_settings()
    admin = users.get(settings.ADMIN_EMAIL.strip().lower())
    operator = users.get("operator@infrawatch.internal")

    notifications: list[dict[str, Any]] = []
    if admin:
        notifications.append(
            {
                "user_id": admin.id,
                "title": "Alerta Crítico no Cluster",
                "message": "Incidente crítico disparado: HTTP 502 Bad Gateway no Servidor Web 02",
                "event_type": "incident.triggered",
                "read": False,
            }
        )
        notifications.append(
            {
                "user_id": admin.id,
                "title": "Relatório de SLA Consolidado",
                "message": "A meta de SLA mensal (99.50%) está sendo cumprida em 99.82%.",
                "event_type": "sla.report",
                "read": True,
            }
        )
    if operator:
        notifications.append(
            {
                "user_id": operator.id,
                "title": "Incidente Atribuído",
                "message": "Você foi atribuído para investigar a latência elevada no Core Router.",
                "event_type": "incident.assigned",
                "read": False,
            }
        )

    for item in notifications:
        stmt = select(NotificationModel).where(
            NotificationModel.user_id == item["user_id"],
            NotificationModel.title == item["title"],
        )
        result = await session.execute(stmt)
        if not result.scalars().first():
            notif = NotificationModel(
                user_id=item["user_id"],
                channel="in_app",
                event_type=item["event_type"],
                title=item["title"],
                message=item["message"],
                read=item["read"],
                created_at=now,
            )
            session.add(notif)
            logger.info("Notificação criada para usuário %s: %s", item["user_id"], item["title"])

    await session.flush()


async def seed_metrics(
    session: AsyncSession,
    org_id: UUID,
    devices: dict[str, DeviceModel],
) -> None:
    """Cadastra histórico de métricas (últimas 24h) para visualização rica de gráficos."""
    now = datetime.now(UTC)
    key_device_names = [
        ("Router FRR (Core Router)", 4.2),
        ("Web Server 01 (Nginx)", 18.5),
        ("infrawatch-postgres", 1.8),
    ]

    inserted_count = 0

    max_id_res = await session.execute(select(func.max(MetricModel.id)))
    current_id: int = (max_id_res.scalar_one_or_none() or 0) + 1

    for dev_name, base_latency in key_device_names:
        dev = devices.get(dev_name)
        if not dev:
            continue

        # Idempotência: se já houver medições recentes para este dispositivo, pula
        recent_check = await session.execute(
            select(func.count(MetricModel.id)).where(
                MetricModel.device_id == dev.id,
                MetricModel.timestamp >= now - timedelta(hours=3),
            )
        )
        count = recent_check.scalar_one_or_none() or 0
        if count > 0:
            logger.info("Métricas recentes já presentes para %s. Pulando injeção sintética.", dev_name)
            continue

        # Injeta 24 pontos históricos (1 por hora)
        for h in range(24, 0, -1):
            ts = now - timedelta(hours=h)
            variation = ((h % 5) - 2) * 0.4
            latency_val = max(1.0, round(base_latency + variation, 2))

            metric = MetricModel(
                id=current_id,
                device_id=dev.id,
                organization_id=org_id,
                metric_type="latency_ms",
                value=latency_val,
                packet_loss=0.0 if h % 8 != 0 else 1.5,
                status="UP" if h % 12 != 0 else "DEGRADED",
                timestamp=ts,
            )
            current_id += 1
            session.add(metric)
            inserted_count += 1

    if inserted_count > 0:
        logger.info("Série temporal de métricas inserida: %d pontos históricos gerados.", inserted_count)
    await session.flush()


async def seed_all() -> None:
    """Executa a carga completa e idempotente da base de demonstração."""
    session_factory = get_session_factory()

    async with session_factory() as session:
        logger.info("Iniciando rotina de seed da base de dados...")

        # 1. Organização
        org_id = await ensure_demo_organization(session)

        # 2. Usuários (com hash Argon2id)
        users = await ensure_demo_users(session, org_id)

        # 3. Dispositivos de rede e infraestrutura
        devices = await seed_devices(session, org_id)

        # 4. Incidentes
        await seed_incidents(session, org_id, devices, users)

        # 5. Janelas de manutenção
        await seed_maintenance_windows(session, org_id, devices)

        # 6. Notificações in-app
        await seed_notifications(session, users)

        # 7. Séries temporais de telemetria
        await seed_metrics(session, org_id, devices)

        await session.commit()
        logger.info("Seed completo finalizado com sucesso e idempotência garantida!")
