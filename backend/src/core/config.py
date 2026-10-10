"""Configurações centralizadas da aplicação InfraWatch via Pydantic Settings.

Garante validação estrita de variáveis de ambiente, fallback para desenvolvimento e testes,
e segurança reforçada em ambientes de produção.
"""

import os
from functools import lru_cache
from typing import Literal, Self

from pydantic import Field, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Configurações gerais do sistema InfraWatch."""

    model_config = SettingsConfigDict(
        env_file=(os.getenv("ENV_FILE", ".env"), "backend/.env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    ENVIRONMENT: Literal["development", "test", "staging", "production"] = Field(
        default="development", alias="ENVIRONMENT"
    )
    DEBUG: bool = Field(default=False, alias="DEBUG")
    PROJECT_NAME: str = Field(default="InfraWatch", alias="PROJECT_NAME")
    APP_NAME: str = Field(default="InfraWatch", alias="APP_NAME")
    APP_VERSION: str = Field(default="0.1.0", alias="APP_VERSION")
    LOG_LEVEL: str = Field(default="INFO", alias="LOG_LEVEL")

    # Configurações do Banco de Dados Relacional (PostgreSQL 16+)
    POSTGRES_USER: str = Field(default="infrawatch_user", alias="POSTGRES_USER")
    POSTGRES_PASSWORD: str = Field(
        default="infrawatch_secure_password_2026", alias="POSTGRES_PASSWORD"
    )
    POSTGRES_HOST: str = Field(default="localhost", alias="POSTGRES_HOST")
    POSTGRES_PORT: int = Field(default=5432, alias="POSTGRES_PORT")
    POSTGRES_DB: str = Field(default="infrawatch_db", alias="POSTGRES_DB")
    DATABASE_URL: str | None = Field(
        default=None,
        alias="DATABASE_URL",
    )
    DB_POOL_SIZE: int = Field(default=20, alias="DB_POOL_SIZE")
    DB_MAX_OVERFLOW: int = Field(default=10, alias="DB_MAX_OVERFLOW")
    DB_POOL_TIMEOUT: int = Field(default=30, alias="DB_POOL_TIMEOUT")
    DB_POOL_PRE_PING: bool = Field(default=True, alias="DB_POOL_PRE_PING")

    # Redis (Cache, Streams, Lock Distribuído)
    REDIS_HOST: str = Field(default="localhost", alias="REDIS_HOST")
    REDIS_PORT: int = Field(default=6379, alias="REDIS_PORT")
    REDIS_PASSWORD: str = Field(default="", alias="REDIS_PASSWORD")
    REDIS_URL: str | None = Field(
        default=None,
        alias="REDIS_URL",
    )
    REDIS_MAX_CONNECTIONS: int = Field(default=10, alias="REDIS_MAX_CONNECTIONS")

    # Segurança & Autenticação
    SECRET_KEY: str = Field(
        default="infrawatch_insecure_dev_secret_key_change_in_production",
        alias="SECRET_KEY",
    )
    REFRESH_SECRET_KEY: str = Field(
        default="infrawatch_refresh_dev_secret_key_change_in_production",
        alias="REFRESH_SECRET_KEY",
    )
    OAUTH_STATE_SECRET: str = Field(
        default="infrawatch_oauth_state_dev_secret_key_change_in_production",
        alias="OAUTH_STATE_SECRET",
    )
    MFA_PENDING_SECRET: str = Field(
        default="infrawatch_mfa_pending_dev_secret_key_change_in_production",
        alias="MFA_PENDING_SECRET",
    )
    ALGORITHM: str = Field(default="HS256", alias="ALGORITHM")
    ACCESS_TOKEN_EXPIRE_MINUTES: int = Field(default=15, alias="ACCESS_TOKEN_EXPIRE_MINUTES")
    JWT_ACCESS_MINUTES: int = Field(default=15, alias="JWT_ACCESS_MINUTES")
    JWT_REFRESH_DAYS: int = Field(default=7, alias="JWT_REFRESH_DAYS")
    REFRESH_TOKEN_GRACE_PERIOD_SECONDS: int = Field(
        default=10, alias="REFRESH_TOKEN_GRACE_PERIOD_SECONDS"
    )
    PASSWORD_RESET_TOKEN_EXPIRE_MINUTES: int = Field(
        default=15, alias="PASSWORD_RESET_TOKEN_EXPIRE_MINUTES"
    )
    EMAIL_VERIFICATION_TOKEN_EXPIRE_HOURS: int = Field(
        default=24, alias="EMAIL_VERIFICATION_TOKEN_EXPIRE_HOURS"
    )

    # Parâmetros Criptográficos Argon2id (RFC 9106)
    ARGON2_TIME_COST: int = Field(default=2, alias="ARGON2_TIME_COST")
    ARGON2_MEMORY_COST: int = Field(default=65536, alias="ARGON2_MEMORY_COST")  # 64 MB
    ARGON2_PARALLELISM: int = Field(default=4, alias="ARGON2_PARALLELISM")

    # Dual-Key Rate Limiting & Account Lockout
    RATE_LIMIT_LOGIN_IP_MAX: int = Field(default=10, alias="RATE_LIMIT_LOGIN_IP_MAX")
    RATE_LIMIT_LOGIN_IP_WINDOW_SECONDS: int = Field(
        default=60, alias="RATE_LIMIT_LOGIN_IP_WINDOW_SECONDS"
    )
    ACCOUNT_LOCKOUT_MAX_FAILURES: int = Field(default=5, alias="ACCOUNT_LOCKOUT_MAX_FAILURES")
    ACCOUNT_LOCKOUT_WINDOW_SECONDS: int = Field(default=300, alias="ACCOUNT_LOCKOUT_WINDOW_SECONDS")
    ACCOUNT_LOCKOUT_DURATION_SECONDS: int = Field(
        default=900, alias="ACCOUNT_LOCKOUT_DURATION_SECONDS"
    )

    # Configuração de Trusted Proxies & Anti-Spoofing de IP (ADR-023)
    FORWARDED_ALLOW_IPS: str = Field(
        default="127.0.0.1,::1,10.0.0.0/8,172.16.0.0/12,192.168.0.0/16",
        alias="FORWARDED_ALLOW_IPS",
    )

    # Configurações de E-mail / SMTP
    SMTP_HOST: str | None = Field(default=None, alias="SMTP_HOST")
    SMTP_PORT: int = Field(default=587, alias="SMTP_PORT")
    SMTP_USER: str | None = Field(default=None, alias="SMTP_USER")
    SMTP_PASSWORD: str | None = Field(default=None, alias="SMTP_PASSWORD")
    SMTP_FROM: str = Field(default="InfraWatch <no-reply@infrawatch.ao>", alias="SMTP_FROM")
    SMTP_TLS: bool = Field(default=True, alias="SMTP_TLS")
    FRONTEND_URL: str = Field(default="http://localhost:3000", alias="FRONTEND_URL")

    # Configurações de Paginação da API
    PAGE_SIZE_DEFAULT: int = Field(default=20, alias="PAGE_SIZE_DEFAULT")
    PAGE_SIZE_MAX: int = Field(default=100, alias="PAGE_SIZE_MAX")

    # Autenticação Social Google OAuth 2.0 / OpenID Connect
    GOOGLE_LOGIN_ENABLED: bool = Field(default=False, alias="GOOGLE_LOGIN_ENABLED")
    GOOGLE_CLIENT_ID: str | None = Field(default=None, alias="GOOGLE_CLIENT_ID")
    GOOGLE_CLIENT_SECRET: str | None = Field(default=None, alias="GOOGLE_CLIENT_SECRET")
    GOOGLE_REDIRECT_URI: str = Field(
        default="http://localhost:8000/api/v1/auth/google/callback",
        alias="GOOGLE_REDIRECT_URI",
    )
    GOOGLE_AUTH_URL: str = Field(
        default="https://accounts.google.com/o/oauth2/v2/auth",
        alias="GOOGLE_AUTH_URL",
    )
    GOOGLE_TOKEN_URL: str = Field(
        default="https://oauth2.googleapis.com/token",
        alias="GOOGLE_TOKEN_URL",
    )
    GOOGLE_CERTS_URL: str = Field(
        default="https://www.googleapis.com/oauth2/v3/certs",
        alias="GOOGLE_CERTS_URL",
    )
    GOOGLE_ISSUER: str = Field(
        default="https://accounts.google.com",
        alias="GOOGLE_ISSUER",
    )
    GOOGLE_STATE_TTL_MINUTES: int = Field(default=10, alias="GOOGLE_STATE_TTL_MINUTES")
    GOOGLE_CERTS_CACHE_TTL_SECONDS: int = Field(
        default=3600, alias="GOOGLE_CERTS_CACHE_TTL_SECONDS"
    )

    # Workers em Segundo Plano (Outbox Relay & Token Cleanup)
    ENABLE_BACKGROUND_WORKERS: bool = Field(default=True, alias="ENABLE_BACKGROUND_WORKERS")
    OUTBOX_RELAY_POLL_INTERVAL_SECONDS: float = Field(
        default=15.0, alias="OUTBOX_RELAY_POLL_INTERVAL_SECONDS"
    )
    OUTBOX_RELAY_BATCH_SIZE: int = Field(default=50, alias="OUTBOX_RELAY_BATCH_SIZE")
    TOKEN_CLEANUP_INTERVAL_SECONDS: int = Field(
        default=3600, alias="TOKEN_CLEANUP_INTERVAL_SECONDS"
    )
    TOKEN_CLEANUP_LOCK_TIMEOUT_SECONDS: int = Field(
        default=300, alias="TOKEN_CLEANUP_LOCK_TIMEOUT_SECONDS"
    )
    TOKEN_CLEANUP_RETENTION_DAYS: int = Field(default=7, alias="TOKEN_CLEANUP_RETENTION_DAYS")

    # Proteção do Endpoint Prometheus /metrics (ADR-025)
    METRICS_REQUIRE_AUTH: bool = Field(default=True, alias="METRICS_REQUIRE_AUTH")
    PROMETHEUS_METRICS_USER: str = Field(default="prometheus", alias="PROMETHEUS_METRICS_USER")
    PROMETHEUS_METRICS_PASSWORD: str = Field(
        default="prometheus_secure_password_2026", alias="PROMETHEUS_METRICS_PASSWORD"
    )

    # Integração GLPI ITSM
    GLPI_ENABLED: bool = Field(default=False, alias="GLPI_ENABLED")
    GLPI_NOTIFY_STARTUP: bool = Field(default=False, alias="GLPI_NOTIFY_STARTUP")
    GLPI_BASE_URL: str = Field(default="http://localhost:8080/apirest.php", alias="GLPI_BASE_URL")
    GLPI_APP_TOKEN: str = Field(default="", alias="GLPI_APP_TOKEN")
    GLPI_USER_TOKEN: str = Field(default="", alias="GLPI_USER_TOKEN")
    GLPI_TIMEOUT_SECONDS: float = Field(default=10.0, alias="GLPI_TIMEOUT_SECONDS")

    # Integração Zabbix JSON-RPC
    ZABBIX_ENABLED: bool = Field(default=False, alias="ZABBIX_ENABLED")
    ZABBIX_NOTIFY_STARTUP: bool = Field(default=False, alias="ZABBIX_NOTIFY_STARTUP")
    ZABBIX_API_URL: str = Field(default="https://zabbix.rcsangola.co.ao/api_jsonrpc.php", alias="ZABBIX_API_URL")
    ZABBIX_API_TOKEN: str = Field(default="", alias="ZABBIX_API_TOKEN")
    ZABBIX_USER: str = Field(default="Admin", alias="ZABBIX_USER")
    ZABBIX_PASSWORD: str = Field(default="zabbix", alias="ZABBIX_PASSWORD")
    ZABBIX_TIMEOUT_SECONDS: float = Field(default=10.0, alias="ZABBIX_TIMEOUT_SECONDS")

    # Notificações Multicanal (Telegram, WhatsApp e Webhooks)
    TELEGRAM_BOT_TOKEN: str = Field(default="", alias="TELEGRAM_BOT_TOKEN")
    TELEGRAM_DEFAULT_CHAT_ID: str = Field(default="", alias="TELEGRAM_DEFAULT_CHAT_ID")
    WHATSAPP_ENABLED: bool = Field(default=False, alias="WHATSAPP_ENABLED")
    WHATSAPP_GATEWAY_URL: str = Field(default="", alias="WHATSAPP_GATEWAY_URL")
    WHATSAPP_API_TOKEN: str = Field(default="", alias="WHATSAPP_API_TOKEN")
    WHATSAPP_DEFAULT_RECIPIENT: str = Field(default="", alias="WHATSAPP_DEFAULT_RECIPIENT")
    DEFAULT_WEBHOOK_URL: str = Field(default="", alias="DEFAULT_WEBHOOK_URL")

    @model_validator(mode="after")
    def _assemble_connection_urls(self) -> Self:
        """Monta dinamicamente DATABASE_URL e REDIS_URL a partir das credenciais se não fornecidas."""
        if not self.DATABASE_URL or (
            self.POSTGRES_HOST != "localhost" and "@localhost:" in self.DATABASE_URL
        ):
            self.DATABASE_URL = (
                f"postgresql+asyncpg://{self.POSTGRES_USER}:{self.POSTGRES_PASSWORD}@"
                f"{self.POSTGRES_HOST}:{self.POSTGRES_PORT}/{self.POSTGRES_DB}"
            )
        if not self.REDIS_URL or (
            self.REDIS_HOST != "localhost" and "@localhost:" in self.REDIS_URL
        ):
            pwd_part = f":{self.REDIS_PASSWORD}@" if self.REDIS_PASSWORD else ""
            self.REDIS_URL = f"redis://{pwd_part}{self.REDIS_HOST}:{self.REDIS_PORT}/0"

        return self

    @model_validator(mode="after")
    def _validate_production_security(self) -> Self:
        """Aplica validações de segurança estritas quando em ambiente de produção."""
        if self.ENVIRONMENT == "production":
            if self.DEBUG:
                raise ValueError("DEBUG não pode ser True em ambiente de produção.")

            insecure_defaults = {
                "infrawatch_insecure_dev_secret_key_change_in_production",
                "infrawatch_refresh_dev_secret_key_change_in_production",
                "infrawatch_oauth_state_dev_secret_key_change_in_production",
                "infrawatch_mfa_pending_dev_secret_key_change_in_production",
                "dev-only-secret-change-me",
                "test-only-secret-change-me",
                "change-me",
                "secret",
                "admin",
                "password",
            }

            if self.SECRET_KEY in insecure_defaults or len(self.SECRET_KEY) < 32:
                raise ValueError(
                    "SECRET_KEY insegura ou com tamanho insuficiente (< 32 caracteres) para produção."
                )

            if self.REFRESH_SECRET_KEY in insecure_defaults or len(self.REFRESH_SECRET_KEY) < 32:
                raise ValueError(
                    "REFRESH_SECRET_KEY insegura ou com tamanho insuficiente (< 32 caracteres) para produção."
                )

            if self.OAUTH_STATE_SECRET in insecure_defaults or len(self.OAUTH_STATE_SECRET) < 32:
                raise ValueError(
                    "OAUTH_STATE_SECRET insegura ou com tamanho insuficiente (< 32 caracteres) para produção."
                )

            if self.MFA_PENDING_SECRET in insecure_defaults or len(self.MFA_PENDING_SECRET) < 32:
                raise ValueError(
                    "MFA_PENDING_SECRET insegura ou com tamanho insuficiente (< 32 caracteres) para produção."
                )

            if self.SECRET_KEY == self.REFRESH_SECRET_KEY:
                raise ValueError(
                    "REFRESH_SECRET_KEY deve ser estritamente diferente de SECRET_KEY em produção."
                )

        return self


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Retorna instância singleton das configurações validadas."""
    return Settings()
