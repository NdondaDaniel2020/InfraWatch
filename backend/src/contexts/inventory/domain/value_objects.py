"""Objetos de Valor imutáveis do domínio Inventory.

Value Objects representam conceitos de negócio sem identidade própria,
sendo diferenciados exclusivamente pelos seus atributos. São imutáveis
e autovalidantes — rejeitar dados inválidos no momento da construção.
"""

import ipaddress as _ipaddress
from dataclasses import dataclass
from enum import Enum


class DeviceCategory(str, Enum):
    """Categorias de equipamento de rede monitorados pelo InfraWatch."""

    ROUTER = "ROUTER"
    SWITCH = "SWITCH"
    SERVER = "SERVER"
    DATABASE = "DATABASE"
    ACCESS_POINT = "ACCESS_POINT"
    MICROWAVE_LINK = "MICROWAVE_LINK"


class DeviceStatus(str, Enum):
    """Estados possíveis de um dispositivo monitorado."""

    UP = "UP"
    DEGRADED = "DEGRADED"
    DOWN = "DOWN"
    MAINTENANCE = "MAINTENANCE"
    PAUSED = "PAUSED"


@dataclass(frozen=True, slots=True)
class IPAddress:
    """Endereço IP validado (IPv4 ou IPv6).

    Lança ``ValueError`` se o endereço fornecido não for válido.
    Exemplos válidos: ``192.168.1.1``, ``::1``, ``2001:db8::1``.
    """

    value: str

    def __post_init__(self) -> None:
        try:
            parsed = _ipaddress.ip_address(self.value)
        except ValueError as err:
            raise ValueError(
                f"Endereço IP inválido: '{self.value}'"
            ) from err
        # Normaliza a representação (ex: '::1' -> '::1', '192.168.001.1' -> '192.168.1.1')
        object.__setattr__(self, "value", str(parsed))

    @property
    def version(self) -> int:
        """Retorna 4 ou 6 conforme a versão do protocolo."""
        return _ipaddress.ip_address(self.value).version

    def __str__(self) -> str:
        return self.value


@dataclass(frozen=True, slots=True)
class NetworkPort:
    """Porta TCP/UDP validada no intervalo 1–65535.

    Lança ``ValueError`` se a porta estiver fora do intervalo permitido.
    """

    value: int

    def __post_init__(self) -> None:
        if not isinstance(self.value, int) or not (1 <= self.value <= 65535):
            raise ValueError(
                f"Porta de rede inválida: {self.value}. Deve estar entre 1 e 65535"
            )

    def __int__(self) -> int:
        return self.value

    def __str__(self) -> str:
        return str(self.value)


@dataclass(frozen=True, slots=True)
class ThresholdConfig:
    """Configuração de limiares de alarme para um dispositivo.

    Atributos:
        max_latency_ms: Latência máxima tolerável em milissegundos (>= 0).
        max_jitter_ms: Jitter máximo tolerável em milissegundos (>= 0).
        max_loss_percent: Percentual máximo de perda de pacotes (0.0 a 100.0).
    """

    max_latency_ms: float = 200.0
    max_jitter_ms: float = 50.0
    max_loss_percent: float = 5.0

    def __post_init__(self) -> None:
        if self.max_latency_ms < 0:
            raise ValueError(
                f"max_latency_ms deve ser >= 0, recebido: {self.max_latency_ms}"
            )
        if self.max_jitter_ms < 0:
            raise ValueError(
                f"max_jitter_ms deve ser >= 0, recebido: {self.max_jitter_ms}"
            )
        if not (0.0 <= self.max_loss_percent <= 100.0):
            raise ValueError(
                f"max_loss_percent deve estar entre 0 e 100, recebido: {self.max_loss_percent}"
            )

    def to_dict(self) -> dict:
        """Serializa para dicionário compatível com JSONB."""
        return {
            "max_latency_ms": self.max_latency_ms,
            "max_jitter_ms": self.max_jitter_ms,
            "max_loss_percent": self.max_loss_percent,
        }

    @classmethod
    def from_dict(cls, data: dict) -> "ThresholdConfig":
        """Reconstrói a partir de um dicionário JSONB."""
        return cls(
            max_latency_ms=data.get("max_latency_ms", 200.0),
            max_jitter_ms=data.get("max_jitter_ms", 50.0),
            max_loss_percent=data.get("max_loss_percent", 5.0),
        )
