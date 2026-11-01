"""Hierarquia semântica de exceções de mensageria para classificação de falhas.

Diferencia falhas transitórias/recuperáveis (rede, timeouts, 5xx, 429) de
poison messages definitivas/irrecuperáveis (schema inválido, 400, 422, KeyError, ValueError).
"""

from typing import Any

import httpx
from pydantic import ValidationError


class MessageProcessingError(Exception):
    """Exceção base para erros ocorridos durante o consumo/processamento de mensagens."""

    def __init__(self, message: str, *args: Any, details: dict[str, Any] | None = None) -> None:
        super().__init__(message, *args)
        self.message = message
        self.details = details or {}


class TransientMessageError(MessageProcessingError):
    """Falha temporária ou recuperável (timeout, conexão, 502/503/504, 429).

    A mensagem NÃO deve receber confirmação (XACK omitido) e deve permanecer no PEL
    para retentativa no próximo ciclo ou conforme agendamento de backoff progressivo.
    """


class PoisonMessageError(MessageProcessingError):
    """Falha definitiva e irrecuperável (schema inválido, JSON corrompido, 400, 422).

    A mensagem DEVE ser desviada imediatamente para a DLQ e receber confirmação (XACK)
    no stream principal para evitar head-of-line blocking e desobstruir o pipeline.
    """


def is_poison_error(exc: BaseException) -> bool:
    """Verifica se uma exceção representa uma Poison Message (falha definitiva/não-recuperável)."""
    if isinstance(exc, PoisonMessageError):
        return True
    if isinstance(exc, (ValueError, TypeError, KeyError, ValidationError)):
        return True
    if isinstance(exc, httpx.HTTPStatusError):
        status = exc.response.status_code
        # Erros 4xx do cliente (exceto 429 Too Many Requests que é temporário)
        if 400 <= status < 500 and status != 429:
            return True
    return False


def is_transient_error(exc: BaseException) -> bool:
    """Verifica se uma exceção representa uma falha transitória/recuperável."""
    if isinstance(exc, TransientMessageError):
        return True
    if isinstance(exc, (TimeoutError, ConnectionError, OSError)):
        return True
    if isinstance(exc, (httpx.TimeoutException, httpx.ConnectError)):
        return True
    if isinstance(exc, httpx.HTTPStatusError):
        status = exc.response.status_code
        # 429 (Rate Limit) ou 5xx (Erros de Gateway/Servidor Downstream)
        if status == 429 or status >= 500:
            return True
    return not is_poison_error(exc)


__all__ = [
    "MessageProcessingError",
    "PoisonMessageError",
    "TransientMessageError",
    "is_poison_error",
    "is_transient_error",
]
