import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { SanitizedServicesGrid } from "../../src/components/client/SanitizedServicesGrid";
import { SlaHistoryModal } from "../../src/components/client/SlaHistoryModal";
import { ClientSupportModal } from "../../src/components/client/ClientSupportModal";
import type { ClientServiceItem } from "../../src/types/clientPortal";
import { clientPortalApi } from "../../src/services/clientPortalApi";
import { apiClient } from "../../src/services/apiClient";

// Mock de serviços para teste de busca e paginação
const mockServices: ClientServiceItem[] = [
  { id: "1", name: "Core BNA Gateway", category: "Core", status: "UP", statusLabel: "UP • Nominal", responseTimeMs: 15, throughputFormatted: "1.2k req/s", successRatePct: 99.9, tags: ["ICMP", "BNA"], stability30DaysPct: 99.9 },
  { id: "2", name: "Internet Banking API", category: "API", status: "UP", statusLabel: "UP • Nominal", responseTimeMs: 25, throughputFormatted: "800 req/s", successRatePct: 99.8, tags: ["HTTPS", "API"], stability30DaysPct: 99.8 },
  { id: "3", name: "Mobile App Backend", category: "API", status: "DEG", statusLabel: "DEG • Alerta", responseTimeMs: 85, throughputFormatted: "400 req/s", successRatePct: 98.5, tags: ["HTTP", "Mobile"], stability30DaysPct: 98.2 },
  { id: "4", name: "ATM Switch Network", category: "Switch", status: "UP", statusLabel: "UP • Nominal", responseTimeMs: 12, throughputFormatted: "2.5k req/s", successRatePct: 100, tags: ["TCP", "ATM"], stability30DaysPct: 100 },
  { id: "5", name: "PostgreSQL Database Core", category: "Database", status: "UP", statusLabel: "UP • Nominal", responseTimeMs: 8, throughputFormatted: "5k req/s", successRatePct: 99.9, tags: ["PG", "Timescale"], stability30DaysPct: 99.9 },
  { id: "6", name: "Redis Cache Cluster", category: "Database", status: "UP", statusLabel: "UP • Nominal", responseTimeMs: 2, throughputFormatted: "10k req/s", successRatePct: 100, tags: ["Redis"], stability30DaysPct: 100 },
  { id: "7", name: "Swift Transações Internacionais", category: "Core", status: "DOWN", statusLabel: "DOWN • Falha", responseTimeMs: 500, throughputFormatted: "0 req/s", successRatePct: 80, tags: ["Swift", "Core"], stability30DaysPct: 95.0 },
  { id: "8", name: "EMV Card Processing", category: "Core", status: "UP", statusLabel: "UP • Nominal", responseTimeMs: 18, throughputFormatted: "1.5k req/s", successRatePct: 99.9, tags: ["EMV", "Cards"], stability30DaysPct: 99.9 },
];

describe("Portal do Cliente - SanitizedServicesGrid (Busca e Paginação)", () => {
  it("deve renderizar barra de busca, filtros de status e paginar serviços em 6 por página", () => {
    render(<SanitizedServicesGrid services={mockServices} />);

    // Verifica barra de busca e contador total
    expect(screen.getByTestId("services-search-input")).toBeInTheDocument();
    expect(screen.getByText(/Exibindo 8 de 8 serviços/i)).toBeInTheDocument();

    // Na página 1 (tamanho 6), deve exibir os 6 primeiros
    expect(screen.getByText("Core BNA Gateway")).toBeInTheDocument();
    expect(screen.getByText("Redis Cache Cluster")).toBeInTheDocument();
    // O 7º serviço ("Swift") deve estar na página 2
    expect(screen.queryByText("Swift Transações Internacionais")).not.toBeInTheDocument();

    // Paginação deve estar visível
    expect(screen.getByTestId("services-pagination")).toBeInTheDocument();
    expect(screen.getByTestId("pagination-page-2")).toBeInTheDocument();

    // Navegar para a página 2
    fireEvent.click(screen.getByTestId("pagination-page-2"));
    expect(screen.getByText("Swift Transações Internacionais")).toBeInTheDocument();
    expect(screen.getByText("EMV Card Processing")).toBeInTheDocument();
    expect(screen.queryByText("Core BNA Gateway")).not.toBeInTheDocument();
  });

  it("deve filtrar serviços em tempo real pelo campo de busca", () => {
    render(<SanitizedServicesGrid services={mockServices} />);

    const searchInput = screen.getByTestId("services-search-input");
    fireEvent.change(searchInput, { target: { value: "Mobile" } });

    expect(screen.getByText("Mobile App Backend")).toBeInTheDocument();
    expect(screen.queryByText("Core BNA Gateway")).not.toBeInTheDocument();
    expect(screen.getByText(/Exibindo 1 de 8 serviços/i)).toBeInTheDocument();
  });

  it("deve filtrar serviços por pílulas de status", () => {
    render(<SanitizedServicesGrid services={mockServices} />);

    // Clicar no filtro DEG (Alerta)
    fireEvent.click(screen.getByTestId("filter-status-deg"));
    expect(screen.getByText("Mobile App Backend")).toBeInTheDocument();
    expect(screen.queryByText("Core BNA Gateway")).not.toBeInTheDocument();

    // Clicar no filtro DOWN (Crítico)
    fireEvent.click(screen.getByTestId("filter-status-down"));
    expect(screen.getByText("Swift Transações Internacionais")).toBeInTheDocument();
    expect(screen.queryByText("Mobile App Backend")).not.toBeInTheDocument();
  });

  it("deve exibir empty state quando a busca não retornar resultados e permitir limpeza", () => {
    render(<SanitizedServicesGrid services={mockServices} />);

    const searchInput = screen.getByTestId("services-search-input");
    fireEvent.change(searchInput, { target: { value: "ServicoInexistente123" } });

    expect(screen.getByTestId("services-filter-empty")).toBeInTheDocument();
    expect(screen.getByText(/Nenhum serviço encontrado/i)).toBeInTheDocument();

    // Limpar filtros
    fireEvent.click(screen.getByText(/Limpar Filtros de Busca/i));
    expect(screen.queryByTestId("services-filter-empty")).not.toBeInTheDocument();
    expect(screen.getByText("Core BNA Gateway")).toBeInTheDocument();
  });
});

