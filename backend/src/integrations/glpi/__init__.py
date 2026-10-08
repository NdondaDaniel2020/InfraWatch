"""Módulo de integração com GLPI 10+."""

from src.integrations.glpi.client import GlpiAuthError, GlpiClient
from src.integrations.glpi.templates import render_glpi_template

__all__ = ["GlpiClient", "GlpiAuthError", "render_glpi_template"]
