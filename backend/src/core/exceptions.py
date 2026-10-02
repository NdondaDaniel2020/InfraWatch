"""Hierarquia de exceções de domínio, aplicação e infraestrutura do InfraWatch."""

from __future__ import annotations

from typing import Any


class InfraWatchException(Exception):
    """Exceção base de todas as exceções personalizadas da aplicação.

    Permite que os serviços de domínio definam status HTTP, código canônico de erro
    e metadados contextuais retornáveis ao cliente.
    """

    def __init__(
        self,
        message: str = "Ocorreu um erro interno no sistema.",
        *,
        status_code: int = 400,
        code: str | None = None,
        payload: dict[str, Any] | None = None,
        headers: dict[str, str] | None = None,
    ) -> None:
        super().__init__(message)
        self.message = message
        self.status_code = status_code
        self.code = code or self.__class__.__name__
        self.payload = payload or {}
        self.headers = headers or {}

    def to_dict(self) -> dict[str, Any]:
        """Serializa a exceção em um dicionário estruturado para JSON."""
        return {
            "message": self.message,
            "code": self.code,
            **self.payload,
        }


# Alias para conformidade e clareza arquitetural
AppError = InfraWatchException


class NotFoundError(InfraWatchException):
    """Lançada quando um recurso ou entidade não foi encontrado."""

    def __init__(
        self,
        message: str = "Recurso não encontrado.",
        *,
        payload: dict[str, Any] | None = None,
        code: str = "NOT_FOUND",
    ) -> None:
        super().__init__(message, status_code=404, code=code, payload=payload)


class EntityNotFoundError(NotFoundError):
    """Lançada quando uma entidade solicitada não foi encontrada."""

    def __init__(self, entity_name: str, identifier: str | int) -> None:
        super().__init__(
            f"{entity_name} com identificador '{identifier}' não foi encontrado(a).",
            payload={"entity": entity_name, "identifier": str(identifier)},
            code="ENTITY_NOT_FOUND",
        )
        self.entity_name = entity_name
        self.identifier = identifier


class ConflictError(InfraWatchException):
    """Lançada quando ocorre violação de unicidade ou conflito de estado."""

    def __init__(
        self,
        message: str = "Conflito com o estado atual do recurso.",
        *,
        payload: dict[str, Any] | None = None,
        code: str = "CONFLICT",
    ) -> None:
        super().__init__(message, status_code=409, code=code, payload=payload)


class PermissionDeniedError(InfraWatchException):
    """Lançada quando o usuário autenticado não possui permissão para a operação."""

    def __init__(
        self,
        message: str = "Permissão negada para executar esta ação.",
        *,
        payload: dict[str, Any] | None = None,
        code: str = "PERMISSION_DENIED",
    ) -> None:
        super().__init__(message, status_code=403, code=code, payload=payload)


class AuditImmutabilityError(InfraWatchException):
    """Lançada quando ocorre tentativa proibida de alteração ou exclusão em auditoria."""

    def __init__(
        self,
        message: str = "A tabela audit_logs é append-only. Operações de UPDATE ou DELETE são estritamente proibidas.",
    ) -> None:
        super().__init__(message, status_code=403, code="AUDIT_IMMUTABILITY_VIOLATION")


# Exceções de Segurança, Autenticação e Ciclo de Vida de Tokens
class AuthenticationError(InfraWatchException):
    """Exceção base para falhas de autenticação de credenciais."""

    def __init__(
        self,
        message: str = "Credenciais de autenticação inválidas.",
        *,
        payload: dict[str, Any] | None = None,
        code: str = "AUTHENTICATION_FAILED",
    ) -> None:
        super().__init__(
            message,
            status_code=401,
            code=code,
            payload=payload,
            headers={"WWW-Authenticate": "Bearer"},
        )


class TokenError(AuthenticationError):
    """Exceção base para falhas de validação ou processamento de tokens."""

    def __init__(
        self,
        message: str = "Falha na validação do token.",
        *,
        payload: dict[str, Any] | None = None,
        code: str = "TOKEN_ERROR",
    ) -> None:
        super().__init__(message, payload=payload, code=code)


class TokenExpiredError(TokenError):
    """Lançada quando um token JWT ou de sessão expirou."""

    def __init__(self, message: str = "O token fornecido expirou.") -> None:
        super().__init__(message, code="TOKEN_EXPIRED")


class InvalidTokenError(TokenError):
    """Lançada quando a assinatura, formato ou tipo do token é inválido."""

    def __init__(self, message: str = "O token fornecido é inválido ou malformado.") -> None:
        super().__init__(message, code="TOKEN_INVALID")


class TokenRevokedError(TokenError):
    """Lançada quando um token previamente revogado ou presente na blacklist é apresentado."""

    def __init__(self, message: str = "O token apresentado foi revogado.") -> None:
        super().__init__(message, code="TOKEN_REVOKED")


class TokenReuseDetectedError(TokenError):
    """Lançada quando detectada tentativa de reutilização de refresh token já rotacionado."""

    def __init__(
        self,
        message: str = "Tentativa de reuso de token detectada. Toda a família de sessões foi invalidada por segurança.",
    ) -> None:
        super().__init__(message, code="TOKEN_REUSE_DETECTED")


