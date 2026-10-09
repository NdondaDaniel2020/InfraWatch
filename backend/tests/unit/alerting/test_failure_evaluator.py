"""Testes unitários da engine de avaliação de falhas e degradação de rede.

Valida máquina de estados, contadores de tentativas/recuperação,
janela deslizante de latência, detecção de degradação e emissão
de eventos de domínio analíticos (IncidentTriggeredEvent, IncidentResolvedEvent).
"""

from uuid import uuid4

import pytest

from src.contexts.alerting.domain.evaluator import (
    EvaluationResult,
    FailureEvaluator,
)
from src.contexts.alerting.domain.events import (
    DeviceDegradedEvent,
    IncidentResolvedEvent,
    IncidentTriggeredEvent,
)
from src.contexts.alerting.domain.state_machine import (
    DeviceHealthStatus,
    HealthStateMachine,
    InvalidStateTransitionError,
)

# ==============================================================================
# 1. Testes da Máquina de Estados (HealthStateMachine)
# ==============================================================================


class TestHealthStateMachine:
    @pytest.fixture
    def sm(self) -> HealthStateMachine:
        return HealthStateMachine()

    def test_transicoes_validas_a_partir_de_up(self, sm: HealthStateMachine) -> None:
        assert sm.can_transition(DeviceHealthStatus.UP, DeviceHealthStatus.UP)
        assert sm.can_transition(DeviceHealthStatus.UP, DeviceHealthStatus.DEGRADED)
        assert sm.can_transition(DeviceHealthStatus.UP, DeviceHealthStatus.DOWN)
        assert sm.can_transition(DeviceHealthStatus.UP, DeviceHealthStatus.MAINTENANCE)

    def test_transicoes_validas_a_partir_de_degraded(self, sm: HealthStateMachine) -> None:
        assert sm.can_transition(DeviceHealthStatus.DEGRADED, DeviceHealthStatus.DEGRADED)
        assert sm.can_transition(DeviceHealthStatus.DEGRADED, DeviceHealthStatus.UP)
        assert sm.can_transition(DeviceHealthStatus.DEGRADED, DeviceHealthStatus.DOWN)
        assert sm.can_transition(DeviceHealthStatus.DEGRADED, DeviceHealthStatus.MAINTENANCE)

    def test_transicoes_validas_a_partir_de_down(self, sm: HealthStateMachine) -> None:
        assert sm.can_transition(DeviceHealthStatus.DOWN, DeviceHealthStatus.DOWN)
        assert sm.can_transition(DeviceHealthStatus.DOWN, DeviceHealthStatus.UP)
        assert sm.can_transition(DeviceHealthStatus.DOWN, DeviceHealthStatus.DEGRADED)
        assert sm.can_transition(DeviceHealthStatus.DOWN, DeviceHealthStatus.MAINTENANCE)

    def test_transicoes_validas_a_partir_de_maintenance(self, sm: HealthStateMachine) -> None:
        assert sm.can_transition(DeviceHealthStatus.MAINTENANCE, DeviceHealthStatus.MAINTENANCE)
        assert sm.can_transition(DeviceHealthStatus.MAINTENANCE, DeviceHealthStatus.UP)
        assert not sm.can_transition(DeviceHealthStatus.MAINTENANCE, DeviceHealthStatus.DOWN)
        assert not sm.can_transition(DeviceHealthStatus.MAINTENANCE, DeviceHealthStatus.DEGRADED)

    def test_transicao_invalida_lanca_excecao(self, sm: HealthStateMachine) -> None:
        with pytest.raises(InvalidStateTransitionError, match="Transição de estado inválida"):
            sm.transition(DeviceHealthStatus.MAINTENANCE, DeviceHealthStatus.DOWN)

    def test_suporte_a_strings_na_maquina_de_estados(self, sm: HealthStateMachine) -> None:
        assert sm.can_transition("UP", "DEGRADED")
        res = sm.transition("UP", "DEGRADED")
        assert res == DeviceHealthStatus.DEGRADED


# ==============================================================================
# 2. Critérios de Aceite da Issue #24
# ==============================================================================


