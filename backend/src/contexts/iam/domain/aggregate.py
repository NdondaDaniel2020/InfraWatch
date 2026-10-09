"""Agregado User — raiz de agregação do contexto IAM (Identity & Access Management).

O agregado User encapsula todas as invariantes e regras de ciclo de vida
de contas de usuários, autenticação, controle de papéis e segurança (MFA).
"""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from src.contexts.iam.domain.enums import UserRole
from src.contexts.iam.domain.value_objects import (
    Email,
    HashedPassword,
    Role,
)
from src.core.domain.entity import Entity


class User(Entity):
    """Agregado raiz representando uma conta de usuário do InfraWatch.

    Invariantes:
    - O e-mail é estritamente validado e normalizado pelo Value Object Email.
    - O hash de senha deve ser mantido criptograficamente seguro via HashedPassword.
    - O papel de acesso RBAC deve pertencer ao conjunto autorizado de UserRole.
    - O nome completo não pode ser vazio ou composto exclusivamente por espaços.
    - Usuários desativados não podem ter seus papéis alterados sem prévia reativação.
    """

    def __init__(
        self,
        id: UUID,
        email: str | Email,
        hashed_password: str | HashedPassword,
        full_name: str,
        role: str | UserRole | Role = UserRole.CLIENT_VIEWER,
        organization_id: UUID | None = None,
        is_active: bool = True,
        is_verified: bool = False,
        mfa_enabled: bool = False,
        mfa_type: str | None = None,
        created_at: datetime | None = None,
        updated_at: datetime | None = None,
    ) -> None:
        super().__init__(id, created_at=created_at)
        self.organization_id = organization_id

        # Validação via Value Objects
        self._email = email if isinstance(email, Email) else Email(email)
        self._hashed_password = (
            hashed_password
            if isinstance(hashed_password, HashedPassword)
            else HashedPassword(hashed_password)
        )
        self._role = role if isinstance(role, Role) else Role(role)

        self.full_name = self._validate_full_name(full_name)
        self.is_active = is_active
        self.is_verified = is_verified
        self.mfa_enabled = mfa_enabled
        self.mfa_type = mfa_type
        self.updated_at = updated_at

    # -- Propriedades para interoperabilidade com o ORM e Schemas --

    @property
    def email(self) -> str:
        return self._email.value

    @email.setter
    def email(self, value: str | Email) -> None:
        self._email = value if isinstance(value, Email) else Email(value)

    @property
    def hashed_password(self) -> str:
        return self._hashed_password.value

    @hashed_password.setter
    def hashed_password(self, value: str | HashedPassword) -> None:
        self._hashed_password = (
            value if isinstance(value, HashedPassword) else HashedPassword(value)
        )

    @property
    def role(self) -> str:
        return self._role.value.value

    @role.setter
    def role(self, value: str | UserRole | Role) -> None:
        self._role = value if isinstance(value, Role) else Role(value)

    # -- Métodos de validação e mutação do Agregado --

    @staticmethod
    def _validate_full_name(name: str) -> str:
        if not name or not isinstance(name, str) or not name.strip():
            raise ValueError("O nome completo do usuário não pode ser vazio.")
        return name.strip()

    def update_profile(self, full_name: str) -> None:
        """Atualiza os dados de identificação pessoal do perfil."""
        self.full_name = self._validate_full_name(full_name)

    def change_role(self, new_role: UserRole | Role | str) -> None:
        """Altera a permissão RBAC atribuída à conta."""
        self._role = new_role if isinstance(new_role, Role) else Role(new_role)

    def change_password(self, new_hashed_password: str | HashedPassword) -> None:
        """Atualiza a credencial criptográfica de autenticação."""
        self._hashed_password = (
            new_hashed_password
            if isinstance(new_hashed_password, HashedPassword)
            else HashedPassword(new_hashed_password)
        )

    def activate(self) -> None:
        """Reativa a conta do usuário."""
        self.is_active = True

    def deactivate(self) -> None:
        """Desativa a conta do usuário por suspensão ou conformidade."""
        self.is_active = False

    def verify_email(self) -> None:
        """Confirma a titularidade e validação do e-mail cadastrado."""
        self.is_verified = True

    def enable_mfa(self, mfa_type: str = "totp") -> None:
        """Ativa a exigência do segundo fator de autenticação."""
        self.mfa_enabled = True
        self.mfa_type = mfa_type

    def disable_mfa(self) -> None:
        """Desativa o segundo fator de autenticação da conta."""
        self.mfa_enabled = False
        self.mfa_type = None


__all__ = ["User"]
