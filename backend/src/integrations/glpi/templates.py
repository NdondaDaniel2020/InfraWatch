"""Módulo de renderização de templates HTML para integração com GLPI.

Mantém os templates visuais desacoplados da lógica de negócio e do ciclo de vida da aplicação.
"""

import html
import logging
from pathlib import Path
from string import Template
from typing import Any

logger = logging.getLogger("infrawatch.integrations.glpi.templates")

_TEMPLATES_DIR = Path(__file__).resolve().parent / "templates"


def _sanitize_val(val: Any) -> Any:
    """Sanitiza recursivamente valores do contexto para prevenir injeção HTML indevida."""
    if val is None:
        return ""
    if isinstance(val, str):
        return html.escape(val, quote=True)
    if isinstance(val, list):
        return [_sanitize_val(x) for x in val]
    if isinstance(val, dict):
        return {k: _sanitize_val(v) for k, v in val.items()}
    if isinstance(val, (int, float, bool)):
        return val
    return html.escape(str(val), quote=True)


def render_glpi_template(template_name: str, **context: Any) -> str:
    """Renderiza um template HTML para payloads do GLPI (tickets, followups, heartbeats).

    Args:
        template_name: Nome do arquivo de template (ex: 'startup_heartbeat.html').
        **context: Variáveis passadas para interpolação no template.

    Returns:
        String HTML com as variáveis substituídas.
    """
    if not template_name.endswith(".html"):
        template_name = f"{template_name}.html"

    template_file = _TEMPLATES_DIR / template_name

    sanitized = {k: _sanitize_val(v) for k, v in context.items()}

    if not template_file.is_file():
        logger.warning("Template GLPI '%s' não encontrado em '%s'", template_name, template_file)
        details = "".join(f"<li><strong>{k}:</strong> {v}</li>" for k, v in sanitized.items())
        return f"<div><p>[InfraWatch] Notificação:</p><ul>{details}</ul></div>"

    raw_html = template_file.read_text(encoding="utf-8")
    return Template(raw_html).safe_substitute(**sanitized)
