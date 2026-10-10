"""Testes unitários matemáticos do motor de cálculo de SLA contratual.

Valida os critérios de aceite da Issue #26:
1. Dispositivo com 2 horas de queda não planejada em mês de 720h tem SLA calculado em 99.72%.
2. Dispositivo com 2 horas de queda durante janela de manutenção aprovada mantém SLA em 100.00%.
3. Janelas não aprovadas não concedem isenção.
4. Sobreposições parciais isentam apenas a porção coincidente.
5. Métricas MTTR e MTBF calculadas corretamente.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from uuid import uuid4

import pytest

from src.contexts.sla.domain.calculator import calculate_sla
from src.contexts.sla.domain.models import DowntimePeriod, MaintenanceWindow


class TestSlaCalculations:
    """Suíte de testes da fórmula analítica de SLA e isenção de janelas."""

    def test_queda_nao_planejada_de_2_horas_em_mes_de_720h_resulta_em_99_72_porcento(self) -> None:
        """Critério de Aceite 1: 2h de queda não planejada em 720h gera SLA de 99.72%."""
        start = datetime(2026, 6, 1, 0, 0, 0, tzinfo=UTC)
        # 30 dias * 24 horas = 720 horas
        end = start + timedelta(hours=720)

        # 2 horas de queda (ex: 7200 segundos)
        downtime_start = start + timedelta(days=5, hours=10)
        downtime_end = downtime_start + timedelta(hours=2)

        device_id = uuid4()
        downtimes = [DowntimePeriod(start_time=downtime_start, end_time=downtime_end)]
        windows: list[MaintenanceWindow] = []

        result = calculate_sla(
            start_period=start,
            end_period=end,
            downtime_periods=downtimes,
            maintenance_windows=windows,
            device_id=device_id,
        )

        # (720 - 2) / 720 * 100 = 718 / 720 * 100 = 99.7222...% -> 99.72%
        assert result.uptime_percentage == 99.72
        assert result.total_period_hours == 720.0
        assert result.unplanned_downtime_minutes == 120.0
        assert result.exempted_downtime_minutes == 0.0
        assert result.incidents_count == 1
        assert result.exempted_incidents_count == 0

    def test_queda_durante_janela_de_manutencao_aprovada_mantem_sla_em_100_porcento(self) -> None:
        """Critério de Aceite 2: 2h de queda durante janela aprovada mantém SLA em 100.00%."""
        start = datetime(2026, 6, 1, 0, 0, 0, tzinfo=UTC)
        end = start + timedelta(hours=720)

        device_id = uuid4()
        downtime_start = start + timedelta(days=10, hours=2)
        downtime_end = downtime_start + timedelta(hours=2)

        downtimes = [DowntimePeriod(start_time=downtime_start, end_time=downtime_end)]
        # Janela cobrindo exatamente o período da queda, devidamente aprovada
        window = MaintenanceWindow(
            start_time=downtime_start - timedelta(minutes=30),
            end_time=downtime_end + timedelta(minutes=30),
            description="Manutenção programada de troca de módulos ópticos",
            device_id=device_id,
            is_approved=True,
        )

        result = calculate_sla(
            start_period=start,
            end_period=end,
            downtime_periods=downtimes,
            maintenance_windows=[window],
            device_id=device_id,
        )

        assert result.uptime_percentage == 100.00
        assert result.unplanned_downtime_minutes == 0.0
        assert result.exempted_downtime_minutes == 120.0
        assert result.incidents_count == 1
        assert result.exempted_incidents_count == 1

    def test_janela_nao_aprovada_nao_isenta_downtime(self) -> None:
        """Garante que janelas com is_approved=False não isentam penalidade no SLA."""
        start = datetime(2026, 6, 1, 0, 0, 0, tzinfo=UTC)
        end = start + timedelta(hours=720)

        device_id = uuid4()
        downtime_start = start + timedelta(days=2)
        downtime_end = downtime_start + timedelta(hours=2)

        downtimes = [DowntimePeriod(start_time=downtime_start, end_time=downtime_end)]
        unapproved_window = MaintenanceWindow(
            start_time=downtime_start,
            end_time=downtime_end,
            description="Manutenção ainda não aprovada pelo NOC",
            device_id=device_id,
            is_approved=False,
        )

        result = calculate_sla(
            start_period=start,
            end_period=end,
            downtime_periods=downtimes,
            maintenance_windows=[unapproved_window],
            device_id=device_id,
        )

        assert result.uptime_percentage == 99.72
        assert result.unplanned_downtime_minutes == 120.0
        assert result.exempted_downtime_minutes == 0.0
        assert result.exempted_incidents_count == 0

    def test_sobreposicao_parcial_isenta_apenas_fracao_coincidente(self) -> None:
        """Queda de 2h onde apenas 1h coincide com janela aprovada deve isentar apenas 1h."""
        start = datetime(2026, 6, 1, 0, 0, 0, tzinfo=UTC)
        end = start + timedelta(hours=720)

        device_id = uuid4()
        # Queda das 02:00 às 04:00 (2 horas)
        downtime_start = start + timedelta(days=3, hours=2)
        downtime_end = start + timedelta(days=3, hours=4)

        # Janela aprovada das 02:00 às 03:00 (1 hora)
        window = MaintenanceWindow(
            start_time=downtime_start,
            end_time=start + timedelta(days=3, hours=3),
            description="Janela de 1 hora apenas",
            device_id=device_id,
            is_approved=True,
        )

        result = calculate_sla(
            start_period=start,
            end_period=end,
            downtime_periods=[DowntimePeriod(start_time=downtime_start, end_time=downtime_end)],
            maintenance_windows=[window],
            device_id=device_id,
        )

        # 1 hora não planejada em 720h: (719 / 720) * 100 = 99.8611% -> 99.86%
        assert result.uptime_percentage == 99.86
        assert result.unplanned_downtime_minutes == 60.0
        assert result.exempted_downtime_minutes == 60.0
        assert result.incidents_count == 1
        assert result.exempted_incidents_count == 0

    def test_calculo_mttr_e_mtbf(self) -> None:
        """Verifica a precisão analítica de MTTR e MTBF em múltiplos incidentes."""
        start = datetime(2026, 6, 1, 0, 0, 0, tzinfo=UTC)
        end = start + timedelta(hours=720)
        device_id = uuid4()

        # 2 falhas de 1 hora cada (total 2 horas de downtime não planejado)
        d1 = DowntimePeriod(
            start_time=start + timedelta(days=2),
            end_time=start + timedelta(days=2, hours=1),
        )
        d2 = DowntimePeriod(
            start_time=start + timedelta(days=10),
            end_time=start + timedelta(days=10, hours=1),
        )

        result = calculate_sla(
            start_period=start,
            end_period=end,
            downtime_periods=[d1, d2],
            maintenance_windows=[],
            device_id=device_id,
        )

        # MTTR: (120 minutos / 2 falhas) = 60 minutos
        assert result.mttr_minutes == 60.0
        # Uptime total: 718 horas. MTBF: 718 / 2 = 359 horas
        assert result.mtbf_hours == 359.0

    def test_periodo_sem_incidentes_produz_sla_100(self) -> None:
        """Um período com 0 incidentes deve produzir 100.00% de disponibilidade."""
        start = datetime(2026, 6, 1, 0, 0, 0, tzinfo=UTC)
        end = start + timedelta(hours=720)

        result = calculate_sla(
            start_period=start,
            end_period=end,
            downtime_periods=[],
            maintenance_windows=[],
        )

        assert result.uptime_percentage == 100.00
        assert result.unplanned_downtime_minutes == 0.0
        assert result.exempted_downtime_minutes == 0.0
        assert result.mttr_minutes == 0.0
        assert result.mtbf_hours == 720.0
        assert result.incidents_count == 0

    def test_validacao_periodo_invalido_dispara_excecao(self) -> None:
        """start_period >= end_period deve disparar ValueError."""
        now = datetime.now(UTC)
        with pytest.raises(ValueError, match="posterior"):
            calculate_sla(
                start_period=now,
                end_period=now - timedelta(hours=1),
                downtime_periods=[],
                maintenance_windows=[],
            )
