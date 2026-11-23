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

import asyncio
import hashlib
import json
import logging
from datetime import UTC, datetime, timedelta
from decimal import Decimal
from typing import Any
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from src.contexts.alerting.database.models import IncidentModel
from src.contexts.alerting.domain.incident import IncidentSeverity, IncidentStatus
from src.contexts.iam.database.models import (
    AuditLogModel,
    NotificationModel,
    OrganizationModel,
    RefreshTokenModel,
    UserModel,
)
from src.contexts.iam.domain.enums import AuditResult, OrgTier, UserRole
from src.contexts.iam.security.password import password_hasher
from src.contexts.inventory.database.models import DeviceModel
from src.contexts.network_topology.database.models import (
    TopologyEdgeModel,
    TopologyNodeModel,
)
from src.contexts.sla.database.models import MaintenanceWindowModel
from src.contexts.system.database.models import SystemSettingModel
from src.contexts.telemetry.database.models import MetricModel
from src.core.config import get_settings
from src.core.database.session import get_session_factory
from src.core.domain.entity import generate_uuid7
from src.core.infrastructure.redis import get_redis_client
from src.core.security.audit import compute_audit_hash

logger = logging.getLogger("infrawatch.seed")

DEMO_ORGANIZATIONS: list[dict[str, Any]] = [
    {
        "name": "InfraWatch Lab Demo",
        "slug": "infrawatch-lab",
        "contact_email": "lab@infrawatch.internal",
        "tier": OrgTier.ENTERPRISE_GOLD.value,
        "sla_target_default": Decimal("99.50"),
    },
    {
        "name": "Banco Sol S.A.",
        "slug": "banco-sol",
        "contact_email": "gestor.ti@bancosol.ao",
        "tier": OrgTier.ENTERPRISE_GOLD.value,
        "sla_target_default": Decimal("99.50"),
    },
    {
        "name": "Unitel Angola",
        "slug": "unitel-angola",
        "contact_email": "noc.telecom@unitel.ao",
        "tier": OrgTier.ENTERPRISE_GOLD.value,
        "sla_target_default": Decimal("99.90"),
    },
    {
        "name": "Sonangol Logistics",
        "slug": "sonangol",
        "contact_email": "ti@sonangol.ao",
        "tier": OrgTier.PROFESSIONAL.value,
        "sla_target_default": Decimal("99.00"),
    },
]

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
        "port": 161,
        "protocol": "snmp",
        "category": "ROUTER",
        "interval_seconds": 10,
        "thresholds": {
            "max_latency_ms": 10.0,
            "max_loss_percent": 0.0,
            "zabbix_host_id": "10683",
            "model": "Net-SNMP Linux Simulator",
            "vendor": "Net-SNMP",
            "serial_number": "SNMP-SIM-LAB01",
            "firmware": "Linux 6.6 / Net-SNMP 5.9",
            "temperature": "32°C",
            "uptime": "21d 08h 14m",
            "ports_active": 4,
            "ports_total": 4,
            "snmp_config": {
                "version": "v2c",
                "community": "public",
                "port": 161,
            },
        },
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
    # === Dispositivos Físicos da Rede Local (Teste ICMP) ===
    {
        "name": "spot",
        "hostname": "spot",
        "ip_address": "192.168.8.48",
        "port": 0,
        "protocol": "icmp",
        "category": "SERVER",
        "interval_seconds": 10,
        "thresholds": {"max_latency_ms": 20.0, "max_loss_percent": 0.0},
    },
    {
        "name": "Play 5",
        "hostname": "play-5",
        "ip_address": "192.168.8.14",
        "port": 0,
        "protocol": "icmp",
        "category": "SERVER",
        "interval_seconds": 10,
        "thresholds": {"max_latency_ms": 30.0, "max_loss_percent": 0.0},
    },
    {
        "name": "vivo-Y55A",
        "hostname": "vivo-y55a",
        "ip_address": "192.168.8.18",
        "port": 0,
        "protocol": "icmp",
        "category": "SERVER",
        "interval_seconds": 10,
        "thresholds": {"max_latency_ms": 50.0, "max_loss_percent": 0.0},
    },
    {
        "name": "Abraao-Matondo",
        "hostname": "abraao-matondo",
        "ip_address": "192.168.8.252",
        "port": 0,
        "protocol": "icmp",
        "category": "SERVER",
        "interval_seconds": 10,
        "thresholds": {
            "max_latency_ms": 50.0,
            "max_loss_percent": 0.0,
            "model": "Workstation HP ProDesk 600 G4",
            "vendor": "HP Inc.",
            "serial_number": "CZC9128KL9",
            "firmware": "Windows 11 Pro / BIOS 02.14.01",
            "temperature": "45°C",
            "uptime": "0d 00h 08m",
            "ports_active": 0,
            "ports_total": 1,
        },
    },
    {
        "name": "iPhone",
        "hostname": "iphone",
        "ip_address": "192.168.8.94",
        "port": 0,
        "protocol": "icmp",
        "category": "SERVER",
        "interval_seconds": 10,
        "thresholds": {"max_latency_ms": 50.0, "max_loss_percent": 0.0},
    },
    {
        "name": "DESKTOP-SNUOOM3",
        "hostname": "desktop-snuoom3",
        "ip_address": "192.168.8.75",
        "port": 0,
        "protocol": "icmp",
        "category": "SERVER",
        "interval_seconds": 10,
        "thresholds": {"max_latency_ms": 50.0, "max_loss_percent": 0.0},
    },
    {
        "name": "Casa-estrela",
        "hostname": "casa-estrela",
        "ip_address": "192.168.8.211",
        "port": 0,
        "protocol": "icmp",
        "category": "SERVER",
        "interval_seconds": 10,
        "thresholds": {"max_latency_ms": 50.0, "max_loss_percent": 0.0},
    },
    {
        "name": "NdDaniel",
        "hostname": "nddaniel",
        "ip_address": "192.168.8.147",
        "port": 0,
        "protocol": "icmp",
        "category": "SERVER",
        "interval_seconds": 10,
        "thresholds": {"max_latency_ms": 100.0, "max_loss_percent": 0.0},
    },
    # === Dispositivos Canônicos dos Clientes (Mocks Frontend) ===
    # Unitel Angola (Backbone & Core)
    {
        "name": "SW-CORE-LUANDA-01",
        "hostname": "sw-core-01.luanda.infrawatch.ao",
        "ip_address": "10.0.1.1",
        "port": 22,
        "protocol": "icmp",
        "category": "SWITCH",
        "interval_seconds": 15,
        "thresholds": {
            "max_latency_ms": 10.0,
            "max_loss_percent": 0.0,
            "model": "Huawei CloudEngine 6857-48S6CQ",
            "vendor": "Huawei Technologies",
            "serial_number": "2102353GVL10N9000042",
            "firmware": "VRP (R) Software, Version 8.210",
            "temperature": "42°C",
            "uptime": "182d 04h 10m",
            "ports_active": 18,
            "ports_total": 24,
        },
        "org_slug": "unitel-angola",
    },
    {
        "name": "SW-CORE-LUANDA-02",
        "hostname": "sw-core-02.luanda.infrawatch.ao",
        "ip_address": "10.0.1.2",
        "port": 22,
        "protocol": "icmp",
        "category": "SWITCH",
        "interval_seconds": 15,
        "thresholds": {
            "max_latency_ms": 10.0,
            "max_loss_percent": 0.0,
            "model": "Huawei CloudEngine 6857-48S6CQ",
            "vendor": "Huawei Technologies",
            "serial_number": "2102353GVL10N9000043",
            "firmware": "VRP (R) Software, Version 8.210",
            "temperature": "41°C",
            "uptime": "182d 04h 08m",
            "ports_active": 16,
            "ports_total": 24,
        },
        "org_slug": "unitel-angola",
    },
    {
        "name": "RT-BRANCH-BENGUELA",
        "hostname": "rt-branch.benguela.infrawatch.ao",
        "ip_address": "172.16.20.1",
        "port": 0,
        "protocol": "icmp",
        "category": "ROUTER",
        "interval_seconds": 10,
        "thresholds": {
            "max_latency_ms": 25.0,
            "max_loss_percent": 0.0,
            "model": "Cisco ISR 4331 Router",
            "vendor": "Cisco Systems",
            "serial_number": "FOC2214300B",
            "firmware": "Cisco IOS-XE 16.09.05",
            "temperature": "37°C",
            "uptime": "91d 12h 00m",
            "ports_active": 3,
            "ports_total": 6,
        },
        "org_slug": "unitel-angola",
    },
    {
        "name": "RTR-EDGE-LUANDA-01",
        "hostname": "rtr-edge-01.luanda.infrawatch.ao",
        "ip_address": "10.0.0.1",
        "port": 0,
        "protocol": "icmp",
        "category": "ROUTER",
        "interval_seconds": 10,
        "thresholds": {
            "max_latency_ms": 5.0,
            "max_loss_percent": 0.0,
            "model": "Cisco ASR 1001-X Router",
            "vendor": "Cisco Systems",
            "serial_number": "FXS213401AZ",
            "firmware": "Cisco IOS XE 17.06.01a",
            "temperature": "36°C",
            "uptime": "210d 11h 30m",
            "ports_active": 4,
            "ports_total": 8,
        },
        "org_slug": "unitel-angola",
    },
    # Banco Sol (Canais Digitais & Core)
    {
        "name": "API-GATEWAY-PROD",
        "hostname": "api-gw.bancosol.infrawatch.ao",
        "ip_address": "10.0.2.15",
        "port": 443,
        "protocol": "http",
        "category": "SERVER",
        "interval_seconds": 10,
        "thresholds": {
            "max_latency_ms": 100.0,
            "max_loss_percent": 0.0,
            "model": "Dell PowerEdge R750xs (2x Xeon Gold)",
            "vendor": "Dell EMC",
            "serial_number": "7B2K9X3-PROD",
            "firmware": "Ubuntu 22.04 LTS (Kernel 5.15.0-107)",
            "temperature": "38°C",
            "uptime": "94d 18h 45m",
            "ports_active": 2,
            "ports_total": 4,
        },
        "org_slug": "banco-sol",
    },
    {
        "name": "DB-REPLICA-02",
        "hostname": "db-replica-02.bancosol.infrawatch.ao",
        "ip_address": "10.0.2.20",
        "port": 5432,
        "protocol": "tcp",
        "category": "DATABASE",
        "interval_seconds": 10,
        "thresholds": {
            "max_latency_ms": 20.0,
            "max_loss_percent": 0.0,
            "model": "Dell PowerEdge R750xd2",
            "vendor": "Dell EMC",
            "serial_number": "8X1M4Q2-PROD",
            "firmware": "Red Hat Enterprise Linux 9.2",
            "temperature": "40°C",
            "uptime": "142d 08h 19m",
            "ports_active": 2,
            "ports_total": 4,
        },
        "org_slug": "banco-sol",
    },
    # Sonangol Logistics
    {
        "name": "DWDM-TALATONA-01",
        "hostname": "dwdm-talatona.sonangol.infrawatch.ao",
        "ip_address": "10.0.3.50",
        "port": 0,
        "protocol": "icmp",
        "category": "ROUTER",
        "interval_seconds": 15,
        "thresholds": {
            "max_latency_ms": 15.0,
            "max_loss_percent": 0.0,
            "model": "Ciena Waveserver 5 Transponder",
            "vendor": "Ciena",
            "serial_number": "CN-WS5-88310",
            "firmware": "Waveserver OS 2.4",
            "temperature": "39°C",
            "uptime": "305d 14h 00m",
            "ports_active": 8,
            "ports_total": 16,
        },
        "org_slug": "sonangol",
    },
]


