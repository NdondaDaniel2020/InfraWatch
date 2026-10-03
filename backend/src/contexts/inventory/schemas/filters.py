from typing import Optional
from pydantic import BaseModel, Field


class DeviceFilters(BaseModel):
    status: Optional[str] = Field(None, description="Filtrar por status atual (UP, DEGRADED, DOWN, MAINTENANCE, PAUSED)")
    category: Optional[str] = Field(None, description="Filtrar por categoria do equipamento")
    protocol: Optional[str] = Field(None, description="Filtrar por protocolo de monitoramento")
    is_paused: Optional[bool] = Field(None, description="Filtrar dispositivos pausados")
