"""Testes unitários para Value Objects e Agregado User do domínio IAM."""

from uuid import uuid4

import pytest

from src.contexts.iam.domain.aggregate import User
from src.contexts.iam.domain.enums import UserRole
from src.contexts.iam.domain.value_objects import (
    Email,
    HashedPassword,
    RawPassword,
    Role,
)


def test_email_valid_normalization():
    """Valida normalização para lowercase e remoção de espaços em branco."""
    email = Email("  Admin.TEST@InfraWatch.AO  ")
    assert str(email) == "admin.test@infrawatch.ao"
    assert email.value == "admin.test@infrawatch.ao"


@pytest.mark.parametrize(
    "invalid_email",
    [
        "",
        "   ",
        "invalid-email",
        "@infrawatch.ao",
        "admin@",
        "admin@localhost",
        "admin@@infrawatch.ao",
        None,
    ],
)
def test_email_invalid_raises_value_error(invalid_email):
    """Garante que e-mails inválidos lançam ValueError."""
    with pytest.raises(ValueError):
        Email(invalid_email)  # type: ignore[arg-type]


def test_raw_password_valid_and_masking():
    """Valida requisitos de senha e mascaramento seguro contra vazamentos em logs."""
    raw = RawPassword("SuperSecret123!")
    assert raw.get_secret_value() == "SuperSecret123!"
    assert str(raw) == "********"
    assert "SuperSecret123!" not in repr(raw)


@pytest.mark.parametrize(
    "invalid_password",
    [
        "",
        "short",
        "1234567",
        "        ",
        None,
    ],
)
def test_raw_password_invalid_raises_value_error(invalid_password):
    """Garante que senhas com menos de 8 caracteres ou vazias sejam rejeitadas."""
    with pytest.raises(ValueError):
        RawPassword(invalid_password)  # type: ignore[arg-type]


def test_hashed_password_valid_and_invalid():
    """Valida o objeto de valor de hash criptográfico."""
    valid_hash = "$argon2id$v=19$m=65536,t=2,p=4$dummyhashhere123456"
    hashed = HashedPassword(valid_hash)
    assert str(hashed) == valid_hash

    with pytest.raises(ValueError):
        HashedPassword("")

    with pytest.raises(ValueError):
        HashedPassword("short")


def test_role_value_object():
    """Valida conversão e checagens auxiliares do Role VO."""
    role_admin = Role("SUPER_ADMIN")
    assert role_admin.is_super_admin is True
    assert role_admin.is_client_viewer is False
    assert str(role_admin) == "SUPER_ADMIN"

    role_viewer = Role(UserRole.CLIENT_VIEWER)
    assert role_viewer.is_client_viewer is True

    with pytest.raises(ValueError):
        Role("INVALID_ROLE_XYZ")


def test_user_aggregate_lifecycle_and_invariants():
    """Testa invariantes e ciclo de vida de mutação do agregado User."""
    user_id = uuid4()
    org_id = uuid4()

    user = User(
        id=user_id,
        email="operator@infrawatch.ao",
        hashed_password="$argon2id$v=19$m=65536,t=2,p=4$dummyhashhere123456",
        full_name="Operador NOC",
        role=UserRole.NOC_OPERATOR,
        organization_id=org_id,
    )

    assert user.id == user_id
    assert user.email == "operator@infrawatch.ao"
    assert user.role == "NOC_OPERATOR"
    assert user.is_active is True
    assert user.is_verified is False
    assert user.mfa_enabled is False

    # Invariante: nome vazio
    with pytest.raises(ValueError):
        user.update_profile("   ")

    # Atualização de perfil
    user.update_profile("Operador NOC Sênior")
    assert user.full_name == "Operador NOC Sênior"

    # Atualização de role
    user.change_role(UserRole.ORG_ADMIN)
    assert user.role == "ORG_ADMIN"

    # Verificação de e-mail e MFA
    user.verify_email()
    assert user.is_verified is True

    user.enable_mfa("totp")
    assert user.mfa_enabled is True
    assert user.mfa_type == "totp"

    user.disable_mfa()
    assert user.mfa_enabled is False
    assert user.mfa_type is None

    # Desativação e Ativação
    user.deactivate()
    assert user.is_active is False

    user.activate()
    assert user.is_active is True
