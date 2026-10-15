from __future__ import annotations

import asyncio
import json
import logging
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any
from uuid import UUID, uuid4

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from src.contexts.inventory.database.models import DeviceModel
from src.contexts.telemetry.database.models import MetricModel
from src.core.config import get_settings
from src.core.database.session import get_session_factory
from src.core.infrastructure.redis import get_redis_client
from src.core.messaging.resilient_bus import ResilientEventBus
from src.integrations.zabbix.client import ZabbixClient, ZabbixError
from src.integrations.zabbix.schemas import ZabbixHostMetrics

logger = logging.getLogger("infrawatch.workers.zabbix_sync")

_DEFAULT_SYNC_INTERVAL = 60.0
_DEFAULT_RECONCILIATION_INTERVAL = 600.0


@dataclass
class ZabbixTarget:
    """Alvo qualificado para telemetria Zabbix mantido em memória RAM."""

    device_id: UUID
    organization_id: UUID
    zabbix_host_id: str
    name: str = ""


class ZabbixSyncWorker:
    """Worker assíncrono resiliente para enriquecimento de telemetria via Zabbix JSON-RPC.

    Adota o padrão de arquitetura do ProbeWorker:
    1. Registro em memória RAM (ZabbixTarget) para zero overhead de banco no ciclo regular.
    2. Consumer de eventos (stream:inventory:changes) para refletir mutações cadastrais em tempo real.
    3. Reconciliação periódica com o PostgreSQL (self-healing fallback a cada 10 min).
    4. Coleta concorrente protegida por semáforo assíncrono (asyncio.Semaphore).
    """

    def __init__(
        self,
        session_factory: async_sessionmaker[AsyncSession] | None = None,
        sync_interval: float = _DEFAULT_SYNC_INTERVAL,
        client: ZabbixClient | None = None,
        event_bus: ResilientEventBus | None = None,
        max_concurrent: int = 50,
        reconciliation_interval: float = _DEFAULT_RECONCILIATION_INTERVAL,
    ) -> None:
        self._session_factory = session_factory or get_session_factory()
        self._sync_interval = sync_interval
        self._custom_client = client
        self._event_bus = event_bus or ResilientEventBus()
        self._semaphore = asyncio.Semaphore(max_concurrent)
        self._reconciliation_interval = reconciliation_interval
        self._monitored_hosts: dict[UUID, ZabbixTarget] = {}

    def _get_zabbix_client(self) -> ZabbixClient:
        """Instancia o cliente Zabbix com base nas configurações da aplicação."""
        if self._custom_client:
            return self._custom_client

        settings = get_settings()
        return ZabbixClient(
            api_url=settings.ZABBIX_API_URL,
            api_token=settings.ZABBIX_API_TOKEN,
            username=settings.ZABBIX_USER,
            password=settings.ZABBIX_PASSWORD,
            timeout=settings.ZABBIX_TIMEOUT_SECONDS,
        )

    async def sync_device_metrics(
        self,
        session: AsyncSession,
        client: ZabbixClient,
        device_id: UUID,
        org_id: UUID,
        zabbix_host_id: str,
    ) -> ZabbixHostMetrics | None:
        """Coleta telemetria de um host específico no Zabbix e armazena métricas."""
        try:
            metrics = await client.get_host_hardware_metrics(hostid=zabbix_host_id)
            if not metrics or not metrics.has_hardware_telemetry:
                logger.debug(
                    "Nenhuma métrica de hardware retornada pelo Zabbix para host %s",
                    zabbix_host_id,
                )
                return metrics

            now = datetime.now(UTC)
            metric_records: list[MetricModel] = []

            # 1. CPU Utilization (%)
            if metrics.cpu_utilization_pct is not None:
                metric_records.append(
                    MetricModel(
                        device_id=device_id,
                        organization_id=org_id,
                        metric_type="cpu_usage_pct",
                        value=float(metrics.cpu_utilization_pct),
                        status="UP",
                        timestamp=now,
                    )
                )

            # 2. Memory Utilization (%)
            if metrics.memory_utilization_pct is not None:
                metric_records.append(
                    MetricModel(
                        device_id=device_id,
                        organization_id=org_id,
                        metric_type="memory_usage_pct",
                        value=float(metrics.memory_utilization_pct),
                        status="UP",
                        timestamp=now,
                    )
                )

            # 3. Disk Utilization (%)
            if metrics.disk_utilization_pct is not None:
                metric_records.append(
                    MetricModel(
                        device_id=device_id,
                        organization_id=org_id,
                        metric_type="disk_usage_pct",
                        value=float(metrics.disk_utilization_pct),
                        status="UP",
                        timestamp=now,
                    )
                )

            if metric_records:
                session.add_all(metric_records)
                await session.commit()
                logger.info(
                    "Telemetria Zabbix gravada para dispositivo %s (CPU: %s%%, RAM: %s%%, Disco: %s%%)",
                    device_id,
                    metrics.cpu_utilization_pct,
                    metrics.memory_utilization_pct,
                    metrics.disk_utilization_pct,
                )

            # Atualiza cache Redis para o dashboard NOC
            try:
                redis = get_redis_client()
                if redis:
                    cache_key = f"infrawatch:device:{device_id}:hardware_telemetry"
                    payload = {
                        "cpu_usage_pct": metrics.cpu_utilization_pct,
                        "memory_usage_pct": metrics.memory_utilization_pct,
                        "disk_usage_pct": metrics.disk_utilization_pct,
                        "collected_at": now.isoformat(),
                        "zabbix_host_id": zabbix_host_id,
                    }
                    await redis.set(cache_key, json.dumps(payload), ex=180)
            except Exception as redis_exc:  # noqa: BLE001
                logger.debug("Falha ao cachear telemetria no Redis: %s", redis_exc)

            return metrics

        except ZabbixError as exc:
            # Resiliência: falhas no Zabbix são isoladas e não abortam a rotina
            logger.warning(
                "Falha ao consultar métricas Zabbix para dispositivo %s (hostid=%s): %s",
                device_id,
                zabbix_host_id,
                exc,
            )
            return None
        except Exception:
            logger.exception(
                "Erro inesperado na sincronização do dispositivo %s com Zabbix",
                device_id,
            )
            return None

    async def load_initial_hosts_from_db(self) -> int:
        """Carrega ativos com zabbix_host_id para o catálogo em memória RAM."""
        try:
            async with self._session_factory() as session:
                query = select(DeviceModel).where(DeviceModel.is_paused.is_(False))
                result = await session.execute(query)
                devices = result.scalars().all()

                new_hosts: dict[UUID, ZabbixTarget] = {}
                for device in devices:
                    thresholds = device.thresholds or {}
                    zabbix_host_id = thresholds.get("zabbix_host_id")
                    if zabbix_host_id:
                        new_hosts[device.id] = ZabbixTarget(
                            device_id=device.id,
                            organization_id=device.organization_id,
                            zabbix_host_id=str(zabbix_host_id),
                            name=device.name,
                        )

                self._monitored_hosts = new_hosts
                logger.info(
                    "Catálogo Zabbix inicial carregado: %d ativos em memória",
                    len(self._monitored_hosts),
                )
                return len(self._monitored_hosts)
        except Exception:
            logger.exception("Falha ao carregar catálogo inicial do Zabbix do PostgreSQL")
            return len(self._monitored_hosts)

    async def handle_inventory_event(self, event_type: str, payload: dict[str, Any]) -> None:
        """Reage em tempo real a mutações de inventário via Redis Streams."""
        agg_id = payload.get("aggregate_id") or payload.get("device_id")
        if not agg_id:
            return

        try:
            device_id = UUID(str(agg_id))
        except (ValueError, TypeError):
            return

        if event_type in ("DeviceDeleted", "DevicePaused"):
            removed = self._monitored_hosts.pop(device_id, None)
            if removed:
                logger.info("ZabbixTarget removido da memória por %s: %s", event_type, device_id)
            return

        if event_type in ("DeviceCreated", "DeviceUpdated", "DeviceResumed"):
            thresholds = payload.get("thresholds") or {}
            zh_id = thresholds.get("zabbix_host_id")
            is_paused = bool(payload.get("is_paused", False))

            if zh_id and not is_paused:
                org_id_raw = payload.get("organization_id")
                try:
                    org_id = UUID(str(org_id_raw)) if org_id_raw else device_id
                except (ValueError, TypeError):
                    org_id = device_id

                # Push para Zabbix: cria ou atualiza host
                await self.push_host_to_zabbix(
                    device_id=device_id,
                    org_id=org_id,
                    name=str(payload.get("name", "Unknown")),
                    ip_address=str(payload.get("ip_address", "")),
                    protocol=str(payload.get("protocol", "snmp")),
                    zabbix_host_id=str(zh_id),
                )

                self._monitored_hosts[device_id] = ZabbixTarget(
                    device_id=device_id,
                    organization_id=org_id,
                    zabbix_host_id=str(zh_id),
                    name=str(payload.get("name", "Unknown")),
                )
                logger.info(
                    "ZabbixTarget adicionado/atualizado na memória: %s (hostid=%s)",
                    device_id,
                    zh_id,
                )
            else:
                self._monitored_hosts.pop(device_id, None)

    async def consume_inventory_events(self, stop_event: asyncio.Event) -> None:
        """Loop que consome stream:inventory:changes via Redis Streams."""
        group = "cg:zabbix_sync_workers"
        topic = "stream:inventory:changes"
        consumer_name = f"zabbix-sync-{uuid4().hex[:6]}"

        while not stop_event.is_set():
            try:
                messages = await self._event_bus.consume_batch(
                    topic=topic,
                    group=group,
                    consumer_name=consumer_name,
                    batch_size=20,
                    timeout_ms=2000,
                )
                if not messages:
                    continue

                acked_ids: list[str] = []
                for msg_id, payload in messages:
                    try:
                        event_type = str(payload.get("event_type", ""))
                        await self.handle_inventory_event(event_type, payload)
                        acked_ids.append(msg_id)
                    except Exception:
                        logger.exception(
                            "Erro ao processar evento de inventário no ZabbixSyncWorker: %s",
                            msg_id,
                        )

                if acked_ids:
                    await self._event_bus.ack(topic, group, *acked_ids)

            except asyncio.CancelledError:
                break
            except Exception:  # noqa: BLE001
                logger.debug(
                    "Falha transitória no consumer de inventário do Zabbix (retentando em 3s)"
                )
                await asyncio.sleep(3.0)

    async def _reconciliation_loop(self, stop_event: asyncio.Event) -> None:
        """Loop periódico de reconciliação com o PostgreSQL (self-healing fallback)."""
        logger.info(
            "Iniciando loop de reconciliação Zabbix (intervalo: %.1fs)...",
            self._reconciliation_interval,
        )
        while not stop_event.is_set():
            try:
                try:
                    await asyncio.wait_for(stop_event.wait(), timeout=self._reconciliation_interval)
                    if stop_event.is_set():
                        break
                except TimeoutError:
                    pass

                logger.debug(
                    "Executando reconciliação periódica de ativos Zabbix com o PostgreSQL..."
                )
                await self.load_initial_hosts_from_db()
            except asyncio.CancelledError:
                break
            except Exception:
                logger.exception("Erro durante reconciliação periódica do Zabbix")
                await asyncio.sleep(10.0)

    async def sync_once(self) -> int:
        """Executa um ciclo único de sincronização sobre os alvos em memória."""
        settings = get_settings()
        if not getattr(settings, "ZABBIX_ENABLED", False):
            logger.debug("Integração Zabbix desativada (ZABBIX_ENABLED=False). Ciclo ignorado.")
            return 0

        # Auto-inicialização defensiva caso o catálogo em memória ainda não tenha sido carregado
        if not self._monitored_hosts:
            await self.load_initial_hosts_from_db()

        if not self._monitored_hosts:
            return 0

        synced_count = 0
        client = self._get_zabbix_client()

        async def _sync_single(target: ZabbixTarget) -> bool:
            async with self._semaphore, self._session_factory() as session:
                synced = await self.sync_device_metrics(
                    session=session,
                    client=client,
                    device_id=target.device_id,
                    org_id=target.organization_id,
                    zabbix_host_id=target.zabbix_host_id,
                )
                return bool(synced)

        async with client:
            tasks = [_sync_single(target) for target in list(self._monitored_hosts.values())]
            results = await asyncio.gather(*tasks, return_exceptions=True)
            for res in results:
                if res is True:
                    synced_count += 1

        return synced_count

    async def push_host_to_zabbix(
        self,
        device_id: UUID,
        org_id: UUID,
        name: str,
        ip_address: str,
        protocol: str,
        zabbix_host_id: str | None = None,
    ) -> str | None:
        """Cria ou atualiza host no Zabbix e vincula templates SNMP padrão.

        Args:
            device_id: UUID do dispositivo no InfraWatch
            org_id: UUID da organização
            name: Nome do dispositivo
            ip_address: Endereço IP ou hostname DNS
            protocol: Protocolo (snmp, icmp, tcp, etc.)
            zabbix_host_id: HostID existente no Zabbix (se já provisionado)

        Returns:
            HostID do Zabbix criado/atualizado ou None em caso de falha
        """
        try:
            client = self._get_zabbix_client()
            async with client:
                if zabbix_host_id:
                    # Atualiza host existente
                    await client.call(
                        "host.update",
                        params={
                            "hostid": zabbix_host_id,
                            "host": name,
                            "name": name,
                            "interfaces": [
                                {
                                    "type": 2,  # SNMP
                                    "main": 1,
                                    "useip": 1,
                                    "ip": ip_address,
                                    "dns": "",
                                    "port": "161",
                                    "details": {"version": 2, "community": "public"},
                                }
                            ],
                        },
                    )
                    logger.info("Host Zabbix atualizado: %s (hostid=%s)", name, zabbix_host_id)
                    return zabbix_host_id
                else:
                    # Cria novo host
                    result = await client.call(
                        "host.create",
                        params={
                            "host": name,
                            "name": name,
                            "interfaces": [
                                {
                                    "type": 2,  # SNMP
                                    "main": 1,
                                    "useip": 1,
                                    "ip": ip_address,
                                    "dns": "",
                                    "port": "161",
                                    "details": {"version": 2, "community": "public"},
                                }
                            ],
                            "groups": [{"groupid": "2"}],  # Linux servers group (default)
                            "templates": [
                                {"templateid": "10001"},  # Template OS Linux SNMP
                                {"templateid": "10002"},  # Template Network Device SNMP
                            ],
                        },
                    )
                    if (
                        result
                        and isinstance(result, dict)
                        and "hostids" in result
                        and result["hostids"]
                    ):
                        new_hostid = str(result["hostids"][0])
                        logger.info("Host Zabbix criado: %s (hostid=%s)", name, new_hostid)
                        return new_hostid

        except ZabbixError as exc:
            logger.warning(
                "Falha ao provisionar host %s no Zabbix: %s",
                name,
                exc,
            )
        except Exception:
            logger.exception("Erro inesperado ao provisionar host %s no Zabbix", name)
        return None

    async def run_forever(self, stop_event: asyncio.Event | None = None) -> None:
        """Loop contínuo de sincronização com registry em memória, eventos e reconciliação."""
        local_stop = stop_event or asyncio.Event()
        logger.info(
            "Iniciando ZabbixSyncWorker resiliente (intervalo: %.1fs, reconciliação: %.1fs)...",
            self._sync_interval,
            self._reconciliation_interval,
        )

        # 1. Carga inicial dos ativos qualificados para a memória RAM
        await self.load_initial_hosts_from_db()

        # 2. Inicia tasks paralelas de consumo de eventos e reconciliação
        consumer_task = asyncio.create_task(
            self.consume_inventory_events(local_stop),
            name="zabbix-inventory-consumer-task",
        )
        reconcile_task = asyncio.create_task(
            self._reconciliation_loop(local_stop),
            name="zabbix-reconciliation-task",
        )

        try:
            while not local_stop.is_set():
                try:
                    count = await self.sync_once()
                    if count > 0:
                        logger.info(
                            "Ciclo Zabbix finalizado: %d dispositivos sincronizados.", count
                        )
                except Exception:
                    logger.exception("Erro no ciclo de sincronização Zabbix")

                try:
                    await asyncio.wait_for(local_stop.wait(), timeout=self._sync_interval)
                except TimeoutError:
                    pass
        finally:
            local_stop.set()
            consumer_task.cancel()
            reconcile_task.cancel()
            await asyncio.gather(consumer_task, reconcile_task, return_exceptions=True)
            logger.info("ZabbixSyncWorker finalizado graciosamente.")


async def main() -> None:
    """Ponto de entrada para execução direta do daemon."""
    from src.core.observability.logging import setup_logging

    setup_logging()

    worker = ZabbixSyncWorker()
    stop_event = asyncio.Event()

    def handle_exit() -> None:
        logger.info("Sinal de encerramento recebido. Parando ZabbixSyncWorker...")
        stop_event.set()

    loop = asyncio.get_running_loop()
    for sig in ("SIGINT", "SIGTERM"):
        try:
            import signal

            loop.add_signal_handler(getattr(signal, sig), handle_exit)
        except NotImplementedError:
            pass

    await worker.run_forever(stop_event=stop_event)


if __name__ == "__main__":
    asyncio.run(main())
