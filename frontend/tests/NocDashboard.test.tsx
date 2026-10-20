import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { BrowserRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { NocDashboardPage } from "../src/pages/noc/NocDashboardPage";
import { TelemetryProvider } from "../src/context/TelemetryContext";

// Helper para renderizar com todos os providers necessários
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
      <TelemetryProvider enabled={false}>
        <BrowserRouter>{ui}</BrowserRouter>
      </TelemetryProvider>
    </QueryClientProvider>
  );
};

describe("NOC Cockpit Dashboard — Telas Mockups & Obsidian Telemetry (Issue #29)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("1. Renderização Inicial e KPIs de Alto Impacto", () => {
    it("deve renderizar o container principal do cockpit noc", () => {
      renderWithProviders(<NocDashboardPage />);

      expect(screen.getByTestId("noc-dashboard-page")).toBeInTheDocument();
    });

    it("deve renderizar os 4 cards de KPI com os valores canônicos do mockup", () => {
      renderWithProviders(<NocDashboardPage />);

      expect(screen.getByTestId("kpi-uptime")).toBeInTheDocument();
      expect(screen.getByText("99.98%")).toBeInTheDocument();

      expect(screen.getByTestId("kpi-mttr")).toBeInTheDocument();
      expect(screen.getByText("18m 42s")).toBeInTheDocument();

      expect(screen.getByTestId("kpi-throughput")).toBeInTheDocument();
      expect(screen.getByText("98.2")).toBeInTheDocument();

      const kpiAlarms = screen.getByTestId("kpi-alarms");
      expect(kpiAlarms).toBeInTheDocument();
      expect(kpiAlarms).toHaveTextContent(/CRIT/i);
    });

    it("deve exibir o gráfico de histograma de tráfego agregado 24h e o feed de incidentes", () => {
      renderWithProviders(<NocDashboardPage />);

      expect(screen.getByTestId("traffic-histogram-card")).toBeInTheDocument();
      expect(screen.getByText(/Throughput de Tráfego Agregado/i)).toBeInTheDocument();
      expect(screen.getByTestId("incident-feed-card")).toBeInTheDocument();
      expect(screen.getByText("Fibra Rompida — RT-BENGUELA")).toBeInTheDocument();
    });
  });

  describe("2. Grade de Dispositivos e Filtros Operacionais", () => {
    it("deve renderizar os cartões de dispositivos monitorados com nomes e IPs", () => {
      renderWithProviders(<NocDashboardPage />);

      expect(screen.getByText("SW-CORE-LUANDA-01")).toBeInTheDocument();
      expect(screen.getByText("RT-BRANCH-BENGUELA")).toBeInTheDocument();
      expect(screen.getByText("API-GATEWAY-PROD")).toBeInTheDocument();
      expect(screen.getByText("10.0.1.1")).toBeInTheDocument();
    });

    it("deve filtrar dispositivos por severidade crítica ao clicar no botão 'Críticos'", async () => {
      renderWithProviders(<NocDashboardPage />);

      const criticalBtn = screen.getByTestId("filter-critical-btn");
      fireEvent.click(criticalBtn);

      // Deve manter RT-BRANCH-BENGUELA e ocultar SW-CORE-LUANDA-01
      expect(screen.getByText("RT-BRANCH-BENGUELA")).toBeInTheDocument();
      expect(screen.queryByText("SW-CORE-LUANDA-01")).not.toBeInTheDocument();

      // Ao clicar em 'Todos', restaura a listagem completa
      const allBtn = screen.getByTestId("filter-all-btn");
      fireEvent.click(allBtn);
      expect(screen.getByText("SW-CORE-LUANDA-01")).toBeInTheDocument();
    });

    it("deve filtrar dispositivos por organização/tenant", async () => {
      renderWithProviders(<NocDashboardPage />);

      const tenantSelect = screen.getByTestId("tenant-filter-select");
      fireEvent.change(tenantSelect, { target: { value: "bancosol" } });

      // Deve exibir apenas o API-GATEWAY-PROD da organização Banco Sol
      expect(screen.getByText("API-GATEWAY-PROD")).toBeInTheDocument();
      expect(screen.queryByText("SW-CORE-LUANDA-01")).not.toBeInTheDocument();
    });
  });

  describe("3. Busca Global (Ctrl + K) e Gaveta de Detalhes", () => {
    it("deve abrir o modal de busca global ao clicar no gatilho de pesquisa", () => {
      renderWithProviders(<NocDashboardPage />);

      expect(screen.queryByTestId("global-search-modal-container")).not.toBeInTheDocument();

      const searchTrigger = screen.getByTestId("global-search-trigger");
      fireEvent.click(searchTrigger);

      expect(screen.getByTestId("global-search-modal-container")).toBeInTheDocument();
      expect(screen.getByPlaceholderText(/Buscar ativos, IPs, chamados GLPI/i)).toBeInTheDocument();
    });

    it("deve abrir o modal de busca global ao pressionar o atalho de teclado Ctrl+K", () => {
      renderWithProviders(<NocDashboardPage />);

      expect(screen.queryByTestId("global-search-modal-container")).not.toBeInTheDocument();

      fireEvent.keyDown(window, { key: "k", ctrlKey: true });

      expect(screen.getByTestId("global-search-modal-container")).toBeInTheDocument();

      // Fecha ao pressionar ESC
      fireEvent.keyDown(window, { key: "Escape" });
      expect(screen.queryByTestId("global-search-modal-container")).not.toBeInTheDocument();
    });

    it("deve abrir a gaveta lateral (Drawer) ao clicar no nome de um dispositivo", async () => {
      renderWithProviders(<NocDashboardPage />);

      expect(screen.queryByTestId("device-detail-drawer-content")).not.toBeInTheDocument();

      const deviceBtn = screen.getByText("SW-CORE-LUANDA-01");
      fireEvent.click(deviceBtn);

      expect(screen.getByTestId("device-detail-drawer-content")).toBeInTheDocument();
      expect(screen.getByText("Histórico de Disponibilidade Operacional")).toBeInTheDocument();

      // Fecha a gaveta com a tecla Escape
      fireEvent.keyDown(window, { key: "Escape" });
      await waitFor(() => {
        expect(screen.queryByTestId("device-detail-drawer-content")).not.toBeInTheDocument();
      });
    });
  });

  describe("4. Estados Alternativos da Esteira ai-mockup-rectifier", () => {
    it("deve alternar para o estado Skeleton ao selecionar no simulador", () => {
      renderWithProviders(<NocDashboardPage />);

      const stateSelect = screen.getByTestId("state-simulator-select");
      fireEvent.change(stateSelect, { target: { value: "skeleton" } });

      expect(screen.getByTestId("state-skeleton-overlay")).toBeInTheDocument();
    });

    it("deve alternar para o estado Empty e permitir retornar ao modo nominal", () => {
      renderWithProviders(<NocDashboardPage />);

      const stateSelect = screen.getByTestId("state-simulator-select");
      fireEvent.change(stateSelect, { target: { value: "empty" } });

      expect(screen.getByTestId("state-empty-overlay")).toBeInTheDocument();
      expect(screen.getByText("Todos os Ativos Operacionais")).toBeInTheDocument();

      const returnBtn = screen.getByText("Voltar ao Modo Nominal");
      fireEvent.click(returnBtn);
      expect(screen.queryByTestId("state-empty-overlay")).not.toBeInTheDocument();
    });

    it("deve alternar para o estado Error e exibir botão de reconexão", () => {
      renderWithProviders(<NocDashboardPage />);

      const stateSelect = screen.getByTestId("state-simulator-select");
      fireEvent.change(stateSelect, { target: { value: "error" } });

      expect(screen.getByTestId("state-error-overlay")).toBeInTheDocument();
      expect(screen.getByText("Falha no Streaming de Telemetria (SSE)")).toBeInTheDocument();

      const reconnectBtn = screen.getByText("Reconectar Ingestão");
      fireEvent.click(reconnectBtn);
      expect(screen.queryByTestId("state-error-overlay")).not.toBeInTheDocument();
    });
  });

  describe("5. Ações Operacionais e Notificações Toast", () => {
    it("deve acionar o comando 'Ping Agora' e exibir toast de sucesso", async () => {
      renderWithProviders(<NocDashboardPage />);

      const pingButtons = screen.getAllByText("Ping Agora");
      fireEvent.click(pingButtons[0]);

      expect(screen.getByTestId("toast-notification")).toBeInTheDocument();
      expect(screen.getByText(/Sonda ICMP executada para/i)).toBeInTheDocument();
    });

    it("deve abrir o modal de Emergency Drain e permitir cancelar", () => {
      renderWithProviders(<NocDashboardPage />);

      expect(screen.queryByTestId("emergency-drain-modal")).not.toBeInTheDocument();

      const drainBtn = screen.getByTestId("emergency-drain-btn");
      fireEvent.click(drainBtn);

      expect(screen.getByTestId("emergency-drain-modal")).toBeInTheDocument();
      expect(screen.getByText("Protocolo Emergency Drain")).toBeInTheDocument();

      const cancelBtn = screen.getByText("Cancelar");
      fireEvent.click(cancelBtn);

      expect(screen.queryByTestId("emergency-drain-modal")).not.toBeInTheDocument();
    });
  });
});
