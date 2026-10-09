"""Cliente assíncrono para a API JSON-RPC 2.0 do Zabbix.

Suporta:
- Autenticação por API Token permanente (Bearer / JSON-RPC auth)
- Autenticação legada por credenciais (user.login / user.logout)
- Consulta de versão da API (apiinfo.version)
- Consulta de hosts (host.get)
- Consulta de itens e telemetria de hardware (item.get)
- Resiliência com retentativas automáticas e backoff exponencial
"""

import asyncio
import logging
from typing import Any

import httpx

from src.integrations.zabbix.schemas import (
    JsonRpcRequest,
    JsonRpcResponse,
    ZabbixHost,
    ZabbixHostMetrics,
    ZabbixItem,
)

logger = logging.getLogger("infrawatch.integrations.zabbix")

_DEFAULT_TIMEOUT = 10.0
_MAX_RETRIES = 3


# ---------------------------------------------------------------------------
# Exceções Customizadas
# ---------------------------------------------------------------------------


class ZabbixError(Exception):
    """Exceção base para erros de integração com Zabbix."""


class ZabbixAuthError(ZabbixError):
    """Falha de autenticação ou token inválido/expirado no Zabbix."""


class ZabbixConnectionError(ZabbixError):
    """Falha de conexão de rede ou timeout com o Zabbix."""


class ZabbixApiError(ZabbixError):
    """Erro retornado explicitamente pelo protocolo JSON-RPC do Zabbix."""

    def __init__(self, code: int, message: str, data: Any = None) -> None:
        super().__init__(f"Zabbix JSON-RPC Error [{code}]: {message} (data={data})")
        self.code = code
        self.message = message
        self.data = data


# ---------------------------------------------------------------------------
# Cliente Zabbix
# ---------------------------------------------------------------------------


