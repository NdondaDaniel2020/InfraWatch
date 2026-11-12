"""Serviço de aplicação para governança, atualização persistente e reset de configurações (Issue #312).

Orquestra a regra de precedência:
Banco de Dados (system_settings) > .env / Secrets (Padrão de Fábrica).
Garante auditoria forense (ADR-019), validação prévia de conectividade e emissão
de eventos no Transactional Outbox para atualização reativa dos daemons.
"""

from __future__ import annotations

import logging
from typing import Any
from urllib.parse import urlparse
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from src.contexts.iam.services.audit_service import AuditService
from src.contexts.system.database.repository import SystemSettingsRepository
from src.contexts.system.domain.events import (
    SystemSettingResetEvent,
    SystemSettingUpdatedEvent,
)
from src.contexts.system.schemas.settings import (
    GlpiSettingsUpdateRequest,
    GlpiTestRequest,
    IntegrationUpdateResponse,
    SmtpSettingsUpdateRequest,
    WebhookSettingsUpdateRequest,
    WhatsappSettingsUpdateRequest,
    ZabbixSettingsUpdateRequest,
    ZabbixTestRequest,
)
from src.contexts.system.services.dynamic_settings_provider import (
    DynamicSettingsProvider,
    get_dynamic_settings_provider,
)
from src.contexts.system.services.integration_tester import (
    IntegrationTesterService,
    get_integration_tester_service,
)
from src.core.database.outbox_repository import OutboxRepository

logger = logging.getLogger("infrawatch.system.settings_service")


def _validate_url(url: str, param_name: str = "endpoint") -> None:
    """Valida se uma string é uma URL HTTP/HTTPS bem formada com host."""
    parsed = urlparse(url.strip())
    if parsed.scheme not in ("http", "https") or not parsed.netloc:
        raise ValueError(
            f"O parâmetro '{param_name}' deve ser uma URL válida com esquema http:// ou https:// e host definido."
        )


