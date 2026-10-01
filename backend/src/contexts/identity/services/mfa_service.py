"""Serviço de autenticação multifator (MFA) baseado em TOTP e Códigos de Backup."""

from __future__ import annotations

import secrets
import string
from datetime import UTC, datetime
from typing import Any
from uuid import UUID

import pyotp
from sqlalchemy.ext.asyncio import AsyncSession

from src.contexts.identity.domain.models import UserModel
from src.contexts.identity.repositories.mfa_repository import MfaRepository
from src.contexts.identity.security.password import password_hasher
from src.contexts.identity.security.tokens import hash_token
from src.core.config import get_settings
from src.core.exceptions import (
    InvalidMfaConfirmationError,
    InvalidTotpCodeError,
    MfaNotActiveError,
    MfaNotSetupError,
)


class MfaService:
    """Serviço com lógica de geração TOTP, validação temporal e gestão de códigos de backup."""

    @staticmethod
    def generate_totp_secret() -> str:
        """Gera segredo Base32 aleatório para TOTP."""
        return pyotp.random_base32()

    @staticmethod
    def get_totp_uri(
        user_email: str,
        secret: str,
        issuer_name: str | None = None,
    ) -> str:
        """Constrói a URI otpauth:// para geração de QR Code em apps autenticadores."""
        settings = get_settings()
        issuer = issuer_name or getattr(settings, "PROJECT_NAME", "InfraWatch")
        totp = pyotp.TOTP(secret)
        return totp.provisioning_uri(name=user_email, issuer_name=issuer)

    @staticmethod
    def verify_totp_code(
        secret: str,
        code: str,
        valid_window: int = 1,
    ) -> bool:
        """Valida código TOTP de 6 dígitos com tolerância a desvio de relógio."""
        if not secret or not code:
            return False
        cleaned = code.replace(" ", "").replace("-", "").strip()
        if not cleaned.isdigit() or len(cleaned) != 6:
            return False
        totp = pyotp.TOTP(secret)
        return bool(totp.verify(cleaned, valid_window=valid_window))

    @staticmethod
    def generate_backup_codes(count: int = 8) -> list[str]:
        """Gera lista de códigos alfanuméricos únicos formatados (ex: XXXXX-XXXXX)."""
        alphabet = "".join(c for c in string.ascii_uppercase + string.digits if c not in "O0I1")
        codes: set[str] = set()
        while len(codes) < count:
            raw = "".join(secrets.choice(alphabet) for _ in range(10))
            codes.add(f"{raw[:5]}-{raw[5:]}")
        return sorted(codes)

    @staticmethod
    def hash_backup_codes(codes: list[str]) -> list[dict[str, Any]]:
        """Gera hashes SHA-256 dos códigos de backup com metadados de consumo."""
        now_iso = datetime.now(UTC).isoformat()
        return [
            {
                "code_hash": hash_token(code.replace("-", "").upper()),
                "used_at": None,
                "created_at": now_iso,
            }
            for code in codes
        ]

    @staticmethod
    def verify_and_consume_backup_code(
        plain_code: str,
        hashed_codes: list[dict[str, Any]],
    ) -> tuple[bool, list[dict[str, Any]], int]:
        """Verifica e consome um código de backup (Burn on Use)."""
        if not plain_code or not hashed_codes:
            return False, hashed_codes or [], 0

        cleaned = plain_code.replace("-", "").replace(" ", "").strip().upper()
        target_hash = hash_token(cleaned)
        now_iso = datetime.now(UTC).isoformat()
        matched = False
        updated: list[dict[str, Any]] = []

        for item in hashed_codes:
            if not isinstance(item, dict):
                continue
            code_hash = item.get("code_hash", "")
            used_at = item.get("used_at")
            if not matched and used_at is None and code_hash == target_hash:
                matched = True
                updated.append(
                    {
                        "code_hash": code_hash,
                        "used_at": now_iso,
                        "created_at": item.get("created_at", now_iso),
                    }
                )
            else:
                updated.append(item)

        remaining = sum(1 for item in updated if item.get("used_at") is None)
        return matched, updated, remaining

    @classmethod
    async def setup_totp(
        cls,
        session: AsyncSession,
        user: UserModel,
    ) -> tuple[str, str]:
        """Gera segredo e URI para início de configuração do MFA."""
        secret = cls.generate_totp_secret()
        uri = cls.get_totp_uri(user.email, secret)
        mfa_repo = MfaRepository(session)
        await mfa_repo.upsert_pending_secret(user.id, secret, type="totp")
        return secret, uri

    @classmethod
    async def enable_totp(
        cls,
        session: AsyncSession,
        user: UserModel,
        code: str,
    ) -> list[str]:
        """Valida primeiro código, ativa MFA no usuário e retorna códigos de backup em texto plano."""
        mfa_repo = MfaRepository(session)
        method = await mfa_repo.get_by_user_and_type(user.id, type="totp")
        if not method or not method.secret:
            raise MfaNotSetupError()

        if not cls.verify_totp_code(method.secret, code):
            raise InvalidTotpCodeError()

        backup_codes = cls.generate_backup_codes(count=8)
        hashed_codes = cls.hash_backup_codes(backup_codes)

        await mfa_repo.activate_method(method, data={"backup_codes": hashed_codes})
        user.mfa_enabled = True
        user.mfa_type = "totp"
        return backup_codes

    @classmethod
    async def disable_totp(
        cls,
        session: AsyncSession,
        user: UserModel,
        code_or_password: str,
    ) -> None:
        """Desativa MFA validando código TOTP ou senha do usuário."""
        if not user.mfa_enabled:
            raise MfaNotActiveError()

        mfa_repo = MfaRepository(session)
        method = await mfa_repo.get_active_by_user_and_type(user.id, type="totp")
        if not method:
            raise MfaNotActiveError()

        is_totp = method.secret and cls.verify_totp_code(method.secret, code_or_password)
        is_password = password_hasher.verify(user.hashed_password, code_or_password)

        if not is_totp and not is_password:
            raise InvalidMfaConfirmationError("Código TOTP ou senha inválida para desativação.")

        await mfa_repo.deactivate_method(method)
        user.mfa_enabled = False
        user.mfa_type = None

    @classmethod
    async def regenerate_backup_codes(
        cls,
        session: AsyncSession,
        user: UserModel,
    ) -> list[str]:
        """Regenera códigos de backup invalidando os anteriores."""
        if not user.mfa_enabled:
            raise MfaNotActiveError()

        mfa_repo = MfaRepository(session)
        method = await mfa_repo.get_active_by_user_and_type(user.id, type="totp")
        if not method:
            raise MfaNotActiveError()

        backup_codes = cls.generate_backup_codes(count=8)
        hashed_codes = cls.hash_backup_codes(backup_codes)
        method.data = {"backup_codes": hashed_codes}
        await session.flush()
        return backup_codes

    @classmethod
    async def verify_challenge(
        cls,
        session: AsyncSession,
        user_id: UUID,
        code: str,
    ) -> bool:
        """Valida o código de desafio no login via TOTP de 6 dígitos ou código de backup."""
        mfa_repo = MfaRepository(session)
        method = await mfa_repo.get_active_by_user_and_type(user_id, type="totp")
        if not method or not method.secret:
            return False

        # 1. Tentativa via TOTP
        if cls.verify_totp_code(method.secret, code):
            return True

        # 2. Tentativa via Backup Code
        data = method.data or {}
        hashed_codes = data.get("backup_codes", [])
        matched, updated_codes, _ = cls.verify_and_consume_backup_code(code, hashed_codes)
        if matched:
            method.data = {"backup_codes": updated_codes}
            await session.flush()
            return True

        return False
