"""Utilitários de criptografia simétrica reversível e mascaramento de segredos.

Utiliza derivação de chaves via SHA-256, gerador de keystream autenticado baseado
no padrão NIST SHAKE-256 e autenticação via HMAC-SHA256 (Encrypt-then-MAC)
completamente baseado na biblioteca padrão do Python, sem dependências externas adicionais.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import secrets

from src.core.config import get_settings


def _derive_keys(secret_key: str) -> tuple[bytes, bytes]:
    """Deriva subchaves de cifragem e autenticação (MAC) a partir da chave mestre."""
    master = hashlib.sha256(secret_key.encode("utf-8")).digest()
    enc_key = hashlib.sha256(master + b":encryption").digest()
    mac_key = hashlib.sha256(master + b":authentication").digest()
    return enc_key, mac_key


def encrypt_secret(plaintext: str, key: str | None = None) -> str:
    """Cifra um texto confidencial retornando payload base64 autenticado.

    Estrutura do payload binário:
    [16 bytes NONCE] + [32 bytes HMAC-SHA256 TAG] + [N bytes CIPHERTEXT]
    """
    if not plaintext:
        return ""

    effective_key = key or get_settings().SECRET_KEY
    enc_key, mac_key = _derive_keys(effective_key)

    nonce = secrets.token_bytes(16)
    plain_bytes = plaintext.encode("utf-8")

    # Gerador de fluxo pseudoaleatório determinístico baseado em SHAKE-256
    keystream = hashlib.shake_256(enc_key + nonce).digest(len(plain_bytes))
    ciphertext = bytes(p ^ k for p, k in zip(plain_bytes, keystream))

    # Encrypt-then-MAC com HMAC-SHA256 sobre (nonce + ciphertext)
    tag = hmac.new(mac_key, nonce + ciphertext, hashlib.sha256).digest()

    raw_payload = nonce + tag + ciphertext
    return base64.urlsafe_b64encode(raw_payload).decode("ascii")


def decrypt_secret(payload: str, key: str | None = None) -> str:
    """Decifra um payload codificado em base64 autenticado.

    Lança ValueError se a integridade falhar ou se o formato for inválido.
    """
    if not payload:
        return ""

    effective_key = key or get_settings().SECRET_KEY
    enc_key, mac_key = _derive_keys(effective_key)

    try:
        raw_payload = base64.urlsafe_b64decode(payload.encode("ascii"))
    except Exception as exc:
        raise ValueError("Payload de segredo inválido (base64 ilegível)") from exc

    if len(raw_payload) < 48:
        raise ValueError("Payload de segredo truncado ou incompleto")

    nonce = raw_payload[:16]
    tag = raw_payload[16:48]
    ciphertext = raw_payload[48:]

    expected_tag = hmac.new(mac_key, nonce + ciphertext, hashlib.sha256).digest()
    if not hmac.compare_digest(tag, expected_tag):
        raise ValueError("Falha de integridade criptográfica: segredo corrompido ou chave incorreta")

    keystream = hashlib.shake_256(enc_key + nonce).digest(len(ciphertext))
    plain_bytes = bytes(c ^ k for c, k in zip(ciphertext, keystream))

    try:
        return plain_bytes.decode("utf-8")
    except UnicodeDecodeError as exc:
        raise ValueError("Falha ao decodificar texto UTF-8 do segredo") from exc


def mask_secret(value: str | None, placeholder: str = "••••••••") -> str:
    """Retorna máscara de proteção para segredos sem vazar seu conteúdo."""
    if not value:
        return ""
    return placeholder


__all__ = ["decrypt_secret", "encrypt_secret", "mask_secret"]
