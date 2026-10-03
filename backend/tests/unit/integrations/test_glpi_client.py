"""Testes unitários do GlpiClient com mock da API REST do GLPI 10+.

Valida:
- Autenticação bem-sucedida e encerramento de sessão
- Abertura de chamado retorna ticket_id
- Adição de acompanhamento técnico
- Encerramento de chamado com status SOLVED
- Renovação automática do session_token em caso de HTTP 401
- Retentativas exponenciais em caso de timeout/erro de conexão
- Falha definitiva após esgotamento das retentativas
"""

from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import httpx
import pytest

from src.integrations.glpi.client import GlpiClient, GlpiAuthError
from src.integrations.glpi.schemas import (
    GlpiImpact,
    GlpiTicketCreate,
    GlpiUrgency,
)


# ---------------------------------------------------------------------------
# Fixtures e helpers
# ---------------------------------------------------------------------------


def make_response(status_code: int, json_body: dict) -> MagicMock:
    """Cria um mock de httpx.Response com o status e body fornecidos."""
    mock = MagicMock(spec=httpx.Response)
    mock.status_code = status_code
    mock.json.return_value = json_body
    mock.raise_for_status = MagicMock()
    if status_code >= 400:
        mock.raise_for_status.side_effect = httpx.HTTPStatusError(
            message=f"HTTP {status_code}",
            request=MagicMock(),
            response=mock,
        )
    return mock


SAMPLE_TICKET = GlpiTicketCreate(
    name="[InfraWatch] Servidor DOWN",
    content="<p>Host inacessível</p>",
    urgency=GlpiUrgency.VERY_HIGH,
    impact=GlpiImpact.HIGH,
)


# ---------------------------------------------------------------------------
# Testes de Autenticação
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_client_init_session_on_enter() -> None:
    """Verifica que __aenter__ chama GET /initSession e armazena o session_token."""
    init_response = make_response(200, {"session_token": "tok-abc123"})
    kill_response = make_response(200, {})

    with patch("httpx.AsyncClient.request", new_callable=AsyncMock) as mock_req:
        mock_req.side_effect = [init_response, kill_response]

        async with GlpiClient("http://glpi", "APP_TOK", "USR_TOK") as client:
            assert client._session_token == "tok-abc123"

        # initSession + killSession
        assert mock_req.call_count == 2


@pytest.mark.asyncio
async def test_client_kills_session_on_exit() -> None:
    """Verifica que __aexit__ chama GET /killSession."""
    init_response = make_response(200, {"session_token": "tok-xyz"})
    kill_response = make_response(200, {})

    with patch("httpx.AsyncClient.request", new_callable=AsyncMock) as mock_req:
        mock_req.side_effect = [init_response, kill_response]

        async with GlpiClient("http://glpi", "APP_TOK", "USR_TOK"):
            pass

        calls = [str(c.kwargs.get("url", "")) for c in mock_req.call_args_list]
        assert any("/killSession" in url for url in calls)


# ---------------------------------------------------------------------------
# Testes de Abertura de Chamado
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_open_ticket_returns_ticket_id() -> None:
    """Valida que open_ticket retorna o ID do chamado criado."""
    init_res = make_response(200, {"session_token": "tok-1"})
    ticket_res = make_response(201, {"id": 42})
    kill_res = make_response(200, {})

    with patch("httpx.AsyncClient.request", new_callable=AsyncMock) as mock_req:
        mock_req.side_effect = [init_res, ticket_res, kill_res]

        async with GlpiClient("http://glpi", "APP_TOK", "USR_TOK") as client:
            ticket_id = await client.open_ticket(SAMPLE_TICKET)

        assert ticket_id == 42


@pytest.mark.asyncio
async def test_add_followup_returns_followup_id() -> None:
    """Valida que add_followup retorna o ID do acompanhamento criado."""
    init_res = make_response(200, {"session_token": "tok-1"})
    followup_res = make_response(201, {"id": 99})
    kill_res = make_response(200, {})

    with patch("httpx.AsyncClient.request", new_callable=AsyncMock) as mock_req:
        mock_req.side_effect = [init_res, followup_res, kill_res]

        async with GlpiClient("http://glpi", "APP_TOK", "USR_TOK") as client:
            fid = await client.add_followup(ticket_id=42, content="Latência elevada: 450ms")

        assert fid == 99


