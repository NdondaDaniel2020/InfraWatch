"""Hierarquia de exceções de domínio e infraestrutura do InfraWatch."""


class InfraWatchException(Exception):
    """Exceção base de todas as exceções personalizadas do InfraWatch."""

    def __init__(self, message: str = "Ocorreu um erro interno no sistema.") -> None:
        super().__init__(message)
        self.message = message


class NotFoundError(InfraWatchException):
    """Lançada quando um recurso ou entidade não foi encontrado."""

    def __init__(self, message: str = "Recurso não encontrado.") -> None:
        super().__init__(message)


class EntityNotFoundError(NotFoundError):
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


# Exceções de Segurança, Autenticação e Ciclo de Vida de Tokens
class AuthenticationError(InfraWatchException):
    """Exceção base para falhas de autenticação."""


class TokenError(AuthenticationError):
    """Exceção base para falhas de validação ou processamento de tokens."""


class TokenExpiredError(TokenError):
    """Lançada quando um token JWT ou de sessão expirou."""

    def __init__(self, message: str = "O token fornecido expirou.") -> None:
        super().__init__(message)


class InvalidTokenError(TokenError):
    """Lançada quando a assinatura, formato ou tipo do token é inválido."""

    def __init__(self, message: str = "O token fornecido é inválido ou malformado.") -> None:
        super().__init__(message)


class TokenRevokedError(TokenError):
    """Lançada quando um token previamente revogado ou presente na blacklist é apresentado."""

    def __init__(self, message: str = "O token apresentado foi revogado.") -> None:
        super().__init__(message)


class TokenReuseDetectedError(TokenError):
    """Lançada quando detectada tentativa de reutilização de refresh token já rotacionado."""

    def __init__(
        self,
        message: str = "Tentativa de reuso de token detectada. Toda a família de sessões foi invalidada por segurança.",
    ) -> None:
        super().__init__(message)


# Rate Limiting & Account Lockout
class RateLimitError(InfraWatchException):
    """Exceção base para bloqueios de taxa de requisições."""

    def __init__(self, message: str, retry_after: int) -> None:
        super().__init__(message)
        self.retry_after = retry_after


class RateLimitExceededError(RateLimitError):
    """Lançada quando o limite de requisições por IP foi excedido."""

    def __init__(
        self,
        message: str = "Limite de tentativas por endereço IP excedido. Tente novamente mais tarde.",
        retry_after: int = 60,
    ) -> None:
        super().__init__(message, retry_after)


class AccountLockedOutError(RateLimitError):
    """Lançada quando a conta foi temporariamente bloqueada por múltiplas falhas consecutivas."""

    def __init__(
        self,
        message: str = "Conta temporariamente bloqueada por excesso de tentativas incorretas.",
        retry_after: int = 900,
    ) -> None:
        super().__init__(message, retry_after)


# Ciclo de Vida de Contas & Verificação
class EmailAlreadyExistsError(InfraWatchException):
    """Lançada quando tenta-se registrar um e-mail já existente."""

    def __init__(self, message: str = "Este endereço de e-mail já está cadastrado.") -> None:
        super().__init__(message)


class InvalidOrExpiredTokenError(InfraWatchException):
    """Lançada quando um token temporário de verificação ou reset é inválido ou expirou."""

    def __init__(self, message: str = "Token inválido ou expirado.") -> None:
        super().__init__(message)


class TokenAlreadyUsedError(InfraWatchException):
    """Lançada quando um token temporário já foi consumido."""

    def __init__(self, message: str = "Este token já foi utilizado anteriormente.") -> None:
        super().__init__(message)


# MFA / 2FA Exceptions
class MfaNotSetupError(InfraWatchException):
    """Lançada quando a configuração de MFA não foi iniciada."""

    def __init__(
        self, message: str = "Configuração de MFA não iniciada. Execute /setup primeiro."
    ) -> None:
        super().__init__(message)


class InvalidTotpCodeError(InfraWatchException):
    """Lançada quando o código TOTP fornecido é incorreto ou expirou."""

    def __init__(self, message: str = "Código TOTP inválido ou expirado.") -> None:
        super().__init__(message)


class MfaNotActiveError(InfraWatchException):
    """Lançada quando tenta-se operar ou desativar MFA que não está habilitado."""

    def __init__(self, message: str = "MFA não está ativado para este usuário.") -> None:
        super().__init__(message)


class InvalidMfaConfirmationError(InfraWatchException):
    """Lançada quando a senha ou código de confirmação de desativação é inválido."""

    def __init__(self, message: str = "Código de confirmação de MFA inválido.") -> None:
        super().__init__(message)


class InvalidMfaChallengeError(InfraWatchException):
    """Lançada quando o código fornecido no desafio de login é inválido."""

    def __init__(
        self, message: str = "Código de verificação de dois fatores incorreto ou expirado."
    ) -> None:
        super().__init__(message)


class InvalidMfaPendingTokenError(InfraWatchException):
    """Lançada quando o token intermediário de desafio MFA é inválido ou expirou."""

    def __init__(
        self, message: str = "Token de autenticação intermediário inválido ou expirado."
    ) -> None:
        super().__init__(message)
