"""Repositório assíncrono para métodos de autenticação multifator (MFA)."""

from __future__ import annotations

from typing import Any
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.contexts.iam.database.models import MfaMethodModel


class MfaRepository:
    """Repositório de persistência de métodos MFA do usuário."""

    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def get_by_user_and_type(
        self, user_id: UUID, type: str = "totp"
    ) -> MfaMethodModel | None:
        """Busca o método MFA para um usuário e tipo específicos."""
        query = select(MfaMethodModel).where(
            MfaMethodModel.user_id == user_id, MfaMethodModel.type == type
        )
        result = await self.session.execute(query)
        return result.scalar_one_or_none()

    async def get_active_by_user_and_type(
        self, user_id: UUID, type: str = "totp"
    ) -> MfaMethodModel | None:
        """Busca o método MFA ativo para um usuário e tipo específicos."""
        query = select(MfaMethodModel).where(
            MfaMethodModel.user_id == user_id,
            MfaMethodModel.type == type,
            MfaMethodModel.is_active.is_(True),
        )
        result = await self.session.execute(query)
        return result.scalar_one_or_none()

    async def upsert_pending_secret(
        self, user_id: UUID, secret: str, type: str = "totp"
    ) -> MfaMethodModel:
        """Cria ou atualiza um segredo MFA pendente (inativo) para o usuário."""
        mfa_method = await self.get_by_user_and_type(user_id, type=type)
        if mfa_method:
            mfa_method.secret = secret
            mfa_method.is_active = False
        else:
            mfa_method = MfaMethodModel(
                user_id=user_id,
                type=type,
                secret=secret,
                is_active=False,
            )
            self.session.add(mfa_method)
        await self.session.flush()
        return mfa_method

    async def activate_method(
        self,
        mfa_method: MfaMethodModel,
        data: dict[str, Any] | None = None,
    ) -> MfaMethodModel:
        """Ativa o método MFA e persiste metadados opcionais (como backup codes)."""
        mfa_method.is_active = True
        if data is not None:
            mfa_method.data = data
        await self.session.flush()
        return mfa_method

    async def deactivate_method(self, mfa_method: MfaMethodModel) -> None:
        """Desativa o método MFA e limpa credenciais sensíveis."""
        mfa_method.is_active = False
        mfa_method.secret = None
        mfa_method.data = None
        await self.session.flush()