async def ensure_demo_organizations(session: AsyncSession) -> dict[str, UUID]:
    """Busca ou cria as organizações multi-tenant de demonstração."""
    orgs_map: dict[str, UUID] = {}

    for item in DEMO_ORGANIZATIONS:
        slug = item["slug"]
        stmt = select(OrganizationModel).where(OrganizationModel.slug == slug)
        result = await session.execute(stmt)
        org = result.scalars().first()

        if org:
            org.name = item["name"]
            org.contact_email = item.get("contact_email")
            org.tier = item.get("tier", OrgTier.ENTERPRISE_GOLD.value)
            org.sla_target_default = item.get("sla_target_default", Decimal("99.50"))
            org.is_active = True
            orgs_map[slug] = org.id
            logger.info("Organização existente sincronizada: %s (%s)", org.name, org.id)
        else:
            org_id = generate_uuid7()
            org = OrganizationModel(
                id=org_id,
                name=item["name"],
                slug=slug,
                contact_email=item.get("contact_email"),
                tier=item.get("tier", OrgTier.ENTERPRISE_GOLD.value),
                sla_target_default=item.get("sla_target_default", Decimal("99.50")),
                is_active=True,
            )
            session.add(org)
            orgs_map[slug] = org_id
            logger.info("Organização criada: %s (%s)", org.name, org_id)

    await session.flush()
    return orgs_map


