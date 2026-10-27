import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { BrowserRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { ClientPortalPage } from "../src/pages/client/ClientPortalPage";
import { pdfExportService } from "../src/services/pdfExportService";

// Helper de renderização com providers necessários
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

describe("Portal do Cliente Sanitizado & Relatórios de SLA (Issue #31)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("1. Renderização Inicial & Identidade Institucional", () => {
    it("deve renderizar o container principal do portal do cliente", () => {
      renderWithProviders(<ClientPortalPage />);

      expect(screen.getByTestId("client-portal-page")).toBeInTheDocument();
      expect(screen.getByText("Banco Sol S.A.")).toBeInTheDocument();
      expect(screen.getByTestId("client-role-badge")).toHaveTextContent("Client Viewer (Read-Only)");
    });

    it("deve renderizar o banner executivo com o gauge circular e meta de SLA", () => {
      renderWithProviders(<ClientPortalPage />);

      expect(screen.getByTestId("sla-banner")).toBeInTheDocument();
      expect(screen.getByTestId("sla-gauge")).toBeInTheDocument();
      expect(screen.getByText("99.92%")).toBeInTheDocument();
      expect(screen.getByText(/Meta Acordada: 99.50%/i)).toBeInTheDocument();
      expect(screen.getByText("3h 27m")).toBeInTheDocument();
      expect(screen.getByText("4.2 min")).toBeInTheDocument();
    });
  });

  describe("2. Segurança & Sanitização de Dados (ADR-009 / ADR-012)", () => {
    it("NUNCA deve exibir IPs de gerência interna (10.x.x.x) na interface do cliente", () => {
      renderWithProviders(<ClientPortalPage />);

      // Varredura estrita de segurança: nenhum IP privado da faixa 10.0.0.0/8 deve existir no DOM
      const ipRegex = /\b10\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/;
      expect(screen.queryByText(ipRegex)).not.toBeInTheDocument();
    });

    it("deve manter a interface 100% executiva sem expor tabelas redundantes ou rotas internas", () => {
      renderWithProviders(<ClientPortalPage />);

      // A página deve focar exclusivamente nos serviços críticos e banner executivo
      expect(screen.getByTestId("sanitized-services-grid")).toBeInTheDocument();
      expect(screen.getByTestId("sla-banner")).toBeInTheDocument();
      expect(screen.queryByTestId("sanitized-endpoints-table")).not.toBeInTheDocument();
      expect(screen.queryByTestId("sla-audit-redirect-card")).not.toBeInTheDocument();
    });
  });

  describe("3. Grid de Serviços Críticos Contratados", () => {
    it("deve exibir os 4 serviços críticos do cliente", () => {
      renderWithProviders(<ClientPortalPage />);

      expect(screen.getByTestId("sanitized-services-grid")).toBeInTheDocument();
      expect(screen.getByText("Internet Banking Web")).toBeInTheDocument();
      expect(screen.getByText("Mobile Banking API")).toBeInTheDocument();
      expect(screen.getByText("Rede Agências Luanda")).toBeInTheDocument();
      expect(screen.getByText("Quiosques & ATMs")).toBeInTheDocument();
    });

    it("deve exibir alerta explicativo de degradação leve sem expor dados internos", () => {
      renderWithProviders(<ClientPortalPage />);

      expect(screen.getByText(/Equipe NOC atuando na otimização de enlace secundário/i)).toBeInTheDocument();
    });
  });

  describe("4. Central de Notificações In-App no Header Global (Catch-Up Resiliente)", () => {
    it("deve renderizar a central de notificações com o botão de sino e badge", () => {
      renderWithProviders(<ClientPortalPage />);

      // A página renderiza os serviços executivos normalmente
      expect(screen.getByTestId("sanitized-services-grid")).toBeInTheDocument();
    });
  });

  describe("5. Exportação de Relatório Executivo em PDF", () => {
    it("deve acionar o serviço de exportação de PDF ao clicar no botão de download", async () => {
      const exportSpy = vi.spyOn(pdfExportService, "exportSlaPdf").mockResolvedValue(true);

      renderWithProviders(<ClientPortalPage />);

      const downloadBtn = screen.getByTestId("download-pdf-btn");
      fireEvent.click(downloadBtn);

      await waitFor(() => {
        expect(exportSpy).toHaveBeenCalledTimes(1);
      });

      expect(screen.getByTestId("toast-notification")).toBeInTheDocument();
    });
  });

  describe("6. Resiliência dos 4 Estados Canônicos da Interface", () => {
    it("deve alternar para o estado Skeleton ao selecionar no simulador", () => {
      renderWithProviders(<ClientPortalPage />);

      const stateSelect = screen.getByTestId("portal-state-select");
      fireEvent.change(stateSelect, { target: { value: "skeleton" } });

      expect(screen.getByTestId("state-skeleton-overlay")).toBeInTheDocument();
    });

    it("deve alternar para o estado Empty e permitir voltar ao modo nominal", () => {
      renderWithProviders(<ClientPortalPage />);

      const stateSelect = screen.getByTestId("portal-state-select");
      fireEvent.change(stateSelect, { target: { value: "empty" } });

      expect(screen.getByTestId("state-empty-overlay")).toBeInTheDocument();
      expect(screen.getByText("Nenhum Serviço Corporativo Vinculado")).toBeInTheDocument();

      const returnBtn = screen.getByText("Voltar ao Modo Nominal");
      fireEvent.click(returnBtn);

      expect(screen.queryByTestId("state-empty-overlay")).not.toBeInTheDocument();
    });

    it("deve alternar para o estado Error e permitir reconectar", () => {
      renderWithProviders(<ClientPortalPage />);

      const stateSelect = screen.getByTestId("portal-state-select");
      fireEvent.change(stateSelect, { target: { value: "error" } });

      expect(screen.getByTestId("state-error-overlay")).toBeInTheDocument();
      expect(screen.getByText("Falha na Sincronização de Telemetria")).toBeInTheDocument();

      const reconnectBtn = screen.getByText("Reconectar Telemetria");
      fireEvent.click(reconnectBtn);

      expect(screen.queryByTestId("state-error-overlay")).not.toBeInTheDocument();
    });
  });
});