describe("Portal do Cliente - SlaHistoryModal (Histórico de SLA)", () => {
  it("deve abrir o modal de histórico, exibir períodos e tabela cronológica", async () => {
    vi.spyOn(clientPortalApi, "getSlaHistory").mockResolvedValueOnce([
      {
        cycleLabel: "Outubro 2026",
        month: "Out",
        uptimePct: 99.95,
        targetPct: 99.5,
        mttrMinutes: 4,
        incidentsCount: 1,
        unplannedDowntimeMinutes: 10,
        exemptedDowntimeMinutes: 30,
        status: "CONFORME",
      },
      {
        cycleLabel: "Setembro 2026",
        month: "Set",
        uptimePct: 99.8,
        targetPct: 99.5,
        mttrMinutes: 6,
        incidentsCount: 2,
        unplannedDowntimeMinutes: 20,
        exemptedDowntimeMinutes: 15,
        status: "CONFORME",
      },
    ]);

    const handleClose = vi.fn();
    render(
      <SlaHistoryModal
        isOpen={true}
        onClose={handleClose}
        tenantName="Banco Sol S.A."
        organizationId="org-123"
      />
    );

    expect(screen.getByTestId("sla-history-modal")).toBeInTheDocument();
    expect(screen.getByText(/Histórico de Desempenho e Metas • Banco Sol S.A./i)).toBeInTheDocument();

    // Períodos de 3, 6 e 12 meses presentes
    expect(screen.getByTestId("history-period-3m")).toBeInTheDocument();
    expect(screen.getByTestId("history-period-6m")).toBeInTheDocument();
    expect(screen.getByTestId("history-period-12m")).toBeInTheDocument();

    // Espera carregamento dos itens do histórico
    await waitFor(() => {
      expect(screen.getByText("Outubro 2026")).toBeInTheDocument();
      expect(screen.getByText("Setembro 2026")).toBeInTheDocument();
    });

    // Fechar ao clicar no botão de fechar
    fireEvent.click(screen.getByTestId("close-history-modal-btn"));
    expect(handleClose).toHaveBeenCalled();
  });
});

