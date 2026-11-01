"""Consumer Redis Streams que abre chamados no GLPI para incidentes críticos.

Assina o stream ``stream:incidents`` via Consumer Group ``cg:glpi_workers``,
consome eventos ``IncidentTriggeredEvent`` e chama o ``GlpiClient`` para
abrir o chamado e registrar o ticket_id de volta ao incidente.

Fluxo de mensagem:
  Redis Stream (stream:incidents)
    -> GlpiTicketConsumer
      -> GlpiClient.open_ticket()
        -> GLPI REST API
          -> ticket_id armazenado no payload (para rastreabilidade)
"""

from __future__ import annotations

import asyncio
import json
import logging
from typing import Any

from src.core.messaging.exceptions import is_poison_error
from src.core.messaging.idempotency import IdempotencyGuard, get_idempotency_guard
from src.core.messaging.resilient_bus import ResilientEventBus
from src.integrations.glpi import GlpiClient, render_glpi_template
from src.integrations.glpi.schemas import (
    GlpiImpact,
    GlpiTicketCreate,
    GlpiUrgency,
)

logger = logging.getLogger("infrawatch.alerting.consumers.glpi_ticket")

STREAM_TOPIC = "stream:incidents"
CONSUMER_GROUP = "cg:glpi_workers"

# Severidades que devem abrir ticket automaticamente
CRITICAL_SEVERITIES = {"CRITICAL", "DOWN"}


