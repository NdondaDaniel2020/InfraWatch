"""Testes unitários para utilitários de criptografia e mascaramento (crypto.py)."""

from __future__ import annotations

import pytest

from src.core.security.crypto import decrypt_secret, encrypt_secret, mask_secret


def test_encrypt_decrypt_roundtrip_default_key() -> None:
    """Valida ciclo completo de cifragem e decifragem usando a chave mestre do sistema."""
    plaintext = "super_secret_zabbix_api_token_12345"
    encrypted = encrypt_secret(plaintext)

    assert encrypted != plaintext
    assert len(encrypted) > len(plaintext)

    decrypted = decrypt_secret(encrypted)
    assert decrypted == plaintext


def test_encrypt_decrypt_roundtrip_custom_key() -> None:
    """Valida ciclo com chave customizada explícita."""
    plaintext = "glpi_user_token_abcde"
    key = "custom_test_secret_key_with_sufficient_length"

    encrypted = encrypt_secret(plaintext, key=key)
    decrypted = decrypt_secret(encrypted, key=key)

    assert decrypted == plaintext


def test_decrypt_with_wrong_key_fails() -> None:
    """Valida que decifrar com chave divergente acusa quebra de integridade."""
    plaintext = "sensitive_password_99"
    encrypted = encrypt_secret(plaintext, key="correct_key_12345678901234567890")

    with pytest.raises(ValueError, match="Falha de integridade criptográfica"):
        decrypt_secret(encrypted, key="wrong_key_1234567890123456789012")


def test_decrypt_tampered_payload_fails() -> None:
    """Valida que adulterar qualquer byte do payload acusa erro de integridade HMAC."""
    plaintext = "secret_to_tamper"
    encrypted = encrypt_secret(plaintext)

    # Altera um caractere no meio do payload base64
    chars = list(encrypted)
    chars[20] = "X" if chars[20] != "X" else "Y"
    tampered = "".join(chars)

    with pytest.raises(ValueError):
        decrypt_secret(tampered)


def test_empty_string_handling() -> None:
    """Valida comportamento defensivo para strings vazias."""
    assert encrypt_secret("") == ""
    assert decrypt_secret("") == ""


def test_invalid_base64_payload_fails() -> None:
    """Valida rejeição de payloads malformados."""
    with pytest.raises(ValueError, match="Payload de segredo inválido"):
        decrypt_secret("not-a-valid-base64!@#$")

    with pytest.raises(ValueError, match="Payload de segredo truncado"):
        # Base64 válido porém com menos de 48 bytes
        decrypt_secret("dG9vX3Nob3J0")


def test_mask_secret() -> None:
    """Valida mascaramento visual seguro para segredos."""
    assert mask_secret("secret_token") == "••••••••"
    assert mask_secret(None) == ""
    assert mask_secret("") == ""
    assert mask_secret("custom", placeholder="[PROTEGIDO]") == "[PROTEGIDO]"
