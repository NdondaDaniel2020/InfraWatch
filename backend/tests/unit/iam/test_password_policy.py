"""Testes unitários para a política de complexidade e força de senha."""

import pytest

from src.contexts.iam.schemas.auth import PasswordResetConfirm
from src.contexts.iam.schemas.user import UserCreate
from src.contexts.iam.schemas.validators import validate_password_strength


def test_password_valid():
    """Senha que atende a todos os critérios deve passar sem erros."""
    valid_pass = "P@ssw0rdSecure2026!"
    assert validate_password_strength(valid_pass) == valid_pass


def test_password_too_short():
    """Senha com menos de 8 caracteres deve ser rejeitada."""
    with pytest.raises(ValueError) as exc:
        validate_password_strength("Aa1!")
    assert "pelo menos 8 caracteres" in str(exc.value)


def test_password_too_long():
    """Senha com mais de 128 caracteres deve ser rejeitada."""
    long_pass = "A1!" + "a" * 126
    with pytest.raises(ValueError) as exc:
        validate_password_strength(long_pass)
    assert "máximo 128 caracteres" in str(exc.value)


def test_password_missing_uppercase():
    """Senha sem letra maiúscula deve ser rejeitada."""
    with pytest.raises(ValueError) as exc:
        validate_password_strength("validpass123!")
    assert "letra maiúscula" in str(exc.value)


def test_password_missing_lowercase():
    """Senha sem letra minúscula deve ser rejeitada."""
    with pytest.raises(ValueError) as exc:
        validate_password_strength("VALIDPASS123!")
    assert "letra minúscula" in str(exc.value)


def test_password_missing_digit():
    """Senha sem dígito numérico deve ser rejeitada."""
    with pytest.raises(ValueError) as exc:
        validate_password_strength("ValidPassword!")
    assert "dígito numérico" in str(exc.value)


def test_password_missing_special_char():
    """Senha sem caractere especial deve ser rejeitada."""
    with pytest.raises(ValueError) as exc:
        validate_password_strength("ValidPassword123")
    assert "caractere especial" in str(exc.value)


@pytest.mark.parametrize(
    "common",
    [
        "password",
        "password123",
        "admin123",
        "12345678",
        "qwerty123!",
    ],
)
def test_password_common_rejected(common: str):
    """Senhas comuns conhecidas devem ser rejeitadas."""
    with pytest.raises(ValueError) as exc:
        validate_password_strength(common)
    assert "muito comum" in str(exc.value)


def test_pydantic_schema_validation():
    """Verifica que os schemas Pydantic executam a validação de senha."""
    with pytest.raises(ValueError):
        UserCreate(
            email="test@example.com",
            password="weak",
            full_name="User Test",
        )

    with pytest.raises(ValueError):
        PasswordResetConfirm(
            token="token123",
            new_password="weak",
        )
