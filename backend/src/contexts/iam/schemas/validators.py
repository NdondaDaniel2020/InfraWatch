"""Validadores reutilizáveis para schemas de identidade."""

from __future__ import annotations

import re

_UPPERCASE_RE = re.compile(r"[A-Z]")
_LOWERCASE_RE = re.compile(r"[a-z]")
_DIGIT_RE = re.compile(r"[0-9]")
_SPECIAL_RE = re.compile(r"[^A-Za-z0-9]")

COMMON_PASSWORDS = frozenset(
    {
        "password",
        "password1",
        "password123",
        "password1234",
        "12345678",
        "123456789",
        "1234567890",
        "qwerty123",
        "qwertyuiop",
        "abc12345",
        "letmein",
        "admin123",
        "admin1234",
        "welcome1",
        "iloveyou",
        "monkey123",
        "dragon123",
        "football1",
        "whatever1",
        "superman1",
        "password123!",
        "passw0rd",
        "qwerty123!",
        "admin123!",
    }
)


def validate_password_strength(password: str) -> str:
    """Valida força da senha de acordo com a política de segurança."""
    if len(password) < 8:
        raise ValueError("A senha deve ter pelo menos 8 caracteres.")

    if len(password) > 128:
        raise ValueError("A senha deve ter no máximo 128 caracteres.")

    if password.lower() in COMMON_PASSWORDS:
        raise ValueError("A senha informada é muito comum e insegura.")

    missing: list[str] = []
    if not _UPPERCASE_RE.search(password):
        missing.append("letra maiúscula")
    if not _LOWERCASE_RE.search(password):
        missing.append("letra minúscula")
    if not _DIGIT_RE.search(password):
        missing.append("dígito numérico")
    if not _SPECIAL_RE.search(password):
        missing.append("caractere especial")

    if missing:
        raise ValueError(f"A senha deve conter pelo menos: {', '.join(missing)}.")

    return password
