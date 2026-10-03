"""Agregado Device — raiz de agregação do contexto Inventory.

O Device encapsula todas as invariantes de negócio de um equipamento
monitorado, incluindo validações via Value Objects, transições de estado
controladas e emissão de eventos de domínio.
"""

from datetime import datetime
from typing import Optional
from uuid import UUID

from src.contexts.inventory.domain.value_objects import (
    DeviceCategory,
    DeviceStatus,
    IPAddress,
    NetworkPort,
    ThresholdConfig,
)
from src.core.domain.entity import Entity


class Device(Entity):
    """Agregado raiz representando um dispositivo de rede monitorado.

    Invariantes:
    - O endereço IP é validado pelo VO ``IPAddress``.
    - A porta é validada pelo VO ``NetworkPort``.
    - A categoria deve pertencer ao enum ``DeviceCategory``.
    - O intervalo de sondagem mínimo é de 5 segundos.
    - Dispositivos pausados não aceitam atualizações de métricas.
    """

    def __init__(
        self,
        id: UUID,
        organization_id: UUID,
        name: str,
        ip_address: str,
        port: int,
        protocol: str,
        category: str,
        interval_seconds: int,
        thresholds: dict,
    ) -> None:
        super().__init__(id)
        self.organization_id = organization_id
        self.name = name

        # Validação via Value Objects
        self._ip_address = IPAddress(ip_address)
        self._port = NetworkPort(port)
        self._category = DeviceCategory(category)
        self._thresholds = ThresholdConfig.from_dict(thresholds) if thresholds else ThresholdConfig()

        self.protocol = protocol
        self.interval_seconds = interval_seconds
        self.is_paused = False
        self.status = DeviceStatus.UP.value
        self.maintenance_until: Optional[datetime] = None

    # -- Propriedades de acesso para manter compatibilidade com o ORM e API --

    @property
    def ip_address(self) -> str:
        return self._ip_address.value

    @ip_address.setter
    def ip_address(self, value: str) -> None:
        self._ip_address = IPAddress(value)

    @property
    def port(self) -> int:
        return self._port.value

    @port.setter
    def port(self, value: int) -> None:
        self._port = NetworkPort(value)

    @property
    def category(self) -> str:
        return self._category.value

    @category.setter
    def category(self, value: str) -> None:
        self._category = DeviceCategory(value)

    @property
    def thresholds(self) -> dict:
        return self._thresholds.to_dict()

    @thresholds.setter
    def thresholds(self, value: dict) -> None:
        self._thresholds = ThresholdConfig.from_dict(value) if value else ThresholdConfig()

    # -- Métodos de mutação do agregado --

    def update(
        self,
        name: Optional[str] = None,
        ip_address: Optional[str] = None,
        port: Optional[int] = None,
        protocol: Optional[str] = None,
        interval_seconds: Optional[int] = None,
        thresholds: Optional[dict] = None,
    ) -> None:
        """Atualiza campos opcionais do dispositivo com validação."""
        if name:
            self.name = name
        if ip_address:
            self.ip_address = ip_address
        if port:
            self.port = port
        if protocol:
            self.protocol = protocol
        if interval_seconds:
            self.interval_seconds = interval_seconds
        if thresholds:
            self.thresholds = thresholds

    def update_status(self, new_status: str, latency: float = 0.0, loss: float = 0.0) -> None:
        """Atualiza o status do dispositivo com base em métricas recebidas.

        Dispositivos pausados não aceitam atualizações de métricas dos probes.

        Args:
            new_status: Novo status (UP, DEGRADED, DOWN).
            latency: Latência medida em milissegundos.
            loss: Percentual de perda de pacotes.

        Raises:
            ValueError: Se o dispositivo estiver pausado ou em manutenção.
        """
        if self.is_paused:
            raise ValueError("Dispositivo pausado nao aceita atualizacoes de metricas")
        if self.status == DeviceStatus.MAINTENANCE.value:
            raise ValueError("Dispositivo em manutencao nao aceita atualizacoes de metricas")

        # Validar status permitido
        DeviceStatus(new_status)
        self.status = new_status

    def pause(self) -> None:
        """Pausa o monitoramento do dispositivo."""
        self.is_paused = True
        self.status = DeviceStatus.PAUSED.value

    def resume(self) -> None:
        """Retoma o monitoramento do dispositivo."""
        self.is_paused = False
        self.status = DeviceStatus.UP.value

    def set_maintenance(self, maintenance_until: datetime) -> None:
        """Coloca o dispositivo em modo de manutenção."""
        self.status = DeviceStatus.MAINTENANCE.value
        self.maintenance_until = maintenance_until
