"""Serviço de autenticação multifator (MFA) baseado em TOTP e Códigos de Backup."""

from __future__ import annotations

import secrets
import string
from datetime import UTC, datetime
from typing import Any
from uuid import UUID

import pyotp
from sqlalchemy.ext.asyncio import AsyncSession

from src.contexts.identity.repositories.mfa_repository import MfaRepository
from src.contexts.identity.repositories.user_repository import UserRepository
from src.contexts.identity.security.password import password_hasher
from src.contexts.identity.security.tokens import hash_token
from src.core.config import get_settings
from src.core.exceptions import (
    AuthenticationError,
    InvalidMfaConfirmationError,
    InvalidTotpCodeError,
    MfaNotActiveError,
    MfaNotSetupError,
    NotFoundError,
)


class MfaService:
    """Serviço com lógica de geração TOTP, validação temporal e gestão de códigos de backup."""

    def __init__(self, session: AsyncSession) -> None:
        self.session = session
        self.mfa_repo = MfaRepository(session)
        self.user_repo = UserRepository(session)

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
        """Valida o código TOTP de 6 dígitos com tolerância de drift temporal configurável."""
        totp = pyotp.TOTP(secret)
        return bool(totp.verify(code.strip(), valid_window=valid_window))

    @staticmethod
    def generate_backup_codes(count: int = 10) -> list[str]:
        """Gera lote de códigos de recuperação aleatórios no formato 8 caracteres alfanuméricos."""
        alphabet = string.ascii_uppercase + string.digits
        # Remove caracteres ambíguos (0, O, 1, I, L)
        alphabet = "".join(c for c in alphabet if c not in "0O1IL")
        codes: list[str] = []
        for _ in range(count):
            part1 = "".join(secrets.choice(alphabet) for _ in range(4))
            part2 = "".join(secrets.choice(alphabet) for _ in range(4))
            codes.append(f"{part1}-{part2}")
        return codes

    @staticmethod
    def hash_backup_codes(codes: list[str]) -> list[dict[str, Any]]:
        """Gera hashes SHA-256 e metadados para persistência segura dos códigos de recuperação."""
        now_iso = datetime.now(UTC).isoformat()
        return [
            {
                "code_hash": hash_token(code.replace("-", "").upper()),
                "created_at": now_iso,
                "used_at": None,
            }
            for code in codes
        ]

    @staticmethod
    def verify_and_consume_backup_code(
        raw_code: str,
        hashed_codes: list[dict[str, Any]],
    ) -> tuple[bool, list[dict[str, Any]], int]:
        """Verifica se o código fornecido é válido e ainda não foi usado (Burn on Use)."""
        target_hash = hash_token(raw_code.replace("-", "").strip().upper())
        matched = False
        updated: list[dict[str, Any]] = []
        now_iso = datetime.now(UTC).isoformat()

        for item in hashed_codes:
            code_hash = item.get("code_hash")
            used_at = item.get("used_at")

            if code_hash == target_hash and used_at is None and not matched:
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

    async def setup_totp(
        self,
        user_id: UUID,
        user_email: str,
    ) -> tuple[str, str]:
        """Gera segredo e URI para início de configuração do MFA."""
        user = await self.user_repo.get_by_id(user_id)
        if not user:
            raise NotFoundError("Usuário não encontrado.")

        secret = self.generate_totp_secret()
        uri = self.get_totp_uri(user_email, secret)
        await self.mfa_repo.upsert_pending_secret(user_id, secret, type="totp")
        return secret, uri

    async def enable_totp(
        self,
        user_id: UUID,
        code: str,
    ) -> list[str]:
        """Valida primeiro código, ativa MFA no usuário e retorna códigos de backup em texto plano."""
        user = await self.user_repo.get_by_id(user_id)
        if not user:
            raise NotFoundError("Usuário não encontrado.")

        method = await self.mfa_repo.get_by_user_and_type(user_id, type="totp")
        if not method or not method.secret:
            raise MfaNotSetupError()

        if not self.verify_totp_code(method.secret, code):
            raise InvalidTotpCodeError()

        backup_codes = self.generate_backup_codes(count=10)
        hashed_codes = self.hash_backup_codes(backup_codes)

        await self.mfa_repo.activate_method(method, data={"backup_codes": hashed_codes})
        user.mfa_enabled = True
        user.mfa_type = "totp"
        await self.session.flush()
        return backup_codes

    async def disable_totp(
        self,
        user_id: UUID,
        password: str,
        code: str,
    ) -> None:
        """Desativa MFA validando código TOTP ou código de backup e senha do usuário."""
        user = await self.user_repo.get_by_id(user_id)
        if not user:
            raise NotFoundError("Usuário não encontrado.")

        if not user.mfa_enabled:
            raise MfaNotActiveError()

        if not password_hasher.verify(user.hashed_password, password):
            raise AuthenticationError("Senha incorreta para confirmação de segurança.")

        method = await self.mfa_repo.get_active_by_user_and_type(user_id, type="totp")
        if not method or not method.secret:
            raise MfaNotActiveError()

        is_totp = self.verify_totp_code(method.secret, code)
        is_backup = False
        data = method.data or {}
        hashed_codes = data.get("backup_codes", [])
        matched, updated_codes, _ = self.verify_and_consume_backup_code(code, hashed_codes)
        if matched:
            is_backup = True
            method.data = {"backup_codes": updated_codes}

        if not is_totp and not is_backup:
            raise InvalidMfaConfirmationError("Código TOTP ou de backup inválido.")

        await self.mfa_repo.deactivate_method(method)
        user.mfa_enabled = False
        user.mfa_type = None
        await self.session.flush()

    async def regenerate_backup_codes(
        self,
        user_id: UUID,
        password: str,
    ) -> list[str]:
        """Regenera códigos de backup invalidando os anteriores mediante confirmação de senha."""
        user = await self.user_repo.get_by_id(user_id)
        if not user:
            raise NotFoundError("Usuário não encontrado.")

        if not user.mfa_enabled:
            raise MfaNotActiveError()

        if not password_hasher.verify(user.hashed_password, password):
            raise AuthenticationError("Senha incorreta para confirmação de segurança.")

        method = await self.mfa_repo.get_active_by_user_and_type(user_id, type="totp")
        if not method:
            raise MfaNotActiveError()

        backup_codes = self.generate_backup_codes(count=10)
        hashed_codes = self.hash_backup_codes(backup_codes)
        method.data = {"backup_codes": hashed_codes}
        await self.session.flush()
        return backup_codes

    async def verify_challenge(
        self,
        user_id: UUID,
        code: str,
    ) -> bool:
        """Valida o código de desafio no login via TOTP de 6 dígitos ou código de backup."""
        method = await self.mfa_repo.get_active_by_user_and_type(user_id, type="totp")
        if not method or not method.secret:
            return False

        # 1. Tentativa via TOTP
        if self.verify_totp_code(method.secret, code):
            return True

        # 2. Tentativa via Backup Code
        data = method.data or {}
        hashed_codes = data.get("backup_codes", [])
        matched, updated_codes, _ = self.verify_and_consume_backup_code(code, hashed_codes)
        if matched:
            method.data = {"backup_codes": updated_codes}
            await self.session.flush()
            return True

        return False
