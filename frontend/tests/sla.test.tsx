import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { Toaster } from "sonner";
import { MaintenanceWindowsPage } from "../src/pages/sla/MaintenanceWindowsPage";
import { SlaReportsPage } from "../src/pages/sla/SlaReportsPage";
import { slaApi } from "../src/services/slaApi";
import { adminApi } from "../src/services/adminApi";
import { clientPortalApi } from "../src/services/clientPortalApi";
import { pdfExportService } from "../src/services/pdfExportService";
import {
  mockMaintenanceWindows,
  mockMaintenanceKpiSummary,
  mockSlaOverviewBancoSol,
  mockSlaOverviewUnitel,
  mockSlaDeviceBreakdown,
} from "../src/mocks/slaMocks";
import { mockAdminOrganizations } from "../src/mocks/auditMocks";
import { MOCK_SANITIZED_ENDPOINTS } from "../src/mocks/clientPortalMocks";

vi.mock("../src/services/slaApi", () => ({
  resolveSlaPeriodRange: vi.fn((_period?: string) => ({})),
  slaApi: {
    listMaintenanceWindows: vi.fn(),
    getMaintenanceKpiSummary: vi.fn(),
    createMaintenanceWindow: vi.fn(),
    approveMaintenanceWindow: vi.fn(),
    getSlaOverview: vi.fn(),
    getSlaDeviceBreakdown: vi.fn(),
    getSlaReportDetails: vi.fn(),
    exportSlaReport: vi.fn(),
  },
}));

vi.mock("../src/services/adminApi", () => ({
  adminApi: {
    listOrganizations: vi.fn(),
  },
}));

vi.mock("../src/services/devicesApi", () => ({
  devicesApi: {
    listDevices: vi.fn().mockResolvedValue({
      items: [
        { id: "dev-1", name: "SW-CORE-LUANDA-01", hostname: "SW-CORE-LUANDA-01", ipAddress: "10.0.1.1", category: "NETWORK" },
        { id: "dev-2", name: "SW-CORE-LUANDA-02", hostname: "SW-CORE-LUANDA-02", ipAddress: "10.0.1.2", category: "NETWORK" },
        { id: "dev-3", name: "DB-REPLICA-02", hostname: "DB-REPLICA-02", ipAddress: "10.0.2.1", category: "DATABASE" },
      ],
      total: 3,
      page: 1,
      pageSize: 20,
      totalPages: 1,
    }),
  },
}));

vi.mock("../src/services/clientPortalApi", () => ({
  clientPortalApi: {
    getSanitizedEndpoints: vi.fn(),
  },
}));

vi.mock("../src/context/AuthContext", () => ({
  useAuth: () => ({
    user: { id: "user-1", name: "Daniel Ndonda", role: "SUPER_ADMIN" },
    isAuthenticated: true,
  }),
}));

const renderWithProviders = (ui: ReactNode, queryClient?: QueryClient) => {
  const client =
    queryClient ||
    new QueryClient({
      defaultOptions: {
        queries: { retry: false, gcTime: 0 },
        mutations: { retry: false },
      },
    });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        {ui}
        <Toaster />
      </MemoryRouter>
    </QueryClientProvider>
  );
};

