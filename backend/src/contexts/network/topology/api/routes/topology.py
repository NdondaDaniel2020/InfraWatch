"""Endpoints REST da API de Topologia de Rede e Sondas On-Demand.

Implementa:
  - GET /api/v1/topology/graph: Retorna o grafo completo (nós e enlaces)
  - POST /api/v1/topology/nodes: Cadastra novo nó no grafo
  - PATCH /api/v1/topology/nodes/{node_id}/position: Atualiza posição visual
  - DELETE /api/v1/topology/nodes/{node_id}: Remove nó e seus enlaces
  - POST /api/v1/topology/edges: Cadastra enlace entre nós
  - DELETE /api/v1/topology/edges/{edge_id}: Remove enlace
  - POST /api/v1/topology/nodes/{node_id}/probe: Dispara ping ICMP on-demand
"""

from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status

from src.contexts.iam.api.dependencies import (
    CurrentUserDep,
    enforce_tenant_scope,
    require_roles,
)
from src.contexts.iam.domain.enums import UserRole
from src.contexts.network.topology.api.dependencies import TopologyServiceDep
from src.contexts.network.topology.domain.models import (
    EdgeAlreadyExistsError,
    EdgeNotFoundError,
    MissingIpAddressError,
    NodeNotFoundError,
    TopologyDomainError,
)
from src.contexts.network.topology.schemas import (
    CreateTopologyEdgeRequest,
    CreateTopologyNodeRequest,
    ProbeDispatchResponse,
    TopologyEdgeResponse,
    TopologyGraphResponse,
    TopologyNodeResponse,
    TriggerOnDemandProbeRequest,
    UpdateTopologyNodePositionRequest,
)

router = APIRouter(prefix="/api/v1/topology", tags=["Network & Topology"])

READ_ROLES = [
    UserRole.SUPER_ADMIN,
    UserRole.NOC_OPERATOR,
    UserRole.ORG_ADMIN,
    UserRole.CLIENT_VIEWER,
]

OPERATOR_ROLES = [
    UserRole.SUPER_ADMIN,
    UserRole.NOC_OPERATOR,
]

PROBE_ROLES = [
    UserRole.SUPER_ADMIN,
    UserRole.NOC_OPERATOR,
    UserRole.ORG_ADMIN,
]


def _resolve_tenant_org(user: CurrentUserDep, org_id: UUID | None) -> UUID:
    """Valida e extrai o UUID da organização aplicando as regras de isolamento multi-tenant."""
    target_str = enforce_tenant_scope(org_id, user)
    if not target_str:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="organization_id é obrigatório para acessar os dados de topologia.",
        )
    return UUID(target_str)


# ---------------------------------------------------------------------------
# Grafo Completo
# ---------------------------------------------------------------------------


@router.get(
    "/graph",
    response_model=TopologyGraphResponse,
    summary="Obter grafo de topologia de rede",
    dependencies=[Depends(require_roles(*READ_ROLES))],
)
async def get_topology_graph(
    user: CurrentUserDep,
    service: TopologyServiceDep,
    organization_id: Annotated[UUID | None, Query(description="Filtrar por organização")] = None,
) -> TopologyGraphResponse:
    """Retorna todos os nós, enlaces e clusters da organização para renderização visual."""
    org_id = _resolve_tenant_org(user, organization_id)
    graph, device_statuses = await service.get_graph(org_id)
    return TopologyGraphResponse.from_domain(graph, device_statuses=device_statuses)


# ---------------------------------------------------------------------------
# Gestão de Nós (TopologyNodes)
# ---------------------------------------------------------------------------


@router.post(
    "/nodes",
    response_model=TopologyNodeResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Criar nó de topologia",
    dependencies=[Depends(require_roles(*OPERATOR_ROLES))],
)
async def create_node(
    payload: CreateTopologyNodeRequest,
    user: CurrentUserDep,
    service: TopologyServiceDep,
    organization_id: Annotated[UUID | None, Query(description="Organização do nó")] = None,
) -> TopologyNodeResponse:
    """Cadastra um novo elemento no grafo de topologia da infraestrutura."""
    org_id = _resolve_tenant_org(user, organization_id)
    try:
        node = await service.create_node(
            organization_id=org_id,
            label=payload.label,
            node_type=payload.node_type,
            device_id=payload.device_id,
            ip_address=payload.ip_address,
            cluster=payload.cluster,
            position_x=payload.position_x,
            position_y=payload.position_y,
        )
        return TopologyNodeResponse.from_domain(node)
    except TopologyDomainError as err:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(err)) from err


