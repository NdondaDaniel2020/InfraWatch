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


@dataclass(frozen=True)
class _StepOutcome:
    """Estrutura intermediária com o resultado da avaliação de um cenário de sonda."""

    target_status: DeviceHealthStatus
    consecutive_failures: int
    consecutive_successes: int
    events: list[DomainEvent]
    reason: str


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

        if active_status == DeviceHealthStatus.MAINTENANCE:
            return self._handle_maintenance(active_status, c_failures, c_successes)

        baseline = self._get_effective_baseline(baseline_latency_ms)

        if packet_loss_pct >= 100.0:
            outcome = self._handle_total_failure(
                active_status=active_status,
                consecutive_failures=c_failures,
                latency_ms=latency_ms,
                packet_loss_pct=packet_loss_pct,
                device_id=device_id,
                organization_id=organization_id,
                device_name=device_name,
                device_ip=device_ip,
                last_probe_details=last_probe_details,
                protocol=protocol,
            )
        elif self._is_sample_degraded(latency_ms, packet_loss_pct, baseline):
            outcome = self._handle_degradation(
                active_status=active_status,
                latency_ms=latency_ms,
                packet_loss_pct=packet_loss_pct,
                baseline=baseline,
                device_id=device_id,
                organization_id=organization_id,
                device_name=device_name,
                device_ip=device_ip,
                last_probe_details=last_probe_details,
                protocol=protocol,
            )
        else:
            outcome = self._handle_healthy_probe(
                active_status=active_status,
                consecutive_successes=c_successes,
                latency_ms=latency_ms,
                packet_loss_pct=packet_loss_pct,
                device_id=device_id,
                organization_id=organization_id,
                device_name=device_name,
                device_ip=device_ip,
                last_probe_details=last_probe_details,
                protocol=protocol,
            )

        return self._build_result(
            active_status=active_status,
            outcome=outcome,
            sync_internal_status=(current_status is None),
            sync_internal_failures=(consecutive_failures is None),
            sync_internal_successes=(consecutive_successes is None),
        )

    def _handle_maintenance(
        self,
        active_status: DeviceHealthStatus,
        c_failures: int,
        c_successes: int,
    ) -> EvaluationResult:
        """Trata avaliação de dispositivo em janela de manutenção programada."""
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

    def _get_effective_baseline(self, baseline_latency_ms: float | None) -> float:
        """Determina a base de latência comparativa (informada ou calculada)."""
        if baseline_latency_ms is not None and baseline_latency_ms > 0:
            return baseline_latency_ms
        return self.moving_average_latency

    def _is_sample_degraded(
        self,
        latency_ms: float,
        packet_loss_pct: float,
        baseline: float,
    ) -> bool:
        """Avalia se a amostra se enquadra em critérios de degradação."""
        if packet_loss_pct >= 100.0:
            return False
        is_loss_degraded = self.degraded_packet_loss_min <= packet_loss_pct < 100.0
        is_latency_degraded = (
            baseline > 0
            and latency_ms > (baseline * self.latency_spike_factor)
        )
        return is_loss_degraded or is_latency_degraded

    def _handle_total_failure(
        self,
        active_status: DeviceHealthStatus,
        consecutive_failures: int,
        latency_ms: float,
        packet_loss_pct: float,
        device_id: UUID | None,
        organization_id: UUID | None,
        device_name: str,
        device_ip: str,
        last_probe_details: dict[str, Any] | None,
        protocol: str,
    ) -> _StepOutcome:
        """Processa cenário de falha total (100% perda ou timeout)."""
        new_failures = consecutive_failures + 1
        new_successes = 0

        if active_status == DeviceHealthStatus.DOWN:
            return _StepOutcome(
                target_status=DeviceHealthStatus.DOWN,
                consecutive_failures=new_failures,
                consecutive_successes=new_successes,
                events=[],
                reason=f"Ativo permanece DOWN ({new_failures} falhas consecutivas)",
            )

        if new_failures >= self.retry_threshold:
            target_status = self._state_machine.transition(
                active_status, DeviceHealthStatus.DOWN
            )
            reason = (
                f"Ativo indisponível: {new_failures} falhas consecutivas com "
                f"{packet_loss_pct:.1f}% de perda"
            )
            event = IncidentTriggeredEvent(
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
                consecutive_failures=new_failures,
                last_probe_details=last_probe_details,
                protocol=protocol,
            )
            return _StepOutcome(
                target_status=target_status,
                consecutive_failures=new_failures,
                consecutive_successes=new_successes,
                events=[event],
                reason=reason,
            )

        return _StepOutcome(
            target_status=active_status,
            consecutive_failures=new_failures,
            consecutive_successes=new_successes,
            events=[],
            reason=(
                f"Falha isolada ({new_failures}/{self.retry_threshold} tentativas); "
                f"mantendo estado {active_status.value}"
            ),
        )

    def _handle_degradation(
        self,
        active_status: DeviceHealthStatus,
        latency_ms: float,
        packet_loss_pct: float,
        baseline: float,
        device_id: UUID | None,
        organization_id: UUID | None,
        device_name: str,
        device_ip: str,
        last_probe_details: dict[str, Any] | None,
        protocol: str,
    ) -> _StepOutcome:
        """Processa cenário de degradação dinâmica de rede."""
        new_failures = 0
        new_successes = 0

        if active_status == DeviceHealthStatus.DOWN:
            return _StepOutcome(
                target_status=DeviceHealthStatus.DOWN,
                consecutive_failures=new_failures,
                consecutive_successes=new_successes,
                events=[],
                reason="Ativo permanece em DOWN (enlace ainda com perda ou latência anormal)",
            )

        if active_status == DeviceHealthStatus.UP:
            target_status = self._state_machine.transition(
                active_status, DeviceHealthStatus.DEGRADED
            )
            reason = self._build_degradation_reason(latency_ms, packet_loss_pct, baseline)
            event = IncidentTriggeredEvent(
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
            return _StepOutcome(
                target_status=target_status,
                consecutive_failures=new_failures,
                consecutive_successes=new_successes,
                events=[event],
                reason=reason,
            )

        return _StepOutcome(
            target_status=DeviceHealthStatus.DEGRADED,
            consecutive_failures=new_failures,
            consecutive_successes=new_successes,
            events=[],
            reason="Enlace permanece em estado DEGRADED",
        )

    def _build_degradation_reason(
        self,
        latency_ms: float,
        packet_loss_pct: float,
        baseline: float,
    ) -> str:
        """Gera descrição textual detalhada do motivo de degradação."""
        is_latency = baseline > 0 and latency_ms > (baseline * self.latency_spike_factor)
        is_loss = self.degraded_packet_loss_min <= packet_loss_pct < 100.0

        if is_latency and is_loss:
            return (
                f"Latência anormal de {latency_ms:.1f}ms (> {baseline * self.latency_spike_factor:.1f}ms) "
                f"e perda de pacotes de {packet_loss_pct:.1f}%"
            )
        if is_latency:
            return (
                f"Latência anormal de {latency_ms:.1f}ms excede {self.latency_spike_factor:.1f}x "
                f"a média base ({baseline:.1f}ms)"
            )
        return f"Perda moderada de pacotes detectada: {packet_loss_pct:.1f}%"

    def _handle_healthy_probe(
        self,
        active_status: DeviceHealthStatus,
        consecutive_successes: int,
        latency_ms: float,
        packet_loss_pct: float,
        device_id: UUID | None,
        organization_id: UUID | None,
        device_name: str,
        device_ip: str,
        last_probe_details: dict[str, Any] | None,
        protocol: str,
    ) -> _StepOutcome:
        """Processa cenário de sondagem saudável."""
        self.add_latency_sample(latency_ms)
        new_successes = consecutive_successes + 1
        new_failures = 0

        if active_status == DeviceHealthStatus.UP:
            return _StepOutcome(
                target_status=DeviceHealthStatus.UP,
                consecutive_failures=new_failures,
                consecutive_successes=new_successes,
                events=[],
                reason="Operação normal e estável",
            )

        if new_successes >= self.recovery_threshold:
            target_status = self._state_machine.transition(
                active_status, DeviceHealthStatus.UP
            )
            reason = f"Ativo recuperado para UP após {new_successes} probes saudáveis consecutivos"
            event = IncidentResolvedEvent(
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
                consecutive_successes=new_successes,
                last_probe_details=last_probe_details,
                protocol=protocol,
            )
            return _StepOutcome(
                target_status=target_status,
                consecutive_failures=new_failures,
                consecutive_successes=new_successes,
                events=[event],
                reason=reason,
            )

        return _StepOutcome(
            target_status=active_status,
            consecutive_failures=new_failures,
            consecutive_successes=new_successes,
            events=[],
            reason=(
                f"Probe saudável ({new_successes}/{self.recovery_threshold} para recuperação); "
                f"mantendo {active_status.value}"
            ),
        )

    def _build_result(
        self,
        active_status: DeviceHealthStatus,
        outcome: _StepOutcome,
        sync_internal_status: bool,
        sync_internal_failures: bool,
        sync_internal_successes: bool,
    ) -> EvaluationResult:
        """Consolida e sincroniza o resultado final da avaliação."""
        if sync_internal_status:
            self.current_status = outcome.target_status
        if sync_internal_failures:
            self.consecutive_failures = outcome.consecutive_failures
        if sync_internal_successes:
            self.consecutive_successes = outcome.consecutive_successes

        return EvaluationResult(
            status=outcome.target_status,
            previous_status=active_status,
            status_changed=(outcome.target_status != active_status),
            events=outcome.events,
            consecutive_failures=outcome.consecutive_failures,
            consecutive_successes=outcome.consecutive_successes,
            moving_average_latency_ms=self.moving_average_latency,
            reason=outcome.reason,
        )
