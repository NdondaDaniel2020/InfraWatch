"""Repositório de persistência para configurações do sistema (Bounded Context: System)."""

from __future__ import annotations

import logging
from collections.abc import Sequence
from datetime import UTC, datetime
from uuid import UUID

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from src.contexts.system.database.models import SystemSettingModel
from src.contexts.system.domain.models import SystemSetting
from src.core.security.crypto import decrypt_secret, encrypt_secret

logger = logging.getLogger("infrawatch.system.repository")


class SystemSettingsRepository:
    """Repositório assíncrono para manipulação da tabela system_settings."""

    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    def _to_domain(self, model: SystemSettingModel) -> SystemSetting:
        """Converte o modelo ORM em entidade de domínio, decifrando se for confidencial."""
        value = model.value
        if model.is_secret:
            try:
                value = decrypt_secret(model.value)
            except Exception as exc:
                logger.error("Falha ao decifrar segredo para a chave %r: %s", model.key, exc)
                value = ""

        return SystemSetting(
            key=model.key,
            category=model.category,
            value=value,
            is_secret=model.is_secret,
            updated_at=model.updated_at,
            updated_by=model.updated_by,
        )

    async def get_by_key(self, key: str) -> SystemSetting | None:
        """Busca uma configuração por sua chave primária."""
        stmt = select(SystemSettingModel).where(SystemSettingModel.key == key)
        result = await self.session.execute(stmt)
        model = result.scalar_one_or_none()
        if not model:
            return None
        return self._to_domain(model)

    async def list_by_category(self, category: str) -> list[SystemSetting]:
        """Retorna todas as configurações vinculadas a uma categoria."""
        stmt = (
            select(SystemSettingModel)
            .where(SystemSettingModel.category == category)
            .order_by(SystemSettingModel.key.asc())
        )
        result = await self.session.execute(stmt)
        models: Sequence[SystemSettingModel] = result.scalars().all()
        return [self._to_domain(m) for m in models]

    async def get_category_dict(self, category: str) -> dict[str, str]:
        """Retorna um dicionário chave -> valor plano decifrado para a categoria."""
        items = await self.list_by_category(category)
        return {item.key: item.value for item in items}

    async def list_all(self) -> list[SystemSetting]:
        """Lista todas as configurações cadastradas."""
        stmt = select(SystemSettingModel).order_by(SystemSettingModel.category.asc(), SystemSettingModel.key.asc())
        result = await self.session.execute(stmt)
        models: Sequence[SystemSettingModel] = result.scalars().all()
        return [self._to_domain(m) for m in models]

    async def save_setting(
        self,
        key: str,
        category: str,
        value: str,
        is_secret: bool = False,
        user_id: UUID | None = None,
    ) -> SystemSetting:
        """Salva ou atualiza uma configuração (upsert), cifrando valores confidenciais."""
        stored_value = encrypt_secret(value) if is_secret else value

        stmt = select(SystemSettingModel).where(SystemSettingModel.key == key)
        result = await self.session.execute(stmt)
        existing = result.scalar_one_or_none()

        now = datetime.now(UTC)
        if existing:
            existing.category = category
            existing.value = stored_value
            existing.is_secret = is_secret
            existing.updated_at = now
            existing.updated_by = user_id
            target = existing
        else:
            target = SystemSettingModel(
                key=key,
                category=category,
                value=stored_value,
                is_secret=is_secret,
                updated_at=now,
                updated_by=user_id,
            )
            self.session.add(target)

        await self.session.flush()

        return SystemSetting(
            key=key,
            category=category,
            value=value,
            is_secret=is_secret,
            updated_at=now,
            updated_by=user_id,
        )

    async def delete_by_key(self, key: str) -> bool:
        """Remove uma configuração específica por chave."""
        stmt = delete(SystemSettingModel).where(SystemSettingModel.key == key)
        result = await self.session.execute(stmt)
        await self.session.flush()
        return bool(result.rowcount and result.rowcount > 0)

    async def delete_by_category(self, category: str) -> int:
        """Remove todas as configurações de uma categoria."""
        stmt = delete(SystemSettingModel).where(SystemSettingModel.category == category)
        result = await self.session.execute(stmt)
        await self.session.flush()
        return int(result.rowcount or 0)


__all__ = ["SystemSettingsRepository"]