class SystemSettingsService:
    """Gerencia a persistência transacional de configurações dinâmicas do sistema."""

    def __init__(
        self,
        session: AsyncSession,
        dynamic_provider: DynamicSettingsProvider | None = None,
        integration_tester: IntegrationTesterService | None = None,
    ) -> None:
        self.session = session
        self.repository = SystemSettingsRepository(session)
        self.audit_service = AuditService(session)
        self.dynamic_provider = dynamic_provider or get_dynamic_settings_provider()
        self.integration_tester = integration_tester or get_integration_tester_service()

    async def update_glpi_settings(
        self,
        payload: GlpiSettingsUpdateRequest,
        updated_by: UUID | None = None,
        ip_address: str | None = None,
    ) -> IntegrationUpdateResponse:
        """Valida, testa e persiste permanentemente parâmetros da integração GLPI."""
        _validate_url(payload.endpoint, "endpoint")

        existing = await self.repository.get_category_dict("glpi")

        effective_app_token = payload.app_token if payload.app_token else existing.get("glpi.app_token", "")
        effective_user_token = payload.user_token if payload.user_token else existing.get("glpi.user_token", "")

        if payload.validate_connectivity:
            test_req = GlpiTestRequest(
                base_url=payload.endpoint,
                app_token=effective_app_token or None,
                user_token=effective_user_token or None,
            )
            test_res = await self.integration_tester.test_glpi(test_req)
            if not test_res.success:
                raise ValueError(
                    f"Falha na validação de conectividade com GLPI: {test_res.message} ({test_res.error or 'Sem resposta'})"
                )

        await self.repository.save_setting(
            key="glpi.base_url",
            category="glpi",
            value=payload.endpoint.strip(),
            is_secret=False,
            updated_by=updated_by,
        )
        await self.repository.save_setting(
            key="glpi.enabled",
            category="glpi",
            value="true" if payload.enabled else "false",
            is_secret=False,
            updated_by=updated_by,
        )
        if effective_app_token:
            await self.repository.save_setting(
                key="glpi.app_token",
                category="glpi",
                value=effective_app_token,
                is_secret=True,
                updated_by=updated_by,
            )
        if effective_user_token:
            await self.repository.save_setting(
                key="glpi.user_token",
                category="glpi",
                value=effective_user_token,
                is_secret=True,
                updated_by=updated_by,
            )
        await self.repository.save_setting(
            key="glpi.timeout_seconds",
            category="glpi",
            value=str(payload.timeout_seconds),
            is_secret=False,
            updated_by=updated_by,
        )

        event = SystemSettingUpdatedEvent(
            category="glpi",
            key="glpi.*",
            is_secret=False,
            updated_by=updated_by,
        )
        OutboxRepository.add_event(self.session, event, aggregate_type="system_settings")

        await self.audit_service.record_action(
            action="system.settings.update",
            resource_type="system_settings",
            resource_id="glpi",
            actor_user_id=updated_by,
            details={
                "category": "glpi",
                "endpoint": payload.endpoint,
                "enabled": payload.enabled,
                "timeout_seconds": payload.timeout_seconds,
            },
            ip_address=ip_address,
        )

        self.dynamic_provider.invalidate_cache("glpi")

        return IntegrationUpdateResponse(
            success=True,
            name="glpi",
            message="Configurações do GLPI atualizadas e persistidas com sucesso.",
            source="database",
            details={"endpoint": payload.endpoint, "enabled": payload.enabled},
        )

    async def update_zabbix_settings(
        self,
        payload: ZabbixSettingsUpdateRequest,
        updated_by: UUID | None = None,
        ip_address: str | None = None,
    ) -> IntegrationUpdateResponse:
        """Valida, testa e persiste permanentemente parâmetros da integração Zabbix."""
        _validate_url(payload.endpoint, "endpoint")

        existing = await self.repository.get_category_dict("zabbix")

        effective_api_token = (
            payload.api_token if payload.api_token is not None else existing.get("zabbix.api_token", "")
        )
        effective_username = (
            payload.username if payload.username is not None else existing.get("zabbix.user", "Admin")
        )
        effective_password = (
            payload.password if payload.password is not None else existing.get("zabbix.password", "")
        )

        if payload.validate_connectivity:
            test_req = ZabbixTestRequest(
                api_url=payload.endpoint,
                api_token=effective_api_token or None,
                username=effective_username or None,
                password=effective_password or None,
            )
            test_res = await self.integration_tester.test_zabbix(test_req)
            if not test_res.success:
                raise ValueError(
                    f"Falha na validação de conectividade com Zabbix: {test_res.message} ({test_res.error or 'Sem resposta'})"
                )

        await self.repository.save_setting(
            key="zabbix.api_url",
            category="zabbix",
            value=payload.endpoint.strip(),
            is_secret=False,
            updated_by=updated_by,
        )
        await self.repository.save_setting(
            key="zabbix.enabled",
            category="zabbix",
            value="true" if payload.enabled else "false",
            is_secret=False,
            updated_by=updated_by,
        )
        if effective_api_token:
            await self.repository.save_setting(
                key="zabbix.api_token",
                category="zabbix",
                value=effective_api_token,
                is_secret=True,
                updated_by=updated_by,
            )
        if effective_username:
            await self.repository.save_setting(
                key="zabbix.user",
                category="zabbix",
                value=effective_username,
                is_secret=False,
                updated_by=updated_by,
            )
        if effective_password:
            await self.repository.save_setting(
                key="zabbix.password",
                category="zabbix",
                value=effective_password,
                is_secret=True,
                updated_by=updated_by,
            )
        await self.repository.save_setting(
            key="zabbix.timeout_seconds",
            category="zabbix",
            value=str(payload.timeout_seconds),
            is_secret=False,
            updated_by=updated_by,
        )

        event = SystemSettingUpdatedEvent(
            category="zabbix",
            key="zabbix.*",
            is_secret=False,
            updated_by=updated_by,
        )
        OutboxRepository.add_event(self.session, event, aggregate_type="system_settings")

        await self.audit_service.record_action(
            action="system.settings.update",
            resource_type="system_settings",
            resource_id="zabbix",
            actor_user_id=updated_by,
            details={
                "category": "zabbix",
                "endpoint": payload.endpoint,
                "enabled": payload.enabled,
                "timeout_seconds": payload.timeout_seconds,
            },
            ip_address=ip_address,
        )

        self.dynamic_provider.invalidate_cache("zabbix")

        return IntegrationUpdateResponse(
            success=True,
            name="zabbix",
            message="Configurações do Zabbix atualizadas e persistidas com sucesso.",
            source="database",
            details={"endpoint": payload.endpoint, "enabled": payload.enabled},
        )

    async def update_whatsapp_settings(
        self,
        payload: WhatsappSettingsUpdateRequest,
        updated_by: UUID | None = None,
        ip_address: str | None = None,
    ) -> IntegrationUpdateResponse:
        """Persiste parâmetros de conexão do gateway WhatsApp."""
        _validate_url(payload.gateway_url, "gateway_url")

        existing = await self.repository.get_category_dict("whatsapp")
        effective_api_token = (
            payload.api_token if payload.api_token is not None else existing.get("whatsapp.api_token", "")
        )

        await self.repository.save_setting(
            key="whatsapp.gateway_url",
            category="whatsapp",
            value=payload.gateway_url.strip(),
            is_secret=False,
            updated_by=updated_by,
        )
        await self.repository.save_setting(
            key="whatsapp.enabled",
            category="whatsapp",
            value="true" if payload.enabled else "false",
            is_secret=False,
            updated_by=updated_by,
        )
        if effective_api_token:
            await self.repository.save_setting(
                key="whatsapp.api_token",
                category="whatsapp",
                value=effective_api_token,
                is_secret=True,
                updated_by=updated_by,
            )
        if payload.default_recipient:
            await self.repository.save_setting(
                key="whatsapp.default_recipient",
                category="whatsapp",
                value=payload.default_recipient.strip(),
                is_secret=False,
                updated_by=updated_by,
            )

        event = SystemSettingUpdatedEvent(
            category="whatsapp",
            key="whatsapp.*",
            is_secret=False,
            updated_by=updated_by,
        )
        OutboxRepository.add_event(self.session, event, aggregate_type="system_settings")

        await self.audit_service.record_action(
            action="system.settings.update",
            resource_type="system_settings",
            resource_id="whatsapp",
            actor_user_id=updated_by,
            details={"category": "whatsapp", "gateway_url": payload.gateway_url, "enabled": payload.enabled},
            ip_address=ip_address,
        )

        self.dynamic_provider.invalidate_cache("whatsapp")

        return IntegrationUpdateResponse(
            success=True,
            name="whatsapp",
            message="Configurações do WhatsApp atualizadas com sucesso.",
            source="database",
            details={"gateway_url": payload.gateway_url, "enabled": payload.enabled},
        )

    async def update_smtp_settings(
        self,
        payload: SmtpSettingsUpdateRequest,
        updated_by: UUID | None = None,
        ip_address: str | None = None,
    ) -> IntegrationUpdateResponse:
        """Persiste parâmetros de conexão do servidor SMTP."""
        existing = await self.repository.get_category_dict("smtp")
        effective_password = (
            payload.password if payload.password is not None else existing.get("smtp.password", "")
        )

        await self.repository.save_setting(
            key="smtp.host", category="smtp", value=payload.host.strip(), is_secret=False, updated_by=updated_by
        )
        await self.repository.save_setting(
            key="smtp.port", category="smtp", value=str(payload.port), is_secret=False, updated_by=updated_by
        )
        await self.repository.save_setting(
            key="smtp.tls",
            category="smtp",
            value="true" if payload.tls else "false",
            is_secret=False,
            updated_by=updated_by,
        )
        await self.repository.save_setting(
            key="smtp.from", category="smtp", value=payload.from_address.strip(), is_secret=False, updated_by=updated_by
        )
        if payload.user:
            await self.repository.save_setting(
                key="smtp.user", category="smtp", value=payload.user.strip(), is_secret=False, updated_by=updated_by
            )
        if effective_password:
            await self.repository.save_setting(
                key="smtp.password", category="smtp", value=effective_password, is_secret=True, updated_by=updated_by
            )
        if payload.default_recipient:
            await self.repository.save_setting(
                key="smtp.default_recipient",
                category="smtp",
                value=payload.default_recipient.strip(),
                is_secret=False,
                updated_by=updated_by,
            )

        event = SystemSettingUpdatedEvent(
            category="smtp",
            key="smtp.*",
            is_secret=False,
            updated_by=updated_by,
        )
        OutboxRepository.add_event(self.session, event, aggregate_type="system_settings")

        await self.audit_service.record_action(
            action="system.settings.update",
            resource_type="system_settings",
            resource_id="smtp",
            actor_user_id=updated_by,
            details={"category": "smtp", "host": payload.host, "port": payload.port},
            ip_address=ip_address,
        )

        self.dynamic_provider.invalidate_cache("smtp")

        return IntegrationUpdateResponse(
            success=True,
            name="smtp",
            message="Configurações de SMTP atualizadas com sucesso.",
            source="database",
            details={"host": payload.host, "port": payload.port},
        )

    async def update_webhook_settings(
        self,
        payload: WebhookSettingsUpdateRequest,
        updated_by: UUID | None = None,
        ip_address: str | None = None,
    ) -> IntegrationUpdateResponse:
        """Persiste parâmetros do webhook de alerta padrão."""
        _validate_url(payload.url, "url")

        await self.repository.save_setting(
            key="webhook.url", category="webhook", value=payload.url.strip(), is_secret=False, updated_by=updated_by
        )
        await self.repository.save_setting(
            key="webhook.enabled",
            category="webhook",
            value="true" if payload.enabled else "false",
            is_secret=False,
            updated_by=updated_by,
        )

        event = SystemSettingUpdatedEvent(
            category="webhook",
            key="webhook.*",
            is_secret=False,
            updated_by=updated_by,
        )
        OutboxRepository.add_event(self.session, event, aggregate_type="system_settings")

        await self.audit_service.record_action(
            action="system.settings.update",
            resource_type="system_settings",
            resource_id="webhook",
            actor_user_id=updated_by,
            details={"category": "webhook", "url": payload.url, "enabled": payload.enabled},
            ip_address=ip_address,
        )

        self.dynamic_provider.invalidate_cache("webhook")

        return IntegrationUpdateResponse(
            success=True,
            name="webhook",
            message="Configurações de Webhook atualizadas com sucesso.",
            source="database",
            details={"url": payload.url, "enabled": payload.enabled},
        )

    async def reset_category_settings(
        self,
        category: str,
        updated_by: UUID | None = None,
        ip_address: str | None = None,
    ) -> IntegrationUpdateResponse:
        """Remove overrides de uma categoria no banco de dados, restaurando o padrão .env."""
        valid_categories = {"glpi", "zabbix", "whatsapp", "smtp", "webhook"}
        cat_lower = category.lower().strip()
        if cat_lower not in valid_categories:
            raise ValueError(
                f"Categoria '{category}' inválida para reset. Categorias suportadas: {', '.join(sorted(valid_categories))}."
            )

        deleted_count = await self.repository.delete_by_category(cat_lower)

        event = SystemSettingResetEvent(
            category=cat_lower,
            updated_by=updated_by,
        )
        OutboxRepository.add_event(self.session, event, aggregate_type="system_settings")

        await self.audit_service.record_action(
            action="system.settings.reset",
            resource_type="system_settings",
            resource_id=cat_lower,
            actor_user_id=updated_by,
            details={"category": cat_lower, "deleted_count": deleted_count},
            ip_address=ip_address,
        )

        self.dynamic_provider.invalidate_cache(cat_lower)

        return IntegrationUpdateResponse(
            success=True,
            name=cat_lower,
            message=f"Configurações de '{cat_lower}' restauradas para o padrão do ambiente.",
            source="environment",
            details={"deleted_count": deleted_count},
        )


__all__ = ["SystemSettingsService"]
