"""Motor de avaliação de falhas, degradação dinâmica e recuperação de ativos de rede.

Implementa contadores de tentativas/falhas consecutivas para prevenção de falsos
positivos, cálculo de média móvel de latência (detecção de jitter/spikes), regras
para transição ao estado DEGRADED e emissão de eventos de domínio (IncidentTriggeredEvent
e IncidentResolvedEvent).
"""

from __future__ import annotations

from collections import deque
from dataclasses import dataclass
from typing import Any
from uuid import UUID

from src.contexts.alerting.domain.events import (
    IncidentResolvedEvent,
    IncidentTriggeredEvent,
)
from src.contexts.alerting.domain.state_machine import (
    DeviceHealthStatus,
    HealthStateMachine,
)
from src.core.domain.entity import generate_uuid7
from src.core.domain.events import DomainEvent


@dataclass(frozen=True)
class EvaluationResult:
    """Resultado imutável de uma rodada de avaliação de métricas de saúde."""

    status: DeviceHealthStatus
    previous_status: DeviceHealthStatus
    status_changed: bool
    events: list[DomainEvent]
    consecutive_failures: int
    consecutive_successes: int
    moving_average_latency_ms: float
    reason: str

    def __eq__(self, other: object) -> bool:
        """Permite comparação direta com DeviceHealthStatus ou strings literais."""
        if isinstance(other, (DeviceHealthStatus, str)):
            return self.status == other
        return super().__eq__(other)


