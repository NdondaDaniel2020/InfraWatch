"""Testes unitários para o módulo de templates do GLPI."""

from src.integrations.glpi.templates import render_glpi_template


def test_render_startup_heartbeat_template():
    """Valida renderização do template de startup/heartbeat."""
    html = render_glpi_template(
        "startup_heartbeat.html",
        app_name="InfraWatch",
        app_version="0.1.0",
        environment="development",
        started_at="08/10/2026 às 19:00:00 UTC",
    )
    assert "InfraWatch" in html
    assert "development" in html
    assert "ONLINE & PROATIVO" in html
    assert "08/10/2026 às 19:00:00 UTC" in html


def test_render_incident_ticket_template():
    """Valida renderização do template de incidente com sanitização."""
    html = render_glpi_template(
        "incident_ticket.html",
        device_name="Switch Core 01",
        device_ip="192.168.1.1",
        severity="CRITICAL",
        occurred_at="2026-10-08 19:00:00",
    )
    assert "Switch Core 01" in html
    assert "192.168.1.1" in html
    assert "CRITICAL" in html


def test_render_template_fallback_on_missing_file():
    """Valida fallback gracioso quando o arquivo de template não existe."""
    html = render_glpi_template("non_existent_template.html", foo="bar")
    assert "Notificação" in html
    assert "foo" in html
    assert "bar" in html