class TestFailureEvaluatorAcceptanceCriteria:
    def test_uma_unica_perda_de_pacote_isolada_mantem_estado_up_sem_falsos_alarmes(self) -> None:
        """Critério 1: Uma única perda de pacote isolada mantém o estado UP sem emitir alarmes falsos."""
        evaluator = FailureEvaluator(retry_threshold=3, recovery_threshold=2)
        dev_id = uuid4()

        result = evaluator.evaluate(
            latency_ms=0.0,
            packet_loss_pct=100.0,
            device_id=dev_id,
            device_name="Switch-Core-01",
            device_ip="10.0.0.1",
        )

        assert isinstance(result, EvaluationResult)
        assert result.status == DeviceHealthStatus.UP
        assert result == DeviceHealthStatus.UP
        assert not result.status_changed
        assert result.consecutive_failures == 1
        assert len(result.events) == 0

        # Segundo teste saudável zera o contador e mantém UP
        healthy_result = evaluator.evaluate(
            latency_ms=10.0,
            packet_loss_pct=0.0,
            device_id=dev_id,
        )
        assert healthy_result.status == DeviceHealthStatus.UP
        assert healthy_result.consecutive_failures == 0
        assert len(healthy_result.events) == 0

    def test_enlace_com_latencia_anormal_180ms_media_12ms_entra_em_degraded(self) -> None:
        """Critério 2: Enlace com latência anormal de 180ms (sendo a média 12ms) entra em estado DEGRADED."""
        evaluator = FailureEvaluator(latency_spike_factor=2.0)
        dev_id = uuid4()

        result = evaluator.evaluate(
            latency_ms=180.0,
            packet_loss_pct=0.0,
            baseline_latency_ms=12.0,
            device_id=dev_id,
            device_name="Link-Radio-Serra",
            device_ip="192.168.100.2",
        )

        assert result.status == DeviceHealthStatus.DEGRADED
        assert result == DeviceHealthStatus.DEGRADED
        assert result.status_changed
        assert len(result.events) >= 1

        # Evento disparado é do tipo IncidentTriggeredEvent com severidade amarela (WARNING / DEGRADED)
        event = result.events[0]
        assert isinstance(event, (IncidentTriggeredEvent, DeviceDegradedEvent))
        assert event.device_id == dev_id
        assert "180.0ms" in getattr(event, "reason", "") or "latência" in getattr(event, "reason", "").lower()
        if isinstance(event, IncidentTriggeredEvent):
            assert event.severity in {"WARNING", "DEGRADED"}
            assert event.new_status == "DEGRADED"


# ==============================================================================
# 3. Degradação Dinâmica por Perda de Pacotes (5% a 49%)
# ==============================================================================


class TestPacketLossDegradation:
    @pytest.mark.parametrize("loss_pct", [5.0, 15.0, 30.0, 49.0])
    def test_perda_entre_5_e_49_porcento_transiciona_para_degraded(self, loss_pct: float) -> None:
        evaluator = FailureEvaluator()
        dev_id = uuid4()

        result = evaluator.evaluate(
            latency_ms=15.0,
            packet_loss_pct=loss_pct,
            baseline_latency_ms=15.0,
            device_id=dev_id,
        )

        assert result.status == DeviceHealthStatus.DEGRADED
        assert result.status_changed
        assert len(result.events) >= 1

    def test_perda_abaixo_de_5_porcento_mantem_up(self) -> None:
        evaluator = FailureEvaluator()
        result = evaluator.evaluate(
            latency_ms=10.0,
            packet_loss_pct=2.0,
            baseline_latency_ms=10.0,
        )
        assert result.status == DeviceHealthStatus.UP
        assert not result.status_changed
        assert len(result.events) == 0


# ==============================================================================
# 4. Transição para DOWN após Falhas Consecutivas (N >= retry_threshold)
# ==============================================================================


