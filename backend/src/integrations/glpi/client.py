"""Cliente REST assíncrono para a API do GLPI 10+.

Responsável por:
- Gerenciar o ciclo de vida da sessão (initSession / killSession)
- Abertura de chamados críticos (POST /Ticket)
- Adição de acompanhamentos técnicos (POST /Ticket/{id}/ITILFollowup)
- Encerramento de chamados resolvidos (PUT /Ticket/{id})

Resiliência embutida:
- Renovação automática do session_token em caso de HTTP 401
- Retentativa exponencial (3 tentativas, máx 10s por requisição)
"""

import asyncio
import logging
from datetime import datetime, UTC
from typing import Any

import httpx

from src.integrations.glpi.schemas import (
    GlpiFollowupCreate,
    GlpiFollowupResponse,
    GlpiSessionResponse,
    GlpiTicketCreate,
    GlpiTicketCreateResponse,
    GlpiTicketStatus,
    GlpiTicketUpdate,
)

logger = logging.getLogger("infrawatch.integrations.glpi")

# Máximo de tentativas e timeout por requisição
_MAX_RETRIES = 3
_REQUEST_TIMEOUT = 10.0


class GlpiAuthError(Exception):
    """Lançado quando a autenticação com o GLPI falha definitivamente."""


class GlpiClient:
    """Cliente HTTP assíncrono para a REST API do GLPI 10+.

    Uso recomendado via context manager async:

        async with GlpiClient(base_url=..., app_token=..., user_token=...) as client:
            ticket_id = await client.open_ticket(...)
    """

    def __init__(
        self,
        base_url: str,
        app_token: str,
        user_token: str,
        timeout: float = _REQUEST_TIMEOUT,
    ) -> None:
        self._base_url = base_url.rstrip("/")
        self._app_token = app_token
        self._user_token = user_token
        self._timeout = timeout
        self._session_token: str | None = None
        self._http: httpx.AsyncClient | None = None

    # ------------------------------------------------------------------
    # Context Manager
    # ------------------------------------------------------------------

    async def __aenter__(self) -> "GlpiClient":
        self._http = httpx.AsyncClient(
            base_url=self._base_url,
            timeout=self._timeout,
        )
        await self._init_session()
        return self

    async def __aexit__(self, *_: Any) -> None:
        try:
            await self._kill_session()
        finally:
            if self._http:
                await self._http.aclose()
                self._http = None

    # ------------------------------------------------------------------
    # Sessão
    # ------------------------------------------------------------------

    async def _init_session(self) -> None:
        """Autentica no GLPI e armazena o session_token."""
        response = await self._request_raw(
            method="GET",
            path="/initSession",
            headers={
                "App-Token": self._app_token,
                "Authorization": f"user_token {self._user_token}",
            },
        )
        data = GlpiSessionResponse.model_validate(response)
        self._session_token = data.session_token
        logger.info("Sessão GLPI iniciada com sucesso")

    async def _kill_session(self) -> None:
        """Encerra a sessão GLPI de forma graciosa."""
        if not self._session_token:
            return
        try:
            await self._request_raw(method="GET", path="/killSession")
            logger.info("Sessão GLPI encerrada")
        except Exception:
            logger.warning("Falha ao encerrar sessão GLPI (ignorado)")
        finally:
            self._session_token = None

    # ------------------------------------------------------------------
    # Requisições base com retentativas
    # ------------------------------------------------------------------

    def _auth_headers(self) -> dict[str, str]:
        return {
            "App-Token": self._app_token,
            "Session-Token": self._session_token or "",
            "Content-Type": "application/json",
        }

    async def _request_raw(
        self,
        method: str,
        path: str,
        headers: dict[str, str] | None = None,
        json: Any = None,
    ) -> dict[str, Any]:
        """Executa uma requisição com retentativas exponenciais."""
        assert self._http is not None, "GlpiClient deve ser usado como context manager"

        last_exc: Exception | None = None
        for attempt in range(1, _MAX_RETRIES + 1):
            try:
                response = await self._http.request(
                    method=method,
                    url=path,
                    headers=headers or self._auth_headers(),
                    json=json,
                )

                if response.status_code == 401 and self._session_token:
                    logger.warning("GLPI: session_token expirado, renovando...")
                    await self._init_session()
                    continue

                response.raise_for_status()
                return response.json()

            except httpx.HTTPStatusError as exc:
                logger.warning("GLPI HTTP erro %d (tentativa %d/%d)", exc.response.status_code, attempt, _MAX_RETRIES)
                last_exc = exc
            except (httpx.TimeoutException, httpx.ConnectError) as exc:
                logger.warning("GLPI conexão/timeout (tentativa %d/%d): %s", attempt, _MAX_RETRIES, exc)
                last_exc = exc

            if attempt < _MAX_RETRIES:
                backoff = 2 ** (attempt - 1)  # 1s, 2s, 4s
                await asyncio.sleep(backoff)

        raise last_exc or RuntimeError("GLPI: todas as tentativas falharam")

    async def _request(
        self,
        method: str,
        path: str,
        json: Any = None,
    ) -> dict[str, Any]:
        """Requisição autenticada com session_token."""
        return await self._request_raw(method=method, path=path, json=json)

    # ------------------------------------------------------------------
    # Operações de Negócio
    # ------------------------------------------------------------------

    async def open_ticket(self, payload: GlpiTicketCreate) -> int:
        """Abre um chamado no GLPI e retorna o ticket_id criado.

        Args:
            payload: Dados do chamado (título, descrição, urgência, etc.)

        Returns:
            ID do ticket criado no GLPI.
        """
        body = {"input": payload.model_dump()}
        data = await self._request("POST", "/Ticket", json=body)
        ticket = GlpiTicketCreateResponse.model_validate(data)
        logger.info("GLPI: chamado #%d criado", ticket.id)
        return ticket.id

    async def add_followup(self, ticket_id: int, content: str, private: bool = False) -> int:
        """Adiciona um acompanhamento técnico ao chamado.

        Args:
            ticket_id: ID do chamado ao qual pertence o acompanhamento.
            content: Texto do acompanhamento (pode conter HTML básico).
            private: Se True, o acompanhamento fica visível apenas internamente.

        Returns:
            ID do acompanhamento criado.
        """
        payload = GlpiFollowupCreate(
            items_id=ticket_id,
            content=content,
            is_private=1 if private else 0,
        )
        body = {"input": payload.model_dump()}
        data = await self._request("POST", f"/Ticket/{ticket_id}/ITILFollowup", json=body)
        followup = GlpiFollowupResponse.model_validate(data)
        logger.info("GLPI: acompanhamento #%d adicionado ao chamado #%d", followup.id, ticket_id)
        return followup.id

    async def close_ticket(self, ticket_id: int) -> None:
        """Encerra o chamado com status SOLVED e data/hora atual.

        Args:
            ticket_id: ID do chamado a ser encerrado.
        """
        solve_date = datetime.now(UTC).strftime("%Y-%m-%d %H:%M:%S")
        payload = GlpiTicketUpdate(
            status=GlpiTicketStatus.SOLVED,
            solvedate=solve_date,
        )
        body = {"input": payload.model_dump()}
        await self._request("PUT", f"/Ticket/{ticket_id}", json=body)
        logger.info("GLPI: chamado #%d encerrado (SOLVED)", ticket_id)