# Rate Limiting & Account Lockout
class RateLimitError(InfraWatchException):
    """Exceção base para bloqueios de taxa de requisições."""

    def __init__(
        self,
        message: str,
        retry_after: int,
        *,
        code: str = "RATE_LIMIT_ERROR",
    ) -> None:
        super().__init__(
            message,
            status_code=429,
            code=code,
            headers={"Retry-After": str(retry_after)},
        )
        self.retry_after = retry_after


class RateLimitExceededError(RateLimitError):
    """Lançada quando o limite de requisições por IP foi excedido."""

    def __init__(
        self,
        message: str = "Limite de tentativas por endereço IP excedido. Tente novamente mais tarde.",
        retry_after: int = 60,
    ) -> None:
        super().__init__(message, retry_after, code="RATE_LIMIT_EXCEEDED")


class AccountLockedOutError(RateLimitError):
    """Lançada quando a conta foi temporariamente bloqueada por múltiplas falhas consecutivas."""

    def __init__(
        self,
        message: str = "Conta temporariamente bloqueada por excesso de tentativas incorretas.",
        retry_after: int = 900,
    ) -> None:
        super().__init__(message, retry_after, code="ACCOUNT_LOCKED_OUT")


# Ciclo de Vida de Contas & Verificação
class EmailAlreadyExistsError(ConflictError):
    """Lançada quando tenta-se registrar um e-mail já existente."""

    def __init__(self, message: str = "Este endereço de e-mail já está cadastrado.") -> None:
        super().__init__(message, code="EMAIL_ALREADY_EXISTS")


class InvalidOrExpiredTokenError(InfraWatchException):
    """Lançada quando um token temporário de verificação ou reset é inválido ou expirou."""

    def __init__(self, message: str = "Token inválido ou expirado.") -> None:
        super().__init__(message, status_code=400, code="TOKEN_INVALID_OR_EXPIRED")


class TokenAlreadyUsedError(InfraWatchException):
    """Lançada quando um token temporário já foi consumido."""

    def __init__(self, message: str = "Este token já foi utilizado anteriormente.") -> None:
        super().__init__(message, status_code=400, code="TOKEN_ALREADY_USED")


# MFA / 2FA Exceptions
class MfaNotSetupError(InfraWatchException):
    """Lançada quando a configuração de MFA não foi iniciada."""

    def __init__(
        self, message: str = "Configuração de MFA não iniciada. Execute /setup primeiro."
    ) -> None:
        super().__init__(message, status_code=400, code="MFA_NOT_SETUP")


class InvalidTotpCodeError(InfraWatchException):
    """Lançada quando o código TOTP fornecido é incorreto ou expirou."""

    def __init__(self, message: str = "Código TOTP inválido ou expirado.") -> None:
        super().__init__(message, status_code=400, code="INVALID_TOTP_CODE")


class MfaNotActiveError(InfraWatchException):
    """Lançada quando tenta-se operar ou desativar MFA que não está habilitado."""

    def __init__(self, message: str = "MFA não está ativado para este usuário.") -> None:
        super().__init__(message, status_code=400, code="MFA_NOT_ACTIVE")


class InvalidMfaConfirmationError(InfraWatchException):
    """Lançada quando a senha ou código de confirmação de desativação é inválido."""

    def __init__(self, message: str = "Código de confirmação de MFA inválido.") -> None:
        super().__init__(message, status_code=400, code="INVALID_MFA_CONFIRMATION")


class InvalidMfaChallengeError(AuthenticationError):
    """Lançada quando o código fornecido no desafio de login é inválido."""

    def __init__(
        self, message: str = "Código de verificação de dois fatores incorreto ou expirado."
    ) -> None:
        super().__init__(message, code="INVALID_MFA_CHALLENGE")


class InvalidMfaPendingTokenError(AuthenticationError):
    """Lançada quando o token intermediário de desafio MFA é inválido ou expirou."""

    def __init__(
        self, message: str = "Token de autenticação intermediário inválido ou expirado."
    ) -> None:
        super().__init__(message, code="INVALID_MFA_PENDING_TOKEN")


class GoogleLoginDisabledError(InfraWatchException):
    """Lançada quando o login social via Google OAuth não está habilitado."""

    def __init__(
        self,
        message: str = "O login via Google não está habilitado no momento.",
        payload: dict[str, Any] | None = None,
    ) -> None:
        super().__init__(
            message=message,
            status_code=403,
            payload=payload,
            code="GOOGLE_LOGIN_DISABLED",
        )


class InvalidGoogleTokenError(InfraWatchException):
    """Lançada quando o token ID ou código de autorização Google é inválido ou expirou."""

    def __init__(
        self,
        message: str = "Token ou código de autorização Google inválido ou expirado.",
        payload: dict[str, Any] | None = None,
    ) -> None:
        super().__init__(
            message=message,
            status_code=400,
            payload=payload,
            code="INVALID_GOOGLE_TOKEN",
        )


class GoogleAuthError(InfraWatchException):
    """Lançada em caso de falha de comunicação ou resposta inesperada do Google."""

    def __init__(
        self,
        message: str = "Falha no serviço de autenticação do Google.",
        payload: dict[str, Any] | None = None,
    ) -> None:
        super().__init__(
            message=message,
            status_code=502,
            payload=payload,
            code="GOOGLE_AUTH_ERROR",
        )
