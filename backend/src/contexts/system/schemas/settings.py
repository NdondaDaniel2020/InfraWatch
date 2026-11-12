"""Schemas Pydantic para o diagnóstico e teste de integrações corporativas (Issue #268)."""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field


class IntegrationStatusItem(BaseModel):
    """Metadados e estado operacional de uma integração externa."""

    name: str = Field(description="Identificador da integração (ex: glpi, zabbix, telegram)")
    enabled: bool = Field(description="Indica se a integração está ativa no ambiente")
    endpoint: str | None = Field(default=None, description="URL ou host de destino")
    configured: bool = Field(description="Indica se as credenciais mínimas foram fornecidas")
    source: Literal["database", "environment"] = Field(
        default="environment", description="Origem da configuração ativa"
    )
    updated_at: str | None = Field(
        default=None, description="Timestamp ISO da última alteração via banco de dados"
    )
    updated_by_email: str | None = Field(
        default=None, description="Email do operador que alterou a configuração"
    )
    details: dict[str, Any] = Field(default_factory=dict, description="Metadados não sensíveis")


class IntegrationStatusResponse(BaseModel):
    """Visão consolidada de todas as integrações externas e recursos do cluster."""

    integrations: list[IntegrationStatusItem] = Field(default_factory=list)
    environment: str = Field(
        description="Ambiente de execução atual (development, production, etc.)"
    )


class GlpiTestRequest(BaseModel):
    """Payload opcional para teste de conexão direta com o GLPI."""

    base_url: str | None = Field(
        default=None, description="URL da API REST do GLPI para teste efêmero"
    )
    app_token: str | None = Field(default=None, description="App-Token para teste efêmero")
    user_token: str | None = Field(default=None, description="User-Token para teste efêmero")


class GlpiTestResponse(BaseModel):
    """Resultado da validação de autenticação e abertura/fechamento de chamado no GLPI."""

    success: bool = Field(description="Indica se todo o fluxo foi executado com sucesso")
    latency_ms: float = Field(description="Tempo total de resposta da API do GLPI em milissegundos")
    message: str = Field(description="Mensagem resumida do diagnóstico")
    session_token_obtained: bool = Field(
        default=False, description="Indica se o token de sessão foi obtido"
    )
    ticket_id: int | None = Field(
        default=None, description="ID do chamado criado e fechado no teste"
    )
    error: str | None = Field(default=None, description="Detalhes de erro em caso de falha")


class ZabbixTestRequest(BaseModel):
    """Payload opcional para teste de conexão direta com o Zabbix JSON-RPC."""

    api_url: str | None = Field(default=None, description="URL da API JSON-RPC do Zabbix")
    api_token: str | None = Field(default=None, description="API Token permanente do Zabbix")
    username: str | None = Field(default=None, description="Usuário de serviço")
    password: str | None = Field(default=None, description="Senha do usuário")


class ZabbixTestResponse(BaseModel):
    """Resultado da validação de autenticação e consulta de inventário no Zabbix."""

    success: bool = Field(description="Indica se a conexão e autenticação foram bem-sucedidas")
    latency_ms: float = Field(description="Tempo de resposta da API JSON-RPC em milissegundos")
    message: str = Field(description="Mensagem resumida do diagnóstico")
    api_version: str | None = Field(
        default=None, description="Versão retornada pelo servidor Zabbix"
    )
    hosts_count: int = Field(
        default=0, description="Quantidade de hosts identificados no inventário"
    )
    error: str | None = Field(default=None, description="Detalhes de erro em caso de falha")


class NotificationTestRequest(BaseModel):
    """Parâmetros para disparo de alerta sintético de teste em canal de notificação."""

    channel: Literal["telegram", "whatsapp", "smtp", "webhook"] = Field(
        description="Canal de notificação a ser testado"
    )
    recipient: str | None = Field(
        default=None,
        description="Destinatário específico para o teste (e-mail, chat_id ou telefone)",
    )
    severity: Literal["CRITICAL", "DEGRADED", "RESOLVED", "INFO"] = Field(
        default="CRITICAL", description="Severidade do alerta simulado"
    )


class NotificationTestResponse(BaseModel):
    """Resultado do disparo de alerta de teste."""

    success: bool = Field(description="Indica se o alerta foi aceito e entregue pelo canal")
    channel: str = Field(description="Nome do canal testado")
    latency_ms: float = Field(description="Tempo de despacho em milissegundos")
    message: str = Field(description="Mensagem informativa de entrega")
    error: str | None = Field(default=None, description="Detalhes de falha do provedor")


