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
        env_file=os.getenv("ENV_FILE", ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    ENVIRONMENT: Literal["development", "test", "staging", "production"] = Field(
        default="development", alias="ENVIRONMENT"
    )
    DEBUG: bool = Field(default=False, alias="DEBUG")
    PROJECT_NAME: str = Field(default="InfraWatch", alias="PROJECT_NAME")

    # Configurações do Banco de Dados Relacional (PostgreSQL 16+)
    DATABASE_URL: str = Field(
        default="postgresql+asyncpg://infrawatch_user:infrawatch_secure_password_2026@localhost:5432/infrawatch_db",
        alias="DATABASE_URL",
    )
    DB_POOL_SIZE: int = Field(default=20, alias="DB_POOL_SIZE")
    DB_MAX_OVERFLOW: int = Field(default=10, alias="DB_MAX_OVERFLOW")
    DB_POOL_TIMEOUT: int = Field(default=30, alias="DB_POOL_TIMEOUT")
    DB_POOL_PRE_PING: bool = Field(default=True, alias="DB_POOL_PRE_PING")

    # Redis (Cache, Streams, Lock Distribuído)
    REDIS_URL: str = Field(
        default="redis://:redis_secure_password_2026@localhost:6379/0",
        alias="REDIS_URL",
    )

    # Segurança & Autenticação
    SECRET_KEY: str = Field(
        default="infrawatch_insecure_dev_secret_key_change_in_production",
        alias="SECRET_KEY",
    )
    REFRESH_SECRET_KEY: str = Field(
        default="infrawatch_refresh_dev_secret_key_change_in_production",
        alias="REFRESH_SECRET_KEY",
    )
    ALGORITHM: str = Field(default="HS256", alias="ALGORITHM")
    ACCESS_TOKEN_EXPIRE_MINUTES: int = Field(default=15, alias="ACCESS_TOKEN_EXPIRE_MINUTES")
    JWT_ACCESS_MINUTES: int = Field(default=15, alias="JWT_ACCESS_MINUTES")
    JWT_REFRESH_DAYS: int = Field(default=7, alias="JWT_REFRESH_DAYS")
    REFRESH_TOKEN_GRACE_PERIOD_SECONDS: int = Field(
        default=10, alias="REFRESH_TOKEN_GRACE_PERIOD_SECONDS"
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
        default=1.0, alias="OUTBOX_RELAY_POLL_INTERVAL_SECONDS"
    )
    OUTBOX_RELAY_BATCH_SIZE: int = Field(default=50, alias="OUTBOX_RELAY_BATCH_SIZE")
    TOKEN_CLEANUP_INTERVAL_SECONDS: int = Field(
        default=3600, alias="TOKEN_CLEANUP_INTERVAL_SECONDS"
    )
    TOKEN_CLEANUP_LOCK_TIMEOUT_SECONDS: int = Field(
        default=300, alias="TOKEN_CLEANUP_LOCK_TIMEOUT_SECONDS"
    )
    TOKEN_CLEANUP_RETENTION_DAYS: int = Field(
        default=7, alias="TOKEN_CLEANUP_RETENTION_DAYS"
    )

    # Proteção do Endpoint Prometheus /metrics (ADR-025)
    METRICS_REQUIRE_AUTH: bool = Field(default=True, alias="METRICS_REQUIRE_AUTH")
    PROMETHEUS_METRICS_USER: str = Field(default="prometheus", alias="PROMETHEUS_METRICS_USER")
    PROMETHEUS_METRICS_PASSWORD: str = Field(
        default="prometheus_secure_password_2026", alias="PROMETHEUS_METRICS_PASSWORD"
    )

    @model_validator(mode="after")
    def _validate_production_security(self) -> Self:
        """Aplica validações de segurança estritas quando em ambiente de produção."""
        if self.ENVIRONMENT == "production":
            if self.DEBUG:
                raise ValueError("DEBUG não pode ser True em ambiente de produção.")

            insecure_defaults = {
                "infrawatch_insecure_dev_secret_key_change_in_production",
                "infrawatch_refresh_dev_secret_key_change_in_production",
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

            if self.SECRET_KEY == self.REFRESH_SECRET_KEY:
                raise ValueError(
                    "REFRESH_SECRET_KEY deve ser estritamente diferente de SECRET_KEY em produção."
                )

        return self


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Retorna instância singleton das configurações validadas."""
    return Settings()
