"""Schemas Pydantic v2 para comunicação com a REST API do GLPI 10+.

Define os modelos de entrada e saída para os endpoints utilizados:
- initSession / killSession (autenticação)
- POST /Ticket (abertura)
- POST /Ticket/{id}/ITILFollowup (acompanhamento)
- PUT /Ticket/{id} (encerramento)
"""

from datetime import datetime
from enum import IntEnum
from typing import Any

from pydantic import BaseModel, Field, field_validator


# ---------------------------------------------------------------------------
# Enums GLPI
# ---------------------------------------------------------------------------


class GlpiTicketStatus(IntEnum):
    """Status do chamado no GLPI (campo status)."""
    NEW = 1
    PROCESSING_ASSIGNED = 2
    PROCESSING_PLANNED = 3
    PENDING = 4
    SOLVED = 5
    CLOSED = 6


class GlpiUrgency(IntEnum):
    """Urgência do chamado (1=Muito Baixa … 5=Muito Alta)."""
    VERY_LOW = 1
    LOW = 2
    MEDIUM = 3
    HIGH = 4
    VERY_HIGH = 5


class GlpiImpact(IntEnum):
    """Impacto do chamado (1=Muito Baixo … 5=Muito Alto)."""
    VERY_LOW = 1
    LOW = 2
    MEDIUM = 3
    HIGH = 4
    VERY_HIGH = 5


class GlpiPriority(IntEnum):
    """Prioridade calculada pelo GLPI."""
    VERY_LOW = 1
    LOW = 2
    MEDIUM = 3
    HIGH = 4
    VERY_HIGH = 5
    MAJOR = 6


# ---------------------------------------------------------------------------
# Autenticação
# ---------------------------------------------------------------------------


class GlpiSessionResponse(BaseModel):
    """Resposta de GET /initSession."""
    session_token: str


# ---------------------------------------------------------------------------
# Tickets
# ---------------------------------------------------------------------------


class GlpiTicketCreate(BaseModel):
    """Payload de criação de chamado (POST /Ticket)."""
    name: str = Field(..., description="Título do chamado")
    content: str = Field(..., description="Descrição detalhada do incidente")
    urgency: GlpiUrgency = GlpiUrgency.VERY_HIGH
    impact: GlpiImpact = GlpiImpact.HIGH
    priority: GlpiPriority = GlpiPriority.VERY_HIGH
    itilcategories_id: int = Field(default=0, description="ID da categoria ITSM (0 = sem categoria)")
    entities_id: int = Field(default=0, description="ID da entidade / organização no GLPI")

    class Config:
        use_enum_values = True


class GlpiTicketCreateResponse(BaseModel):
    """Resposta de POST /Ticket."""
    id: int


class GlpiTicketUpdate(BaseModel):
    """Payload para encerramento / atualização de chamado (PUT /Ticket/{id})."""
    status: GlpiTicketStatus = GlpiTicketStatus.SOLVED
    solvedate: str | None = Field(None, description="Data/hora de resolução (Y-m-d H:M:S)")

    class Config:
        use_enum_values = True


# ---------------------------------------------------------------------------
# Acompanhamentos (ITILFollowup)
# ---------------------------------------------------------------------------


class GlpiFollowupCreate(BaseModel):
    """Payload de criação de acompanhamento técnico (POST /Ticket/{id}/ITILFollowup)."""
    items_id: int = Field(..., description="ID do chamado ao qual pertence")
    itemtype: str = Field(default="Ticket")
    content: str = Field(..., description="Texto do acompanhamento técnico")
    is_private: int = Field(default=0, description="1=privado, 0=público")
    requesttypes_id: int = Field(default=1, description="Tipo de requisição (1=Email, 6=Manual)")


class GlpiFollowupResponse(BaseModel):
    """Resposta de POST /Ticket/{id}/ITILFollowup."""
    id: int
