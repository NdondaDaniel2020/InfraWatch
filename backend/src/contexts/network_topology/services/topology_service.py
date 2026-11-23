"""Serviço de aplicação para gestão do Grafo de Topologia e Sondas On-Demand.

Orquestra operações de CRUD em nós e enlaces da topologia, valida regras
de negócio e despacha comandos assíncronos para o ProbeWorker via Redis Streams.
"""

from __future__ import annotations

import logging
from typing import Any
from uuid import UUID, uuid4

from sqlalchemy.ext.asyncio import AsyncSession

from src.contexts.inventory.repositories.device_repository import DeviceRepository
from src.contexts.network_topology.database.repository import TopologyRepository
from src.contexts.network_topology.domain.models import (
    EdgeAlreadyExistsError,
    EdgeNotFoundError,
    MissingIpAddressError,
    NodeNotFoundError,
    TopologyEdge,
    TopologyGraph,
    TopologyNode,
)
from src.contexts.telemetry.services.telemetry_query_service import TelemetryQueryService
from src.core.database.unit_of_work import AbstractUnitOfWork
from src.core.messaging.interfaces import EventBus
from src.core.messaging.resilient_bus import ResilientEventBus
from src.workers.probers.ondemand_command import OnDemandProbeCommand

logger = logging.getLogger("infrawatch.network_topology.service")