class TestDownStateTransition:
    def test_tres_falhas_consecutivas_transicionam_para_down_e_disparam_incidente(self) -> None:
        evaluator = FailureEvaluator(retry_threshold=3)
        dev_id = uuid4()

        # Falha 1: continua UP
        res1 = evaluator.evaluate(latency_ms=0.0, packet_loss_pct=100.0, device_id=dev_id)
        assert res1.status == DeviceHealthStatus.UP
        assert not res1.status_changed
        assert len(res1.events) == 0

        # Falha 2: continua UP
        res2 = evaluator.evaluate(latency_ms=0.0, packet_loss_pct=100.0, device_id=dev_id)
        assert res2.status == DeviceHealthStatus.UP
        assert not res2.status_changed
        assert len(res2.events) == 0

        # Falha 3: atinge o threshold -> transiciona para DOWN
        res3 = evaluator.evaluate(latency_ms=0.0, packet_loss_pct=100.0, device_id=dev_id)
        assert res3.status == DeviceHealthStatus.DOWN
        assert res3.status_changed
        assert res3.consecutive_failures == 3
        assert len(res3.events) == 1

        event = res3.events[0]
        assert isinstance(event, IncidentTriggeredEvent)
        assert event.severity in {"DOWN", "CRITICAL"}
        assert event.new_status == "DOWN"
        assert event.previous_status == "UP"
        assert event.consecutive_failures == 3

        # Falha 4: já em DOWN, não re-dispara novo evento de transição
        res4 = evaluator.evaluate(latency_ms=0.0, packet_loss_pct=100.0, device_id=dev_id)
        assert res4.status == DeviceHealthStatus.DOWN
        assert not res4.status_changed
        assert res4.consecutive_failures == 4
        assert len(res4.events) == 0

    def test_transicao_de_degraded_para_down_apos_falhas(self) -> None:
        evaluator = FailureEvaluator(retry_threshold=3)
        dev_id = uuid4()

        # Primeiro entra em DEGRADED por latência
        evaluator.evaluate(latency_ms=150.0, packet_loss_pct=0.0, baseline_latency_ms=20.0, device_id=dev_id)
        assert evaluator.current_status == DeviceHealthStatus.DEGRADED

        # Agora sofre 3 falhas consecutivas de 100% de perda
        evaluator.evaluate(latency_ms=0.0, packet_loss_pct=100.0, device_id=dev_id)
        evaluator.evaluate(latency_ms=0.0, packet_loss_pct=100.0, device_id=dev_id)
        res_down = evaluator.evaluate(latency_ms=0.0, packet_loss_pct=100.0, device_id=dev_id)

        assert res_down.status == DeviceHealthStatus.DOWN
        assert res_down.status_changed
        assert len(res_down.events) == 1
        assert res_down.events[0].previous_status == "DEGRADED"


# ==============================================================================
# 5. Recuperação para UP após Probes Saudáveis (N >= recovery_threshold)
# ==============================================================================


class TestRecoveryToUp:
    def test_recuperacao_de_down_para_up_com_dois_probes_saudaveis(self) -> None:
        evaluator = FailureEvaluator(retry_threshold=2, recovery_threshold=2)
        dev_id = uuid4()

        # Leva a DOWN
        evaluator.evaluate(latency_ms=0.0, packet_loss_pct=100.0, device_id=dev_id)
        evaluator.evaluate(latency_ms=0.0, packet_loss_pct=100.0, device_id=dev_id)
        assert evaluator.current_status == DeviceHealthStatus.DOWN

        # Probe 1 saudável: ainda continua DOWN aguardando estabilidade
        res_rec1 = evaluator.evaluate(latency_ms=12.0, packet_loss_pct=0.0, device_id=dev_id)
        assert res_rec1.status == DeviceHealthStatus.DOWN
        assert not res_rec1.status_changed
        assert res_rec1.consecutive_successes == 1
        assert len(res_rec1.events) == 0

        # Probe 2 saudável: atinge recovery_threshold -> UP e IncidentResolvedEvent
        res_rec2 = evaluator.evaluate(latency_ms=11.0, packet_loss_pct=0.0, device_id=dev_id)
        assert res_rec2.status == DeviceHealthStatus.UP
        assert res_rec2.status_changed
        assert res_rec2.consecutive_successes == 2
        assert res_rec2.consecutive_failures == 0
        assert len(res_rec2.events) == 1

        resolved_event = res_rec2.events[0]
        assert isinstance(resolved_event, IncidentResolvedEvent)
        assert resolved_event.severity == "RESOLVED"
        assert resolved_event.previous_status == "DOWN"
        assert resolved_event.new_status == "UP"
        assert resolved_event.consecutive_successes == 2

    def test_recuperacao_de_degraded_para_up(self) -> None:
        evaluator = FailureEvaluator(recovery_threshold=2)
        dev_id = uuid4()

        # Entra em DEGRADED
        evaluator.evaluate(latency_ms=100.0, packet_loss_pct=20.0, baseline_latency_ms=10.0, device_id=dev_id)
        assert evaluator.current_status == DeviceHealthStatus.DEGRADED

        # Probe 1 saudável
        res1 = evaluator.evaluate(latency_ms=10.0, packet_loss_pct=0.0, baseline_latency_ms=10.0, device_id=dev_id)
        assert res1.status == DeviceHealthStatus.DEGRADED
        assert not res1.status_changed

        # Probe 2 saudável -> Recuperado
        res2 = evaluator.evaluate(latency_ms=10.0, packet_loss_pct=0.0, baseline_latency_ms=10.0, device_id=dev_id)
        assert res2.status == DeviceHealthStatus.UP
        assert res2.status_changed
        assert len(res2.events) == 1
        assert isinstance(res2.events[0], IncidentResolvedEvent)
        assert res2.events[0].previous_status == "DEGRADED"


