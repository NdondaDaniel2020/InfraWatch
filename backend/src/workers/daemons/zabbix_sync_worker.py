"""Worker periódico para sincronização de telemetria de hardware via Zabbix JSON-RPC.

Coleta métricas avançadas (CPU, RAM, Disco) de ativos associados a um `zabbix_host_id`
e persiste na série temporal de telemetria, enriquecendo a visão de NOC do InfraWatch
sem duplicar regras de coleta nativas (ADR-004).
"""

import asyncio
import json
import logging
from datetime import UTC, datetime
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from src.contexts.inventory.database.models import DeviceModel
from src.contexts.telemetry.database.models import MetricModel
from src.core.config import get_settings
from src.core.database.session import get_session_factory
from src.core.infrastructure.redis import get_redis_client
from src.integrations.zabbix.client import ZabbixClient, ZabbixError
from src.integrations.zabbix.schemas import ZabbixHostMetrics

logger = logging.getLogger("infrawatch.workers.zabbix_sync")

_DEFAULT_SYNC_INTERVAL = 60.0


class ZabbixSyncWorker:
    """Worker assíncrono para enriquecimento de telemetria via conector Zabbix JSON-RPC."""

    def __init__(
        self,
        session_factory: async_sessionmaker[AsyncSession] | None = None,
        sync_interval: float = _DEFAULT_SYNC_INTERVAL,
        client: ZabbixClient | None = None,
    ) -> None:
        self._session_factory = session_factory or get_session_factory()
        self._sync_interval = sync_interval
        self._custom_client = client

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

    async def sync_once(self) -> int:
        """Executa um ciclo único de sincronização para todos os dispositivos qualificados."""
        settings = get_settings()
        if not getattr(settings, "ZABBIX_ENABLED", False):
            logger.debug("Integração Zabbix desativada (ZABBIX_ENABLED=False). Ciclo ignorado.")
            return 0

        synced_count = 0
        client = self._get_zabbix_client()

        async with client, self._session_factory() as session:
            query = select(DeviceModel).where(
                DeviceModel.is_paused.is_(False)
            )
            result = await session.execute(query)
            devices = result.scalars().all()

            for device in devices:
                thresholds = device.thresholds or {}
                zabbix_host_id = thresholds.get("zabbix_host_id")
                if not zabbix_host_id:
                    continue

                synced = await self.sync_device_metrics(
                    session=session,
                    client=client,
                    device_id=device.id,
                    org_id=device.organization_id,
                    zabbix_host_id=str(zabbix_host_id),
                )
                if synced:
                    synced_count += 1

        return synced_count

    async def run_forever(self, stop_event: asyncio.Event | None = None) -> None:
        """Loop contínuo de sincronização em segundo plano com intervalo regular."""
        logger.info(
            "Iniciando ZabbixSyncWorker (intervalo: %.1fs)...",
            self._sync_interval,
        )

        while stop_event is None or not stop_event.is_set():
            try:
                count = await self.sync_once()
                if count > 0:
                    logger.info("Ciclo Zabbix finalizado: %d dispositivos sincronizados.", count)
            except Exception:
                logger.exception("Erro no ciclo de sincronização Zabbix")

            try:
                if stop_event:
                    await asyncio.wait_for(stop_event.wait(), timeout=self._sync_interval)
                else:
                    await asyncio.sleep(self._sync_interval)
            except TimeoutError:
                pass


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
