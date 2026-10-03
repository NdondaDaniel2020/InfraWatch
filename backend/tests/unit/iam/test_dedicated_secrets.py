"""Testes unitários para segredos dedicados (OAuth State e MFA Pending Tokens) e capacidade da blacklist."""

from datetime import UTC, datetime
from uuid import uuid4

import jwt
import pytest

from src.contexts.iam.security.tokens import (
    create_mfa_pending_token,
    decode_mfa_pending_token,
)
from src.contexts.iam.services.google_auth_service import (
    create_google_state,
    verify_google_state,
)
from src.contexts.iam.services.token_service import (
    _clean_expired_in_memory_blacklist,
    _in_memory_blacklist,
)
from src.core.config import get_settings
from src.core.exceptions import InvalidGoogleTokenError, InvalidTokenError


def test_mfa_pending_token_uses_dedicated_secret():
    """Valida que o MFA pending token é assinado e verificado com MFA_PENDING_SECRET."""
    settings = get_settings()
    user_id = uuid4()
    token = create_mfa_pending_token(user_id)

    # Decodificação com a chave correta
    payload = decode_mfa_pending_token(token)
    assert payload["sub"] == str(user_id)
    assert payload["type"] == "mfa_pending"

    # Token assinado com SECRET_KEY genérica deve ser rejeitado por decode_mfa_pending_token
    forged_token = jwt.encode(
        {"sub": str(user_id), "type": "mfa_pending", "exp": int(datetime.now(UTC).timestamp()) + 300},
        "different_secret_key_12345678901234567890",
        algorithm=settings.ALGORITHM,
    )
    with pytest.raises(InvalidTokenError):
        decode_mfa_pending_token(forged_token)


def test_google_state_uses_dedicated_secret():
    """Valida que o Google OAuth State é assinado e verificado com OAUTH_STATE_SECRET."""
    settings = get_settings()
    state = create_google_state()

    # Validação correta não lança exceção
    verify_google_state(state)

    # State com chave adulterada deve falhar
    tampered_state = jwt.encode(
        {"nonce": "test", "type": "google_state", "exp": int(datetime.now(UTC).timestamp()) + 300},
        "wrong_secret_key_for_testing_12345678",
        algorithm=settings.ALGORITHM,
    )
    with pytest.raises(InvalidGoogleTokenError):
        verify_google_state(tampered_state)


def test_in_memory_blacklist_capacity_cap():
    """Valida que a blacklist em memória respeita o tamanho máximo e descarta os itens mais próximos da expiração."""
    _in_memory_blacklist.clear()
    now = datetime.now(UTC).timestamp()

    # Inserir itens com tempos de expiração diferentes
    test_max = 5
    for i in range(10):
        _in_memory_blacklist[f"jti-{i}"] = now + 100 + i

    # Executa a limpeza com limite simulado reduzido
    _clean_expired_in_memory_blacklist(max_size=test_max)

    # Deve conter no máximo test_max itens (os que expiram mais tarde)
    assert len(_in_memory_blacklist) <= test_max
    # Os que expiram antes (menores índices) devem ter sido removidos
    assert "jti-0" not in _in_memory_blacklist
    assert "jti-1" not in _in_memory_blacklist
    # Os que expiram por último permanecem
    assert "jti-9" in _in_memory_blacklist

    _in_memory_blacklist.clear()
