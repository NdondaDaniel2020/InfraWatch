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

    @staticmethod
    def _calculate_cpu_throttling(stats: dict[str, Any]) -> tuple[int, int]:
        """Extrai métricas de throttling CPU (periodos throttled e tempo throttled em nanossegundos)."""
        try:
            cpu_stats = stats.get("cpu_stats", {})
            throttling = cpu_stats.get("throttling_data", {})
            periods = int(throttling.get("throttled_periods", 0))
            throttled_time = int(throttling.get("throttled_time", 0))
            return periods, throttled_time
        except (KeyError, TypeError, ValueError):
            pass
        return 0, 0

    @staticmethod
    def _calculate_memory_detailed(stats: dict[str, Any]) -> dict[str, Any]:
        """Extrai breakdown detalhado de memória (page faults, shmem, slab, workingset)."""
        try:
            memory_stats = stats.get("memory_stats", {})
            stats_detail = memory_stats.get("stats", {})
            return {
                "page_faults": int(stats_detail.get("pgfault", 0)),
                "major_faults": int(stats_detail.get("pgmajfault", 0)),
                "shmem_bytes": int(stats_detail.get("shmem", 0)),
                "slab_bytes": int(stats_detail.get("slab", 0)),
                "slab_reclaimable_bytes": int(stats_detail.get("slab_reclaimable", 0)),
                "slab_unreclaimable_bytes": int(stats_detail.get("slab_unreclaimable", 0)),
                "workingset_refault": int(stats_detail.get("workingset_refault", 0)),
                "workingset_activate": int(stats_detail.get("workingset_activate", 0)),
                "workingset_nodereclaim": int(stats_detail.get("workingset_nodereclaim", 0)),
            }
        except (KeyError, TypeError, ValueError):
            pass
        return {}

    @staticmethod
    def _extract_network_stats(stats: dict[str, Any]) -> dict[str, Any]:
        """Extrai estatísticas de rede por interface (rx/tx bytes, packets, errors, dropped)."""
        try:
            networks = stats.get("networks", {})
            if not networks:
                return {}
            # Agrega todas as interfaces (geralmente eth0)
            total_rx_bytes = 0
            total_tx_bytes = 0
            total_rx_packets = 0
            total_tx_packets = 0
            total_rx_errors = 0
            total_tx_errors = 0
            total_rx_dropped = 0
            total_tx_dropped = 0
            interfaces = {}
            for iface, data in networks.items():
                rx_b = int(data.get("rx_bytes", 0))
                tx_b = int(data.get("tx_bytes", 0))
                rx_p = int(data.get("rx_packets", 0))
                tx_p = int(data.get("tx_packets", 0))
                rx_e = int(data.get("rx_errors", 0))
                tx_e = int(data.get("tx_errors", 0))
                rx_d = int(data.get("rx_dropped", 0))
                tx_d = int(data.get("tx_dropped", 0))
                interfaces[iface] = {
                    "rx_bytes": rx_b, "tx_bytes": tx_b,
                    "rx_packets": rx_p, "tx_packets": tx_p,
                    "rx_errors": rx_e, "tx_errors": tx_e,
                    "rx_dropped": rx_d, "tx_dropped": tx_d,
                }
                total_rx_bytes += rx_b
                total_tx_bytes += tx_b
                total_rx_packets += rx_p
                total_tx_packets += tx_p
                total_rx_errors += rx_e
                total_tx_errors += tx_e
                total_rx_dropped += rx_d
                total_tx_dropped += tx_d
            return {
                "interfaces": interfaces,
                "rx_bytes": total_rx_bytes,
                "tx_bytes": total_tx_bytes,
                "rx_packets": total_rx_packets,
                "tx_packets": total_tx_packets,
                "rx_errors": total_rx_errors,
                "tx_errors": total_tx_errors,
                "rx_dropped": total_rx_dropped,
                "tx_dropped": total_tx_dropped,
            }
        except (KeyError, TypeError, ValueError):
            pass
        return {}

    @staticmethod
    def _extract_blkio_stats(stats: dict[str, Any]) -> dict[str, Any]:
        """Extrai estatísticas de I/O de bloco (read/write bytes e ops)."""
        try:
            blkio = stats.get("blkio_stats", {})
            io_service_bytes = blkio.get("io_service_bytes_recursive", []) or []
            read_bytes = 0
            write_bytes = 0
            read_ops = 0
            write_ops = 0
            for entry in io_service_bytes:
                op = entry.get("op")
                value = int(entry.get("value", 0))
                if op == "read":
                    read_bytes += value
                elif op == "write":
                    write_bytes += value
            io_serviced = blkio.get("io_serviced_recursive", []) or []
            for entry in io_serviced:
                op = entry.get("op")
                value = int(entry.get("value", 0))
                if op == "read":
                    read_ops += value
                elif op == "write":
                    write_ops += value
            return {
                "read_bytes": read_bytes,
                "write_bytes": write_bytes,
                "read_ops": read_ops,
                "write_ops": write_ops,
            }
        except (KeyError, TypeError, ValueError):
            pass
        return {}

    @staticmethod
    def _extract_pids_stats(stats: dict[str, Any]) -> dict[str, Any]:
        """Extrai contagem de processos (PIDs) atuais e limite."""
        try:
            pids = stats.get("pids_stats", {})
            return {
                "current": int(pids.get("current", 0)),
                "limit": int(pids.get("limit", 0)),
            }
        except (KeyError, TypeError, ValueError):
            pass
        return {}

    @staticmethod
    def _extract_health_info(inspect_data: dict[str, Any]) -> dict[str, Any]:
        """Extrai informações de health check do container."""
        try:
            state = inspect_data.get("State", {})
            health = state.get("Health")
            if not health:
                return {"status": "none", "output": None, "failing_streak": 0}
            return {
                "status": str(health.get("Status", "unknown")).lower(),
                "output": health.get("Log", [{}])[-1].get("Output") if health.get("Log") else None,
                "failing_streak": int(health.get("FailingStreak", 0)),
            }
        except (KeyError, TypeError, ValueError, IndexError):
            pass
        return {"status": "unknown", "output": None, "failing_streak": 0}

    @staticmethod
    def _extract_config_metadata(inspect_data: dict[str, Any]) -> dict[str, Any]:
        """Extrai metadados de configuração: image, labels Compose, mounts, resource limits."""
        try:
            config = inspect_data.get("Config", {})
            host_config = inspect_data.get("HostConfig", {})
            mounts = inspect_data.get("Mounts", [])

            labels = config.get("Labels", {}) or {}
            compose_labels = {k: v for k, v in labels.items() if k.startswith("com.docker.compose.")}

            mount_list = []
            for m in mounts:
                mount_list.append({
                    "type": m.get("Type"),
                    "source": m.get("Source"),
                    "destination": m.get("Destination"),
                    "mode": m.get("Mode"),
                    "driver": m.get("Driver"),
                    "rw": m.get("RW", False),
                })

            return {
                "image": config.get("Image"),
                "labels": compose_labels,
                "mounts": mount_list,
                "memory_limit_bytes": host_config.get("Memory", 0),
                "memory_swap_bytes": host_config.get("MemorySwap", 0),
                "cpu_quota": host_config.get("CpuQuota", 0),
                "cpu_period": host_config.get("CpuPeriod", 0),
                "cpu_shares": host_config.get("CpuShares", 0),
                "cpuset_cpus": host_config.get("CpusetCpus", ""),
                "pids_limit": host_config.get("PidsLimit", 0),
                "oom_kill_disable": host_config.get("OomKillDisable", False),
            }
        except (KeyError, TypeError, ValueError):
            pass
        return {}

    @staticmethod
    def _extract_network_info(inspect_data: dict[str, Any]) -> dict[str, Any]:
        """Extrai informações de rede do container (IP, gateway, MAC, DNS)."""
        try:
            networks = inspect_data.get("NetworkSettings", {}).get("Networks", {})
            if not networks:
                return {}
            # Pega a primeira rede (geralmente a do compose)
            for net_name, net_data in networks.items():
                return {
                    "network_name": net_name,
                    "ip_address": net_data.get("IPAddress"),
                    "gateway": net_data.get("Gateway"),
                    "mac_address": net_data.get("MacAddress"),
                    "dns_names": net_data.get("DNSNames", []),
                    "aliases": net_data.get("Aliases", []),
                }
        except (KeyError, TypeError, ValueError):
            pass
        return {}

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

                # 2. Se estiver executando e saudável, coleta métricas em tempo real
                cpu_throttled_periods = 0
                cpu_throttled_time_ns = 0
                memory_detailed = {}
                network_stats = {}
                blkio_stats = {}
                pids_stats = {}

                if is_running and not is_restarting:
                    try:
                        stats_resp = await client.get(f"/containers/{container_id}/stats?stream=false")
                        if stats_resp.status_code == 200:
                            stats_data = stats_resp.json()
                            cpu_pct = self._calculate_cpu_percent(stats_data)
                            mem_pct, mem_mb = self._calculate_memory_stats(stats_data)
                            cpu_throttled_periods, cpu_throttled_time_ns = self._calculate_cpu_throttling(stats_data)
                            memory_detailed = self._calculate_memory_detailed(stats_data)
                            network_stats = self._extract_network_stats(stats_data)
                            blkio_stats = self._extract_blkio_stats(stats_data)
                            pids_stats = self._extract_pids_stats(stats_data)
                    except Exception as stats_exc:  # noqa: BLE001
                        logger.debug("Falha secundária ao coletar stats do contêiner %s: %s", container_id, stats_exc)

                health_info = self._extract_health_info(inspect_data)
                config_metadata = self._extract_config_metadata(inspect_data)
                network_info = self._extract_network_info(inspect_data)

                extra_data: dict[str, Any] = {
                    "container_id": inspect_data.get("Id", "")[:12],
                    "container_status": status_str,
                    "cpu_usage_pct": cpu_pct,
                    "memory_usage_pct": mem_pct,
                    "memory_used_mb": mem_mb,
                    "restart_count": restart_count,
                    "exit_code": exit_code,
                    "oom_killed": is_oom_killed,
                    # CPU throttling
                    "cpu_throttled_periods": cpu_throttled_periods,
                    "cpu_throttled_time_ns": cpu_throttled_time_ns,
                    # Memória detalhada
                    "memory_page_faults": memory_detailed.get("page_faults", 0),
                    "memory_major_faults": memory_detailed.get("major_faults", 0),
                    "memory_shmem_bytes": memory_detailed.get("shmem_bytes", 0),
                    "memory_slab_bytes": memory_detailed.get("slab_bytes", 0),
                    "memory_slab_reclaimable_bytes": memory_detailed.get("slab_reclaimable_bytes", 0),
                    "memory_slab_unreclaimable_bytes": memory_detailed.get("slab_unreclaimable_bytes", 0),
                    "memory_workingset_refault": memory_detailed.get("workingset_refault", 0),
                    "memory_workingset_activate": memory_detailed.get("workingset_activate", 0),
                    "memory_workingset_nodereclaim": memory_detailed.get("workingset_nodereclaim", 0),
                    # Rede
                    "network_interfaces": network_stats.get("interfaces", {}),
                    "network_rx_bytes": network_stats.get("rx_bytes", 0),
                    "network_tx_bytes": network_stats.get("tx_bytes", 0),
                    "network_rx_packets": network_stats.get("rx_packets", 0),
                    "network_tx_packets": network_stats.get("tx_packets", 0),
                    "network_rx_errors": network_stats.get("rx_errors", 0),
                    "network_tx_errors": network_stats.get("tx_errors", 0),
                    "network_rx_dropped": network_stats.get("rx_dropped", 0),
                    "network_tx_dropped": network_stats.get("tx_dropped", 0),
                    # Block I/O
                    "blkio_read_bytes": blkio_stats.get("read_bytes", 0),
                    "blkio_write_bytes": blkio_stats.get("write_bytes", 0),
                    "blkio_read_ops": blkio_stats.get("read_ops", 0),
                    "blkio_write_ops": blkio_stats.get("write_ops", 0),
                    # PIDs
                    "pids_current": pids_stats.get("current", 0),
                    "pids_limit": pids_stats.get("limit", 0),
                    # Health check
                    "health_status": health_info.get("status", "unknown"),
                    "health_output": health_info.get("output"),
                    "health_failing_streak": health_info.get("failing_streak", 0),
                    # Config metadata
                    "image": config_metadata.get("image"),
                    "compose_labels": config_metadata.get("labels", {}),
                    "mounts": config_metadata.get("mounts", []),
                    "memory_limit_bytes": config_metadata.get("memory_limit_bytes", 0),
                    "memory_swap_bytes": config_metadata.get("memory_swap_bytes", 0),
                    "cpu_quota": config_metadata.get("cpu_quota", 0),
                    "cpu_period": config_metadata.get("cpu_period", 0),
                    "cpu_shares": config_metadata.get("cpu_shares", 0),
                    "cpuset_cpus": config_metadata.get("cpuset_cpus", ""),
                    "pids_limit_config": config_metadata.get("pids_limit", 0),
                    "oom_kill_disable": config_metadata.get("oom_kill_disable", False),
                    # Network info
                    "container_network": network_info,
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
