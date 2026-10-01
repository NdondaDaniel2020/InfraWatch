"""Enumerações de domínio do contexto de Identidade e Multi-Tenancy."""

from enum import StrEnum


class UserRole(StrEnum):
    """Papéis de controle de acesso baseado em função (RBAC).

    - SUPER_ADMIN: Administrador global da RCS com acesso irrestrito a todos os tenants.
    - NOC_OPERATOR: Operador técnico da RCS focado em monitoramento, incidentes e SLA.
    - ORG_ADMIN: Administrador do cliente com gestão de usuários e ativos da organização.
    - CLIENT_VIEWER: Usuário cliente com visão apenas-leitura e dados técnicos sensíveis mascarados.
    """

    SUPER_ADMIN = "SUPER_ADMIN"
    NOC_OPERATOR = "NOC_OPERATOR"
    ORG_ADMIN = "ORG_ADMIN"
    CLIENT_VIEWER = "CLIENT_VIEWER"


class OrgTier(StrEnum):
    """Níveis de serviço e prioridade da organização no InfraWatch."""

    ENTERPRISE_GOLD = "ENTERPRISE_GOLD"
    STANDARD = "STANDARD"
    INTERNAL = "INTERNAL"


class TokenType(StrEnum):
    """Tipos de token JWT emitidos pela autenticação."""

    ACCESS = "ACCESS"
    REFRESH = "REFRESH"


class AuditAction(StrEnum):
    """Ações sensíveis auditadas para conformidade e rastreabilidade."""

    USER_CREATED = "USER_CREATED"
    USER_UPDATED = "USER_UPDATED"
    USER_DEACTIVATED = "USER_DEACTIVATED"
    PASSWORD_RESET = "PASSWORD_RESET"
    LOGIN_SUCCESS = "LOGIN_SUCCESS"
    LOGIN_FAILED = "LOGIN_FAILED"
    LOGOUT = "LOGOUT"
    TOKEN_REVOKED = "TOKEN_REVOKED"
    ORGANIZATION_CREATED = "ORGANIZATION_CREATED"
    ORGANIZATION_UPDATED = "ORGANIZATION_UPDATED"


class AuditResult(StrEnum):
    """Resultado da ação registrada na trilha de auditoria."""

    SUCCESS = "SUCCESS"
    FAILED = "FAILED"
