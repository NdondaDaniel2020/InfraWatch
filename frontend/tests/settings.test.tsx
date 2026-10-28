import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { SystemSettingsPage } from "../src/pages/settings/SystemSettingsPage";
import { settingsApi } from "../src/services/settingsApi";
import type { IntegrationStatusResponse } from "../src/types/settings";

const mockStatus: IntegrationStatusResponse = {
  integrations: [
    {
      name: "glpi",
      enabled: true,
      endpoint: "https://glpi.rcsangola.co.ao/apirest.php",
      configured: true,
      details: {
        app_token_configured: true,
        user_token_configured: true,
      },
    },
    {
      name: "zabbix",
      enabled: true,
      endpoint: "http://zabbix:8080/api_jsonrpc.php",
      configured: true,
      details: {
        api_token_configured: true,
        user: "Admin",
      },
    },
    {
      name: "telegram",
      enabled: true,
      endpoint: "api.telegram.org",
      configured: true,
      details: {},
    },
    {
      name: "postgres",
      enabled: true,
      endpoint: "postgres:5432",
      configured: true,
      details: { database: "infrawatch", pool_size: 20 },
    },
    {
      name: "redis",
      enabled: true,
      endpoint: "redis:6379",
      configured: true,
      details: { db: 0 },
    },
  ],
  environment: "production",
};

vi.mock("../src/services/settingsApi", () => ({
  settingsApi: {
    getStatus: vi.fn(),
    testGlpi: vi.fn(),
    testZabbix: vi.fn(),
    testNotification: vi.fn(),
    testInfra: vi.fn(),
  },
}));

describe("Central de Configurações do Sistema (Issue #268)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(settingsApi.getStatus).mockResolvedValue(mockStatus);
  });

  it("renderiza a Central de Configurações com título, abas e status de integrações", async () => {
    render(
      <MemoryRouter>
        <SystemSettingsPage />
      </MemoryRouter>
    );

    expect(screen.getByText("Consultando estado das integrações em memória...")).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText("Central de Configurações do Sistema")).toBeInTheDocument();
    });

    expect(screen.getByText("GLPI ITSM")).toBeInTheDocument();
    expect(screen.getByText("Zabbix Server")).toBeInTheDocument();
    expect(screen.getByText("Notificações")).toBeInTheDocument();
    expect(screen.getByText("Infra & Cluster")).toBeInTheDocument();
  });

  it("executa teste in-process de GLPI ao clicar no botão correspondente", async () => {
    vi.mocked(settingsApi.testGlpi).mockResolvedValue({
      success: true,
      latency_ms: 15.4,
      message: "Integração GLPI validada: sessão iniciada, ticket criado e encerrado.",
      session_token_obtained: true,
      ticket_id: 1042,
    });

    render(
      <MemoryRouter>
        <SystemSettingsPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText("Testar Conexão In-Process")).toBeInTheDocument();
    });

    const testBtn = screen.getByText("Testar Conexão In-Process");
    fireEvent.click(testBtn);

    await waitFor(() => {
      expect(screen.getByText("Integração GLPI validada: sessão iniciada, ticket criado e encerrado.")).toBeInTheDocument();
      expect(screen.getByText("#1042")).toBeInTheDocument();
      expect(screen.getByText("15.4 ms")).toBeInTheDocument();
    });

    expect(settingsApi.testGlpi).toHaveBeenCalled();
  });

  it("permite navegar para a aba Zabbix e disparar teste JSON-RPC", async () => {
    vi.mocked(settingsApi.testZabbix).mockResolvedValue({
      success: true,
      latency_ms: 12.8,
      message: "Conexão com Zabbix Server v7.0.0 validada com sucesso.",
      api_version: "7.0.0",
      hosts_count: 54,
    });

    render(
      <MemoryRouter>
        <SystemSettingsPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText("Zabbix Server")).toBeInTheDocument();
    });

    const zabbixTab = screen.getByRole("button", { name: /Zabbix Server/i });
    fireEvent.click(zabbixTab);

    await waitFor(() => {
      expect(screen.getByText("Zabbix Server (SNMP / Agent Telemetry & JSON-RPC)")).toBeInTheDocument();
    });

    const testBtn = screen.getByText("Testar Conexão In-Process");
    fireEvent.click(testBtn);

    await waitFor(() => {
      expect(screen.getByText("Conexão com Zabbix Server v7.0.0 validada com sucesso.")).toBeInTheDocument();
      expect(screen.getByText("7.0.0")).toBeInTheDocument();
      expect(screen.getByText("54")).toBeInTheDocument();
    });

    expect(settingsApi.testZabbix).toHaveBeenCalled();
  });

  it("permite testar disparo de alerta em canal de Notificação", async () => {
    vi.mocked(settingsApi.testNotification).mockResolvedValue({
      success: true,
      channel: "telegram",
      latency_ms: 38.2,
      message: "Alerta de teste entregue via TELEGRAM com sucesso!",
    });

    render(
      <MemoryRouter>
        <SystemSettingsPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText("Notificações")).toBeInTheDocument();
    });

    const notifTab = screen.getByRole("button", { name: /Notificações/i });
    fireEvent.click(notifTab);

    await waitFor(() => {
      expect(screen.getByText("Disparador de Alerta Sintético de Teste")).toBeInTheDocument();
    });

    const sendBtn = screen.getByText("Disparar Teste via TELEGRAM");
    fireEvent.click(sendBtn);

    await waitFor(() => {
      expect(screen.getByText("Alerta de teste entregue via TELEGRAM com sucesso!")).toBeInTheDocument();
      expect(screen.getByText("38.2 ms")).toBeInTheDocument();
    });

    expect(settingsApi.testNotification).toHaveBeenCalledWith({
      channel: "telegram",
      recipient: undefined,
      severity: "CRITICAL",
    });
  });

  it("permite verificar conectividade e latência do Cluster (TimescaleDB e Redis)", async () => {
    vi.mocked(settingsApi.testInfra).mockResolvedValue({
      postgres_ok: true,
      postgres_latency_ms: 1.85,
      redis_ok: true,
      redis_latency_ms: 0.92,
      message: "Cluster de infraestrutura 100% operacional (PostgreSQL e Redis conectados).",
    });

    render(
      <MemoryRouter>
        <SystemSettingsPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText("Infra & Cluster")).toBeInTheDocument();
    });

    const clusterTab = screen.getByRole("button", { name: /Infra & Cluster/i });
    fireEvent.click(clusterTab);

    await waitFor(() => {
      expect(screen.getByText("Verificar Saúde do Cluster")).toBeInTheDocument();
    });

    const checkBtn = screen.getByText("Verificar Saúde do Cluster");
    fireEvent.click(checkBtn);

    await waitFor(() => {
      expect(screen.getByText("Cluster de infraestrutura 100% operacional (PostgreSQL e Redis conectados).")).toBeInTheDocument();
      expect(screen.getByText("1.85 ms")).toBeInTheDocument();
      expect(screen.getByText("0.92 ms")).toBeInTheDocument();
    });

    expect(settingsApi.testInfra).toHaveBeenCalled();
  });
});
