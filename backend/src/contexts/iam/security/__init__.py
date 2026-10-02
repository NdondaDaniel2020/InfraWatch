"""Módulo de segurança criptográfica do contexto de Identidade."""

from src.contexts.iam.security.password import PasswordHasher, password_hasher
from src.contexts.iam.security.rate_limiter import DualKeyRateLimiter
from src.contexts.iam.security.timing import (
    DUMMY_ARGON2_HASH,
    constant_time_verify,
    constant_time_verify_sync,
)
from src.contexts.iam.security.tokens import (
    create_access_token,
    decode_access_token,
    generate_opaque_token,
    hash_token,
)

__all__ = [
    "DUMMY_ARGON2_HASH",
    "DualKeyRateLimiter",
    "PasswordHasher",
    "constant_time_verify",
    "constant_time_verify_sync",
    "create_access_token",
    "decode_access_token",
    "generate_opaque_token",
    "hash_token",
    "password_hasher",
]
