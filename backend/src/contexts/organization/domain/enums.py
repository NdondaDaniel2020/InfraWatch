"""Enumerações de domínio do contexto de Organizações (Tenants)."""

from enum import StrEnum


class OrgTier(StrEnum):
    """Níveis de serviço e prioridade da organização no InfraWatch."""

    STANDARD = "STANDARD"
    PROFESSIONAL = "PROFESSIONAL"
    ENTERPRISE_GOLD = "ENTERPRISE_GOLD"
    CRITICAL_INFRA = "CRITICAL_INFRA"
    INTERNAL = "INTERNAL"
