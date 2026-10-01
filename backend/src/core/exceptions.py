"""Hierarquia de exceções de domínio e infraestrutura do InfraWatch."""


class InfraWatchException(Exception):
    """Exceção base de todas as exceções personalizadas do InfraWatch."""

    def __init__(self, message: str = "Ocorreu um erro interno no sistema.") -> None:
        super().__init__(message)
        self.message = message


class EntityNotFoundError(InfraWatchException):
    """Lançada quando uma entidade solicitada não foi encontrada."""

    def __init__(self, entity_name: str, identifier: str | int) -> None:
        super().__init__(f"{entity_name} com identificador '{identifier}' não foi encontrado(a).")
        self.entity_name = entity_name
        self.identifier = identifier


class ConflictError(InfraWatchException):
    """Lançada quando ocorre violação de unicidade ou conflito de estado."""


class AuditImmutabilityError(InfraWatchException):
    """Lançada quando ocorre tentativa proibida de alteração ou exclusão em registros de auditoria."""

    def __init__(
        self,
        message: str = "A tabela audit_logs é append-only. Operações de UPDATE ou DELETE são estritamente proibidas.",
    ) -> None:
        super().__init__(message)