class GlpiTicketConsumer:
    """Consumer de incidentes críticos que dispara abertura automática de chamados no GLPI.

    Lê eventos ``IncidentTriggeredEvent`` do Redis Stream ``stream:incidents``
    e, para cada incidente de severidade CRITICAL ou DOWN, chama o GlpiClient
    para registrar o chamado no ITSM corporativo.
    """

    def __init__(
        self,
        event_bus: ResilientEventBus,
        glpi_base_url: str,
        glpi_app_token: str,
        glpi_user_token: str,
        consumer_name: str = "glpi-worker-1",
        batch_size: int = 10,
        poll_timeout_ms: int = 3000,
        idempotency_guard: IdempotencyGuard | None = None,
        max_retries: int = 5,
    ) -> None:
        self._event_bus = event_bus
        self._glpi_base_url = glpi_base_url
        self._glpi_app_token = glpi_app_token
        self._glpi_user_token = glpi_user_token
        self.consumer_name = consumer_name
        self.batch_size = batch_size
        self.poll_timeout_ms = poll_timeout_ms
        self._idempotency_guard = idempotency_guard or get_idempotency_guard()
        self.max_retries = max_retries

    def _build_ticket_payload(self, payload: dict[str, Any]) -> GlpiTicketCreate:
        """Constrói o payload do chamado a partir do evento de incidente."""
        device_name = payload.get("device_name", "Dispositivo desconhecido")
        device_ip = payload.get("device_ip", "N/A")
        severity = payload.get("severity", "UNKNOWN")
        occurred_at = payload.get("occurred_at", "N/A")
        event_id = payload.get("event_id") or payload.get("id")

        tag_suffix = f" [event_id:{event_id}]" if event_id else ""
        title = f"[InfraWatch] Incidente {severity} — {device_name} ({device_ip}){tag_suffix}"
        content = render_glpi_template(
            "incident_ticket.html",
            device_name=device_name,
            device_ip=device_ip,
            severity=severity,
            occurred_at=occurred_at,
        )
        if event_id:
            content += f"\n<p><small>Correlation ID: [event_id:{event_id}]</small></p>"

        return GlpiTicketCreate(
            name=title,
            content=content,
            urgency=GlpiUrgency.VERY_HIGH if severity == "DOWN" else GlpiUrgency.HIGH,
            impact=GlpiImpact.HIGH,
        )

    async def _handle_event(self, event_type: str, payload: dict[str, Any]) -> None:
        """Processa um evento de incidente e abre o chamado no GLPI se necessário."""
        if event_type != "IncidentTriggeredEvent":
            logger.debug("Evento %s não tratado pelo consumer GLPI", event_type)
            return

        severity = payload.get("severity", "")
        if severity not in CRITICAL_SEVERITIES:
            logger.debug(
                "Incidente com severidade '%s' não requer abertura de chamado GLPI",
                severity,
            )
            return

        event_id = payload.get("event_id") or payload.get("id")
        if event_id and await self._idempotency_guard.is_processed(event_id, "GlpiTicketConsumer"):
            logger.warning(
                "Evento %s já processado pelo GlpiTicketConsumer (descarte idempotente)",
                event_id,
            )
            return

        ticket_payload = self._build_ticket_payload(payload)

        try:
            async with GlpiClient(
                base_url=self._glpi_base_url,
                app_token=self._glpi_app_token,
                user_token=self._glpi_user_token,
            ) as glpi:
                ticket_id = await glpi.open_ticket(ticket_payload)

                # Acompanhamento técnico com detalhes das últimas sondas
                if probe_details := payload.get("last_probe_details"):
                    followup_text = render_glpi_template(
                        "incident_followup.html",
                        protocol=payload.get("protocol", "N/A"),
                        probe_details_json=json.dumps(probe_details, indent=2, ensure_ascii=False),
                    )
                    await glpi.add_followup(ticket_id, followup_text, private=True)

            if event_id:
                await self._idempotency_guard.mark_processed(event_id, "GlpiTicketConsumer")

            logger.info(
                "Chamado GLPI #%d criado para incidente no dispositivo '%s' (severidade=%s)",
                ticket_id,
                payload.get("device_name"),
                severity,
            )

        except Exception:
            logger.exception(
                "Falha ao criar chamado GLPI para dispositivo '%s'. "
                "O incidente será reprocessado via outbox.",
                payload.get("device_name"),
            )
            # Re-raise para impedir XACK: a mensagem permanece pendente e será reprocessada
            raise

    async def consume_loop(self, stop_event: asyncio.Event | None = None) -> None:
        """Loop contínuo de consumo de eventos de incidente via Redis Streams."""
        logger.info(
            "Iniciando GlpiTicketConsumer '%s' no stream '%s' (grupo '%s')",
            self.consumer_name,
            STREAM_TOPIC,
            CONSUMER_GROUP,
        )

        while stop_event is None or not stop_event.is_set():
            try:
                messages = await self._event_bus.consume_batch(
                    topic=STREAM_TOPIC,
                    group=CONSUMER_GROUP,
                    consumer_name=self.consumer_name,
                    batch_size=self.batch_size,
                    timeout_ms=self.poll_timeout_ms,
                )

                if not messages:
                    continue

                acked_ids: list[str] = []
                for msg_id, payload in messages:
                    if not await self._event_bus.should_process_retry(
                        STREAM_TOPIC, CONSUMER_GROUP, msg_id
                    ):
                        logger.debug(
                            "Mensagem %s em período de backoff no grupo '%s'. Adiando processamento.",
                            msg_id,
                            CONSUMER_GROUP,
                        )
                        continue

                    try:
                        event_type = payload.get("event_type", "Unknown")
                        await self._handle_event(event_type, payload)
                        acked_ids.append(msg_id)
                    except Exception as exc:  # noqa: BLE001
                        if is_poison_error(exc):
                            logger.error(
                                "Poison message detectada no chamado GLPI da mensagem %s: %s. Desviando imediatamente para DLQ com ACK.",
                                msg_id,
                                exc,
                            )
                            await self._event_bus.publish_dlq(
                                original_topic=STREAM_TOPIC,
                                original_msg_id=msg_id,
                                payload=payload,
                                reason=f"PoisonMessage: {exc}",
                                error_details=str(exc),
                                group=CONSUMER_GROUP,
                                delivery_count=1,
                            )
                            continue

                        delivery_count = await self._event_bus.get_delivery_count(
                            STREAM_TOPIC, CONSUMER_GROUP, msg_id
                        )
                        if delivery_count >= self.max_retries:
                            logger.error(
                                "Incidente %s atingiu limite de %d tentativas no GLPI. Despachando para DLQ.",
                                msg_id,
                                self.max_retries,
                            )
                            await self._event_bus.send_to_dlq(
                                topic=STREAM_TOPIC,
                                group=CONSUMER_GROUP,
                                message_id=msg_id,
                                payload=payload,
                                error=str(exc),
                                delivery_count=delivery_count,
                            )
                        else:
                            logger.warning(
                                "Falha transitória ao processar chamado GLPI da mensagem %s (tentativa %d/%d): %s — retentará via XAUTOCLAIM",
                                msg_id,
                                delivery_count,
                                self.max_retries,
                                exc,
                            )

                if acked_ids:
                    await self._event_bus.ack(STREAM_TOPIC, CONSUMER_GROUP, *acked_ids)

            except asyncio.CancelledError:
                logger.info(
                    "GlpiTicketConsumer '%s' interrompido graciosamente", self.consumer_name
                )
                break
            except Exception:
                logger.exception("Erro inesperado no loop do GlpiTicketConsumer")
                await asyncio.sleep(3.0)


__all__ = [
    "CONSUMER_GROUP",
    "CRITICAL_SEVERITIES",
    "STREAM_TOPIC",
    "GlpiTicketConsumer",
]