class ZabbixClient:
    """Cliente HTTP assíncrono para a API JSON-RPC 2.0 do Zabbix.

    Uso recomendado via context manager:
        async with ZabbixClient(api_url=..., api_token=...) as zabbix:
            metrics = await zabbix.get_host_hardware_metrics(hostid="10084")
    """

    def __init__(
        self,
        api_url: str,
        api_token: str | None = None,
        username: str | None = None,
        password: str | None = None,
        timeout: float = _DEFAULT_TIMEOUT,
        verify_ssl: bool = True,
    ) -> None:
        self._api_url = api_url.rstrip("/")
        self._api_token = api_token or None
        self._username = username
        self._password = password
        self._timeout = timeout
        self._verify_ssl = verify_ssl

        self._auth_token: str | None = self._api_token
        self._session_created = False
        self._request_counter = 0
        self._client: httpx.AsyncClient | None = None

    async def __aenter__(self) -> "ZabbixClient":  # noqa: PYI034
        await self.open()
        return self

    async def __aexit__(
        self,
        exc_type: type[BaseException] | None,
        exc_val: BaseException | None,
        exc_tb: object,
    ) -> None:
        await self.close()

    async def open(self) -> None:
        """Inicializa a sessão HTTP e autentica caso necessário."""
        if self._client is None or self._client.is_closed:
            headers = {
                "Content-Type": "application/json-rpc",
                "User-Agent": "InfraWatch-ZabbixConnector/1.0",
            }

            self._client = httpx.AsyncClient(
                timeout=self._timeout,
                verify=self._verify_ssl,
                headers=headers,
            )

        # Se não temos API token, mas temos usuário e senha, efetuamos login
        if not self._auth_token and self._username and self._password:
            await self.login(self._username, self._password)

    async def close(self) -> None:
        """Finaliza sessões ativas e encerra o cliente HTTP."""
        if self._session_created and self._auth_token and not self._api_token:
            try:
                await self.logout()
            except Exception as exc:  # noqa: BLE001
                logger.debug("Falha ignorada ao encerrar sessão no Zabbix: %s", exc)

        if self._client and not self._client.is_closed:
            await self._client.aclose()
            self._client = None

    def _next_id(self) -> int:
        self._request_counter += 1
        return self._request_counter

    async def call(
        self,
        method: str,
        params: dict[str, Any] | list[Any] | None = None,
        auth: str | None = None,
    ) -> Any:
        """Executa uma chamada de procedimento remoto JSON-RPC 2.0 no Zabbix."""
        if self._client is None or self._client.is_closed:
            await self.open()

        assert self._client is not None

        # O Zabbix aceita o token no campo auth ou via cabeçalho Authorization
        effective_auth = auth if auth is not None else self._auth_token

        # Headers por requisição: métodos como apiinfo.version PROÍBEM header de Authorization
        request_headers: dict[str, str] = {}
        payload_auth: str | None = None

        if method not in ("apiinfo.version", "user.login") and effective_auth:
            request_headers["Authorization"] = f"Bearer {effective_auth}"
            if not self._api_token:
                payload_auth = effective_auth

        payload = JsonRpcRequest(
            method=method,
            params=params if params is not None else {},
            id=self._next_id(),
            auth=payload_auth,
        ).model_dump(exclude_none=True)

        last_exception: Exception | None = None

        for attempt in range(1, _MAX_RETRIES + 1):
            try:
                response = await self._client.post(self._api_url, json=payload, headers=request_headers)

                if response.status_code == 401 or response.status_code == 403:
                    raise ZabbixAuthError(
                        f"Não autorizado pelo servidor Zabbix (HTTP {response.status_code})"
                    )

                response.raise_for_status()
                data = response.json()
                rpc_response = JsonRpcResponse.model_validate(data)

                if rpc_response.error:
                    err = rpc_response.error
                    err_data_str = str(err.data) if err.data else ""
                    # Mensagens conhecidas de auth inválida no Zabbix
                    if (
                        "Not authorized" in err.message
                        or "Session terminated" in err.message
                        or "Session terminated" in err_data_str
                        or "Not authorized" in err_data_str
                        or (err.code == -32602 and "login" in method)
                    ):
                        raise ZabbixAuthError(f"Erro de autenticação Zabbix: {err.message} ({err.data})")

                    raise ZabbixApiError(code=err.code, message=err.message, data=err.data)

                return rpc_response.result

            except (httpx.TransportError, httpx.TimeoutException) as exc:
                last_exception = exc
                logger.warning(
                    "Falha transitória na conexão com Zabbix (tentativa %d/%d): %s",
                    attempt,
                    _MAX_RETRIES,
                    exc,
                )
                if attempt < _MAX_RETRIES:
                    await asyncio.sleep(0.5 * (2 ** (attempt - 1)))
            except ZabbixError:
                raise
            except Exception as exc:  # noqa: BLE001
                last_exception = exc
                logger.error("Erro inesperado ao consultar Zabbix: %s", exc)
                break

        raise ZabbixConnectionError(
            f"Falha definitiva ao comunicar com Zabbix em {self._api_url}: {last_exception}"
        ) from last_exception

    async def get_api_version(self) -> str:
        """Retorna a versão do servidor Zabbix (ex: '6.0.14', '7.0.0')."""
        result = await self.call("apiinfo.version", auth=None)
        return str(result)

    async def login(self, username: str, password: str) -> str:
        """Autentica com usuário e senha via método user.login."""
        # Suporta tanto chave 'username' (Zabbix 5.4+) quanto 'user' (Zabbix < 5.4)
        params = {"username": username, "password": password}
        try:
            token = await self.call("user.login", params=params, auth=None)
        except ZabbixApiError:
            # Tenta fallback para formato antigo 'user'
            params = {"user": username, "password": password}
            token = await self.call("user.login", params=params, auth=None)

        if not isinstance(token, str):
            raise ZabbixAuthError("Resposta inesperada do user.login no Zabbix")

        self._auth_token = token
        self._session_created = True
        return token

    async def logout(self) -> bool:
        """Encerra a sessão ativa no Zabbix."""
        if not self._auth_token:
            return True
        result = await self.call("user.logout", params=[])
        self._auth_token = None
        self._session_created = False
        return bool(result)

    async def get_hosts(
        self,
        hostids: list[str] | None = None,
        names: list[str] | None = None,
    ) -> list[ZabbixHost]:
        """Consulta hosts cadastrados no Zabbix."""
        params: dict[str, Any] = {
            "output": ["hostid", "host", "name", "status", "available"],
        }
        if hostids:
            params["hostids"] = hostids
        if names:
            params["filter"] = {"host": names}

        raw_hosts = await self.call("host.get", params=params)
        return [ZabbixHost.model_validate(h) for h in raw_hosts]

    async def get_items(
        self,
        hostids: list[str],
        keys: list[str] | None = None,
    ) -> list[ZabbixItem]:
        """Consulta itens e últimas métricas de um ou mais hosts."""
        params: dict[str, Any] = {
            "output": ["itemid", "name", "key_", "lastvalue", "units", "lastclock", "status"],
            "hostids": hostids,
            "filter": {"status": "0"},
        }
        if keys:
            params["search"] = {"key_": keys}
            params["searchByAny"] = True

        raw_items = await self.call("item.get", params=params)
        return [ZabbixItem.model_validate(item) for item in raw_items]

    async def get_host_hardware_metrics(self, hostid: str) -> ZabbixHostMetrics:
        """Busca e consolida as métricas de hardware (CPU, Memória RAM, Disco) de um host."""
        items = await self.get_items(
            hostids=[hostid],
            keys=["system.cpu", "vm.memory", "vfs.fs"],
        )

        metrics = ZabbixHostMetrics(hostid=hostid, items=items)

        for item in items:
            key = item.key_.lower()
            val = item.parse_float_value()
            if val is None:
                continue

            # CPU Utilization (%)
            if ("system.cpu.util" in key or "system.cpu.load" in key) and metrics.cpu_utilization_pct is None:
                metrics.cpu_utilization_pct = round(val, 2)

            # Memory Utilization (%)
            elif ("vm.memory.util" in key or "vm.memory.size[pused]" in key) and metrics.memory_utilization_pct is None:
                metrics.memory_utilization_pct = round(val, 2)

            # Memory Used Bytes
            elif "vm.memory.size[used]" in key and metrics.memory_used_bytes is None:
                metrics.memory_used_bytes = val

            # Memory Total Bytes
            elif "vm.memory.size[total]" in key and metrics.memory_total_bytes is None:
                metrics.memory_total_bytes = val

            # Disk Utilization (%)
            elif "vfs.fs.size[" in key and "pused]" in key and metrics.disk_utilization_pct is None:
                metrics.disk_utilization_pct = round(val, 2)

            # Disk Used Bytes
            elif "vfs.fs.size[" in key and "used]" in key and "pused]" not in key and metrics.disk_used_bytes is None:
                metrics.disk_used_bytes = val

            # Disk Total Bytes
            elif "vfs.fs.size[" in key and "total]" in key and metrics.disk_total_bytes is None:
                metrics.disk_total_bytes = val

        # Se temos used e total de memória mas não a porcentagem, calcula:
        if (
            metrics.memory_utilization_pct is None
            and metrics.memory_used_bytes
            and metrics.memory_total_bytes
            and metrics.memory_total_bytes > 0
        ):
            metrics.memory_utilization_pct = round(
                (metrics.memory_used_bytes / metrics.memory_total_bytes) * 100.0, 2
            )

        # Se temos used e total de disco mas não a porcentagem, calcula:
        if (
            metrics.disk_utilization_pct is None
            and metrics.disk_used_bytes
            and metrics.disk_total_bytes
            and metrics.disk_total_bytes > 0
        ):
            metrics.disk_utilization_pct = round(
                (metrics.disk_used_bytes / metrics.disk_total_bytes) * 100.0, 2
            )

        return metrics

    async def get_or_create_status_item(self, hostid: str) -> str | None:
        """Busca ou cria automaticamente o item trapper infrawatch.status no host indicado."""
        try:
            items = await self.call(
                "item.get",
                params={
                    "hostids": [hostid],
                    "filter": {"key_": "infrawatch.status"},
                    "output": ["itemid", "name", "key_"],
                },
            )
            if items and isinstance(items, list) and len(items) > 0:
                return str(items[0]["itemid"])

            # Se ainda não existe, provisiona o item como Zabbix trapper (type: 2, value_type: 4 = text)
            created = await self.call(
                "item.create",
                params={
                    "name": "InfraWatch API Status (Startup)",
                    "key_": "infrawatch.status",
                    "hostid": hostid,
                    "type": 2,  # Zabbix trapper
                    "value_type": 4,  # Text
                },
            )
            if created and isinstance(created, dict) and "itemids" in created and created["itemids"]:
                logger.info(
                    "Item trapper infrawatch.status provisionado com sucesso no Zabbix (itemid: %s)",
                    created["itemids"][0],
                )
                return str(created["itemids"][0])
        except Exception as exc:  # noqa: BLE001
            logger.debug("Não foi possível obter ou provisionar item infrawatch.status no Zabbix: %s", exc)
        return None

    async def send_startup_heartbeat(
        self,
        app_name: str = "InfraWatch",
        version: str = "0.1.0",
        environment: str = "development",
    ) -> dict[str, Any]:
        """Valida conectividade e registra batimento cardíaco (startup heartbeat) no Zabbix."""
        api_version = await self.get_api_version()
        hosts = await self.get_hosts()

        pushed = False
        item_id: str | None = None
        # No Zabbix 7.0+, localiza ou provisiona o item trapper e envia o histórico via itemid
        if hosts:
            target_host = hosts[0]
            item_id = await self.get_or_create_status_item(target_host.hostid)
            if item_id:
                try:
                    res = await self.call(
                        "history.push",
                        params=[
                            {
                                "itemid": item_id,
                                "value": f"{app_name} v{version} ONLINE ({environment})",
                            }
                        ],
                    )
                    if res and isinstance(res, dict) and res.get("response") == "success":
                        data_list = res.get("data", [])
                        if data_list and "error" not in data_list[0]:
                            pushed = True
                except Exception as exc:  # noqa: BLE001
                    logger.debug("Tentativa de history.push no Zabbix falhou: %s", exc)

        return {
            "status": "ok",
            "api_version": api_version,
            "hosts_count": len(hosts),
            "item_id": item_id,
            "heartbeat_pushed": pushed,
        }


