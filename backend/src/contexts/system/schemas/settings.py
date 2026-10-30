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
