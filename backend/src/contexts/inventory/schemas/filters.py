from pydantic import BaseModel, Field


class DeviceFilters(BaseModel):
    status: str | None = Field(
        None, description="Filtrar por status atual (UP, DEGRADED, DOWN, MAINTENANCE, PAUSED)"
    )
    category: str | None = Field(None, description="Filtrar por categoria do equipamento")
    protocol: str | None = Field(None, description="Filtrar por protocolo de monitoramento")
    is_paused: bool | None = Field(None, description="Filtrar dispositivos pausados")
