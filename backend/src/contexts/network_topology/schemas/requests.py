"""DTOs Pydantic de entrada (Requests) para o contexto de Topologia."""

from __future__ import annotations

from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class CreateTopologyNodeRequest(BaseModel):
    """Payload para criação manual de nó na topologia."""

    model_config = ConfigDict(frozen=True)

    label: str = Field(..., min_length=1, max_length=255, description="Rótulo visual do nó")
    node_type: str = Field(
        default="device",
        description="Tipo de elemento: 'device' | 'service' | 'external' | 'cluster'",
    )
    device_id: UUID | None = Field(
        default=None, description="Vínculo opcional ao ativo no inventário"
    )
    ip_address: str | None = Field(
        default=None, max_length=45, description="Endereço IP para testes de conectividade"
    )
    cluster: str | None = Field(
        default=None, max_length=255, description="Agrupamento visual ou zona"
    )
    position_x: float | None = Field(default=None, description="Coordenada X no canvas")
    position_y: float | None = Field(default=None, description="Coordenada Y no canvas")


class UpdateTopologyNodePositionRequest(BaseModel):
    """Payload para atualização de posicionamento de nós no canvas."""

    model_config = ConfigDict(frozen=True)

    position_x: float = Field(..., description="Nova coordenada X")
    position_y: float = Field(..., description="Nova coordenada Y")


class CreateTopologyEdgeRequest(BaseModel):
    """Payload para criação de enlace entre nós."""

    model_config = ConfigDict(frozen=True)

    source_node_id: UUID = Field(..., description="ID do nó de origem")
    target_node_id: UUID = Field(..., description="ID do nó de destino")
    link_type: str = Field(
        default="ethernet",
        description="Tipo de enlace: 'fiber' | 'ethernet' | 'vpn' | 'logical' | 'wireless'",
    )
    bandwidth_gbps: float | None = Field(
        default=None, gt=0, description="Largura de banda nominal em Gbps"
    )
    port_src: str | None = Field(
        default=None, max_length=50, description="Identificador da porta de origem"
    )
    port_dst: str | None = Field(
        default=None, max_length=50, description="Identificador da porta de destino"
    )


class TriggerOnDemandProbeRequest(BaseModel):
    """Parâmetros opcionais para o disparo de sonda sob demanda."""

    model_config = ConfigDict(frozen=True)

    timeout_ms: int = Field(
        default=5000,
        ge=1000,
        le=15000,
        description="Tempo limite máximo para execução do teste de ping (em ms)",
    )
