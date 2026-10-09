"""Objetos de Valor imutáveis do domínio IAM (Identity & Access Management).

Value Objects representam conceitos de negócio sem identidade própria,
sendo diferenciados exclusivamente pelos seus atributos. São imutáveis
e autovalidantes — garantem invariantes de domínio no momento da instanciação.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

from src.contexts.iam.domain.enums import UserRole

# Regex RFC 5322 simplificada para validação sintática de e-mail
_EMAIL_REGEX = re.compile(
    r"^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$"
)


@dataclass(frozen=True, slots=True)
class Email:
    """Endereço de e-mail normalizado e sintaticamente validado.

    Invariantes:
    - O endereço não pode ser vazio.
    - É convertido automaticamente para minúsculas e sem espaços laterais.
    - Deve obedecer ao formato de e-mail padrão.
    """

    value: str

    def __post_init__(self) -> None:
        if not self.value or not isinstance(self.value, str):
            raise ValueError("O endereço de e-mail não pode ser vazio.")

        normalized = self.value.strip().lower()
        if not _EMAIL_REGEX.match(normalized):
            raise ValueError(f"Endereço de e-mail inválido: '{self.value}'.")

        object.__setattr__(self, "value", normalized)

    def __str__(self) -> str:
        return self.value


@dataclass(frozen=True, slots=True)
class RawPassword:
    """Senha em texto plano com garantia de invariantes estruturais mínimas.

    Invariantes:
    - Comprimento mínimo de 8 caracteres.
    - Não pode ser composta exclusivamente por espaços em branco.
    - Oculta o valor em representações textuais (__repr__ e __str__) para prevenir vazamento em logs.
    """

    value: str

    def __post_init__(self) -> None:
        if not self.value or not isinstance(self.value, str):
            raise ValueError("A senha não pode ser vazia.")

        if len(self.value) < 8:
            raise ValueError("A senha deve conter no mínimo 8 caracteres.")

        if not self.value.strip():
            raise ValueError("A senha não pode ser composta apenas por espaços.")

    def get_secret_value(self) -> str:
        """Retorna o valor confidencial da senha em texto plano."""
        return self.value

    def __str__(self) -> str:
        return "********"

    def __repr__(self) -> str:
        return "RawPassword(********)"


@dataclass(frozen=True, slots=True)
class HashedPassword:
    """Hash criptográfico seguro de senha gerado por algoritmo como Argon2id.

    Invariantes:
    - Não pode ser vazio.
    - Deve possuir comprimento e estrutura condizente com hashes criptográficos.
    """

    value: str

    def __post_init__(self) -> None:
        if not self.value or not isinstance(self.value, str) or len(self.value) < 10:
            raise ValueError("O hash criptográfico de senha é inválido ou vazio.")

    def __str__(self) -> str:
        return self.value


@dataclass(frozen=True, slots=True)
class Role:
    """Papel RBAC validado do usuário.

    Invariantes:
    - Deve pertencer aos papéis válidos definidos no enum UserRole.
    """

    value: UserRole

    def __init__(self, value: UserRole | str) -> None:
        if isinstance(value, UserRole):
            object.__setattr__(self, "value", value)
        elif isinstance(value, str):
            try:
                object.__setattr__(self, "value", UserRole(value.upper()))
            except ValueError:
                valid_roles = ", ".join(r.value for r in UserRole)
                raise ValueError(
                    f"Papel de usuário inválido: '{value}'. Papéis permitidos: {valid_roles}."
                ) from None
        else:
            raise TypeError(f"Tipo inválido para papel de usuário: {type(value)}.")

    @property
    def is_super_admin(self) -> bool:
        return self.value == UserRole.SUPER_ADMIN

    @property
    def is_noc_operator(self) -> bool:
        return self.value == UserRole.NOC_OPERATOR

    @property
    def is_org_admin(self) -> bool:
        return self.value == UserRole.ORG_ADMIN

    @property
    def is_client_viewer(self) -> bool:
        return self.value == UserRole.CLIENT_VIEWER

    def __str__(self) -> str:
        return self.value.value


__all__ = [
    "Email",
    "HashedPassword",
    "RawPassword",
    "Role",
    "UserRole",
]