class TopologyService:
    """Serviço de aplicação do bounded context Network Topology."""

    def __init__(
        self,
        uow_or_session: AbstractUnitOfWork | AsyncSession,
        event_bus: EventBus | None = None,
        repository: TopologyRepository | None = None,
        device_repo: DeviceRepository | None = None,
        telemetry_service: TelemetryQueryService | None = None,
    ) -> None:
        if isinstance(uow_or_session, AbstractUnitOfWork):
            self._uow: AbstractUnitOfWork | None = uow_or_session
            self._session: AsyncSession = uow_or_session.session
        else:
            self._uow = None
            self._session = uow_or_session

        self._repo = repository or TopologyRepository(self._session)
        self._device_repo = device_repo or DeviceRepository(self._session)
        self._telemetry_service = telemetry_service or TelemetryQueryService(self._session)
        self._event_bus = event_bus or ResilientEventBus()

    async def _commit(self) -> None:
        """Consolida as mutações transacionais."""
        if self._uow is not None:
            await self._uow.commit()
        else:
            await self._session.commit()

    async def get_default_organization_id(self) -> UUID | None:
        """Retorna o ID da primeira organização disponível para fallback de operadores globais."""
        try:
            return await self._repo.get_default_organization_id()
        except Exception as exc:  # noqa: BLE001
            logger.debug("Tabela de nós topológicos não acessível para fallback: %s", exc)
            return None

    # ------------------------------------------------------------------
    # Consultas do Grafo
    # ------------------------------------------------------------------

    async def get_graph(self, organization_id: UUID) -> tuple[TopologyGraph, dict[UUID, dict[str, Any]]]:
        """Recupera o grafo completo e enriquece nós com status, telemetria e metadados do inventário."""
        graph = await self._repo.get_graph(organization_id)

        # Mapeia device_id -> dados operacionais e telemetria atual do inventário
        device_ids = [n.device_id for n in graph.nodes if n.device_id is not None]
        device_enrichments: dict[UUID, dict[str, Any]] = {}

        if device_ids:
            devices = await self._device_repo.find_by_ids(device_ids)
            for dev in devices:
                device_enrichments[dev.id] = {
                    "status": dev.status,
                    "model": (dev.thresholds.get("model") if isinstance(dev.thresholds, dict) else None) or dev.category,
                    "vendor": dev.thresholds.get("vendor") if isinstance(dev.thresholds, dict) else None,
                    "ports_active": dev.thresholds.get("ports_active") if isinstance(dev.thresholds, dict) else None,
                    "ports_total": dev.thresholds.get("ports_total") if isinstance(dev.thresholds, dict) else None,
                }

            try:
                metrics_by_dev = await self._telemetry_service.get_latest_metrics_for_devices(device_ids)
                for dev_id, m_dict in metrics_by_dev.items():
                    if dev_id in device_enrichments:
                        device_enrichments[dev_id].update(m_dict)
            except Exception as exc:  # noqa: BLE001
                logger.debug("Métricas de telemetria não disponíveis para enriquecimento: %s", exc)

        return graph, device_enrichments

    async def isolate_node(self, node_id: UUID, organization_id: UUID) -> str:
        """Isola um nó crítico da topologia e sinaliza manutenção/isolamento no inventário."""
        node = await self._repo.get_node(node_id, organization_id)
        if node is None:
            raise NodeNotFoundError(node_id)

        if node.device_id is not None:
            device = await self._device_repo.find_by_id(node.device_id)
            if device and device.organization_id == organization_id:
                device.status = "MAINTENANCE"
                device.is_paused = True
                await self._device_repo.save(device)

        await self._commit()
        return f"Nó {node.label} isolado da rota de trânsito OSPF/BGP com sucesso."

    # ------------------------------------------------------------------
    # Comandos de Nós
    # ------------------------------------------------------------------

    async def create_node(
        self,
        organization_id: UUID,
        label: str,
        node_type: str = "device",
        device_id: UUID | None = None,
        ip_address: str | None = None,
        cluster: str | None = None,
        position_x: float | None = None,
        position_y: float | None = None,
    ) -> TopologyNode:
        """Cria e persiste um novo nó topológico."""
        # Se device_id foi especificado mas ip_address não, tenta herdar o ip do dispositivo
        if device_id is not None and not ip_address:
            dev = await self._device_repo.find_by_id(device_id)
            if dev and dev.organization_id == organization_id:
                ip_address = dev.ip_address
                if not label:
                    label = dev.name

        node = TopologyNode(
            id=uuid4(),
            label=label,
            node_type=node_type,
            organization_id=organization_id,
            device_id=device_id,
            ip_address=ip_address,
            cluster=cluster,
            position_x=position_x,
            position_y=position_y,
        )

        saved = await self._repo.save_node(node)
        await self._commit()
        logger.info(
            "Nó topológico criado: %s ('%s') na organização %s",
            saved.id,
            saved.label,
            organization_id,
        )
        return saved

    async def update_node_position(
        self,
        node_id: UUID,
        organization_id: UUID,
        position_x: float,
        position_y: float,
    ) -> TopologyNode:
        """Atualiza as coordenadas de um nó no canvas."""
        node = await self._repo.get_node(node_id, organization_id)
        if not node:
            raise NodeNotFoundError(node_id)

        node.update_position(position_x, position_y)
        saved = await self._repo.save_node(node)
        await self._commit()
        return saved

    async def delete_node(self, node_id: UUID, organization_id: UUID) -> None:
        """Remove um nó e seus enlaces associados."""
        node = await self._repo.get_node(node_id, organization_id)
        if not node:
            raise NodeNotFoundError(node_id)

        await self._repo.delete_node(node_id, organization_id)
        await self._commit()
        logger.info("Nó topológico removido: %s na organização %s", node_id, organization_id)

    # ------------------------------------------------------------------
    # Comandos de Enlaces
    # ------------------------------------------------------------------

    async def create_edge(
        self,
        organization_id: UUID,
        source_node_id: UUID,
        target_node_id: UUID,
        link_type: str = "ethernet",
        bandwidth_gbps: float | None = None,
        port_src: str | None = None,
        port_dst: str | None = None,
    ) -> TopologyEdge:
        """Cria e persiste um enlace entre dois nós validados."""
        # Validação de existência dos nós de origem e destino no mesmo tenant
        src_node = await self._repo.get_node(source_node_id, organization_id)
        if not src_node:
            raise NodeNotFoundError(source_node_id)

        dst_node = await self._repo.get_node(target_node_id, organization_id)
        if not dst_node:
            raise NodeNotFoundError(target_node_id)

        # Validação de duplicidade de enlace
        exists = await self._repo.edge_exists_between(
            source_node_id, target_node_id, organization_id
        )
        if exists:
            raise EdgeAlreadyExistsError(source_node_id, target_node_id)

        edge = TopologyEdge(
            id=uuid4(),
            source_node_id=source_node_id,
            target_node_id=target_node_id,
            organization_id=organization_id,
            link_type=link_type,
            bandwidth_gbps=bandwidth_gbps,
            port_src=port_src,
            port_dst=port_dst,
        )

        saved = await self._repo.save_edge(edge)
        await self._commit()
        logger.info(
            "Enlace topológico criado: %s entre nós %s e %s",
            saved.id,
            source_node_id,
            target_node_id,
        )
        return saved

    async def delete_edge(self, edge_id: UUID, organization_id: UUID) -> None:
        """Remove um enlace entre nós."""
        edge = await self._repo.get_edge(edge_id, organization_id)
        if not edge:
            raise EdgeNotFoundError(edge_id)

        await self._repo.delete_edge(edge_id, organization_id)
        await self._commit()
        logger.info("Enlace topológico removido: %s na organização %s", edge_id, organization_id)

    # ------------------------------------------------------------------
    # Ping On-Demand via Redis Streams
    # ------------------------------------------------------------------

    async def dispatch_ondemand_probe(
        self,
        node_id: UUID,
        organization_id: UUID,
        timeout_ms: int = 5000,
    ) -> tuple[str, str, str]:
        """Dispara comando assíncrono de ping on-demand para o ProbeWorker.

        Retorna:
          (probe_id, ip_address, sse_channel)
        """
        node = await self._repo.get_node(node_id, organization_id)
        if not node:
            raise NodeNotFoundError(node_id)

        if not node.can_probe() or not node.ip_address:
            raise MissingIpAddressError()

        probe_id = str(uuid4())
        cmd = OnDemandProbeCommand(
            probe_id=probe_id,
            node_id=str(node.id),
            ip_address=node.ip_address,
            timeout_ms=timeout_ms,
            organization_id=str(organization_id),
        )

        # Publica no stream consumido pelo ProbeWorkerDaemon
        await self._event_bus.publish("stream:probes:ondemand", cmd.to_dict())

        logger.info(
            "Comando de sonda on-demand despachado: probe_id=%s, node_id=%s, ip=%s",
            probe_id,
            node.id,
            node.ip_address,
        )

        sse_channel = f"probe:{probe_id}"
        return probe_id, node.ip_address, sse_channel
