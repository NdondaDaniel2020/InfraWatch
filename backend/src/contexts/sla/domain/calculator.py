"""Motor analítico de cálculo de disponibilidade e SLA contratual."""

from __future__ import annotations

from collections.abc import Sequence
from datetime import datetime
from uuid import UUID

from src.contexts.sla.domain.models import (
    DowntimePeriod,
    MaintenanceWindow,
    SlaCalculationResult,
    _ensure_utc,
)


def _merge_intervals(intervals: list[tuple[datetime, datetime]]) -> list[tuple[datetime, datetime]]:
    """Funde intervalos temporais sobrepostos ou contíguos em blocos disjuntos."""
    if not intervals:
        return []

    sorted_intervals = sorted(intervals, key=lambda x: x[0])
    merged: list[tuple[datetime, datetime]] = [sorted_intervals[0]]

    for current_start, current_end in sorted_intervals[1:]:
        last_start, last_end = merged[-1]
        if current_start <= last_end:
            # Sobreposição ou contiguidade: estende o intervalo
            merged[-1] = (last_start, max(last_end, current_end))
        else:
            merged.append((current_start, current_end))

    return merged


def _calculate_window_overlap(
    start: datetime,
    end: datetime,
    merged_windows: list[tuple[datetime, datetime]],
) -> float:
    """Calcula a soma de segundos de intersecção entre o intervalo e as janelas consolidadas."""
    total_overlap = 0.0
    for win_start, win_end in merged_windows:
        overlap_start = max(start, win_start)
        overlap_end = min(end, win_end)
        if overlap_end > overlap_start:
            total_overlap += (overlap_end - overlap_start).total_seconds()
    return total_overlap


def calculate_sla(
    start_period: datetime,
    end_period: datetime,
    downtime_periods: Sequence[DowntimePeriod],
    maintenance_windows: Sequence[MaintenanceWindow],
    device_id: UUID | None = None,
) -> SlaCalculationResult:
    """Calcula o índice de disponibilidade SLA com isenção de janelas de manutenção (ADR-011).

    Fórmula:
      Uptime % = ((Tempo Total - Downtime Não Planejado) / Tempo Total) * 100
      onde períodos de downtime que coincidem com Janelas de Manutenção Aprovadas
      são subtraídos da penalidade contratual (marcados como EXEMPTED).
    """
    start_utc = _ensure_utc(start_period)
    end_utc = _ensure_utc(end_period)

    if start_utc is None or end_utc is None:
        raise ValueError("start_period e end_period são obrigatórios.")
    if end_utc <= start_utc:
        raise ValueError("O horário final do período deve ser posterior ao horário inicial.")

    total_period_seconds = (end_utc - start_utc).total_seconds()
    total_period_hours = total_period_seconds / 3600.0

    # 1. Filtra janelas de manutenção aprovadas aplicáveis a este dispositivo (ou globais)
    applicable_windows: list[tuple[datetime, datetime]] = []
    for window in maintenance_windows:
        if not window.is_approved:
            continue
        if window.device_id is not None and device_id is not None and window.device_id != device_id:
            continue
        # Clampa a janela ao período avaliado
        clamped_win_start = max(window.start_time, start_utc)
        clamped_win_end = min(window.end_time, end_utc)
        if clamped_win_end > clamped_win_start:
            applicable_windows.append((clamped_win_start, clamped_win_end))

    merged_maintenance = _merge_intervals(applicable_windows)

    # 2. Processa cada intervalo de downtime
    raw_downtime_seconds = 0.0
    unplanned_downtime_seconds = 0.0
    exempted_downtime_seconds = 0.0

    incidents_count = 0
    exempted_incidents_count = 0
    unplanned_incidents_count = 0

    for period in downtime_periods:
        # Clampa o downtime para dentro da janela de observação
        period_start = max(period.start_time, start_utc)
        period_end = min(period.end_time, end_utc)

        if period_end <= period_start:
            continue

        incidents_count += 1
        duration_seconds = (period_end - period_start).total_seconds()
        raw_downtime_seconds += duration_seconds

        # Calcula a fração do downtime coberta por janelas aprovadas
        overlap_seconds = _calculate_window_overlap(period_start, period_end, merged_maintenance)
        exempt_seconds = min(duration_seconds, overlap_seconds)
        unplanned_seconds = max(0.0, duration_seconds - exempt_seconds)

        exempted_downtime_seconds += exempt_seconds
        unplanned_downtime_seconds += unplanned_seconds

        if unplanned_seconds == 0.0:
            exempted_incidents_count += 1
        else:
            unplanned_incidents_count += 1

    # 3. Calcula o Uptime percentual
    effective_uptime_seconds = max(0.0, total_period_seconds - unplanned_downtime_seconds)
    uptime_percentage = round((effective_uptime_seconds / total_period_seconds) * 100.0, 2)

    # 4. Métricas analíticas (MTTR e MTBF)
    unplanned_downtime_minutes = round(unplanned_downtime_seconds / 60.0, 2)
    exempted_downtime_minutes = round(exempted_downtime_seconds / 60.0, 2)

    if unplanned_incidents_count > 0:
        mttr_minutes = round(unplanned_downtime_minutes / unplanned_incidents_count, 2)
        uptime_hours = effective_uptime_seconds / 3600.0
        mtbf_hours = round(uptime_hours / unplanned_incidents_count, 2)
    else:
        mttr_minutes = 0.0
        mtbf_hours = round(total_period_hours, 2)

    return SlaCalculationResult(
        device_id=device_id,
        start_period=start_utc,
        end_period=end_utc,
        total_period_seconds=total_period_seconds,
        total_period_hours=round(total_period_hours, 2),
        unplanned_downtime_seconds=unplanned_downtime_seconds,
        unplanned_downtime_minutes=unplanned_downtime_minutes,
        exempted_downtime_seconds=exempted_downtime_seconds,
        exempted_downtime_minutes=exempted_downtime_minutes,
        uptime_percentage=uptime_percentage,
        mttr_minutes=mttr_minutes,
        mtbf_hours=mtbf_hours,
        incidents_count=incidents_count,
        exempted_incidents_count=exempted_incidents_count,
        raw_downtime_seconds=raw_downtime_seconds,
    )
