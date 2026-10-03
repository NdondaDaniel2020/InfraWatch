from abc import ABC, abstractmethod
from typing import List, Optional
from uuid import UUID

from src.contexts.inventory.domain.aggregate import Device


class DeviceRepository(ABC):
    @abstractmethod
    async def save(self, device: Device) -> None:
        """Salva um dispositivo e seus eventos."""
        pass

    @abstractmethod
    async def find_by_id(self, device_id: UUID) -> Optional[Device]:
        """Busca um dispositivo pelo seu ID."""
        pass

    @abstractmethod
    async def find_by_organization(self, organization_id: UUID) -> List[Device]:
        """Busca os dispositivos de uma organização."""
        pass