async def ensure_demo_organization(session: AsyncSession) -> UUID:
    """Busca ou cria a organização padrão do laboratório (compatibilidade)."""
    orgs = await ensure_demo_organizations(session)
    return orgs["infrawatch-lab"]


async def ensure_demo_users(
    session: AsyncSession, orgs: dict[str, UUID] | UUID
) -> dict[str, UserModel]:
    """Cadastra ou atualiza os usuários de demonstração com hash seguro Argon2."""
    settings = get_settings()

    if isinstance(orgs, UUID):
        orgs_map = {"infrawatch-lab": orgs}
        default_org = orgs
    else:
        orgs_map = orgs
        default_org = orgs.get("infrawatch-lab") or next(iter(orgs.values()))

    demo_users_data: list[dict[str, str]] = [
        # SUPER_ADMIN
        {
            "email": settings.ADMIN_EMAIL.strip().lower(),
            "full_name": "NOC Super Admin",
            "password": settings.ADMIN_PASSWORD,
            "role": UserRole.SUPER_ADMIN.value,
            "org_slug": "infrawatch-lab",
        },
        {
            "email": "daniel.ndonda@infrawatch.ao",
            "full_name": "Daniel Ndonda",
            "password": "Admin#2026!Global",
            "role": UserRole.SUPER_ADMIN.value,
            "org_slug": "infrawatch-lab",
        },
        # NOC_OPERATOR
        {
            "email": "operator@infrawatch.internal",
            "full_name": "Operador NOC 01",
            "password": "Operator#2026!Noc",
            "role": UserRole.NOC_OPERATOR.value,
            "org_slug": "infrawatch-lab",
        },
        {
            "email": "operador.noc@infrawatch.ao",
            "full_name": "Operador NOC Luanda",
            "password": "Operator#2026!Noc",
            "role": UserRole.NOC_OPERATOR.value,
            "org_slug": "infrawatch-lab",
        },
        # ORG_ADMIN (Gestor Corporativo de Organização Cliente - Banco Sol)
        {
            "email": "gestor.ti@bancosol.ao",
            "full_name": "Mateus Silva (Banco Sol)",
            "password": "Admin#2026!BancoSol",
            "role": UserRole.ORG_ADMIN.value,
            "org_slug": "banco-sol",
        },
        # CLIENT_VIEWER (Visualizadores e Auditores de Clientes)
        {
            "email": "viewer@infrawatch.internal",
            "full_name": "Cliente Visualizador",
            "password": "Viewer#2026!Client",
            "role": UserRole.CLIENT_VIEWER.value,
            "org_slug": "infrawatch-lab",
        },
        {
            "email": "noc.telecom@unitel.ao",
            "full_name": "Auditoria Unitel",
            "password": "Viewer#2026!Unitel",
            "role": UserRole.CLIENT_VIEWER.value,
            "org_slug": "unitel-angola",
        },
        {
            "email": "viewer@bancosol.ao",
            "full_name": "Auditor Banco Sol",
            "password": "Viewer#2026!BancoSol",
            "role": UserRole.CLIENT_VIEWER.value,
            "org_slug": "banco-sol",
        },
    ]

    users_map: dict[str, UserModel] = {}

    for item in demo_users_data:
        email = item["email"]
        target_org_id = orgs_map.get(item.get("org_slug", ""), default_org)
        stmt = select(UserModel).where(UserModel.email == email)
        result = await session.execute(stmt)
        user = result.scalars().first()

        if user:
            user.full_name = item["full_name"]
            user.role = item["role"]
            user.organization_id = target_org_id
            user.is_active = True
            user.is_verified = True
            logger.info("Usuário já existente atualizado: %s [%s]", email, item["role"])
        else:
            hashed_pwd = password_hasher.hash(item["password"])
            user = UserModel(
                id=generate_uuid7(),
                organization_id=target_org_id,
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


async def seed_devices(
    session: AsyncSession, orgs: dict[str, UUID] | UUID
) -> dict[str, DeviceModel]:
    """Cadastra ou atualiza os dispositivos de demonstração de forma idempotente."""
    if isinstance(orgs, UUID):
        orgs_map = {"infrawatch-lab": orgs}
        default_org = orgs
    else:
        orgs_map = orgs
        default_org = orgs.get("infrawatch-lab") or next(iter(orgs.values()))

    devices_map: dict[str, DeviceModel] = {}

    for item in DEMO_DEVICES:
        target_org_id = orgs_map.get(item.get("org_slug", ""), default_org)
        stmt = select(DeviceModel).where(
            DeviceModel.organization_id == target_org_id,
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
                organization_id=target_org_id,
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
    orgs: dict[str, UUID] | UUID,
    devices: dict[str, DeviceModel],
    users: dict[str, UserModel],
) -> None:
    """Cadastra incidentes de demonstração em múltiplos estados (TRIGGERED, ACKNOWLEDGED, RESOLVED)."""
    now = datetime.now(UTC)
    if isinstance(orgs, UUID):
        orgs_map = {"infrawatch-lab": orgs}
        default_org = orgs
    else:
        orgs_map = orgs
        default_org = orgs.get("infrawatch-lab") or next(iter(orgs.values()))

    operator = users.get("operator@infrawatch.internal") or users.get("operador.noc@infrawatch.ao")
    operator_id = operator.id if operator else None
    daniel = users.get("daniel.ndonda@infrawatch.ao")
    daniel_id = daniel.id if daniel else operator_id

    incidents_data: list[dict[str, Any]] = [
        # Lab
        {
            "device_name": "Web Server 02 (Nginx)",
            "org_slug": "infrawatch-lab",
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
            "org_slug": "infrawatch-lab",
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
            "org_slug": "infrawatch-lab",
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
            "org_slug": "infrawatch-lab",
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
        # Mocks Canônicos de Clientes
        {
            "device_name": "SW-CORE-LUANDA-01",
            "org_slug": "unitel-angola",
            "title": "SW-CORE-LUANDA-01 está Inalcançável (DOWN)",
            "severity": IncidentSeverity.CRITICAL.value,
            "status": IncidentStatus.TRIGGERED.value,
            "operator_id": None,
            "glpi_ticket_id": 8492,
            "root_cause": None,
            "started_at": now - timedelta(minutes=8),
            "acknowledged_at": None,
            "resolved_at": None,
            "downtime_minutes": 8,
        },
        {
            "device_name": "API-GATEWAY-PROD",
            "org_slug": "banco-sol",
            "title": "API-GATEWAY-PROD: Latência P95 > 140ms",
            "severity": IncidentSeverity.DEGRADED.value,
            "status": IncidentStatus.ACKNOWLEDGED.value,
            "operator_id": daniel_id,
            "glpi_ticket_id": 8488,
            "root_cause": "Sobrecarga temporária de requisições de autenticação MFA",
            "started_at": now - timedelta(hours=1, minutes=39),
            "acknowledged_at": now - timedelta(hours=1, minutes=20),
            "resolved_at": None,
            "downtime_minutes": None,
        },
    ]

    for item in incidents_data:
        device = devices.get(item["device_name"])
        if not device:
            continue

        target_org_id = device.organization_id or orgs_map.get(
            item.get("org_slug", ""), default_org
        )

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
                organization_id=target_org_id,
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
    orgs: dict[str, UUID] | UUID,
    devices: dict[str, DeviceModel],
) -> None:
    """Cadastra janelas de manutenção de teste (futuras e passadas)."""
    now = datetime.now(UTC)
    if isinstance(orgs, UUID):
        orgs_map = {"infrawatch-lab": orgs}
        default_org = orgs
    else:
        orgs_map = orgs
        default_org = orgs.get("infrawatch-lab") or next(iter(orgs.values()))

    windows: list[dict[str, Any]] = [
        # Lab
        {
            "device_name": "Router FRR (Core Router)",
            "org_slug": "infrawatch-lab",
            "description": "Atualização Semestral de Firmware e Kernel do Core Router",
            "start_time": now + timedelta(days=2),
            "end_time": now + timedelta(days=2, hours=3),
            "is_approved": True,
        },
        {
            "device_name": "Web Server 01 (Nginx)",
            "org_slug": "infrawatch-lab",
            "description": "Manutenção Preventiva e Atualização de Certificados TLS",
            "start_time": now - timedelta(days=4),
            "end_time": now - timedelta(days=4, hours=2),
            "is_approved": True,
        },
        # Mocks Canônicos
        {
            "device_name": "SW-CORE-LUANDA-01",
            "org_slug": "unitel-angola",
            "description": "Atualização Crítica de Firmware Cisco IOS-XE 17.9.4a (CVE-2026-1192)",
            "start_time": now + timedelta(days=1, hours=2),
            "end_time": now + timedelta(days=1, hours=4),
            "is_approved": True,
        },
        {
            "device_name": "DB-REPLICA-02",
            "org_slug": "banco-sol",
            "description": "Manutenção preventiva de base de dados e VACUUM FULL",
            "start_time": now + timedelta(days=3),
            "end_time": now + timedelta(days=3, hours=2),
            "is_approved": False,
        },
        {
            "device_name": "DWDM-TALATONA-01",
            "org_slug": "sonangol",
            "description": "Expansão de Capacidade DWDM Anel Luanda Sul",
            "start_time": now - timedelta(days=10),
            "end_time": now - timedelta(days=10, hours=-2),
            "is_approved": True,
        },
        {
            "device_name": "RTR-EDGE-LUANDA-01",
            "org_slug": "unitel-angola",
            "description": "Substituição de Módulos de Alimentação Redundantes PSU-B",
            "start_time": now - timedelta(days=15),
            "end_time": now - timedelta(days=15, hours=-2),
            "is_approved": True,
        },
    ]

    for item in windows:
        dev = devices.get(item["device_name"]) if item.get("device_name") else None
        target_org_id = (
            dev.organization_id if dev else orgs_map.get(item.get("org_slug", ""), default_org)
        )

        stmt = select(MaintenanceWindowModel).where(
            MaintenanceWindowModel.organization_id == target_org_id,
            MaintenanceWindowModel.description == item["description"],
        )
        result = await session.execute(stmt)
        existing = result.scalars().first()

        if existing:
            existing.is_approved = item["is_approved"]
            existing.start_time = item["start_time"]
            existing.end_time = item["end_time"]
            if dev:
                existing.device_id = dev.id
            logger.info("Janela de manutenção atualizada: %s", item["description"])
        else:
            win = MaintenanceWindowModel(
                id=generate_uuid7(),
                device_id=dev.id if dev else None,
                organization_id=target_org_id,
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
        ("Web Server 02 (Nginx)", 19.2),
        ("infrawatch-postgres", 1.8),
        ("infrawatch-redis", 1.2),
        ("SW-CORE-LUANDA-01", 2.1),
        ("SW-CORE-LUANDA-02", 2.3),
        ("RTR-EDGE-LUANDA-01", 3.5),
        ("API-GATEWAY-PROD", 14.8),
        ("DB-REPLICA-02", 5.2),
        ("SNMP Simulator Gateway", 8.4),
        ("DWDM-TALATONA-01", 6.1),
        ("spot", 12.0),
        ("Play 5", 22.0),
        ("vivo-Y55A", 35.0),
    ]

    inserted_count = 0

    max_id_res = await session.execute(select(func.max(MetricModel.id)))
    current_id: int = (max_id_res.scalar_one_or_none() or 0) + 1

    for dev_name, base_latency in key_device_names:
        dev = devices.get(dev_name)
        if not dev:
            continue

        target_org_id = dev.organization_id or org_id

        # Idempotência: se já houver medições recentes para este dispositivo, pula
        recent_check = await session.execute(
            select(func.count(MetricModel.id)).where(
                MetricModel.device_id == dev.id,
                MetricModel.timestamp >= now - timedelta(hours=3),
            )
        )
        count = recent_check.scalar_one_or_none() or 0
        if count > 0:
            logger.info(
                "Métricas recentes já presentes para %s. Pulando injeção sintética.", dev_name
            )
            continue

        # Injeta 24 pontos históricos (1 por hora)
        for h in range(24, 0, -1):
            ts = now - timedelta(hours=h)
            variation = ((h % 5) - 2) * 0.4
            latency_val = max(1.0, round(base_latency + variation, 2))

            metric = MetricModel(
                id=current_id,
                device_id=dev.id,
                organization_id=target_org_id,
                metric_type="latency_ms",
                value=latency_val,
                packet_loss=0.0 if h % 8 != 0 else 1.5,
                status="UP" if h % 12 != 0 else "DEGRADED",
                timestamp=ts,
            )
            current_id += 1
            session.add(metric)
            inserted_count += 1

        # Injeta métricas de hardware (CPU / RAM / Disco) para servidores e dispositivos SNMP
        if dev.category in ("SERVER", "ROUTER", "SWITCH", "DATABASE") or str(dev.protocol).lower() == "snmp":
            cpu_val = round(15.0 + (dev.id.int % 40) + (base_latency % 10), 1)
            mem_val = round(35.0 + (dev.id.int % 30) + (base_latency % 8), 1)
            disk_val = round(28.0 + (dev.id.int % 25), 1)

            session.add(
                MetricModel(
                    id=current_id,
                    device_id=dev.id,
                    organization_id=target_org_id,
                    metric_type="cpu_usage_pct",
                    value=cpu_val,
                    status="UP",
                    timestamp=now,
                )
            )
            current_id += 1

            session.add(
                MetricModel(
                    id=current_id,
                    device_id=dev.id,
                    organization_id=target_org_id,
                    metric_type="memory_usage_pct",
                    value=mem_val,
                    status="UP",
                    timestamp=now,
                )
            )
            current_id += 1

            session.add(
                MetricModel(
                    id=current_id,
                    device_id=dev.id,
                    organization_id=target_org_id,
                    metric_type="disk_usage_pct",
                    value=disk_val,
                    status="UP",
                    timestamp=now,
                )
            )
            current_id += 1
            inserted_count += 3

            # Atualiza cache Redis para o dashboard NOC e inspeção
            try:
                redis = get_redis_client()
                if redis:
                    cache_key = f"infrawatch:device:{dev.id}:hardware_telemetry"
                    await redis.set(
                        cache_key,
                        json.dumps({
                            "cpu_usage_pct": cpu_val,
                            "memory_usage_pct": mem_val,
                            "disk_usage_pct": disk_val,
                            "collected_at": now.isoformat(),
                            "zabbix_host_id": (dev.thresholds or {}).get("zabbix_host_id"),
                        }),
                        ex=86400,
                    )
            except Exception:
                pass

    if inserted_count > 0:
        logger.info(
            "Série temporal de métricas inserida: %d pontos históricos gerados.", inserted_count
        )
    await session.flush()


async def seed_topology(
    session: AsyncSession,
    orgs: dict[str, UUID] | UUID,
    devices: dict[str, DeviceModel],
) -> None:
    """Cadastra nós e arestas de topologia em grafo de forma idempotente."""
    if isinstance(orgs, UUID):
        orgs_map = {"infrawatch-lab": orgs}
        default_org = orgs
    else:
        orgs_map = orgs
        default_org = orgs.get("infrawatch-lab") or next(iter(orgs.values()))

    unitel_org_id = orgs_map.get("unitel-angola", default_org)
    banco_org_id = orgs_map.get("banco-sol", default_org)
    lab_org_id = orgs_map.get("infrawatch-lab", default_org)
    sonangol_org_id = orgs_map.get("sonangol", default_org)

    nodes_data: list[dict[str, Any]] = [
        # --- UNITEL ANGOLA ---
        {
            "label": "RT-EDGE-01",
            "node_type": "router",
            "device_name": "RTR-EDGE-LUANDA-01",
            "ip_address": "10.0.0.1",
            "cluster": "CLUSTER LUANDA-01",
            "position_x": 400.0,
            "position_y": 100.0,
            "org_id": unitel_org_id,
        },
        {
            "label": "SW-CORE-LUANDA-01",
            "node_type": "switch",
            "device_name": "SW-CORE-LUANDA-01",
            "ip_address": "10.0.1.1",
            "cluster": "CLUSTER LUANDA-01",
            "position_x": 300.0,
            "position_y": 280.0,
            "org_id": unitel_org_id,
        },
        {
            "label": "SW-CORE-LUANDA-02",
            "node_type": "switch",
            "device_name": "SW-CORE-LUANDA-02",
            "ip_address": "10.0.1.2",
            "cluster": "CLUSTER LUANDA-01",
            "position_x": 550.0,
            "position_y": 280.0,
            "org_id": unitel_org_id,
        },
        {
            "label": "RT-BRANCH-BENGUELA",
            "node_type": "router",
            "device_name": "RT-BRANCH-BENGUELA",
            "ip_address": "172.16.20.1",
            "cluster": "CLUSTER BENGUELA-01",
            "position_x": 150.0,
            "position_y": 450.0,
            "org_id": unitel_org_id,
        },
        # --- BANCO SOL S.A. ---
        {
            "label": "API-GATEWAY-PROD",
            "node_type": "server",
            "device_name": "API-GATEWAY-PROD",
            "ip_address": "10.0.2.15",
            "cluster": "CLUSTER BANCO SOL",
            "position_x": 400.0,
            "position_y": 150.0,
            "org_id": banco_org_id,
        },
        {
            "label": "DB-REPLICA-02",
            "node_type": "database",
            "device_name": "DB-REPLICA-02",
            "ip_address": "10.0.2.20",
            "cluster": "CLUSTER BANCO SOL",
            "position_x": 400.0,
            "position_y": 380.0,
            "org_id": banco_org_id,
        },
        # --- INFRAWATCH LAB DEMO ---
        {
            "label": "Router FRR",
            "node_type": "router",
            "device_name": "Router FRR (Core Router)",
            "ip_address": "172.28.0.10",
            "cluster": "LAB DEMO",
            "position_x": 400.0,
            "position_y": 80.0,
            "org_id": lab_org_id,
        },
        {
            "label": "Web Server 01",
            "node_type": "server",
            "device_name": "Web Server 01 (Nginx)",
            "ip_address": "172.28.0.21",
            "cluster": "LAB DEMO",
            "position_x": 250.0,
            "position_y": 260.0,
            "org_id": lab_org_id,
        },
        {
            "label": "Web Server 02",
            "node_type": "server",
            "device_name": "Web Server 02 (Nginx)",
            "ip_address": "172.28.0.22",
            "cluster": "LAB DEMO",
            "position_x": 550.0,
            "position_y": 260.0,
            "org_id": lab_org_id,
        },
        {
            "label": "PostgreSQL Database",
            "node_type": "database",
            "device_name": "PostgreSQL Database",
            "ip_address": "postgres",
            "cluster": "LAB DEMO",
            "position_x": 250.0,
            "position_y": 460.0,
            "org_id": lab_org_id,
        },
        {
            "label": "Redis Cache",
            "node_type": "database",
            "device_name": "Redis Cache & Streams",
            "ip_address": "redis",
            "cluster": "LAB DEMO",
            "position_x": 550.0,
            "position_y": 460.0,
            "org_id": lab_org_id,
        },
        {
            "label": "SNMP Simulator Gateway",
            "node_type": "router",
            "device_name": "SNMP Simulator Gateway",
            "ip_address": "172.28.0.11",
            "cluster": "LAB DEMO",
            "position_x": 400.0,
            "position_y": 600.0,
            "org_id": lab_org_id,
        },
        # --- SONANGOL LOGISTICS ---
        {
            "label": "DWDM-TALATONA-01",
            "node_type": "router",
            "device_name": "DWDM-TALATONA-01",
            "ip_address": "10.0.3.50",
            "cluster": "SONANGOL TALATONA",
            "position_x": 400.0,
            "position_y": 200.0,
            "org_id": sonangol_org_id,
        },
    ]

    nodes_map: dict[tuple[UUID, str], TopologyNodeModel] = {}
    for item in nodes_data:
        dev = devices.get(str(item["device_name"]))
        label_str = str(item["label"])
        node_stmt = select(TopologyNodeModel).where(
            TopologyNodeModel.organization_id == item["org_id"],
            TopologyNodeModel.label == label_str,
        )
        existing = (await session.execute(node_stmt)).scalars().first()
        if existing:
            existing.ip_address = str(item["ip_address"]) if item["ip_address"] else None
            existing.cluster = str(item["cluster"]) if item["cluster"] else None
            existing.position_x = float(item["position_x"]) if item["position_x"] is not None else None
            existing.position_y = float(item["position_y"]) if item["position_y"] is not None else None
            if dev:
                existing.device_id = dev.id
            nodes_map[(item["org_id"], label_str)] = existing
        else:
            node = TopologyNodeModel(
                id=generate_uuid7(),
                organization_id=item["org_id"],
                label=label_str,
                node_type=str(item["node_type"]),
                device_id=dev.id if dev else None,
                ip_address=str(item["ip_address"]) if item["ip_address"] else None,
                cluster=str(item["cluster"]) if item["cluster"] else None,
                position_x=float(item["position_x"]) if item["position_x"] is not None else None,
                position_y=float(item["position_y"]) if item["position_y"] is not None else None,
            )
            session.add(node)
            nodes_map[(item["org_id"], label_str)] = node

    await session.flush()

    edges_data: list[dict[str, Any]] = [
        # --- UNITEL ANGOLA ---
        {
            "src": "RT-EDGE-01",
            "dst": "SW-CORE-LUANDA-01",
            "link_type": "fiber",
            "bandwidth_gbps": 100.0,
            "port_src": "100GE 1/1",
            "port_dst": "100GE 1/0/1",
            "org_id": unitel_org_id,
        },
        {
            "src": "SW-CORE-LUANDA-01",
            "dst": "SW-CORE-LUANDA-02",
            "link_type": "fiber",
            "bandwidth_gbps": 100.0,
            "port_src": "100GE 1/0/2",
            "port_dst": "100GE 1/0/2",
            "org_id": unitel_org_id,
        },
        {
            "src": "SW-CORE-LUANDA-01",
            "dst": "RT-BRANCH-BENGUELA",
            "link_type": "fiber",
            "bandwidth_gbps": 10.0,
            "port_src": "100GE 1/0/18",
            "port_dst": "sfp-sfpplus1",
            "org_id": unitel_org_id,
        },
        # --- BANCO SOL S.A. ---
        {
            "src": "API-GATEWAY-PROD",
            "dst": "DB-REPLICA-02",
            "link_type": "ethernet",
            "bandwidth_gbps": 10.0,
            "port_src": "eth0",
            "port_dst": "eth0",
            "org_id": banco_org_id,
        },
        # --- INFRAWATCH LAB DEMO ---
        {
            "src": "Router FRR",
            "dst": "Web Server 01",
            "link_type": "ethernet",
            "bandwidth_gbps": 10.0,
            "port_src": "eth1",
            "port_dst": "eth0",
            "org_id": lab_org_id,
        },
        {
            "src": "Router FRR",
            "dst": "Web Server 02",
            "link_type": "ethernet",
            "bandwidth_gbps": 10.0,
            "port_src": "eth2",
            "port_dst": "eth0",
            "org_id": lab_org_id,
        },
        {
            "src": "Web Server 01",
            "dst": "PostgreSQL Database",
            "link_type": "ethernet",
            "bandwidth_gbps": 10.0,
            "port_src": "eth0",
            "port_dst": "eth0",
            "org_id": lab_org_id,
        },
        {
            "src": "Web Server 01",
            "dst": "Redis Cache",
            "link_type": "ethernet",
            "bandwidth_gbps": 10.0,
            "port_src": "eth0",
            "port_dst": "eth0",
            "org_id": lab_org_id,
        },
        {
            "src": "Router FRR",
            "dst": "SNMP Simulator Gateway",
            "link_type": "ethernet",
            "bandwidth_gbps": 1.0,
            "port_src": "eth3",
            "port_dst": "eth0",
            "org_id": lab_org_id,
        },
    ]

    for item in edges_data:
        src_node = nodes_map.get((item["org_id"], str(item["src"])))
        dst_node = nodes_map.get((item["org_id"], str(item["dst"])))
        if not src_node or not dst_node:
            continue

        edge_stmt = select(TopologyEdgeModel).where(
            TopologyEdgeModel.organization_id == item["org_id"],
            TopologyEdgeModel.source_node_id == src_node.id,
            TopologyEdgeModel.target_node_id == dst_node.id,
        )
        existing_edge = (await session.execute(edge_stmt)).scalars().first()
        if existing_edge:
            existing_edge.link_type = str(item["link_type"])
            existing_edge.bandwidth_gbps = float(item["bandwidth_gbps"])
            existing_edge.port_src = str(item["port_src"]) if item["port_src"] else None
            existing_edge.port_dst = str(item["port_dst"]) if item["port_dst"] else None
        else:
            edge = TopologyEdgeModel(
                id=generate_uuid7(),
                organization_id=item["org_id"],
                source_node_id=src_node.id,
                target_node_id=dst_node.id,
                link_type=str(item["link_type"]),
                bandwidth_gbps=float(item["bandwidth_gbps"]),
                port_src=str(item["port_src"]) if item["port_src"] else None,
                port_dst=str(item["port_dst"]) if item["port_dst"] else None,
            )
            session.add(edge)

    await session.flush()
    logger.info("Topologia em grafo semeada com sucesso (%d nós).", len(nodes_data))


async def seed_audit_logs(
    session: AsyncSession,
    orgs: dict[str, UUID] | UUID,
    users: dict[str, UserModel],
) -> None:
    """Cadastra trilha de auditoria encadeada criptograficamente."""
    stmt = select(func.count(AuditLogModel.id))
    count = (await session.execute(stmt)).scalar_one_or_none() or 0
    if count > 0:
        logger.info("Logs de auditoria já existentes (%d registros). Pulando seed.", count)
        return

    now = datetime.now(UTC)
    if isinstance(orgs, UUID):
        orgs_map = {"infrawatch-lab": orgs}
        default_org = orgs
    else:
        orgs_map = orgs
        default_org = orgs.get("infrawatch-lab") or next(iter(orgs.values()))

    daniel = users.get("daniel.ndonda@infrawatch.ao") or users.get(
        get_settings().ADMIN_EMAIL.strip().lower()
    )
    gestor_banco = users.get("gestor.ti@bancosol.ao")
    operador = users.get("operador.noc@infrawatch.ao") or users.get("operator@infrawatch.internal")

    audit_events: list[dict[str, Any]] = [
        {
            "org_id": orgs_map.get("infrawatch-lab", default_org),
            "actor_id": daniel.id if daniel else None,
            "action": "SYSTEM_GENESIS",
            "resource_type": "PLATFORM",
            "resource_id": "infrawatch-core",
            "result": AuditResult.SUCCESS.value,
            "details": {"version": "2.0.0", "engine": "TimescaleDB/FastAPI"},
            "ip_address": "127.0.0.1",
            "created_at": now - timedelta(hours=10),
        },
        {
            "org_id": orgs_map.get("banco-sol", default_org),
            "actor_id": gestor_banco.id if gestor_banco else None,
            "action": "SESSION_MFA",
            "resource_type": "AUTH_SESSION",
            "resource_id": "Sessão BSol-042",
            "result": AuditResult.SUCCESS.value,
            "details": {"auth_method": "TOTP Corporativo", "session_duration": "4 hours"},
            "ip_address": "197.149.33.10",
            "created_at": now - timedelta(hours=6),
        },
        {
            "org_id": orgs_map.get("banco-sol", default_org),
            "actor_id": gestor_banco.id if gestor_banco else None,
            "action": "SLA_EXEMPT_REQ",
            "resource_type": "SLA_EXEMPTION",
            "resource_id": "api.bancosol.ao",
            "result": AuditResult.SUCCESS.value,
            "details": {
                "reason": "Janela técnica de manutenção autorizada pelo conselho",
                "endpoint": "api.bancosol.ao",
                "window_hours": 2,
            },
            "ip_address": "197.149.33.10",
            "created_at": now - timedelta(hours=5),
        },
        {
            "org_id": orgs_map.get("unitel-angola", default_org),
            "actor_id": operador.id if operador else None,
            "action": "INCIDENT_ACK",
            "resource_type": "INCIDENT",
            "resource_id": "#INC-8492",
            "result": AuditResult.SUCCESS.value,
            "details": {
                "incident_id": "#INC-8492",
                "title": "SW-CORE-LUANDA-01 está Inalcançável (DOWN)",
                "operator_notes": "Acionamento de equipe de campo para verificação da fibra apagada.",
            },
            "ip_address": "197.149.22.45",
            "created_at": now - timedelta(hours=3),
        },
        {
            "org_id": orgs_map.get("infrawatch-lab", default_org),
            "actor_id": daniel.id if daniel else None,
            "action": "DEVICE_PAUSED",
            "resource_type": "NETWORK_DEVICE",
            "resource_id": "SW-CORE-LUANDA-01",
            "result": AuditResult.SUCCESS.value,
            "details": {
                "device_id": "SW-CORE-LUANDA-01",
                "pause_reason": "Manutenção preventiva emergencial de link óptico",
                "authorized_by": "Daniel Ndonda",
            },
            "ip_address": "197.149.20.12",
            "created_at": now - timedelta(hours=1),
        },
    ]

    prev_hash = None
    for item in audit_events:
        log_id = generate_uuid7()
        rec_hash = compute_audit_hash(
            id=str(log_id),
            actor_user_id=str(item["actor_id"]) if item["actor_id"] else None,
            action=item["action"],
            resource_type=item["resource_type"],
            resource_id=item["resource_id"],
            result=item["result"],
            details=item["details"],
            created_at=item["created_at"],
            previous_hash=prev_hash,
        )

        log_model = AuditLogModel(
            id=log_id,
            organization_id=item["org_id"],
            actor_user_id=item["actor_id"],
            action=item["action"],
            resource_type=item["resource_type"],
            resource_id=item["resource_id"],
            result=item["result"],
            details=item["details"],
            ip_address=item["ip_address"],
            created_at=item["created_at"],
            previous_hash=prev_hash,
            hash=rec_hash,
        )
        session.add(log_model)
        prev_hash = rec_hash

    await session.flush()
    logger.info("Cadeia criptográfica de auditoria inserida com sucesso (5 registros encadeados).")


async def sync_zabbix_hosts_on_seed(
    session: AsyncSession,
    devices: dict[str, DeviceModel],
) -> None:
    """Registra e sincroniza dispositivos de demonstração no Zabbix Server em tempo de seed."""
    settings = get_settings()
    if not getattr(settings, "ZABBIX_ENABLED", False):
        logger.info("Zabbix desativado (ZABBIX_ENABLED=False). Pulando provisionamento no Zabbix.")
        return

    try:
        from src.integrations.zabbix.client import ZabbixClient
        from src.workers.daemons.zabbix_sync_worker import build_zabbix_snmp_interface_details

        api_url = settings.ZABBIX_API_URL
        api_token = settings.ZABBIX_API_TOKEN
        username = settings.ZABBIX_USER
        password = settings.ZABBIX_PASSWORD

        async with ZabbixClient(
            api_url=api_url,
            api_token=api_token,
            username=username,
            password=password,
            timeout=5.0,
        ) as client:
            version = await client.get_api_version()
            logger.info("Zabbix Server acessível para seed (Versão: %s)", version)

            existing_hosts = await client.get_hosts()
            existing_map = {h.host: h.hostid for h in existing_hosts}
            existing_name_map = {h.name: h.hostid for h in existing_hosts}

            for name, device in devices.items():
                thresholds = dict(device.thresholds or {})
                protocol = str(device.protocol).lower()
                snmp_conf = thresholds.get("snmp_config") or thresholds.get("snmp")

                if protocol == "snmp" or snmp_conf or "zabbix_host_id" in thresholds:
                    host_key = device.hostname or name
                    target_hostid = existing_map.get(host_key) or existing_name_map.get(name) or existing_map.get(name)

                    interface_details = build_zabbix_snmp_interface_details(
                        snmp_config=snmp_conf,
                        port=device.port or 161,
                        ip_address=device.ip_address,
                    )

                    is_network_device = any(
                        k in name.lower() for k in ("router", "switch", "dwdm", "cisco", "sw-", "rt-")
                    )
                    template_id = "10226" if is_network_device else "10248"

                    if target_hostid:
                        try:
                            await client.call(
                                "host.update",
                                params={
                                    "hostid": str(target_hostid),
                                    "host": host_key,
                                    "name": name,
                                    "interfaces": [interface_details],
                                },
                            )
                            logger.info("Host Zabbix atualizado no seed: %s (hostid=%s)", name, target_hostid)
                        except Exception as upd_err:
                            logger.debug("Aviso ao atualizar host %s no Zabbix: %s", name, upd_err)
                    else:
                        try:
                            res = await client.call(
                                "host.create",
                                params={
                                    "host": host_key,
                                    "name": name,
                                    "interfaces": [interface_details],
                                    "groups": [{"groupid": "2"}],
                                    "templates": [{"templateid": template_id}],
                                },
                            )
                            if res and isinstance(res, dict) and "hostids" in res and res["hostids"]:
                                target_hostid = str(res["hostids"][0])
                                logger.info("Host Zabbix criado com sucesso no seed: %s (hostid=%s)", name, target_hostid)
                        except Exception as crt_err:
                            logger.warning("Falha ao criar host %s no Zabbix: %s", name, crt_err)

                    if target_hostid:
                        thresholds["zabbix_host_id"] = str(target_hostid)
                        device.thresholds = thresholds
                        session.add(device)

            await session.flush()
    except Exception as exc:
        logger.warning("Não foi possível sincronizar hosts com Zabbix durante o seed: %s", exc)


async def seed_all() -> None:
    """Executa a carga completa e idempotente da base de demonstração."""
    session_factory = get_session_factory()

    async with session_factory() as session:
        logger.info("Iniciando rotina de seed da base de dados...")

        # 1. Organizações Multi-Tenant
        orgs = await ensure_demo_organizations(session)
        default_org_id = orgs["infrawatch-lab"]

        # 2. Usuários (com hash Argon2id e múltiplos papéis RBAC)
        users = await ensure_demo_users(session, orgs)

        # 3. Dispositivos de rede e infraestrutura
        devices = await seed_devices(session, orgs)

        # 4. Incidentes
        await seed_incidents(session, orgs, devices, users)

        # 5. Janelas de manutenção e isenções de SLA
        await seed_maintenance_windows(session, orgs, devices)

        # 6. Notificações in-app
        await seed_notifications(session, users)

        # 7. Séries temporais de telemetria
        await seed_metrics(session, default_org_id, devices)

        # 8. Topologia em grafo
        await seed_topology(session, orgs, devices)

        # 9. Trilha criptográfica de auditoria
        await seed_audit_logs(session, orgs, users)

        # 10. Provisionamento e Sincronização Zabbix JSON-RPC
        await sync_zabbix_hosts_on_seed(session, devices)

        await session.commit()
        logger.info("Seed completo finalizado com sucesso e idempotência garantida!")


if __name__ == "__main__":
    asyncio.run(seed_all())