class FailureEvaluator:
    """Motor de avaliação analítica de falhas e degradação em ativos de rede.

    Regras de Negócio:
      1. Isolamento de Falhas Transitórias:
         Um único probe falho não declara queda imediata; mantém o estado UP
         até atingir ``retry_threshold`` falhas consecutivas.
      2. Degradação Dinâmica (DEGRADED):
         Ativada quando a latência ultrapassa ``latency_spike_factor`` vezes a média
         móvel basal (ou SLA contratual) ou perda entre 5% e 49%.
      3. Queda Confirmada (DOWN):
         Ativada quando ocorrem N falhas consecutivas (>= ``retry_threshold``, padrão 3)
         com 100% de perda.
      4. Recuperação Estável (UP):
         Retorno ao estado UP somente após N probes saudáveis consecutivos
         (>= ``recovery_threshold``, padrão 2) com 0% de perda e latência estável.
    """

    def __init__(
        self,
        retry_threshold: int = 3,
        recovery_threshold: int = 2,
        latency_spike_factor: float = 2.0,
        degraded_packet_loss_min: float = 5.0,
        degraded_packet_loss_max: float = 49.0,
        moving_average_window: int = 10,
        state_machine: HealthStateMachine | None = None,
    ) -> None:
        self.retry_threshold = retry_threshold
        self.recovery_threshold = recovery_threshold
        self.latency_spike_factor = latency_spike_factor
        self.degraded_packet_loss_min = degraded_packet_loss_min
        self.degraded_packet_loss_max = degraded_packet_loss_max
        self.moving_average_window = moving_average_window
        self._state_machine = state_machine or HealthStateMachine()

        self.current_status: DeviceHealthStatus = DeviceHealthStatus.UP
        self.consecutive_failures: int = 0
        self.consecutive_successes: int = 0
        self._latency_samples: deque[float] = deque(maxlen=moving_average_window)

    @property
    def moving_average_latency(self) -> float:
        """Média móvel aritmética da latência das últimas sondagens saudáveis."""
        if not self._latency_samples:
            return 0.0
        return sum(self._latency_samples) / len(self._latency_samples)

    def add_latency_sample(self, latency_ms: float) -> None:
        """Adiciona uma amostra de latência à janela móvel."""
        if latency_ms >= 0:
            self._latency_samples.append(latency_ms)

    def evaluate(
        self,
        latency_ms: float = 0.0,
        packet_loss_pct: float = 0.0,
        *,
        current_status: DeviceHealthStatus | str | None = None,
        consecutive_failures: int | None = None,
        consecutive_successes: int | None = None,
        baseline_latency_ms: float | None = None,
        device_id: UUID | None = None,
        organization_id: UUID | None = None,
        device_name: str = "",
        device_ip: str = "",
        last_probe_details: dict[str, Any] | None = None,
        protocol: str = "",
    ) -> EvaluationResult:
        """Avalia os dados da sonda e determina o novo estado e eventos a disparar.

        Suporta operação com estado interno ou modo sem estado (passando parâmetros
        explícitos via argumentos nomeados).
        """
        # Determina estado ativo e contadores
        active_status = (
            self._state_machine._coerce_status(current_status)
            if current_status is not None
            else self.current_status
        )
        c_failures = (
            self.consecutive_failures
            if consecutive_failures is None
            else consecutive_failures
        )
        c_successes = (
            self.consecutive_successes
            if consecutive_successes is None
            else consecutive_successes
        )

        # Dispositivos em janela de manutenção programada não sofrem transição por sondas
        if active_status == DeviceHealthStatus.MAINTENANCE:
            return EvaluationResult(
                status=DeviceHealthStatus.MAINTENANCE,
                previous_status=active_status,
                status_changed=False,
                events=[],
                consecutive_failures=c_failures,
                consecutive_successes=c_successes,
                moving_average_latency_ms=self.moving_average_latency,
                reason="Dispositivo em janela de manutenção programada",
            )

        # Baseline de latência para cálculo de anomalias
        effective_baseline = (
            baseline_latency_ms
            if (baseline_latency_ms is not None and baseline_latency_ms > 0)
            else self.moving_average_latency
        )

        # Classificação da amostra
        is_total_failure = packet_loss_pct >= 100.0
        is_loss_degraded = (
            self.degraded_packet_loss_min <= packet_loss_pct < 100.0
        )
        is_latency_degraded = (
            effective_baseline > 0
            and latency_ms > (effective_baseline * self.latency_spike_factor)
            and packet_loss_pct < 100.0
        )
        is_degraded = (is_loss_degraded or is_latency_degraded) and not is_total_failure
        is_healthy = (
            not is_total_failure
            and not is_degraded
            and packet_loss_pct < self.degraded_packet_loss_min
        )

        events: list[DomainEvent] = []
        target_status: DeviceHealthStatus = active_status
        reason: str = ""

        # Cenário 1: Falha Total (100% de perda ou Timeout)
        if is_total_failure:
            c_failures += 1
            c_successes = 0

            if active_status == DeviceHealthStatus.DOWN:
                target_status = DeviceHealthStatus.DOWN
                reason = f"Ativo permanece DOWN ({c_failures} falhas consecutivas)"
            else:
                if c_failures >= self.retry_threshold:
                    target_status = self._state_machine.transition(
                        active_status, DeviceHealthStatus.DOWN
                    )
                    reason = (
                        f"Ativo indisponível: {c_failures} falhas consecutivas com "
                        f"{packet_loss_pct:.1f}% de perda"
                    )
                    events.append(
                        IncidentTriggeredEvent(
                            device_id=device_id or generate_uuid7(),
                            organization_id=organization_id,
                            device_name=device_name,
                            device_ip=device_ip,
                            severity="DOWN",
                            reason=reason,
                            latency_ms=latency_ms,
                            packet_loss_pct=packet_loss_pct,
                            previous_status=active_status.value,
                            new_status=DeviceHealthStatus.DOWN.value,
                            consecutive_failures=c_failures,
                            last_probe_details=last_probe_details,
                            protocol=protocol,
                        )
                    )
                else:
                    target_status = active_status
                    reason = (
                        f"Falha isolada ({c_failures}/{self.retry_threshold} tentativas); "
                        f"mantendo estado {active_status.value}"
                    )

        # Cenário 2: Degradação Dinâmica (Latência ou Perda parcial)
        elif is_degraded:
            c_successes = 0
            c_failures = 0

            if active_status == DeviceHealthStatus.DOWN:
                target_status = DeviceHealthStatus.DOWN
                reason = "Ativo permanece em DOWN (enlace ainda com perda ou latência anormal)"
            elif active_status == DeviceHealthStatus.UP:
                target_status = self._state_machine.transition(
                    active_status, DeviceHealthStatus.DEGRADED
                )
                if is_latency_degraded and is_loss_degraded:
                    reason = (
                        f"Latência anormal de {latency_ms:.1f}ms (> {effective_baseline * self.latency_spike_factor:.1f}ms) "
                        f"e perda de pacotes de {packet_loss_pct:.1f}%"
                    )
                elif is_latency_degraded:
                    reason = (
                        f"Latência anormal de {latency_ms:.1f}ms excede {self.latency_spike_factor:.1f}x "
                        f"a média base ({effective_baseline:.1f}ms)"
                    )
                else:
                    reason = f"Perda moderada de pacotes detectada: {packet_loss_pct:.1f}%"

                events.append(
                    IncidentTriggeredEvent(
                        device_id=device_id or generate_uuid7(),
                        organization_id=organization_id,
                        device_name=device_name,
                        device_ip=device_ip,
                        severity="WARNING",
                        reason=reason,
                        latency_ms=latency_ms,
                        packet_loss_pct=packet_loss_pct,
                        previous_status=active_status.value,
                        new_status=DeviceHealthStatus.DEGRADED.value,
                        consecutive_failures=0,
                        last_probe_details=last_probe_details,
                        protocol=protocol,
                    )
                )
            else:
                target_status = DeviceHealthStatus.DEGRADED
                reason = "Enlace permanece em estado DEGRADED"

        # Cenário 3: Probe Saudável (Operação Normal)
        elif is_healthy:
            self.add_latency_sample(latency_ms)
            c_successes += 1
            c_failures = 0

            if active_status == DeviceHealthStatus.UP:
                target_status = DeviceHealthStatus.UP
                reason = "Operação normal e estável"
            else:
                # DOWN ou DEGRADED aguardando recuperação
                if c_successes >= self.recovery_threshold:
                    target_status = self._state_machine.transition(
                        active_status, DeviceHealthStatus.UP
                    )
                    reason = (
                        f"Ativo recuperado para UP após {c_successes} probes saudáveis consecutivos"
                    )
                    events.append(
                        IncidentResolvedEvent(
                            device_id=device_id or generate_uuid7(),
                            organization_id=organization_id,
                            device_name=device_name,
                            device_ip=device_ip,
                            severity="RESOLVED",
                            reason=reason,
                            latency_ms=latency_ms,
                            packet_loss_pct=packet_loss_pct,
                            previous_status=active_status.value,
                            new_status=DeviceHealthStatus.UP.value,
                            consecutive_successes=c_successes,
                            last_probe_details=last_probe_details,
                            protocol=protocol,
                        )
                    )
                else:
                    target_status = active_status
                    reason = (
                        f"Probe saudável ({c_successes}/{self.recovery_threshold} para recuperação); "
                        f"mantendo {active_status.value}"
                    )

        # Sincroniza estado interno do avaliador quando não sobrescrito por chamadas externas
        if current_status is None:
            self.current_status = target_status
        if consecutive_failures is None:
            self.consecutive_failures = c_failures
        if consecutive_successes is None:
            self.consecutive_successes = c_successes

        status_changed = target_status != active_status

        return EvaluationResult(
            status=target_status,
            previous_status=active_status,
            status_changed=status_changed,
            events=events,
            consecutive_failures=c_failures,
            consecutive_successes=c_successes,
            moving_average_latency_ms=self.moving_average_latency,
            reason=reason,
        )
