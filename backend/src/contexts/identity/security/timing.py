"""Mitigação de Timing Attack e neutralização de enumeração de contas (ADR-022 / Issue #10).

Elimina a discrepância temporal entre tentativas com e-mails existentes e inexistentes.
Como o algoritmo Argon2id demanda custo computacional deliberado (~50-80ms),
uma resposta imediata (<5ms) para e-mails não cadastrados revelaria ao atacante
se a conta existe ou não.

Ao utilizar um hash dummy pré-computado para usuários inexistentes, ambas as
rotas consomem tempo de processamento idêntico.
"""

from __future__ import annotations

from src.contexts.identity.security.password import password_hasher

# Hash pré-computado uma única vez no boot da aplicação com os parâmetros oficiais de Argon2id
DUMMY_ARGON2_HASH: str = password_hasher.hash(
    "infrawatch_timing_attack_mitigation_constant_dummy_password_2026"
)


async def constant_time_verify(candidate_hash: str | None, plain_password: str) -> bool:
    """Executa verificação criptográfica de senha em tempo constante neutro.

    Se o candidate_hash for None (usuário não encontrado no banco):
    - Executa a verificação contra o DUMMY_ARGON2_HASH, consumindo o mesmo ciclo de CPU/memória.
    - Retorna sempre False.

    Se o candidate_hash existir:
    - Executa a verificação real contra a senha fornecida.
    - Retorna True se coincidir, False caso contrário.
    """
    if candidate_hash is None or not candidate_hash.strip():
        # Consumir o mesmo tempo computacional sem vazar informação temporal
        await password_hasher.verify_async(DUMMY_ARGON2_HASH, plain_password)
        return False

    return await password_hasher.verify_async(candidate_hash, plain_password)


def constant_time_verify_sync(candidate_hash: str | None, plain_password: str) -> bool:
    """Versão síncrona da verificação em tempo constante."""
    if candidate_hash is None or not candidate_hash.strip():
        password_hasher.verify(DUMMY_ARGON2_HASH, plain_password)
        return False

    return password_hasher.verify(candidate_hash, plain_password)
