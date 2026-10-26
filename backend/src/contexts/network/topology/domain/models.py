"""Entidades de Domínio Puro — Topologia de Rede.

Regras:
  - Zero dependências externas (sem FastAPI, SQLAlchemy, Pydantic, Redis).
  - Entidades com validações invariantes encapsuladas nos métodos.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import UTC, datetime
from uuid import UUID

# ---------------------------------------------------------------------------
# Enums de Domínio
# ---------------------------------------------------------------------------

VALID_NODE_TYPES = frozenset({"device", "service", "external", "cluster"})
VALID_LINK_TYPES = frozenset({"fiber", "ethernet", "vpn", "logical", "wireless"})


# ---------------------------------------------------------------------------
# Exceções de Domínio
# ---------------------------------------------------------------------------


class TopologyDomainError(Exception):
    """Erro base para violações de regras de domínio de topologia."""


class InvalidNodeTypeError(TopologyDomainError):
    """Tipo de nó inválido."""

    def __init__(self, node_type: str) -> None:
        super().__init__(
            f"Tipo de nó inválido: '{node_type}'. "
            f"Tipos aceitos: {sorted(VALID_NODE_TYPES)}"
        )


class InvalidLinkTypeError(TopologyDomainError):
    """Tipo de enlace inválido."""

    def __init__(self, link_type: str) -> None:
        super().__init__(
            f"Tipo de enlace inválido: '{link_type}'. "
            f"Tipos aceitos: {sorted(VALID_LINK_TYPES)}"
        )


class SelfLoopEdgeError(TopologyDomainError):
    """Um enlace não pode conectar um nó a si mesmo."""

    def __init__(self, node_id: UUID) -> None:
        super().__init__(
            f"Enlace auto-referente inválido: nó '{node_id}' não pode conectar-se a si mesmo."
        )


class NodeNotFoundError(TopologyDomainError):
    """Nó de topologia não encontrado."""

    def __init__(self, node_id: UUID) -> None:
        super().__init__(f"Nó de topologia '{node_id}' não encontrado.")


class EdgeNotFoundError(TopologyDomainError):
    """Enlace de topologia não encontrado."""

    def __init__(self, edge_id: UUID) -> None:
        super().__init__(f"Enlace de topologia '{edge_id}' não encontrado.")


class EdgeAlreadyExistsError(TopologyDomainError):
    """Já existe um enlace entre os nós especificados."""

    def __init__(self, source_id: UUID, target_id: UUID) -> None:
        super().__init__(
            f"Já existe um enlace cadastrado entre os nós '{source_id}' e '{target_id}'."
        )


class MissingIpAddressError(TopologyDomainError):
    """Nó de tipo 'device' deve ter ip_address para sondas."""

    def __init__(self) -> None:
        super().__init__(
            "Nós do tipo 'device' usados para ping on-demand devem possuir ip_address."
        )


# ---------------------------------------------------------------------------
# Entidade: TopologyNode
# ---------------------------------------------------------------------------


@dataclass
class TopologyNode:
    """Nó do grafo de infraestrutura.

    Representa qualquer entidade topológica: um dispositivo de rede físico,
    um serviço (ex: contêiner Docker), um recurso externo ou um cluster de
    agrupamento visual.

    Invariantes:
      - ``node_type`` deve ser um dos tipos validados em VALID_NODE_TYPES.
      - ``label`` não pode ser vazio.
    """

    id: UUID
    label: str
    node_type: str                   # "device" | "service" | "external" | "cluster"
    organization_id: UUID
    device_id: UUID | None = None    # Referência soft ao inventário
    ip_address: str | None = None    # Endereço IP para ping on-demand
    cluster: str | None = None       # Agrupamento visual (ex: "CLUSTER LUANDA-01")
    position_x: float | None = None  # Coordenada X para layout fixo
    position_y: float | None = None  # Coordenada Y para layout fixo
    created_at: datetime = field(default_factory=lambda: datetime.now(UTC))
    updated_at: datetime = field(default_factory=lambda: datetime.now(UTC))

    def __post_init__(self) -> None:
        self._validate()

    def _validate(self) -> None:
        if not self.label or not self.label.strip():
            raise TopologyDomainError("O campo 'label' do nó não pode ser vazio.")
        if self.node_type not in VALID_NODE_TYPES:
            raise InvalidNodeTypeError(self.node_type)

    def update_position(self, x: float, y: float) -> None:
        """Atualiza as coordenadas visuais do nó no canvas."""
        self.position_x = x
        self.position_y = y
        self.updated_at = datetime.now(UTC)

    def update_label(self, label: str) -> None:
        """Renomeia o nó com validação de invariante."""
        if not label or not label.strip():
            raise TopologyDomainError("O novo label não pode ser vazio.")
        self.label = label
        self.updated_at = datetime.now(UTC)

    def can_probe(self) -> bool:
        """Verifica se o nó possui IP configurado para sondas on-demand."""
        return bool(self.ip_address and self.ip_address.strip())


# ---------------------------------------------------------------------------
# Entidade: TopologyEdge
# ---------------------------------------------------------------------------


@dataclass
class TopologyEdge:
    """Enlace entre dois nós do grafo de infraestrutura.

    Representa uma conexão física ou lógica entre dois TopologyNodes.

    Invariantes:
      - ``source_node_id`` != ``target_node_id`` (sem auto-loops).
      - ``link_type`` deve ser um dos tipos validados em VALID_LINK_TYPES.
      - ``bandwidth_gbps`` deve ser positivo quando fornecido.
    """

    id: UUID
    source_node_id: UUID
    target_node_id: UUID
    organization_id: UUID
    link_type: str = "ethernet"          # "fiber" | "ethernet" | "vpn" | "logical" | "wireless"
    bandwidth_gbps: float | None = None  # Capacidade nominal do enlace
    port_src: str | None = None          # Porta de origem (ex: "GE0/0/1")
    port_dst: str | None = None          # Porta de destino (ex: "GE0/0/24")
    created_at: datetime = field(default_factory=lambda: datetime.now(UTC))
    updated_at: datetime = field(default_factory=lambda: datetime.now(UTC))

    def __post_init__(self) -> None:
        self._validate()

    def _validate(self) -> None:
        if self.source_node_id == self.target_node_id:
            raise SelfLoopEdgeError(self.source_node_id)
        if self.link_type not in VALID_LINK_TYPES:
            raise InvalidLinkTypeError(self.link_type)
        if self.bandwidth_gbps is not None and self.bandwidth_gbps <= 0:
            raise TopologyDomainError(
                f"bandwidth_gbps deve ser positivo, recebido: {self.bandwidth_gbps}"
            )


# ---------------------------------------------------------------------------
# Agregado: TopologyGraph
# ---------------------------------------------------------------------------


@dataclass
class TopologyGraph:
    """Grafo completo de topologia de uma organização.

    Agrega nós e enlaces para consulta e apresentação.
    """

    nodes: list[TopologyNode]
    edges: list[TopologyEdge]

    @property
    def total_nodes(self) -> int:
        return len(self.nodes)

    @property
    def total_edges(self) -> int:
        return len(self.edges)

    @property
    def dominant_cluster(self) -> str | None:
        """Retorna o cluster mais representado no grafo, ou None se não houver."""
        clusters = [n.cluster for n in self.nodes if n.cluster]
        if not clusters:
            return None
        return max(set(clusters), key=clusters.count)
