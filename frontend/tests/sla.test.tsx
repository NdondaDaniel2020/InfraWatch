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
import {
  mockMaintenanceWindows,
  mockMaintenanceKpiSummary,
  mockSlaOverviewBancoSol,
  mockSlaOverviewUnitel,
  mockSlaDeviceBreakdown,
} from "../src/mocks/slaMocks";

vi.mock("../src/services/slaApi", () => ({
  slaApi: {
    listMaintenanceWindows: vi.fn(),
    getMaintenanceKpiSummary: vi.fn(),
    createMaintenanceWindow: vi.fn(),
    approveMaintenanceWindow: vi.fn(),
    getSlaOverview: vi.fn(),
    getSlaDeviceBreakdown: vi.fn(),
    exportSlaReport: vi.fn(),
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

      const openModalBtn = screen.getByRole("button", { name: /\+ agendar nova parada técnica/i });
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

    it("deve exibir estado skeleton e estado vazio", async () => {
      const user = userEvent.setup();
      (slaApi.listMaintenanceWindows as Mock).mockResolvedValue([]);
      (slaApi.getMaintenanceKpiSummary as Mock).mockResolvedValue(mockMaintenanceKpiSummary);

      renderWithProviders(<MaintenanceWindowsPage />);

      await waitFor(() => {
        expect(screen.getByTestId("maint-empty-container")).toBeInTheDocument();
      });

      // Alternar manualmente para skeleton
      const skeletonBtn = screen.getByRole("button", { name: "skeleton" });
      await user.click(skeletonBtn);
      expect(screen.getByTestId("maint-skeleton-container")).toBeInTheDocument();
    });
  });

  describe("Painel de Relatórios Analíticos de SLA (/sla)", () => {
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
      await user.selectOptions(selectTenant, "unitel");

      await waitFor(() => {
        expect(slaApi.getSlaOverview).toHaveBeenCalledWith("unitel");
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

    it("deve ter tabela detalhada de ativos com conformidade de SLA", async () => {
      (slaApi.getSlaOverview as Mock).mockResolvedValue(mockSlaOverviewBancoSol);
      (slaApi.getSlaDeviceBreakdown as Mock).mockResolvedValue(mockSlaDeviceBreakdown);

      renderWithProviders(<SlaReportsPage />);

      await waitFor(() => {
        expect(screen.getByTestId("sla-device-breakdown-table")).toBeInTheDocument();
        expect(screen.getAllByText("SW-CORE-LUANDA-01").length).toBeGreaterThanOrEqual(1);
        expect(screen.getAllByText("CONFORME").length).toBeGreaterThanOrEqual(1);
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