describe("Gestão de Janelas de Manutenção & SLA (Issue #218)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.URL.createObjectURL = vi.fn().mockReturnValue("blob:mock-url");
    window.URL.revokeObjectURL = vi.fn();
    (adminApi.listOrganizations as Mock).mockResolvedValue({
      items: mockAdminOrganizations,
      total: mockAdminOrganizations.length,
      page: 1,
      page_size: mockAdminOrganizations.length,
    });
  });

  describe("Painel de Janelas de Manutenção (/maintenance)", () => {
    it("deve renderizar estado nominal com cartões RFC e KPIs", async () => {
      (slaApi.listMaintenanceWindows as Mock).mockResolvedValue(mockMaintenanceWindows);
      (slaApi.getMaintenanceKpiSummary as Mock).mockResolvedValue(mockMaintenanceKpiSummary);

      renderWithProviders(<MaintenanceWindowsPage />);

      await waitFor(() => {
        expect(screen.getByText("Janelas de Manutenção Programada & Isenções de SLA")).toBeInTheDocument();
        expect(screen.getByText("RFC-2026-8812")).toBeInTheDocument();
        expect(screen.getByText("RFC-2026-8840")).toBeInTheDocument();
        expect(screen.getAllByText("Unitel Angola (Backbone Core)").length).toBeGreaterThanOrEqual(1);
      });
    });

    it("deve alternar para a visualização em Linha do Tempo Gantt 24h", async () => {
      const user = userEvent.setup();
      (slaApi.listMaintenanceWindows as Mock).mockResolvedValue(mockMaintenanceWindows);
      (slaApi.getMaintenanceKpiSummary as Mock).mockResolvedValue(mockMaintenanceKpiSummary);

      renderWithProviders(<MaintenanceWindowsPage />);

      await waitFor(() => expect(screen.getByText("RFC-2026-8812")).toBeInTheDocument());

      const ganttBtn = screen.getByTitle("Exibir Linha do Tempo Gantt");
      await user.click(ganttBtn);

      await waitFor(() => {
        expect(screen.getByTestId("maint-gantt-container")).toBeInTheDocument();
        expect(screen.getByText("Linha do Tempo Gantt — 24 Horas")).toBeInTheDocument();
      });
    });

    it("deve filtrar janelas por aba de status", async () => {
      const user = userEvent.setup();
      (slaApi.listMaintenanceWindows as Mock).mockResolvedValue(mockMaintenanceWindows);
      (slaApi.getMaintenanceKpiSummary as Mock).mockResolvedValue(mockMaintenanceKpiSummary);

      renderWithProviders(<MaintenanceWindowsPage />);

      await waitFor(() => expect(screen.getByText("RFC-2026-8812")).toBeInTheDocument());

      const pendingTab = screen.getByRole("button", { name: /pendentes/i });
      await user.click(pendingTab);

      await waitFor(() => {
        expect(screen.getByText("RFC-2026-8840")).toBeInTheDocument();
      });
    });

    it("deve abrir modal de agendamento e submeter nova RFC com alerta de conflito", async () => {
      const user = userEvent.setup();
      (slaApi.listMaintenanceWindows as Mock).mockResolvedValue(mockMaintenanceWindows);
      (slaApi.getMaintenanceKpiSummary as Mock).mockResolvedValue(mockMaintenanceKpiSummary);
      (slaApi.createMaintenanceWindow as Mock).mockResolvedValue({
        id: "maint-99",
        rfcNumber: "RFC-2026-8850",
        title: "Atualização de Switch",
      });

      renderWithProviders(<MaintenanceWindowsPage />);

      await waitFor(() => expect(screen.getByText("RFC-2026-8812")).toBeInTheDocument());

      const openModalBtn = screen.getByRole("button", { name: /agendar nova parada técnica/i });
      await user.click(openModalBtn);

      expect(screen.getByRole("dialog")).toBeInTheDocument();
      expect(screen.getByTestId("conflict-warning")).toBeInTheDocument();

      const titleInput = screen.getByPlaceholderText(/atualização crítica de firmware/i);
      await user.type(titleInput, "Manutenção de Roteador de Borda");

      const descInput = screen.getByPlaceholderText(/descreva o escopo da parada/i);
      await user.type(descInput, "Procedimento técnico detalhado para atualização.");

      const submitBtn = screen.getByRole("button", { name: /submeter parada programada/i });
      await user.click(submitBtn);

      await waitFor(() => {
        expect(slaApi.createMaintenanceWindow).toHaveBeenCalled();
      });
    });

    it("deve homologar isenção de SLA formalmente", async () => {
      const user = userEvent.setup();
      (slaApi.listMaintenanceWindows as Mock).mockResolvedValue(mockMaintenanceWindows);
      (slaApi.getMaintenanceKpiSummary as Mock).mockResolvedValue(mockMaintenanceKpiSummary);
      (slaApi.approveMaintenanceWindow as Mock).mockResolvedValue({
        ...mockMaintenanceWindows[1],
        status: "APPROVED",
        slaExemption: true,
      });

      renderWithProviders(<MaintenanceWindowsPage />);

      await waitFor(() => expect(screen.getByText("RFC-2026-8840")).toBeInTheDocument());

      const approveBtn = screen.getByRole("button", { name: /homologar isenção agora/i });
      await user.click(approveBtn);

      await waitFor(() => {
        expect(slaApi.approveMaintenanceWindow).toHaveBeenCalledWith("maint-2");
      });
    });

    it("deve exportar dossie de RFCs em CSV e abrir dossie tecnico", async () => {
      const user = userEvent.setup();
      (slaApi.listMaintenanceWindows as Mock).mockResolvedValue(mockMaintenanceWindows);
      (slaApi.getMaintenanceKpiSummary as Mock).mockResolvedValue(mockMaintenanceKpiSummary);

      renderWithProviders(<MaintenanceWindowsPage />);

      await waitFor(() => expect(screen.getByText("RFC-2026-8812")).toBeInTheDocument());

      const exportBtn = screen.getByRole("button", { name: /exportar rfcs/i });
      await user.click(exportBtn);

      const dossierBtn = screen.getAllByRole("button", { name: /ver dossiê/i })[0];
      await user.click(dossierBtn);

      await waitFor(() => {
        expect(screen.getByTestId("rfc-dossier-maint-1")).toBeInTheDocument();
        expect(screen.getByText(/DOSSIÊ TÉCNICO OPERACIONAL — RFC-2026-8812/i)).toBeInTheDocument();
      });
    });

    it("deve exibir estado vazio quando não houver manutenções agendadas", async () => {
      (slaApi.listMaintenanceWindows as Mock).mockResolvedValue([]);
      (slaApi.getMaintenanceKpiSummary as Mock).mockResolvedValue(mockMaintenanceKpiSummary);

      renderWithProviders(<MaintenanceWindowsPage />);

      await waitFor(() => {
        expect(screen.getByTestId("maint-empty-container")).toBeInTheDocument();
        expect(screen.getByText("Nenhuma Janela de Manutenção Programada")).toBeInTheDocument();
      });
    });
  });

  describe("Painel de Relatórios Analíticos de SLA (/sla)", () => {
    beforeEach(() => {
      (adminApi.listOrganizations as Mock).mockResolvedValue({
        items: mockAdminOrganizations,
        total: mockAdminOrganizations.length,
        page: 1,
        page_size: mockAdminOrganizations.length,
      });
      (clientPortalApi.getSanitizedEndpoints as Mock).mockResolvedValue(
        MOCK_SANITIZED_ENDPOINTS
      );
    });

    it("deve renderizar indicadores analíticos de SLA, MTTR e MTBF", async () => {
      (slaApi.getSlaOverview as Mock).mockResolvedValue(mockSlaOverviewBancoSol);
      (slaApi.getSlaDeviceBreakdown as Mock).mockResolvedValue(mockSlaDeviceBreakdown);

      renderWithProviders(<SlaReportsPage />);

      await waitFor(() => {
        expect(screen.getByText("Relatórios Analíticos de SLA & Disponibilidade Contratual")).toBeInTheDocument();
        expect(screen.getAllByText("99.98%").length).toBeGreaterThanOrEqual(1);
        expect(screen.getByText("8.2m")).toBeInTheDocument();
        expect(screen.getByText("418h")).toBeInTheDocument();
      });
    });

    it("deve alterar contratante e atualizar métricas de SLA", async () => {
      const user = userEvent.setup();
      (slaApi.getSlaOverview as Mock).mockResolvedValue(mockSlaOverviewBancoSol);
      (slaApi.getSlaDeviceBreakdown as Mock).mockResolvedValue(mockSlaDeviceBreakdown);

      renderWithProviders(<SlaReportsPage />);

      await waitFor(() => expect(screen.getAllByText("99.98%").length).toBeGreaterThanOrEqual(1));

      (slaApi.getSlaOverview as Mock).mockResolvedValue(mockSlaOverviewUnitel);

      const selectTenant = screen.getByLabelText(/selecionar contratante enterprise/i);
      await user.selectOptions(selectTenant, "org-unitel");

      await waitFor(() => {
        expect(slaApi.getSlaOverview).toHaveBeenCalledWith(
          "org-unitel",
          "last_30d"
        );
      });
    });

    it("deve disparar exportação de relatório em CSV e JSON", async () => {
      const user = userEvent.setup();
      (slaApi.getSlaOverview as Mock).mockResolvedValue(mockSlaOverviewBancoSol);
      (slaApi.getSlaDeviceBreakdown as Mock).mockResolvedValue(mockSlaDeviceBreakdown);

      // Mock createObjectURL e revokeObjectURL
      window.URL.createObjectURL = vi.fn().mockReturnValue("blob:mock-url");
      window.URL.revokeObjectURL = vi.fn();

      renderWithProviders(<SlaReportsPage />);

      await waitFor(() => expect(screen.getAllByText("99.98%").length).toBeGreaterThanOrEqual(1));

      const csvBtn = screen.getByRole("button", { name: "CSV" });
      await user.click(csvBtn);

      expect(window.URL.createObjectURL).toHaveBeenCalled();

      const jsonBtn = screen.getByRole("button", { name: "JSON" });
      await user.click(jsonBtn);

      expect(window.URL.createObjectURL).toHaveBeenCalledTimes(2);
    });

    it("deve permitir alternar entre abas de Endpoints Contratados e Ativos de Rede", async () => {
      const user = userEvent.setup();
      (slaApi.getSlaOverview as Mock).mockResolvedValue(mockSlaOverviewBancoSol);
      (slaApi.getSlaDeviceBreakdown as Mock).mockResolvedValue(mockSlaDeviceBreakdown);

      renderWithProviders(<SlaReportsPage />);

      await waitFor(() => {
        expect(screen.getByTestId("sla-device-breakdown-table")).toBeInTheDocument();
        expect(screen.getByText("10.0.1.1")).toBeInTheDocument();
      });

      // Clicar na aba de Endpoints Contratados (Visão Cliente)
      const endpointsTab = screen.getByTestId("tab-view-endpoints");
      await user.click(endpointsTab);

      await waitFor(() => {
        expect(screen.getByTestId("sla-endpoints-table")).toBeInTheDocument();
        expect(screen.getByText("api.bancosol.ao")).toBeInTheDocument();
        expect(screen.getByText("ibanking.bancosol.ao")).toBeInTheDocument();
        expect(screen.getAllByText("DC Luanda Sul").length).toBeGreaterThanOrEqual(1);
        expect(screen.getByText("99.99%")).toBeInTheDocument();
      });

      // Testar busca de endpoints
      const searchInput = screen.getByTestId("sla-endpoint-search-input");
      await user.type(searchInput, "ibanking");
      expect(screen.getByText("ibanking.bancosol.ao")).toBeInTheDocument();
      expect(screen.queryByText("wan-agencias.bancosol.ao")).not.toBeInTheDocument();

      // Voltar para aba de Ativos de Rede
      const devicesTab = screen.getByTestId("tab-view-devices");
      await user.click(devicesTab);
      expect(screen.getByTestId("sla-device-breakdown-table")).toBeInTheDocument();
      expect(screen.getAllByText("SW-CORE-LUANDA-01").length).toBeGreaterThanOrEqual(1);
    });

    it("deve paginar e filtrar a tabela de Ativos Físicos de Rede", async () => {
      const user = userEvent.setup();
      const manyDevices = Array.from({ length: 12 }, (_, i) => ({
        deviceId: `dev-${i + 1}`,
        deviceName: `DEVICE-CORE-${String(i + 1).padStart(2, "0")}`,
        ipAddress: `10.0.1.${i + 1}`,
        tier: "TIER-1" as const,
        nominalUptimePct: 99.5,
        netUptimePct: 99.8,
        exemptedMaintenanceMinutes: 60,
        status: "COMPLIANT" as const,
      }));

      (slaApi.getSlaOverview as Mock).mockResolvedValue(mockSlaOverviewBancoSol);
      (slaApi.getSlaDeviceBreakdown as Mock).mockResolvedValue(manyDevices);

      renderWithProviders(<SlaReportsPage />);

      await waitFor(() => {
        expect(screen.getByTestId("sla-device-breakdown-table")).toBeInTheDocument();
        expect(screen.getByTestId("sla-devices-pagination")).toBeInTheDocument();
      });

      // Página 1 deve ter DEVICE-CORE-01 e não DEVICE-CORE-06 (com itemsPerPage=5)
      expect(screen.getByText("DEVICE-CORE-01")).toBeInTheDocument();
      expect(screen.queryByText("DEVICE-CORE-06")).not.toBeInTheDocument();

      // Avançar para página 2
      const nextBtn = screen.getByTestId("sla-devices-pagination-next");
      await user.click(nextBtn);

      expect(screen.getByText("DEVICE-CORE-06")).toBeInTheDocument();
      expect(screen.queryByText("DEVICE-CORE-01")).not.toBeInTheDocument();

      // Testar busca
      const searchInput = screen.getByTestId("sla-device-search-input");
      await user.type(searchInput, "CORE-12");
      expect(screen.getByText("DEVICE-CORE-12")).toBeInTheDocument();
      expect(screen.queryByText("DEVICE-CORE-06")).not.toBeInTheDocument();
    });

    it("deve permitir alterar o período de apuração temporal de SLA", async () => {
      const user = userEvent.setup();
      (slaApi.getSlaOverview as Mock).mockResolvedValue(mockSlaOverviewBancoSol);
      (slaApi.getSlaDeviceBreakdown as Mock).mockResolvedValue(mockSlaDeviceBreakdown);

      renderWithProviders(<SlaReportsPage />);

      await waitFor(() => {
        expect(screen.getByLabelText(/selecionar período de apuração/i)).toBeInTheDocument();
      });

      const periodSelect = screen.getByLabelText(/selecionar período de apuração/i);
      await user.selectOptions(periodSelect, "last_7d");
      expect(periodSelect).toHaveValue("last_7d");
    });

    it("deve disparar a exportação do relatório executivo NOC em PDF na visão de dispositivos", async () => {
      const user = userEvent.setup();
      (slaApi.getSlaOverview as Mock).mockResolvedValue(mockSlaOverviewBancoSol);
      (slaApi.getSlaDeviceBreakdown as Mock).mockResolvedValue(mockSlaDeviceBreakdown);
      (slaApi.getSlaReportDetails as Mock).mockResolvedValue({
        organizationId: "org-1",
        organizationName: "Banco Sol S.A.",
        periodLabel: "Nov/2026",
        startPeriod: "2026-11-01",
        endPeriod: "2026-11-30",
        uptimeNetPct: 99.85,
        uptimeGrossPct: 99.9,
        slaTargetPct: 99.5,
        slaMet: true,
        mttrMinutes: 5.2,
        mtbfHours: 720,
        totalDevices: 3,
        unplannedDowntimeMinutes: 14,
        exemptedDowntimeMinutes: 60,
        devices: [],
        digitalSignature: "SHA256:test-signature-noc",
      });

      const exportSpy = vi.spyOn(pdfExportService, "exportNocSlaReportPdf").mockResolvedValue(true);

      renderWithProviders(<SlaReportsPage />);

      await waitFor(() => {
        expect(screen.getByText("Gerar Relatório Executivo PDF")).toBeInTheDocument();
      });

      const generatePdfBtn = screen.getByText("Gerar Relatório Executivo PDF");
      await user.click(generatePdfBtn);

      await waitFor(() => {
        expect(exportSpy).toHaveBeenCalledWith(
          expect.objectContaining({
            viewMode: "devices",
            tenantName: mockSlaOverviewBancoSol.tenantName,
            selectedPeriod: "last_30d",
          })
        );
      });
    });
  });

  describe("Acessibilidade (WCAG AA)", () => {
    it("deve ter roles semânticas de main nas páginas", async () => {
      (slaApi.listMaintenanceWindows as Mock).mockResolvedValue(mockMaintenanceWindows);
      (slaApi.getMaintenanceKpiSummary as Mock).mockResolvedValue(mockMaintenanceKpiSummary);

      renderWithProviders(<MaintenanceWindowsPage />);

      await waitFor(() => {
        expect(screen.getByRole("main")).toBeInTheDocument();
      });
    });
  });
});
