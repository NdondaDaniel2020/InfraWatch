"""Módulo de compatibilidade e transição de comandos do Inventory para schemas Pydantic."""

from src.contexts.inventory.schemas.requests import (
    CreateDeviceRequest as CreateDeviceCommand,
    PauseDeviceRequest as PauseDeviceCommand,
    ResumeDeviceRequest as ResumeDeviceCommand,
    SetMaintenanceRequest as SetMaintenanceCommand,
    UpdateDeviceRequest as UpdateDeviceCommand,
)

__all__ = [
    "CreateDeviceCommand",
    "UpdateDeviceCommand",
    "PauseDeviceCommand",
    "ResumeDeviceCommand",
    "SetMaintenanceCommand",
]
