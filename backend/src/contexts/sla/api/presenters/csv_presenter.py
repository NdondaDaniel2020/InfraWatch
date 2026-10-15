"""Formatador de relatórios contratuais de SLA para saída em formato CSV (RFC 4180)."""

from __future__ import annotations

import csv
import io
from collections.abc import Sequence
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from src.contexts.sla.schemas.responses import SlaReportResponse

CSV_HEADERS: list[str] = [
    "Device ID",
    "Device Name",
    "Category",
    "IP Address",
    "Start Period (UTC)",
    "End Period (UTC)",
    "Total Period (Hours)",
    "Unplanned Downtime (Minutes)",
    "Exempted Downtime (Minutes)",
    "Uptime (%)",
    "SLA Target (%)",
    "SLA Met",
    "MTTR (Minutes)",
    "MTBF (Hours)",
    "Total Incidents",
    "Exempted Incidents",
]


class SlaCsvPresenter:
    """Presenter responsável por transformar dados analíticos de SLA em streams e strings CSV."""

    @classmethod
    def format_device_sla_row(
        cls,
        device: Any,
        report: SlaReportResponse,
    ) -> list[str | int]:
        """Converte uma combinação de ativo e relatório analítico em uma linha de dados CSV."""
        return [
            str(device.id),
            device.name,
            device.category,
            device.ip_address,
            report.start_period.isoformat(),
            report.end_period.isoformat(),
            f"{report.total_period_hours:.2f}",
            f"{report.unplanned_downtime_minutes:.2f}",
            f"{report.exempted_downtime_minutes:.2f}",
            f"{report.uptime_percentage:.2f}",
            f"{report.sla_target:.2f}",
            "SIM" if report.sla_met else "NAO",
            f"{report.mttr_minutes:.2f}",
            f"{report.mtbf_hours:.2f}",
            report.incidents_count,
            report.exempted_incidents_count,
        ]

    @classmethod
    def format_single_device(
        cls,
        device: Any,
        report: SlaReportResponse,
    ) -> str:
        """Gera string CSV formatada para um único ativo com cabeçalho e linha de dados."""
        output = io.StringIO()
        writer = csv.writer(output)
        writer.writerow(CSV_HEADERS)
        writer.writerow(cls.format_device_sla_row(device, report))
        return output.getvalue()

    @classmethod
    def format_multiple_devices(
        cls,
        items: Sequence[tuple[Any, SlaReportResponse]],
    ) -> str:
        """Gera string CSV consolidada para múltiplos ativos de uma organização."""
        output = io.StringIO()
        writer = csv.writer(output)
        writer.writerow(CSV_HEADERS)
        for device, report in items:
            writer.writerow(cls.format_device_sla_row(device, report))
        return output.getvalue()