describe("Portal do Cliente - ClientSupportModal (Suporte e Chamados)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("deve renderizar modal de suporte simplificado com formulário e régua de SLA reativa", () => {
    render(
      <ClientSupportModal
        isOpen={true}
        onClose={vi.fn()}
        services={mockServices}
      />
    );

    expect(screen.getByTestId("client-support-modal")).toBeInTheDocument();
    expect(screen.getByTestId("ticket-title-input")).toBeInTheDocument();
    expect(screen.getByTestId("ticket-severity-select")).toBeInTheDocument();
    expect(screen.getByTestId("ticket-description-input")).toBeInTheDocument();
    expect(screen.getByTestId("sla-ruler")).toBeInTheDocument();
    expect(screen.getByText("≤ 15 min")).toBeInTheDocument();
    expect(screen.getByText("≤ 1 hora")).toBeInTheDocument();
    expect(screen.getByText("≤ 4 horas")).toBeInTheDocument();
    expect(screen.getByText("≤ 12 horas")).toBeInTheDocument();
  });

  it("deve validar campos e registrar chamado com protocolo no GLPI", async () => {
    const handleTicketCreated = vi.fn();
    vi.spyOn(clientPortalApi, "openSupportTicket").mockResolvedValueOnce({
      ticketId: "tkt-test-1",
      protocol: "INFRA-20261031-TEST01",
      title: "Falha na conexão VPN BNA",
      severity: "CRITICAL",
      status: "OPEN",
      createdAt: new Date().toISOString(),
      glpiTicketId: 8502,
      message: "Chamado registrado no GLPI e despachado para a equipe NOC.",
    });

    render(
      <ClientSupportModal
        isOpen={true}
        onClose={vi.fn()}
        organizationId="org-123"
        services={mockServices}
        onTicketCreated={handleTicketCreated}
      />
    );

    // Preencher formulário
    fireEvent.change(screen.getByTestId("ticket-title-input"), {
      target: { value: "Falha na conexão VPN BNA" },
    });
    fireEvent.change(screen.getByTestId("ticket-severity-select"), {
      target: { value: "CRITICAL" },
    });
    fireEvent.change(screen.getByTestId("ticket-description-input"), {
      target: { value: "Túnel IPsec principal inacessível desde as 14h UTC gerando indisponibilidade." },
    });

    // Submeter
    fireEvent.click(screen.getByTestId("ticket-submit-btn"));

    await waitFor(() => {
      expect(screen.getByTestId("ticket-created-success")).toBeInTheDocument();
      expect(screen.getByText("INFRA-20261031-TEST01")).toBeInTheDocument();
      expect(screen.getByText("#8502")).toBeInTheDocument();
    });

    expect(handleTicketCreated).toHaveBeenCalled();
  });

  it("deve renderizar rótulo Perda de Pacotes para dispositivos ICMP", () => {
    const icmpService: ClientServiceItem = {
      id: "srv-icmp",
      name: "Casa-estrela",
      category: "SERVER",
      status: "UP",
      statusLabel: "Nominal",
      responseTimeMs: 232,
      throughputFormatted: "0% Perda",
      tags: ["icmp"],
      stability30DaysPct: 100.0,
    };

    render(<SanitizedServicesGrid services={[icmpService]} />);

    expect(screen.getByText("Perda de Pacotes")).toBeInTheDocument();
    expect(screen.getByText("0% Perda")).toBeInTheDocument();
    expect(screen.getByText("232 ms (Normal)")).toBeInTheDocument();
    expect(screen.getByText("100.0%")).toBeInTheDocument();
  });
});

describe("clientPortalApi.getClientServices com Telemetria e SLA", () => {
  it("deve mapear latência, perda de pacotes e estabilidade 30 dias a partir dos endpoints reais", async () => {
    vi.spyOn(apiClient, "get").mockImplementation(async (url: string) => {
      if (url.startsWith("/api/v1/events/telemetry")) {
        return {
          total: 2,
          items: [
            {
              device_id: "dev-1",
              name: "NdDaniel",
              category: "SERVER",
              status: "DEG",
              protocol: "icmp",
              last_latency_ms: 388.297,
              last_packet_loss: 0.0,
            },
            {
              device_id: "dev-2",
              name: "DESKTOP-SNUOOM3",
              category: "SERVER",
              status: "DOWN",
              protocol: "icmp",
              last_latency_ms: 0.0,
              last_packet_loss: 100.0,
            },
          ],
        };
      }
      if (url.startsWith("/api/v1/sla/organizations/org-test/report")) {
        return {
          organization_id: "org-test",
          organization_name: "Test Org",
          digital_signature: "SIG123",
          period_label: "Nov/2026",
          start_period: "2026-11-01",
          end_period: "2026-11-30",
          uptime_net_pct: 99.8,
          uptime_gross_pct: 99.8,
          sla_target_pct: 99.5,
          sla_met: true,
          mttr_minutes: 0,
          mtbf_hours: 720,
          total_devices: 2,
          unplanned_downtime_minutes: 0,
          exempted_downtime_minutes: 0,
          devices: [
            {
              device_id: "dev-1",
              device_name: "NdDaniel",
              category: "SERVER",
              uptime_gross_pct: 99.8,
              uptime_net_pct: 99.8,
              rfc_exempted_minutes: 0,
              sla_target_pct: 99.5,
              mttr_minutes: 0,
              status: "CONFORME",
            },
            {
              device_id: "dev-2",
              device_name: "DESKTOP-SNUOOM3",
              category: "SERVER",
              uptime_gross_pct: 0.0,
              uptime_net_pct: 0.0,
              rfc_exempted_minutes: 0,
              sla_target_pct: 99.5,
              mttr_minutes: 0,
              status: "VIOLADO",
            },
          ],
        };
      }
      return null;
    });

    const services = await clientPortalApi.getClientServices("org-test");
    expect(services).toHaveLength(2);

    expect(services[0].id).toBe("dev-1");
    expect(services[0].name).toBe("NdDaniel");
    expect(services[0].status).toBe("DEG");
    expect(services[0].responseTimeMs).toBe(388);
    expect(services[0].throughputFormatted).toBe("0% Perda");
    expect(services[0].stability30DaysPct).toBe(99.8);

    expect(services[1].id).toBe("dev-2");
    expect(services[1].name).toBe("DESKTOP-SNUOOM3");
    expect(services[1].status).toBe("DOWN");
    expect(services[1].responseTimeMs).toBe(0);
    expect(services[1].throughputFormatted).toBe("100% Perda");
    expect(services[1].stability30DaysPct).toBe(0.0);
  });
});