# ==============================================================================
# 6. Prevenção de Flapping e Reinicialização de Contadores
# ==============================================================================


class TestFlappingPrevention:
    def test_sucesso_intercalado_reseta_contador_de_falhas(self) -> None:
        evaluator = FailureEvaluator(retry_threshold=3)
        dev_id = uuid4()

        # 2 falhas
        evaluator.evaluate(latency_ms=0.0, packet_loss_pct=100.0, device_id=dev_id)
        evaluator.evaluate(latency_ms=0.0, packet_loss_pct=100.0, device_id=dev_id)
        assert evaluator.consecutive_failures == 2

        # 1 sucesso -> zera falhas consecutivas
        evaluator.evaluate(latency_ms=10.0, packet_loss_pct=0.0, device_id=dev_id)
        assert evaluator.consecutive_failures == 0
        assert evaluator.current_status == DeviceHealthStatus.UP

        # Outra falha isolada: contador reinicia de 1 e mantém UP
        res = evaluator.evaluate(latency_ms=0.0, packet_loss_pct=100.0, device_id=dev_id)
        assert res.consecutive_failures == 1
        assert res.status == DeviceHealthStatus.UP

    def test_falha_intercalada_em_down_reseta_contador_de_sucessos(self) -> None:
        evaluator = FailureEvaluator(retry_threshold=2, recovery_threshold=2)
        dev_id = uuid4()

        # Leva a DOWN
        evaluator.evaluate(latency_ms=0.0, packet_loss_pct=100.0, device_id=dev_id)
        evaluator.evaluate(latency_ms=0.0, packet_loss_pct=100.0, device_id=dev_id)
        assert evaluator.current_status == DeviceHealthStatus.DOWN

        # 1 sucesso
        evaluator.evaluate(latency_ms=10.0, packet_loss_pct=0.0, device_id=dev_id)
        assert evaluator.consecutive_successes == 1

        # Falha antes do segundo sucesso -> zera consecutive_successes
        evaluator.evaluate(latency_ms=0.0, packet_loss_pct=100.0, device_id=dev_id)
        assert evaluator.consecutive_successes == 0
        assert evaluator.current_status == DeviceHealthStatus.DOWN


# ==============================================================================
# 7. Janela Móvel de Latência e Modo Sem Estado (Stateless / Overrides)
# ==============================================================================


class TestMovingAverageAndStatelessEvaluations:
    def test_janela_movel_calcula_media_dinamica(self) -> None:
        evaluator = FailureEvaluator(moving_average_window=3, latency_spike_factor=2.0)

        # 3 amostras saudáveis: 10, 20, 30 -> média = 20
        evaluator.evaluate(latency_ms=10.0, packet_loss_pct=0.0)
        evaluator.evaluate(latency_ms=20.0, packet_loss_pct=0.0)
        evaluator.evaluate(latency_ms=30.0, packet_loss_pct=0.0)
        assert evaluator.moving_average_latency == pytest.approx(20.0, 0.1)

        # Amostra de 45ms (> 2 * 20 = 40ms) deve entrar em DEGRADED usando a média calculada
        res = evaluator.evaluate(latency_ms=45.0, packet_loss_pct=0.0)
        assert res.status == DeviceHealthStatus.DEGRADED

    def test_avaliacao_com_parametros_estaticos_stateless(self) -> None:
        """Suporta chamada informando estado e contadores externos (ex: CQRS / worker desacoplado)."""
        evaluator = FailureEvaluator(retry_threshold=3)

        # Simula estado recebido externamente (consecutive_failures=1, packet_loss=15%)
        res = evaluator.evaluate(
            current_status=DeviceHealthStatus.UP,
            consecutive_failures=1,
            packet_loss_pct=15.0,
        )
        assert res.status == DeviceHealthStatus.DEGRADED
        assert res == DeviceHealthStatus.DEGRADED

    def test_dispositivo_em_manutencao_ignora_alertas(self) -> None:
        evaluator = FailureEvaluator(retry_threshold=2)
        res = evaluator.evaluate(
            current_status=DeviceHealthStatus.MAINTENANCE,
            latency_ms=0.0,
            packet_loss_pct=100.0,
        )
        assert res.status == DeviceHealthStatus.MAINTENANCE
        assert not res.status_changed
        assert len(res.events) == 0
