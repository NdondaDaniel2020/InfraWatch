"""Serviço integrador de rate limiting e account lockout para o fluxo de autenticação."""

from __future__ import annotations

import logging

from src.contexts.iam.security.rate_limiter import DualKeyRateLimiter
from src.core.exceptions import AccountLockedOutError, RateLimitExceededError

logger = logging.getLogger(__name__)


class AuthRateLimitService:
    """Orquestra as verificações de taxa e bloqueio preventivo antes e após o login."""

    def __init__(self, rate_limiter: DualKeyRateLimiter | None = None) -> None:
        self.rate_limiter = rate_limiter or DualKeyRateLimiter()

    async def pre_login_check(self, client_ip: str, email: str) -> None:
        """Executa checagens prévias de limite de requisições e lockout de conta.

        Ordem de prioridade:
        1. Limite por IP (mitigação rápida de flooding/DDoS contra o gateway).
        2. Account Lockout por conta (mitigação contra botnets distribuídos atacando uma vítima).

        Lança:
        - RateLimitExceededError: se o IP ultrapassou a cota por minuto.
        - AccountLockedOutError: se a conta estiver bloqueada preventivamente.
        """
        # 1. Checagem de taxa por IP
        ip_retry_after = await self.rate_limiter.check_ip_limit(client_ip)
        if ip_retry_after is not None:
            logger.warning(
                "Requisição bloqueada por Rate Limit de IP: %s (retry_after=%ss)",
                client_ip,
                ip_retry_after,
            )
            raise RateLimitExceededError(
                message=f"Muitas tentativas a partir deste IP. Tente novamente em {ip_retry_after} segundos.",
                retry_after=ip_retry_after,
            )

        # 2. Checagem de Account Lockout por par conta e IP
        account_retry_after = await self.rate_limiter.check_account_lockout(
            email, client_ip=client_ip
        )
        if account_retry_after is not None:
            logger.warning(
                "Tentativa de login bloqueada para par conta/IP em lockout: %s (IP: %s, retry_after=%ss)",
                email,
                client_ip,
                account_retry_after,
            )
            raise AccountLockedOutError(
                message=f"Conta temporariamente bloqueada por segurança. Tente novamente em {account_retry_after} segundos.",
                retry_after=account_retry_after,
            )

    async def register_failed_login(self, client_ip: str, email: str) -> None:
        """Registra falha de credenciais e ativa Account Lockout se o limite for atingido."""
        count, lockout_ttl = await self.rate_limiter.register_failed_account_attempt(
            email, client_ip=client_ip
        )
        if lockout_ttl is not None:
            logger.warning(
                "Account Lockout ativado para a conta %s (IP: %s) após %s falhas consecutivas (duração=%ss)",
                email,
                client_ip,
                count,
                lockout_ttl,
            )
            raise AccountLockedOutError(
                message=f"Conta bloqueada por excesso de tentativas incorretas. Tente novamente em {lockout_ttl} segundos.",
                retry_after=lockout_ttl,
            )

    async def register_successful_login(self, client_ip: str, email: str) -> None:
        """Limpa o contador de falhas da conta após validação com sucesso das credenciais."""
        await self.rate_limiter.reset_account_attempts(email, client_ip=client_ip)
