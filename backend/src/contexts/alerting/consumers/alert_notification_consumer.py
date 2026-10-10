"""Consumer Redis Streams que despacha notificações multicanal para eventos de incidentes.

Assina o stream ``stream:incidents`` via Consumer Group ``cg:notification_workers``,
consome eventos de ciclo de vida de rede (IncidentTriggeredEvent, DeviceDegradedEvent, IncidentResolvedEvent)
e despacha mensagens de alerta via NotificationDispatcher para Telegram, WhatsApp, Webhooks e SMTP.

Fluxo de mensagem:
  Redis Stream (stream:incidents)
    -> AlertNotificationConsumer
      -> Mapeamento para AlertMessage
      -> NotificationDispatcher.dispatch_by_severity()
        -> Concorrente: Telegram, WhatsApp, Webhook, SMTP
"""

from __future__ import annotations

import asyncio
import logging
from typing import Any
from uuid import UUID

from src.core.messaging.interfaces import EventHandler
from src.core.messaging.resilient_bus import ResilientEventBus
from src.integrations.notifications import (
    AlertMessage,
    AlertSeverity,
    NotificationDispatcher,
    get_notification_dispatcher,
)

logger = logging.getLogger("infrawatch.alerting.consumers.notifications")

STREAM_TOPIC = "stream:incidents"
NOTIFICATION_CONSUMER_GROUP = "cg:notification_workers"


class AlertNotificationConsumer(EventHandler):
    """Consumer de incidentes que despacha notificações multicanal desacopladas."""

    def __init__(
        self,
        event_bus: ResilientEventBus,
        dispatcher: NotificationDispatcher | None = None,
        consumer_name: str = "notification-worker-1",
        batch_size: int = 10,
        poll_timeout_ms: int = 3000,
    ) -> None:
        self._event_bus = event_bus
        self._dispatcher = dispatcher or get_notification_dispatcher()
        self.consumer_name = consumer_name
        self.batch_size = batch_size
        self.poll_timeout_ms = poll_timeout_ms

    def _parse_uuid(self, val: Any) -> UUID | None:
        """Converte valor para UUID de forma defensiva."""
        if isinstance(val, UUID):
            return val
        if isinstance(val, str) and val.strip():
            try:
                return UUID(val)
            except ValueError:
                return None
        return None

    def _map_severity(self, raw_severity: str) -> AlertSeverity:
        """Mapeia string de severidade para o enum AlertSeverity."""
        cleaned = raw_severity.upper().strip()
        if cleaned in ("CRITICAL", "DOWN"):
            return AlertSeverity.CRITICAL
        if cleaned in ("DEGRADED", "WARNING"):
            return AlertSeverity.DEGRADED
        if cleaned in ("RESOLVED", "UP"):
            return AlertSeverity.RESOLVED
        return AlertSeverity.INFO

    def _build_alert_message(self, event_type: str, payload: dict[str, Any]) -> AlertMessage | None:
        """Converte payload do evento de domínio em AlertMessage padronizado."""
        device_name = payload.get("device_name") or "Dispositivo"
        device_ip = payload.get("device_ip")
        device_id = self._parse_uuid(payload.get("device_id") or payload.get("aggregate_id"))

        if event_type == "IncidentTriggeredEvent":
            raw_sev = str(payload.get("severity", "CRITICAL"))
            severity = self._map_severity(raw_sev)
            reason = payload.get("reason") or "Queda ou falha severa detectada no ativo."
            title = f"Incidente {raw_sev} no ativo {device_name}"
            return AlertMessage(
                title=title,
                description=reason,
                severity=severity,
                device_id=device_id,
                device_name=device_name,
                device_ip=device_ip,
                extra_data=payload.get("extra_data") or {},
            )

        if event_type == "DeviceDegradedEvent":
            reason = (
                payload.get("reason")
                or f"Degradação dinâmica detectada (latência={payload.get('latency_ms', 0)}ms, perda={payload.get('packet_loss_pct', 0)}%)."
            )
            return AlertMessage(
                title=f"Degradação no ativo {device_name}",
                description=reason,
                severity=AlertSeverity.DEGRADED,
                device_id=device_id,
                device_name=device_name,
                device_ip=device_ip,
                extra_data=payload.get("extra_data") or {},
            )

        if event_type == "IncidentResolvedEvent":
            reason = (
                payload.get("root_cause")
                or payload.get("reason")
                or "Ativo restabeleceu conectividade normal (0% perda de pacotes)."
            )
            downtime = payload.get("downtime_minutes")
            downtime_float = float(downtime) if downtime is not None else None
            return AlertMessage(
                title=f"Incidente Resolvido no ativo {device_name}",
                description=reason,
                severity=AlertSeverity.RESOLVED,
                device_id=device_id,
                device_name=device_name,
                device_ip=device_ip,
                downtime_minutes=downtime_float,
                extra_data=payload.get("extra_data") or {},
            )

        logger.debug("Tipo de evento '%s' ignorado pelo AlertNotificationConsumer", event_type)
        return None

    async def handle(self, topic: str, event_data: dict[str, Any]) -> None:
        """Implementação do protocolo EventHandler para eventos diretos."""
        event_type = str(event_data.get("event_type", topic))
        alert = self._build_alert_message(event_type, event_data)
        if alert is None:
            return

        try:
            results = await self._dispatcher.dispatch_by_severity(alert)
            logger.info(
                "Alerta '%s' processado pelo NotificationConsumer. Resultados por canal: %s",
                alert.title,
                results,
            )
        except Exception:
            logger.exception("Falha inesperada ao despachar alerta '%s'", alert.title)
            raise

    async def consume_loop(self, stop_event: asyncio.Event | None = None) -> None:
        """Loop contínuo de consumo de eventos de incidentes via Redis Streams."""
        logger.info(
            "Iniciando AlertNotificationConsumer '%s' no stream '%s' (grupo '%s')",
            self.consumer_name,
            STREAM_TOPIC,
            NOTIFICATION_CONSUMER_GROUP,
        )

        while stop_event is None or not stop_event.is_set():
            try:
                messages = await self._event_bus.consume_batch(
                    topic=STREAM_TOPIC,
                    group=NOTIFICATION_CONSUMER_GROUP,
                    consumer_name=self.consumer_name,
                    batch_size=self.batch_size,
                    timeout_ms=self.poll_timeout_ms,
                )

                if not messages:
                    continue

                acked_ids: list[str] = []
                for msg_id, payload in messages:
                    try:
                        event_type = str(payload.get("event_type", "Unknown"))
                        alert = self._build_alert_message(event_type, payload)
                        if alert is not None:
                            await self._dispatcher.dispatch_by_severity(alert)
                        acked_ids.append(msg_id)
                    except Exception:
                        logger.exception(
                            "Falha ao processar notificação da mensagem %s — não será confirmada",
                            msg_id,
                        )

                if acked_ids:
                    await self._event_bus.ack(STREAM_TOPIC, NOTIFICATION_CONSUMER_GROUP, *acked_ids)

            except asyncio.CancelledError:
                logger.info(
                    "AlertNotificationConsumer '%s' interrompido graciosamente",
                    self.consumer_name,
                )
                break
            except Exception:
                logger.exception("Erro inesperado no loop do AlertNotificationConsumer")
                await asyncio.sleep(2.0)


__all__ = [
    "NOTIFICATION_CONSUMER_GROUP",
    "STREAM_TOPIC",
    "AlertNotificationConsumer",
]
