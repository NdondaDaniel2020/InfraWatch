"""Primitiva base de Objeto de Valor (Value Object - DDD) para o InfraWatch.

Objetos de valor são definidos exclusivamente pelo conjunto dos seus atributos,
sendo estritamente imutáveis (frozen=True) e sem identidade conceitual própria.
"""
from abc import ABC
from dataclasses import FrozenInstanceError, dataclass


@dataclass(frozen=True)
class ValueObject(ABC):
    """Classe base abstrata para todos os Objetos de Valor do domínio.

    Regras de Negócio:
    - Imutabilidade estrita: Qualquer atribuição ou alteração de atributo pós-instanciação
      dispara `dataclasses.FrozenInstanceError`.
    - Comparação estrutural: Dois objetos de valor são iguais (`vo1 == vo2`) se e somente se
      todos os seus atributos forem estruturalmente iguais.
    - Sem identidade: Não possuem identificador único (ID).
    """

    def __post_init__(self) -> None:
        """Ponto de extensão para validações de invariantes de negócio nas subclasses."""
        pass