class InfraTestResponse(BaseModel):
    """Diagnóstico de conectividade e latência com os componentes do cluster."""

    postgres_ok: bool = Field(description="Conectividade com PostgreSQL / TimescaleDB")
    postgres_latency_ms: float = Field(description="Latência do ping SQL em milissegundos")
    redis_ok: bool = Field(description="Conectividade com Redis Streams")
    redis_latency_ms: float = Field(
        description="Latência do comando PING no Redis em milissegundos"
    )
    message: str = Field(description="Resumo do estado operacional do cluster")


class GlpiSettingsUpdateRequest(BaseModel):
    """Payload para atualização persistente de parâmetros do GLPI ITSM."""

    endpoint: str = Field(description="URL base da API REST do GLPI (ex: https://glpi.empresa.ao/apirest.php)")
    enabled: bool = Field(default=True, description="Habilitar integração com GLPI")
    app_token: str | None = Field(default=None, description="App-Token do GLPI (omitir para preservar atual)")
    user_token: str | None = Field(default=None, description="User-Token do GLPI (omitir para preservar atual)")
    timeout_seconds: float = Field(default=10.0, ge=1.0, le=60.0, description="Timeout de requisição em segundos")
    validate_connectivity: bool = Field(default=True, description="Executa teste prévio de conexão antes de persistir")


class ZabbixSettingsUpdateRequest(BaseModel):
    """Payload para atualização persistente de parâmetros do Zabbix Server."""

    endpoint: str = Field(description="URL da API JSON-RPC do Zabbix (ex: https://zabbix.empresa.ao/api_jsonrpc.php)")
    enabled: bool = Field(default=True, description="Habilitar sincronização com Zabbix")
    api_token: str | None = Field(default=None, description="API Token permanente do Zabbix")
    username: str | None = Field(default=None, description="Usuário de serviço Zabbix")
    password: str | None = Field(default=None, description="Senha de serviço Zabbix (omitir para preservar atual)")
    timeout_seconds: float = Field(default=10.0, ge=1.0, le=60.0, description="Timeout de requisição em segundos")
    validate_connectivity: bool = Field(default=True, description="Executa teste prévio de conexão antes de persistir")


class WhatsappSettingsUpdateRequest(BaseModel):
    """Payload para atualização persistente do Gateway WhatsApp."""

    gateway_url: str = Field(description="URL base da API do Gateway WhatsApp")
    enabled: bool = Field(default=True, description="Habilitar envio via WhatsApp")
    api_token: str | None = Field(default=None, description="Token de autenticação da instância")
    default_recipient: str | None = Field(default=None, description="Número de telefone padrão")
    validate_connectivity: bool = Field(default=False, description="Validar conectividade antes de salvar")


class SmtpSettingsUpdateRequest(BaseModel):
    """Payload para atualização persistente do servidor SMTP."""

    host: str = Field(description="Host do servidor SMTP")
    port: int = Field(default=587, ge=1, le=65535, description="Porta do servidor SMTP")
    tls: bool = Field(default=True, description="Usar TLS")
    from_address: str = Field(description="Endereço de e-mail remetente")
    user: str | None = Field(default=None, description="Usuário SMTP")
    password: str | None = Field(default=None, description="Senha SMTP (omitir para preservar atual)")
    default_recipient: str | None = Field(default=None, description="Destinatário de alerta padrão")
    validate_connectivity: bool = Field(default=False, description="Validar conectividade antes de salvar")


class WebhookSettingsUpdateRequest(BaseModel):
    """Payload para atualização persistente de webhook padrão."""

    url: str = Field(description="URL do webhook de destino")
    enabled: bool = Field(default=True, description="Habilitar webhook padrão")
    validate_connectivity: bool = Field(default=False, description="Validar conectividade antes de salvar")


class IntegrationUpdateResponse(BaseModel):
    """Resposta de confirmação de persistência de parâmetros de integração."""

    success: bool = Field(default=True, description="Indica se a atualização foi persistida")
    name: str = Field(description="Nome da integração atualizada")
    message: str = Field(description="Mensagem descritiva da ação realizada")
    source: Literal["database", "environment"] = Field(
        default="database", description="Nova origem ativa da configuração"
    )
    details: dict[str, Any] = Field(default_factory=dict, description="Metadados da configuração salva")
