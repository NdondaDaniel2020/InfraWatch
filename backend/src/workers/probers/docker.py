"""Executor de sondagem Docker para contêineres via Docker Engine API.

Conecta-se à API nativa do Docker (via Unix Domain Socket /var/run/docker.sock
ou TCP remoto) de forma 100% assíncrona, coletando estado de saúde
(running, restarting, oom_killed) e métricas de CPU/RAM em tempo de execução.
"""

from __future__ import annotations

import logging
import os
import time
from typing import Any

import httpx

from src.workers.probers.base import BaseProber, ProbeResult
from src.workers.scheduler.in_memory_inventory import ProbeTarget

logger = logging.getLogger("infrawatch.workers.probers.docker")


class DockerProber(BaseProber):
    """Prober que avalia a integridade de contêineres Docker via Docker Engine API."""

    def __init__(self, socket_path: str | None = None) -> None:
        self.socket_path = socket_path or os.getenv("DOCKER_SOCKET_PATH", "/var/run/docker.sock")

    def _get_client(self, target: ProbeTarget, timeout_s: float) -> httpx.AsyncClient:
        """Instancia o cliente HTTP assíncrono para o socket UDS ou endpoint TCP."""
        if target.port > 0 and target.ip_address not in ("", "127.0.0.1", "localhost", "0.0.0.0"):
            base_url = f"http://{target.ip_address}:{target.port}"
            return httpx.AsyncClient(base_url=base_url, timeout=timeout_s)

        transport = httpx.AsyncHTTPTransport(uds=self.socket_path)
        return httpx.AsyncClient(transport=transport, base_url="http://docker", timeout=timeout_s)

    def _extract_container_identifier(self, target: ProbeTarget) -> str:
        """Determina o nome ou ID do contêiner a partir dos metadados do alvo."""
        candidate = target.ip_address.strip()
        if candidate and candidate not in ("127.0.0.1", "localhost", "0.0.0.0"):
            return candidate
        return target.name.strip()

    @staticmethod
    def _calculate_cpu_percent(stats: dict[str, Any]) -> float:
        """Calcula percentual de uso de CPU com base nos deltas do cgroups."""
        try:
            cpu_stats = stats.get("cpu_stats", {})
            precpu_stats = stats.get("precpu_stats", {})

            cpu_usage = cpu_stats.get("cpu_usage", {})
            precpu_usage = precpu_stats.get("cpu_usage", {})

            cpu_delta = cpu_usage.get("total_usage", 0) - precpu_usage.get("total_usage", 0)
            system_delta = cpu_stats.get("system_cpu_usage", 0) - precpu_stats.get("system_cpu_usage", 0)

            if system_delta > 0 and cpu_delta > 0:
                online_cpus = cpu_stats.get("online_cpus")
                if not online_cpus:
                    percpu = cpu_usage.get("percpu_usage") or []
                    online_cpus = len(percpu) if percpu else 1
                return round((cpu_delta / system_delta) * online_cpus * 100.0, 2)
        except (KeyError, TypeError, ZeroDivisionError):
            pass
        return 0.0

    @staticmethod
    def _calculate_memory_stats(stats: dict[str, Any]) -> tuple[float, float]:
        """Calcula percentual de memória em relação ao limite e consumo em megabytes."""
        try:
            memory_stats = stats.get("memory_stats", {})
            usage = memory_stats.get("usage", 0)
            stats_detail = memory_stats.get("stats", {})

            # Subtrai inactive_file/cache conforme convenção Docker cgroups
            cache = stats_detail.get("inactive_file", stats_detail.get("cache", 0))
            used_bytes = max(0, usage - cache)
            limit = memory_stats.get("limit", 0)

            pct = (used_bytes / limit * 100.0) if limit > 0 else 0.0
            mb = round(used_bytes / (1024 * 1024), 2)
            return round(pct, 2), mb
        except (KeyError, TypeError, ZeroDivisionError):
            pass
        return 0.0, 0.0

    async def probe(self, target: ProbeTarget, timeout_ms: int = 2000) -> ProbeResult:
        """Executa a inspeção e coleta de telemetria do contêiner Docker."""
        timeout_s = max(0.1, timeout_ms / 1000.0)
        container_id = self._extract_container_identifier(target)
        start_time = time.perf_counter()

        client = self._get_client(target, timeout_s)
        try:
            async with client:
                # 1. Consulta metadados de estado do contêiner
                inspect_resp = await client.get(f"/containers/{container_id}/json")
                latency_ms = round((time.perf_counter() - start_time) * 1000, 2)

                if inspect_resp.status_code == 404:
                    return ProbeResult(
                        device_id=target.device_id,
                        target_name=target.name,
                        status="DOWN",
                        latency_ms=latency_ms,
                        packet_loss_pct=100.0,
                        error_message=f"Contêiner '{container_id}' não encontrado no Docker Engine",
                    )

                if inspect_resp.status_code >= 400:
                    return ProbeResult(
                        device_id=target.device_id,
                        target_name=target.name,
                        status="ERROR",
                        latency_ms=latency_ms,
                        packet_loss_pct=100.0,
                        error_message=f"Docker Engine retornou erro HTTP {inspect_resp.status_code}",
                    )

                inspect_data = inspect_resp.json()

                state = inspect_data.get("State", {})
                status_str = str(state.get("Status", "")).lower()
                is_running = bool(state.get("Running", False))
                is_restarting = bool(state.get("Restarting", False))
                is_oom_killed = bool(state.get("OOMKilled", False))
                exit_code = int(state.get("ExitCode", 0))
                restart_count = int(inspect_data.get("RestartCount", 0))

                cpu_pct = 0.0
                mem_pct = 0.0
                mem_mb = 0.0

                # 2. Se estiver executando e saudável, coleta métricas em tempo real
                if is_running and not is_restarting:
                    try:
                        stats_resp = await client.get(f"/containers/{container_id}/stats?stream=false")
                        if stats_resp.status_code == 200:
                            stats_data = stats_resp.json()
                            cpu_pct = self._calculate_cpu_percent(stats_data)
                            mem_pct, mem_mb = self._calculate_memory_stats(stats_data)
                    except Exception as stats_exc:  # noqa: BLE001
                        logger.debug("Falha secundária ao coletar stats do contêiner %s: %s", container_id, stats_exc)

                extra_data: dict[str, Any] = {
                    "container_id": inspect_data.get("Id", "")[:12],
                    "container_status": status_str,
                    "cpu_usage_pct": cpu_pct,
                    "memory_usage_pct": mem_pct,
                    "memory_used_mb": mem_mb,
                    "restart_count": restart_count,
                    "exit_code": exit_code,
                    "oom_killed": is_oom_killed,
                }

                # 3. Classificação de saúde operacional
                if is_oom_killed:
                    return ProbeResult(
                        device_id=target.device_id,
                        target_name=target.name,
                        status="DOWN",
                        latency_ms=latency_ms,
                        packet_loss_pct=100.0,
                        error_message=f"Contêiner encerrado por falta de memória (OOMKilled, ExitCode: {exit_code})",
                        extra_data=extra_data,
                    )

                if is_restarting or status_str == "restarting":
                    return ProbeResult(
                        device_id=target.device_id,
                        target_name=target.name,
                        status="DEGRADED",
                        latency_ms=latency_ms,
                        packet_loss_pct=50.0,
                        error_message=f"Contêiner em reinicialização contínua (RestartCount: {restart_count})",
                        extra_data=extra_data,
                    )

                if status_str in ("exited", "dead") or not is_running:
                    return ProbeResult(
                        device_id=target.device_id,
                        target_name=target.name,
                        status="DOWN",
                        latency_ms=latency_ms,
                        packet_loss_pct=100.0,
                        error_message=f"Contêiner parado (Status: {status_str}, ExitCode: {exit_code})",
                        extra_data=extra_data,
                    )

                if status_str == "paused":
                    return ProbeResult(
                        device_id=target.device_id,
                        target_name=target.name,
                        status="DEGRADED",
                        latency_ms=latency_ms,
                        packet_loss_pct=50.0,
                        error_message="Contêiner em estado pausado",
                        extra_data=extra_data,
                    )

                if cpu_pct >= 90.0 or mem_pct >= 90.0:
                    return ProbeResult(
                        device_id=target.device_id,
                        target_name=target.name,
                        status="DEGRADED",
                        latency_ms=latency_ms,
                        packet_loss_pct=0.0,
                        error_message=f"Alto consumo de recursos (CPU: {cpu_pct}%, RAM: {mem_pct}%)",
                        extra_data=extra_data,
                    )

                return ProbeResult(
                    device_id=target.device_id,
                    target_name=target.name,
                    status="UP",
                    latency_ms=latency_ms,
                    packet_loss_pct=0.0,
                    error_message=None,
                    extra_data=extra_data,
                )

        except (httpx.TimeoutException, TimeoutError):
            latency_ms = round((time.perf_counter() - start_time) * 1000, 2)
            return ProbeResult(
                device_id=target.device_id,
                target_name=target.name,
                status="TIMEOUT",
                latency_ms=latency_ms,
                packet_loss_pct=100.0,
                error_message="Tempo limite na consulta à Docker Engine API excedido",
            )
        except httpx.ConnectError as exc:
            latency_ms = round((time.perf_counter() - start_time) * 1000, 2)
            return ProbeResult(
                device_id=target.device_id,
                target_name=target.name,
                status="DOWN",
                latency_ms=latency_ms,
                packet_loss_pct=100.0,
                error_message=f"Falha de conexão com Docker Engine: {exc!s}",
            )
        except Exception as exc:  # noqa: BLE001
            latency_ms = round((time.perf_counter() - start_time) * 1000, 2)
            logger.warning("Erro inesperado no DockerProber para '%s': %s", target.name, exc)
            return ProbeResult(
                device_id=target.device_id,
                target_name=target.name,
                status="ERROR",
                latency_ms=latency_ms,
                packet_loss_pct=100.0,
                error_message=f"Erro interno DockerProber: {exc!s}",
            )