@router.patch(
    "/nodes/{node_id}/position",
    response_model=TopologyNodeResponse,
    summary="Atualizar coordenadas de nó no canvas",
    dependencies=[Depends(require_roles(*OPERATOR_ROLES))],
)
async def update_node_position(
    node_id: UUID,
    payload: UpdateTopologyNodePositionRequest,
    user: CurrentUserDep,
    service: TopologyServiceDep,
    organization_id: Annotated[UUID | None, Query(description="Organização do nó")] = None,
) -> TopologyNodeResponse:
    """Persiste a nova posição de um nó no canvas interativo."""
    org_id = _resolve_tenant_org(user, organization_id)
    try:
        node = await service.update_node_position(
            node_id=node_id,
            organization_id=org_id,
            position_x=payload.position_x,
            position_y=payload.position_y,
        )
        return TopologyNodeResponse.from_domain(node)
    except NodeNotFoundError as err:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(err)) from err


@router.delete(
    "/nodes/{node_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Remover nó de topologia",
    dependencies=[Depends(require_roles(*OPERATOR_ROLES))],
)
async def delete_node(
    node_id: UUID,
    user: CurrentUserDep,
    service: TopologyServiceDep,
    organization_id: Annotated[UUID | None, Query(description="Organização do nó")] = None,
) -> None:
    """Remove um nó do grafo e todos os enlaces incidentes a ele."""
    org_id = _resolve_tenant_org(user, organization_id)
    try:
        await service.delete_node(node_id, org_id)
    except NodeNotFoundError as err:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(err)) from err


# ---------------------------------------------------------------------------
# Gestão de Enlaces (TopologyEdges)
# ---------------------------------------------------------------------------


@router.post(
    "/edges",
    response_model=TopologyEdgeResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Criar enlace entre nós",
    dependencies=[Depends(require_roles(*OPERATOR_ROLES))],
)
async def create_edge(
    payload: CreateTopologyEdgeRequest,
    user: CurrentUserDep,
    service: TopologyServiceDep,
    organization_id: Annotated[UUID | None, Query(description="Organização do enlace")] = None,
) -> TopologyEdgeResponse:
    """Cadastra uma conexão física ou lógica entre dois nós validados."""
    org_id = _resolve_tenant_org(user, organization_id)
    try:
        edge = await service.create_edge(
            organization_id=org_id,
            source_node_id=payload.source_node_id,
            target_node_id=payload.target_node_id,
            link_type=payload.link_type,
            bandwidth_gbps=payload.bandwidth_gbps,
            port_src=payload.port_src,
            port_dst=payload.port_dst,
        )
        return TopologyEdgeResponse.from_domain(edge)
    except NodeNotFoundError as err:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(err)) from err
    except EdgeAlreadyExistsError as err:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(err)) from err
    except TopologyDomainError as err:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(err)) from err


@router.delete(
    "/edges/{edge_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Remover enlace",
    dependencies=[Depends(require_roles(*OPERATOR_ROLES))],
)
async def delete_edge(
    edge_id: UUID,
    user: CurrentUserDep,
    service: TopologyServiceDep,
    organization_id: Annotated[UUID | None, Query(description="Organização do enlace")] = None,
) -> None:
    """Remove um enlace entre nós."""
    org_id = _resolve_tenant_org(user, organization_id)
    try:
        await service.delete_edge(edge_id, org_id)
    except EdgeNotFoundError as err:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(err)) from err


# ---------------------------------------------------------------------------
# Sonda On-Demand (Ping/ICMP)
# ---------------------------------------------------------------------------


@router.post(
    "/nodes/{node_id}/probe",
    response_model=ProbeDispatchResponse,
    summary="Disparar ping/diagnóstico on-demand em nó",
    dependencies=[Depends(require_roles(*PROBE_ROLES))],
)
async def trigger_ondemand_probe(
    node_id: UUID,
    user: CurrentUserDep,
    service: TopologyServiceDep,
    payload: TriggerOnDemandProbeRequest | None = None,
    organization_id: Annotated[UUID | None, Query(description="Organização do nó")] = None,
) -> ProbeDispatchResponse:
    """Despacha teste ICMP real para o ProbeWorker via Redis Streams.

    Retorna imediatamente probe_id e canal SSE para recepção do resultado em tempo real.
    """
    org_id = _resolve_tenant_org(user, organization_id)
    timeout_ms = payload.timeout_ms if payload else 5000

    try:
        probe_id, ip_address, sse_channel = await service.dispatch_ondemand_probe(
            node_id=node_id,
            organization_id=org_id,
            timeout_ms=timeout_ms,
        )
        return ProbeDispatchResponse(
            probe_id=probe_id,
            node_id=str(node_id),
            ip_address=ip_address,
            sse_channel=sse_channel,
            message="Comando de sonda despachado com sucesso para o ProbeWorker.",
        )
    except NodeNotFoundError as err:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(err)) from err
    except MissingIpAddressError as err:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(err)) from err
