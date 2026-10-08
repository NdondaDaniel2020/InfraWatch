"""Script de teste da integração GLPI 10/12 com o InfraWatch.

Executa o fluxo completo do GlpiClient:
1. Autenticação e obtenção do session_token (initSession)
2. Criação de chamado de incidente crítico (POST /Ticket)
3. Inclusão de acompanhamento técnico privado com diagnóstico (POST /ITILFollowup)
4. Encerramento do chamado com status SOLVED (PUT /Ticket/{id})
5. Finalização graciosa da sessão (killSession)
"""

import asyncio
import sys
from pathlib import Path

# Adiciona o diretório backend ao sys.path para importação dos módulos
root_dir = Path(__file__).resolve().parent.parent
backend_dir = root_dir / "backend"
sys.path.insert(0, str(backend_dir))

from src.core.config import get_settings
from src.integrations.glpi import GlpiClient, render_glpi_template
from src.integrations.glpi.schemas import (
    GlpiImpact,
    GlpiTicketCreate,
    GlpiUrgency,
)


async def main() -> None:
    settings = get_settings()

    print("=" * 60)
    print(" InfraWatch - Teste de Integração GLPI")
    print("=" * 60)
    print(f" GLPI Base URL  : {settings.GLPI_BASE_URL}")
    print(f" GLPI App Token : {settings.GLPI_APP_TOKEN[:6]}... ({len(settings.GLPI_APP_TOKEN)} chars)")
    print(f" GLPI Enabled   : {settings.GLPI_ENABLED}")
    print("=" * 60)

    if not settings.GLPI_APP_TOKEN or not settings.GLPI_USER_TOKEN:
        print("\n[ERRO] GLPI_APP_TOKEN ou GLPI_USER_TOKEN não configurados no .env")
        sys.exit(1)

    print("\n[1/4] Iniciando sessão e conectando à API REST do GLPI...")
    async with GlpiClient(
        base_url=settings.GLPI_BASE_URL,
        app_token=settings.GLPI_APP_TOKEN,
        user_token=settings.GLPI_USER_TOKEN,
        timeout=settings.GLPI_TIMEOUT_SECONDS,
    ) as client:
        print("  -> Autenticação realizada com sucesso (Session-Token obtido).")

        print("\n[2/4] Abrindo chamado de teste no GLPI...")
        ticket_content = render_glpi_template(
            "incident_ticket.html",
            device_name="cr01.luanda.rcsangola.co.ao",
            device_ip="10.200.0.1",
            severity="CRITICAL / DOWN",
            occurred_at="08/10/2026 18:00:00 UTC",
        )
        ticket_payload = GlpiTicketCreate(
            name="[InfraWatch] Falha Crítica de Conectividade - Core Router BGP",
            content=ticket_content,
            urgency=GlpiUrgency.VERY_HIGH,
            impact=GlpiImpact.HIGH,
        )
        ticket_id = await client.open_ticket(ticket_payload)
        print(f"  -> Chamado criado com sucesso! Ticket ID: #{ticket_id}")
        print(f"  -> URL no GLPI: http://localhost:8080/front/ticket.form.php?id={ticket_id}")

        print("\n[3/4] Adicionando acompanhamento técnico privado com telemetria...")
        followup_content = render_glpi_template(
            "incident_followup.html",
            protocol="ICMP Ping Probe",
            probe_details_json="Packet Loss: 100%\nRTT: timeout\nStatus: DOWN confirmado por 3 sondas consecutivas.",
        )
        followup_id = await client.add_followup(
            ticket_id=ticket_id,
            content=followup_content,
            private=True,
        )
        print(f"  -> Acompanhamento técnico registrado! Followup ID: #{followup_id}")

        print("\n[4/4] Encerrando chamado (SOLVED)...")
        await client.close_ticket(ticket_id)
        print(f"  -> Chamado #{ticket_id} encerrado com sucesso (Status: SOLVED).")

    print("\n" + "=" * 60)
    print(" Integração GLPI validada com 100% de sucesso!")
    print(" Acesse o painel web: http://localhost:8080 (Login: glpi / Senha: glpi)")
    print("=" * 60)


if __name__ == "__main__":
    asyncio.run(main())
