import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { BrowserRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { ClientPortalPage } from "../src/pages/client/ClientPortalPage";
import { pdfExportService } from "../src/services/pdfExportService";
import { clientPortalApi } from "../src/services/clientPortalApi";
import type {
  ClientSlaSummary,
  ClientServiceItem,
  OrganizationSlaReportDetails,
  SlaMonthlyHistoryItem,
} from "../src/types/clientPortal";

vi.mock("../src/context/AuthContext", () => ({
  useAuth: () => ({
    user: {
      id: "user-1",
      email: "cliente@bancosol.ao",
      name: "Cliente Banco Sol",
      role: "CLIENT_VIEWER",
      organization_id: "org-banco-sol",
      organization_name: "Banco Sol S.A.",
    },
    isAuthenticated: true,
    isLoading: false,
  }),
}));

vi.mock("../src/services/clientPortalApi", () => ({
  clientPortalApi: {
    getSlaSummary: vi.fn(),
    getClientServices: vi.fn(),
    getSlaHistory: vi.fn(),
    getSlaReport: vi.fn(),
    openSupportTicket: vi.fn(),
  },
}));

const mockedApi = vi.mocked(clientPortalApi, true);

const summaryFixture: ClientSlaSummary = {
  tenantId: "org-banco-sol",
  tenantName: "Banco Sol S.A.",
  uptimeCurrentMonthPct: 99.92,
  slaTargetPct: 99.5,
  downtimeBalanceFormatted: "3h 27m",
  mttrMinutesAvg: 4.2,
  nextMaintenanceWindow: "15/11 02:00-04:00",
  cycleMonthLabel: "Ciclo Nov/2026",
};

const servicesFixture: ClientServiceItem[] = [
  {
    id: "svc-1",
    name: "Internet Banking Web",
    category: "Aplicação",
    status: "UP",
    statusLabel: "Nominal",
    responseTimeMs: 18,
    throughputFormatted: "1.2 Gbps",
    successRatePct: 99.99,
    tags: ["HTTPS"],
    stability30DaysPct: 99.98,
  },
  {
    id: "svc-2",
    name: "Mobile Banking API",
    category: "API",
    status: "UP",
    statusLabel: "Nominal",
    tags: ["REST"],
  },
  {
    id: "svc-3",
    name: "Rede Agências Luanda",
    category: "WAN",
    status: "DEG",
    statusLabel: "Degradação",
    responseTimeMs: 54,
    tags: ["MPLS"],
    advisoryAlert: "Equipe NOC atuando na otimização de enlace secundário.",
  },
  {
    id: "svc-4",
    name: "Quiosques & ATMs",
    category: "Rede",
    status: "UP",
    statusLabel: "Nominal",
    tags: ["VPN"],
  },
];

const historyFixture: SlaMonthlyHistoryItem[] = [
  {
    cycleLabel: "Out/2026",
    month: "Out",
    uptimePct: 99.95,
    targetPct: 99.5,
    mttrMinutes: 4,
    incidentsCount: 1,
    unplannedDowntimeMinutes: 10,
    exemptedDowntimeMinutes: 30,
    status: "CONFORME",
  },
];

const reportFixture: OrganizationSlaReportDetails = {
  organizationId: "org-banco-sol",
  organizationName: "Banco Sol S.A.",
  periodLabel: "Nov/2026",
  startPeriod: "2026-11-01",
  endPeriod: "2026-11-30",
  uptimeNetPct: 99.92,
  uptimeGrossPct: 99.95,
  slaTargetPct: 99.5,
  slaMet: true,
  mttrMinutes: 4.2,
  mtbfHours: 720,
  totalDevices: 4,
  unplannedDowntimeMinutes: 30,
  exemptedDowntimeMinutes: 120,
  devices: [],
  digitalSignature: "SHA256:relatorio-oficial-assinado",
};

const renderWithProviders = (ui: React.ReactElement) => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>{ui}</BrowserRouter>
    </QueryClientProvider>
  );
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("Portal do Cliente Sanitizado & Relatórios de SLA (Issue #31)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedApi.getSlaSummary.mockResolvedValue(summaryFixture);
    mockedApi.getClientServices.mockResolvedValue(servicesFixture);
    mockedApi.getSlaHistory.mockResolvedValue(historyFixture);
    mockedApi.getSlaReport.mockResolvedValue(reportFixture);
    mockedApi.openSupportTicket.mockResolvedValue({
      ticketId: "ticket-1",
      protocol: "INFRA-20261101-0001",
      title: "Lentidão",
      severity: "MEDIUM",
      status: "OPEN",
      createdAt: "2026-11-01T10:00:00Z",
      glpiTicketId: 9001,
      message: "Chamado registrado no GLPI.",
    });
  });

  describe("1. Identidade Institucional e Dados Reais", () => {
    it("deve renderizar o container principal com a organização do usuário autenticado", async () => {
      renderWithProviders(<ClientPortalPage />);

      expect(screen.getByTestId("client-portal-page")).toBeInTheDocument();
      expect(await screen.findByText("Banco Sol S.A.")).toBeInTheDocument();
      expect(screen.getByTestId("client-role-badge")).toHaveTextContent(
        "Client Viewer (Read-Only)"
      );
    });

    it("deve exibir os KPIs devolvidos pelo backend no banner executivo", async () => {
      renderWithProviders(<ClientPortalPage />);

      expect(await screen.findByTestId("sla-banner")).toBeInTheDocument();
      expect(screen.getByText("99.92%")).toBeInTheDocument();
      expect(screen.getByText(/Meta Acordada: 99.50%/i)).toBeInTheDocument();
      expect(screen.getByText("3h 27m")).toBeInTheDocument();
      expect(screen.getByText("4.2 min")).toBeInTheDocument();
    });
  });

  describe("2. Segurança & Sanitização de Dados (ADR-009 / ADR-012)", () => {
    it("NUNCA deve exibir IPs de gerência interna (10.x.x.x) na interface do cliente", async () => {
      renderWithProviders(<ClientPortalPage />);

      await screen.findByTestId("sla-banner");

      const ipRegex = /\b10\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/;
      expect(screen.queryByText(ipRegex)).not.toBeInTheDocument();
    });

    it("deve manter a interface executiva sem expor tabelas internas de endpoints", async () => {
      renderWithProviders(<ClientPortalPage />);

      await screen.findByTestId("sla-banner");

      expect(screen.getByTestId("sanitized-services-grid")).toBeInTheDocument();
      expect(screen.queryByTestId("sanitized-endpoints-table")).not.toBeInTheDocument();
      expect(screen.queryByTestId("sla-audit-redirect-card")).not.toBeInTheDocument();
    });
  });

  describe("3. Grid de Serviços Críticos Contratados", () => {
    it("deve listar exatamente os serviços devolvidos pela API", async () => {
      renderWithProviders(<ClientPortalPage />);

      expect(await screen.findByText("Internet Banking Web")).toBeInTheDocument();
      expect(screen.getByText("Mobile Banking API")).toBeInTheDocument();
      expect(screen.getByText("Rede Agências Luanda")).toBeInTheDocument();
      expect(screen.getByText("Quiosques & ATMs")).toBeInTheDocument();
    });

    it("deve mostrar N/D quando o backend não fornece métricas de latência e estabilidade", async () => {
      renderWithProviders(<ClientPortalPage />);

      const mobileCard = await screen.findByTestId("service-card-svc-2");
      expect(mobileCard).toHaveTextContent("Tempo de Resposta");
      expect(mobileCard).toHaveTextContent("N/D");
      expect(mobileCard).not.toHaveTextContent("20 ms");
    });
  });

  describe("4. Exportação de Relatório Executivo em PDF", () => {
    it("deve buscar o relatório oficial e exportar o PDF apenas com dados reais", async () => {
      const exportSpy = vi.spyOn(pdfExportService, "exportSlaPdf").mockResolvedValue(true);

      renderWithProviders(<ClientPortalPage />);

      const downloadBtn = await screen.findByTestId("download-pdf-btn");
      fireEvent.click(downloadBtn);

      await waitFor(() => {
        expect(mockedApi.getSlaReport).toHaveBeenCalledWith("org-banco-sol");
        expect(exportSpy).toHaveBeenCalledWith(
          summaryFixture,
          servicesFixture,
          reportFixture
        );
      });

      expect(
        await screen.findByText(/Download do relatório oficial de SLA concluído/i)
      ).toBeInTheDocument();
    });

    it("não deve gerar PDF nem inventar assinatura quando o relatório oficial falha", async () => {
      mockedApi.getSlaReport.mockRejectedValue(
        new Error("Relatório oficial indisponível.")
      );
      const exportSpy = vi.spyOn(pdfExportService, "exportSlaPdf").mockResolvedValue(true);

      renderWithProviders(<ClientPortalPage />);

      const downloadBtn = await screen.findByTestId("download-pdf-btn");
      fireEvent.click(downloadBtn);

      expect(
        await screen.findByText(/Nenhum documento foi gerado/i)
      ).toBeInTheDocument();
      expect(exportSpy).not.toHaveBeenCalled();
    });
  });

  describe("5. Resiliência dos Estados Canônicos da Interface", () => {
    it("deve renderizar o estado Skeleton enquanto as queries estão pendentes", async () => {
      const summaryDeferred = deferred<ClientSlaSummary>();
      const servicesDeferred = deferred<ClientServiceItem[]>();
      mockedApi.getSlaSummary.mockReturnValue(summaryDeferred.promise);
      mockedApi.getClientServices.mockReturnValue(servicesDeferred.promise);

      renderWithProviders(<ClientPortalPage />);

      expect(screen.getByTestId("state-skeleton-overlay")).toBeInTheDocument();

      summaryDeferred.resolve(summaryFixture);
      servicesDeferred.resolve(servicesFixture);

      expect(await screen.findByTestId("sla-banner")).toBeInTheDocument();
      expect(screen.queryByTestId("state-skeleton-overlay")).not.toBeInTheDocument();
    });

    it("deve renderizar o estado Empty quando a API não devolve serviços", async () => {
      mockedApi.getClientServices.mockResolvedValue([]);

      renderWithProviders(<ClientPortalPage />);

      expect(await screen.findByTestId("state-empty-overlay")).toBeInTheDocument();
      expect(
        screen.getByText("Nenhum Serviço Corporativo Vinculado")
      ).toBeInTheDocument();
      expect(screen.getByText("Atualizar Dados")).toBeInTheDocument();
    });

    it("deve renderizar o estado Error e recuperar após retry com dados reais", async () => {
      mockedApi.getSlaSummary.mockRejectedValueOnce(new Error("backend down"));
      mockedApi.getClientServices.mockRejectedValueOnce(new Error("backend down"));

      renderWithProviders(<ClientPortalPage />);

      expect(await screen.findByTestId("state-error-overlay")).toBeInTheDocument();
      expect(
        screen.getByText("Falha na Sincronização de Telemetria")
      ).toBeInTheDocument();

      mockedApi.getSlaSummary.mockResolvedValue(summaryFixture);
      mockedApi.getClientServices.mockResolvedValue(servicesFixture);

      fireEvent.click(screen.getByText("Tentar Novamente"));

      expect(await screen.findByTestId("sla-banner")).toBeInTheDocument();
      expect(screen.queryByTestId("state-error-overlay")).not.toBeInTheDocument();
    });
  });

  describe("6. Abertura de Chamado sem Ticket Fictício", () => {
    it("deve exibir erro real quando a API de suporte falha, sem criar protocolo falso", async () => {
      mockedApi.openSupportTicket.mockRejectedValue(
        new Error("Falha de comunicação com o GLPI.")
      );

      renderWithProviders(<ClientPortalPage />);

      await screen.findByTestId("sla-banner");
      fireEvent.click(screen.getByTestId("priority-support-btn"));

      fireEvent.change(screen.getByTestId("ticket-title-input"), {
        target: { value: "Lentidão no Internet Banking" },
      });
      fireEvent.change(screen.getByTestId("ticket-description-input"), {
        target: { value: "Latência elevada desde as 10h." },
      });
      fireEvent.click(screen.getByTestId("ticket-submit-btn"));

      expect(
        await screen.findByText("Falha de comunicação com o GLPI.")
      ).toBeInTheDocument();
      expect(screen.queryByTestId("ticket-created-success")).not.toBeInTheDocument();
    });
  });

  describe("7. Histórico de SLA", () => {
    it("deve mostrar erro no modal de histórico quando a API falha", async () => {
      mockedApi.getSlaHistory.mockRejectedValue(
        new Error("Histórico indisponível no backend.")
      );

      renderWithProviders(<ClientPortalPage />);

      await screen.findByTestId("sla-banner");
      fireEvent.click(screen.getByTestId("history-sla-btn"));

      expect(await screen.findByTestId("sla-history-modal")).toBeInTheDocument();
      expect(
        (await screen.findAllByText("Histórico indisponível no backend.")).length
      ).toBeGreaterThan(0);
    });
  });
});