@pytest.mark.asyncio
async def test_close_ticket_calls_put_with_solved_status() -> None:
    """Valida que close_ticket envia PUT com status SOLVED."""
    init_res = make_response(200, {"session_token": "tok-1"})
    close_res = make_response(200, {"id": 42})
    kill_res = make_response(200, {})

    with patch("httpx.AsyncClient.request", new_callable=AsyncMock) as mock_req:
        mock_req.side_effect = [init_res, close_res, kill_res]

        async with GlpiClient("http://glpi", "APP_TOK", "USR_TOK") as client:
            await client.close_ticket(ticket_id=42)

        # O PUT deve ter sido chamado com o body contendo status=5 (SOLVED)
        put_call = mock_req.call_args_list[1]
        assert put_call.kwargs.get("method") == "PUT" or put_call.args[0] == "PUT"
        sent_json = put_call.kwargs.get("json", {})
        assert sent_json.get("input", {}).get("status") == 5  # SOLVED


# ---------------------------------------------------------------------------
# Testes de Renovação de Sessão
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_auto_renew_session_on_401() -> None:
    """Valida que o client renova o session_token automaticamente em caso de 401."""
    init_res_1 = make_response(200, {"session_token": "tok-expired"})
    unauth_res = make_response(401, {"message": "session expired"})
    # A resposta 401 não deve chamar raise_for_status antes da renovação
    unauth_res.raise_for_status = MagicMock()  # não levanta (checado por status_code)
    init_res_2 = make_response(200, {"session_token": "tok-renewed"})
    ticket_res = make_response(201, {"id": 77})
    kill_res = make_response(200, {})

    with patch("httpx.AsyncClient.request", new_callable=AsyncMock) as mock_req:
        mock_req.side_effect = [init_res_1, unauth_res, init_res_2, ticket_res, kill_res]

        async with GlpiClient("http://glpi", "APP_TOK", "USR_TOK") as client:
            ticket_id = await client.open_ticket(SAMPLE_TICKET)
            # Verificar token renovado ANTES do __aexit__ (que zera o token)
            assert client._session_token == "tok-renewed"

        assert ticket_id == 77


# ---------------------------------------------------------------------------
# Testes de Resiliência e Retentativas
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_retry_on_timeout_succeeds_eventually() -> None:
    """Valida que o client retenta e tem sucesso após um timeout temporário."""
    init_res = make_response(200, {"session_token": "tok-1"})
    ticket_res = make_response(201, {"id": 55})
    kill_res = make_response(200, {})

    timeout_exc = httpx.TimeoutException("Connection timed out")

    with patch("httpx.AsyncClient.request", new_callable=AsyncMock) as mock_req, \
         patch("asyncio.sleep", new_callable=AsyncMock):
        mock_req.side_effect = [init_res, timeout_exc, ticket_res, kill_res]

        async with GlpiClient("http://glpi", "APP_TOK", "USR_TOK") as client:
            ticket_id = await client.open_ticket(SAMPLE_TICKET)

        assert ticket_id == 55


@pytest.mark.asyncio
async def test_raises_after_max_retries_exhausted() -> None:
    """Valida que o client levanta exceção após esgotar todas as tentativas."""
    init_res = make_response(200, {"session_token": "tok-1"})
    timeout_exc = httpx.TimeoutException("Connection timed out")

    with patch("httpx.AsyncClient.request", new_callable=AsyncMock) as mock_req, \
         patch("asyncio.sleep", new_callable=AsyncMock):
        # init + 3 timeouts (max_retries) + kill
        mock_req.side_effect = [init_res, timeout_exc, timeout_exc, timeout_exc]

        with pytest.raises(httpx.TimeoutException):
            async with GlpiClient("http://glpi", "APP_TOK", "USR_TOK") as client:
                await client.open_ticket(SAMPLE_TICKET)
