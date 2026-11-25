"""Formatador de apresentação visual para chamados de suporte técnico."""

from __future__ import annotations

import html
from datetime import datetime
from uuid import UUID


def format_support_ticket_html(
    *,
    organization_name: str,
    organization_id: UUID | str,
    requester_email: str,
    severity: str,
    device_info: str,
    description: str,
    protocol: str,
    created_at: datetime,
) -> str:
    """Formata o corpo visual em HTML do chamado de suporte para renderização em GLPI."""
    safe_org = html.escape(str(organization_name))
    safe_email = html.escape(str(requester_email).strip())
    safe_severity = html.escape(str(severity))
    safe_device = html.escape(str(device_info))
    safe_description = html.escape(str(description).strip()).replace("\n", "<br/>")

    return (
        '<div style="font-family: -apple-system, BlinkMacSystemFont, sans-serif; line-height: 1.5; color: #1e293b;">'
        '<h3 style="color: #0284c7; margin-bottom: 8px;">🎫 Chamado Aberto via Portal do Cliente</h3>'
        f'<p style="margin: 4px 0;"><strong>Organização:</strong> {safe_org} (ID: {organization_id})</p>'
        f'<p style="margin: 4px 0;"><strong>Solicitante:</strong> {safe_email}</p>'
        f'<p style="margin: 4px 0;"><strong>Severidade:</strong> {safe_severity}</p>'
        f'<p style="margin: 4px 0;"><strong>Ativo Afetado:</strong> {safe_device}</p>'
        '<hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 12px 0;" />'
        '<h4 style="margin: 0 0 6px 0; color: #334155;">Descrição Detalhada:</h4>'
        '<div style="background: #f8fafc; padding: 12px; border-radius: 8px; border: 1px solid #e2e8f0; font-size: 13px;">'
        f"{safe_description}"
        "</div>"
        '<p style="font-size: 11px; color: #64748b; margin-top: 12px;">'
        f"Protocolo de Atendimento InfraWatch: <strong>{protocol}</strong> | Registrado em {created_at.strftime('%d/%m/%Y %H:%M:%S UTC')}"
        "</p>"
        "</div>"
    )
