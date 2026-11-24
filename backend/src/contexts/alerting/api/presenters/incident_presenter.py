"""Formatadores de apresentação para o bounded context Alerting."""

from __future__ import annotations

from src.core.config import get_settings


def build_glpi_ticket_url(ticket_id: int | None) -> str | None:
    """Gera o link navegável direto para o formulário do chamado na UI Web do GLPI."""
    if not ticket_id:
        return None

    try:
        settings = get_settings()
        base_ui = (
            settings.GLPI_PUBLIC_URL.strip().rstrip("/")
            if getattr(settings, "GLPI_PUBLIC_URL", "")
            else getattr(settings, "GLPI_BASE_URL", "").replace("/apirest.php", "").rstrip("/")
        )
        if base_ui:
            return f"{base_ui}/front/ticket.form.php?id={ticket_id}"
    except (AttributeError, ValueError):
        return None

    return None
