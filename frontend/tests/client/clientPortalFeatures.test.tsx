import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { SanitizedServicesGrid } from "../../src/components/client/SanitizedServicesGrid";
import { SlaHistoryModal } from "../../src/components/client/SlaHistoryModal";
import { ClientSupportModal } from "../../src/components/client/ClientSupportModal";
import type { ClientServiceItem } from "../../src/types/clientPortal";
import { clientPortalApi } from "../../src/services/clientPortalApi";

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

  it("deve renderizar modal de suporte com formulário e aba de canais diretos", () => {
    render(
      <ClientSupportModal
        isOpen={true}
        onClose={vi.fn()}
        services={mockServices}
      />
    );

    expect(screen.getByTestId("client-support-modal")).toBeInTheDocument();
    expect(screen.getByTestId("support-tab-ticket")).toBeInTheDocument();
    expect(screen.getByTestId("support-tab-direct")).toBeInTheDocument();

    // Alternar para canais diretos
    fireEvent.click(screen.getByTestId("support-tab-direct"));
    expect(screen.getByTestId("whatsapp-support-link")).toBeInTheDocument();
    expect(screen.getByText("+244 923 000 000 • Atendimento 24h")).toBeInTheDocument();
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
});
