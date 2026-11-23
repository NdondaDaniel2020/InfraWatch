"""Entidade leve representativa de usuário autenticado no domínio IAM."""

from dataclasses import dataclass

from src.contexts.iam.domain.enums import UserRole


@dataclass(frozen=True)
class AuthenticatedUser:
    """Representação leve do usuário autenticado no contexto da aplicação."""

    id: str
    email: str
    role: str
    organization_id: str | None = None

    @property
    def is_super_admin(self) -> bool:
        """Indica se o usuário possui privilégios de superadministrador global."""
        return self.role in ("SUPER_ADMIN", "ADMIN")

    @property
    def is_noc_operator(self) -> bool:
        """Indica se o usuário é operador NOC com visão operacional global."""
        return self.role == UserRole.NOC_OPERATOR.value

    @property
    def is_global_operator(self) -> bool:
        """Indica se o usuário possui permissão de leitura cross-tenant (SUPER_ADMIN ou NOC_OPERATOR)."""
        return self.is_super_admin or self.is_noc_operator

    def can_access_organization(self, target_org_id: str | None) -> bool:
        """Valida se o usuário pode acessar dados de uma organização específica."""
        if self.is_global_operator:
            return True
        if target_org_id is None:
            return True
        return self.organization_id == target_org_id

    def get_scoped_organization_id(self, target_org_id: str | None = None) -> str | None:
        """Resolve o organization_id estrito baseado no nível de privilégio.

        - Perfis de cliente (ORG_ADMIN, CLIENT_VIEWER): Forçam SEMPRE seu próprio tenant,
          ignorando qualquer target_org_id passado na requisição ou bloqueando acessos indevidos.
        - Perfis operacionais globais (SUPER_ADMIN, NOC_OPERATOR): Podem filtrar por um
          target_org_id específico ou receber None para consultas agregadas.
        """
        if self.is_global_operator:
            return target_str if (target_str := target_org_id) else None
        return self.organization_id
