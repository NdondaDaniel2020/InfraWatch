"""Módulo de segurança criptográfica do contexto de Identidade."""

from src.contexts.identity.security.password import PasswordHasher, password_hasher
from src.contexts.identity.security.rate_limiter import DualKeyRateLimiter
from src.contexts.identity.security.tokens import (
    create_access_token,
    decode_access_token,
    generate_opaque_token,
    hash_token,
)

__all__ = [
    "DualKeyRateLimiter",
    "PasswordHasher",
    "create_access_token",
    "decode_access_token",
    "generate_opaque_token",
    "hash_token",
    "password_hasher",
]
