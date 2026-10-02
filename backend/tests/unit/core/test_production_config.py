"""Testes unitários para validação estrita de segredos e configurações em produção."""

import pytest
from pydantic import ValidationError

from src.core.config import Settings


def test_production_rejects_default_secret_key():
    """Valida que valores padrão de SECRET_KEY são rejeitados em produção."""
    with pytest.raises(ValidationError, match="SECRET_KEY insegura ou com tamanho insuficiente"):
        Settings(
            ENVIRONMENT="production",
            SECRET_KEY="infrawatch_insecure_dev_secret_key_change_in_production",
            REFRESH_SECRET_KEY="a" * 32,
            DEBUG=False,
        )


def test_production_rejects_default_refresh_secret_key():
    """Valida que valores padrão de REFRESH_SECRET_KEY são rejeitados em produção."""
    with pytest.raises(
        ValidationError, match="REFRESH_SECRET_KEY insegura ou com tamanho insuficiente"
    ):
        Settings(
            ENVIRONMENT="production",
            SECRET_KEY="a" * 32,
            REFRESH_SECRET_KEY="infrawatch_refresh_dev_secret_key_change_in_production",
            DEBUG=False,
        )


def test_production_rejects_short_secrets():
    """Valida que segredos menores que 32 caracteres são rejeitados em produção."""
    with pytest.raises(ValidationError, match="SECRET_KEY insegura ou com tamanho insuficiente"):
        Settings(
            ENVIRONMENT="production",
            SECRET_KEY="short-secret-key",
            REFRESH_SECRET_KEY="b" * 32,
            DEBUG=False,
        )


def test_production_rejects_identical_keys():
    """Valida que REFRESH_SECRET_KEY e SECRET_KEY não podem ser idênticas em produção."""
    strong_key = "k" * 32
    with pytest.raises(ValidationError, match="REFRESH_SECRET_KEY deve ser estritamente diferente"):
        Settings(
            ENVIRONMENT="production",
            SECRET_KEY=strong_key,
            REFRESH_SECRET_KEY=strong_key,
            DEBUG=False,
        )


def test_production_rejects_debug_mode():
    """Valida que DEBUG=True é rejeitado em produção."""
    with pytest.raises(ValidationError, match="DEBUG não pode ser True em ambiente de produção"):
        Settings(
            ENVIRONMENT="production",
            SECRET_KEY="a" * 32,
            REFRESH_SECRET_KEY="b" * 32,
            DEBUG=True,
        )


def test_production_accepts_strong_secrets():
    """Valida que configurações com segredos fortes e distintos são aceitas em produção."""
    settings = Settings(
        ENVIRONMENT="production",
        SECRET_KEY="super_secure_production_secret_key_12345",
        REFRESH_SECRET_KEY="super_secure_production_refresh_key_67890",
        DEBUG=False,
    )
    assert settings.ENVIRONMENT == "production"
    assert settings.DEBUG is False
    assert len(settings.SECRET_KEY) >= 32
    assert settings.SECRET_KEY != settings.REFRESH_SECRET_KEY


def test_development_and_test_allow_defaults():
    """Valida que ambientes development e test aceitam defaults para facilidade de desenvolvimento."""
    dev_settings = Settings(ENVIRONMENT="development")
    assert dev_settings.ENVIRONMENT == "development"

    test_settings = Settings(ENVIRONMENT="test")
    assert test_settings.ENVIRONMENT == "test"
