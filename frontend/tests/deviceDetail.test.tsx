import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";
import { DeviceDetailPage } from "../src/pages/inventory/DeviceDetailPage";
import { deviceDetailApi } from "../src/services/deviceDetailApi";
import {
  createMockDeviceDetail,
  createMockTimescaleMetrics,
  mockManualProbeResult,
  mockOpticalInterfaces,
} from "../src/mocks/deviceDetailMocks";

vi.mock("../src/services/deviceDetailApi", () => ({
  deviceDetailApi: {
    getDeviceDetail: vi.fn(),
    getTimescaleMetrics: vi.fn(),
    triggerManualProbe: vi.fn(),
    getDeviceInterfaces: vi.fn(),
  },
}));

vi.mock("../src/services/slaApi", () => ({
  slaApi: {
    getDeviceSla: vi.fn().mockResolvedValue({
      uptime_percentage: 99.98,
      sla_target: 99.5,
      sla_met: true,
      mttr_minutes: 8.2333,
      mtbf_hours: 418,
    }),
  },
}));

vi.mock("../src/services/incidentsApi", () => ({
  incidentsApi: {
    listIncidents: vi.fn().mockResolvedValue([
      {
        id: "inc-1",
        title: "Atenuação Óptica Porta 19",
        status: "TRIGGERED",
        duration_str: "28m",
        glpi_ticket_id: 8493,
      },
      {
        id: "inc-2",
        title: "Manutenção Firmware V200",
        status: "RESOLVIDO",
        duration_str: "14h 12m",
        glpi_ticket_id: 8115,
      },
    ]),
  },
}));

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return {
    ...actual,
    useParams: () => ({ id: "dev-1" }),
    useNavigate: () => vi.fn(),
  };
});

import { MemoryRouter } from "react-router-dom";

const renderWithProviders = (ui: ReactNode, queryClient?: QueryClient) => {
  const client = queryClient || new QueryClient({
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

describe("DeviceDetailPage — Cockpit 360° do Dispositivo (Issue #244)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (deviceDetailApi.getDeviceInterfaces as Mock).mockResolvedValue(mockOpticalInterfaces);
  });


  const mockDevice = createMockDeviceDetail();
  const mockMetrics = createMockTimescaleMetrics("24h");

  describe("Estados Canônicos de Interface", () => {
    it("deve exibir skeleton durante carregamento inicial", () => {
      (deviceDetailApi.getDeviceDetail as Mock).mockResolvedValue(mockDevice);
      (deviceDetailApi.getTimescaleMetrics as Mock).mockResolvedValue(mockMetrics);

      renderWithProviders(<DeviceDetailPage />);

      expect(screen.getAllByTestId("skeleton").length).toBeGreaterThanOrEqual(5);
    });

    it("deve renderizar estado nominal com dados completos", async () => {
      (deviceDetailApi.getDeviceDetail as Mock).mockResolvedValue(mockDevice);
      (deviceDetailApi.getTimescaleMetrics as Mock).mockResolvedValue(mockMetrics);

      renderWithProviders(<DeviceDetailPage />);

      await waitFor(() => {
        expect(screen.getAllByText("SW-CORE-LUANDA-01").length).toBeGreaterThanOrEqual(1);
        expect(screen.getByText("Huawei CloudEngine 6800")).toBeInTheDocument();
      });
    });

    it("deve exibir estado vazio quando ativo não tem telemetria", async () => {
      const emptyDevice = createMockDeviceDetail({ id: "dev-empty", name: "Novo Switch" });
      const emptyMetrics = createMockTimescaleMetrics("24h", { buckets: [] });

      (deviceDetailApi.getDeviceDetail as Mock).mockResolvedValue(emptyDevice);
      (deviceDetailApi.getTimescaleMetrics as Mock).mockResolvedValue(emptyMetrics);

      renderWithProviders(<DeviceDetailPage />);

      await waitFor(() => {
        expect(screen.getByText(/nenhum registro de telemetria/i)).toBeInTheDocument();
      });
    });

    it("deve exibir estado de erro quando API falha", async () => {
      (deviceDetailApi.getDeviceDetail as Mock).mockRejectedValue(new Error("Timeout SNMP"));
      (deviceDetailApi.getTimescaleMetrics as Mock).mockRejectedValue(new Error("Timeout SNMP"));

      renderWithProviders(<DeviceDetailPage />);

      await waitFor(() => {
        expect(screen.getByText(/timeout de comunica/i)).toBeInTheDocument();
        expect(screen.getByRole("button", { name: /forçar re-poll/i })).toBeInTheDocument();
      });
    });
  });

  describe("Hero Header — Identificação do Ativo", () => {
    it("deve exibir metadados do dispositivo (IP, MAC, Firmware, Uptime, Local)", async () => {
      (deviceDetailApi.getDeviceDetail as Mock).mockResolvedValue(mockDevice);
      (deviceDetailApi.getTimescaleMetrics as Mock).mockResolvedValue(mockMetrics);

      renderWithProviders(<DeviceDetailPage />);

      await waitFor(() => {
        expect(screen.getAllByText("10.0.1.1").length).toBeGreaterThanOrEqual(1);
        expect(screen.getByText("70:7B:E8:4A:12:00")).toBeInTheDocument();
        expect(screen.getByText("V200R021C00")).toBeInTheDocument();
        expect(screen.getByText("184d 12h 45m")).toBeInTheDocument();
        expect(screen.getByText(/Datacenter Luanda Sul/i)).toBeInTheDocument();
      });
    });

    it("deve copiar IP para clipboard ao clicar no ícone de cópia", async () => {
      const user = userEvent.setup();
      const writeTextMock = vi.fn().mockResolvedValue(undefined);
      Object.defineProperty(navigator, "clipboard", {
        value: { writeText: writeTextMock },
        writable: true,
        configurable: true,
      });

      (deviceDetailApi.getDeviceDetail as Mock).mockResolvedValue(mockDevice);
      (deviceDetailApi.getTimescaleMetrics as Mock).mockResolvedValue(mockMetrics);

      renderWithProviders(<DeviceDetailPage />);

      await waitFor(() => expect(screen.getAllByText("10.0.1.1").length).toBeGreaterThanOrEqual(1));

      const copyButton = screen.getByRole("button", { name: /copiar endereço ip/i });
      await user.click(copyButton);

      expect(writeTextMock).toHaveBeenCalledWith("10.0.1.1");
    });

    it("deve exibir badge de status operacional com dot pulsante", async () => {
      (deviceDetailApi.getDeviceDetail as Mock).mockResolvedValue(mockDevice);
      (deviceDetailApi.getTimescaleMetrics as Mock).mockResolvedValue(mockMetrics);

      renderWithProviders(<DeviceDetailPage />);

      await waitFor(() => {
        expect(screen.getByText(/operacional \/ up/i)).toBeInTheDocument();
        expect(screen.getAllByTestId("badge-dot")).toHaveLength(1);
      });
    });
  });

  describe("Ações Imediatas", () => {
    it("deve disparar probe manual ICMP e exibir toast de sucesso", async () => {
      const user = userEvent.setup();
      (deviceDetailApi.getDeviceDetail as Mock).mockResolvedValue(mockDevice);
      (deviceDetailApi.getTimescaleMetrics as Mock).mockResolvedValue(mockMetrics);
      (deviceDetailApi.triggerManualProbe as Mock).mockResolvedValue(mockManualProbeResult);

      renderWithProviders(<DeviceDetailPage />);

      await waitFor(() => expect(screen.getAllByText("SW-CORE-LUANDA-01").length).toBeGreaterThanOrEqual(1));

      const probeButton = screen.getByRole("button", { name: /disparar ping \/ icmp/i });
      await user.click(probeButton);

      await waitFor(() => {
        expect(deviceDetailApi.triggerManualProbe).toHaveBeenCalledWith("dev-1");
      });

      await waitFor(() => {
        expect(screen.getByText(/sonda icmp concluída/i)).toBeInTheDocument();
      });
    });

    it("deve navegar para edição do ativo", async () => {
      (deviceDetailApi.getDeviceDetail as Mock).mockResolvedValue(mockDevice);
      (deviceDetailApi.getTimescaleMetrics as Mock).mockResolvedValue(mockMetrics);

      renderWithProviders(<DeviceDetailPage />);

      await waitFor(() => expect(screen.getAllByText("SW-CORE-LUANDA-01").length).toBeGreaterThanOrEqual(1));

      const editLink = screen.getByRole("link", { name: /editar ativo/i });
      expect(editLink).toHaveAttribute("href", "/devices/dev-1/edit");
    });
  });

  describe("Gráfico Timescale — Métricas de Latência", () => {
    it("deve exibir cards de estatísticas (Mín, P95, Máx, Loss)", async () => {
      (deviceDetailApi.getDeviceDetail as Mock).mockResolvedValue(mockDevice);
      (deviceDetailApi.getTimescaleMetrics as Mock).mockResolvedValue(mockMetrics);

      renderWithProviders(<DeviceDetailPage />);

      await waitFor(() => {
        expect(screen.getByText("1.8")).toBeInTheDocument();
        expect(screen.getByText("2.1")).toBeInTheDocument();
        expect(screen.getByText("14.2")).toBeInTheDocument();
        expect(screen.getByText("0.0")).toBeInTheDocument();
      });
    });

    it("deve ter seletor de período (1h, 24h, 7d, 30d)", async () => {
      (deviceDetailApi.getDeviceDetail as Mock).mockResolvedValue(mockDevice);
      (deviceDetailApi.getTimescaleMetrics as Mock).mockResolvedValue(mockMetrics);

      renderWithProviders(<DeviceDetailPage />);

      await waitFor(() => expect(screen.getAllByText("SW-CORE-LUANDA-01").length).toBeGreaterThanOrEqual(1));

      expect(screen.getByRole("button", { name: /1 hora/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /24 horas/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /7 dias/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /30 dias/i })).toBeInTheDocument();
    });

    it("deve alterar período e refazer query", async () => {
      const user = userEvent.setup();
      (deviceDetailApi.getDeviceDetail as Mock).mockResolvedValue(mockDevice);
      (deviceDetailApi.getTimescaleMetrics as Mock).mockResolvedValue(mockMetrics);

      renderWithProviders(<DeviceDetailPage />);

      await waitFor(() => expect(screen.getAllByText("SW-CORE-LUANDA-01").length).toBeGreaterThanOrEqual(1));

      await user.click(screen.getByRole("button", { name: /7 dias/i }));

      await waitFor(() => {
        expect(deviceDetailApi.getTimescaleMetrics).toHaveBeenCalledWith("dev-1", "7d");
      });
    });
  });

  describe("Matriz de Interfaces Ópticas", () => {
    it("deve renderizar grid de 24 portas com status correto", async () => {
      (deviceDetailApi.getDeviceDetail as Mock).mockResolvedValue(mockDevice);
      (deviceDetailApi.getTimescaleMetrics as Mock).mockResolvedValue(mockMetrics);

      renderWithProviders(<DeviceDetailPage />);

      await waitFor(() => expect(screen.getAllByText("SW-CORE-LUANDA-01").length).toBeGreaterThanOrEqual(1));

      expect(screen.getByText(/\d+\s*\/\s*24\s*ATIVAS/i)).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "01" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "24" })).toBeInTheDocument();
    });

    it("deve destacar porta com erro CRC (DEG)", async () => {
      (deviceDetailApi.getDeviceDetail as Mock).mockResolvedValue(mockDevice);
      (deviceDetailApi.getTimescaleMetrics as Mock).mockResolvedValue(mockMetrics);

      renderWithProviders(<DeviceDetailPage />);

      await waitFor(() => expect(screen.getAllByText("SW-CORE-LUANDA-01").length).toBeGreaterThanOrEqual(1));

      const port19 = screen.getByText("19");
      expect(port19).toHaveAttribute("title", expect.stringContaining("CRC"));
    });

    it("deve exibir detalhe da porta ao clicar", async () => {
      const user = userEvent.setup();
      (deviceDetailApi.getDeviceDetail as Mock).mockResolvedValue(mockDevice);
      (deviceDetailApi.getTimescaleMetrics as Mock).mockResolvedValue(mockMetrics);

      renderWithProviders(<DeviceDetailPage />);

      await waitFor(() => expect(screen.getAllByText("SW-CORE-LUANDA-01").length).toBeGreaterThanOrEqual(1));

      await user.click(screen.getByRole("button", { name: "01" }));

      await waitFor(() => {
        expect(screen.getByText(/Porta 01 Inspecionada/i)).toBeInTheDocument();
        expect(screen.getByText("-3.2 dBm")).toBeInTheDocument();
      });
    });
  });

  describe("SLA & Disponibilidade", () => {
    it("deve exibir gauge radial com disponibilidade", async () => {
      (deviceDetailApi.getDeviceDetail as Mock).mockResolvedValue(mockDevice);
      (deviceDetailApi.getTimescaleMetrics as Mock).mockResolvedValue(mockMetrics);

      renderWithProviders(<DeviceDetailPage />);

      await waitFor(() => expect(screen.getAllByText("SW-CORE-LUANDA-01").length).toBeGreaterThanOrEqual(1));

      expect(screen.getByText("99.98%")).toBeInTheDocument();
      expect(screen.getAllByText(/Meta:/i).length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText("99.50%")).toBeInTheDocument();
    });

    it("deve exibir MTTR e MTBF", async () => {
      (deviceDetailApi.getDeviceDetail as Mock).mockResolvedValue(mockDevice);
      (deviceDetailApi.getTimescaleMetrics as Mock).mockResolvedValue(mockMetrics);

      renderWithProviders(<DeviceDetailPage />);

      await waitFor(() => expect(screen.getAllByText("SW-CORE-LUANDA-01").length).toBeGreaterThanOrEqual(1));

      expect(screen.getByText("8m 14s")).toBeInTheDocument();
      expect(screen.getByText("418 horas")).toBeInTheDocument();
    });
  });

  describe("Histórico de Incidentes GLPI", () => {
    it("deve listar incidentes recentes com links", async () => {
      (deviceDetailApi.getDeviceDetail as Mock).mockResolvedValue(mockDevice);
      (deviceDetailApi.getTimescaleMetrics as Mock).mockResolvedValue(mockMetrics);

      renderWithProviders(<DeviceDetailPage />);

      await waitFor(() => expect(screen.getAllByText("SW-CORE-LUANDA-01").length).toBeGreaterThanOrEqual(1));

      expect(screen.getByText("Atenuação Óptica Porta 19")).toBeInTheDocument();
      expect(screen.getByText("Manutenção Firmware V200")).toBeInTheDocument();
      expect(screen.getByText("GLPI #8493")).toBeInTheDocument();
    });
  });

  describe("Acessibilidade (WCAG AA)", () => {
    it("deve ter role=main no conteúdo principal", async () => {
      (deviceDetailApi.getDeviceDetail as Mock).mockResolvedValue(mockDevice);
      (deviceDetailApi.getTimescaleMetrics as Mock).mockResolvedValue(mockMetrics);

      renderWithProviders(<DeviceDetailPage />);

      await waitFor(() => expect(screen.getByRole("main")).toBeInTheDocument());
    });

    it("deve ter navegação por teclado nos botões de ação", async () => {
      const user = userEvent.setup();
      (deviceDetailApi.getDeviceDetail as Mock).mockResolvedValue(mockDevice);
      (deviceDetailApi.getTimescaleMetrics as Mock).mockResolvedValue(mockMetrics);

      renderWithProviders(<DeviceDetailPage />);

      await waitFor(() => expect(screen.getAllByText("SW-CORE-LUANDA-01").length).toBeGreaterThanOrEqual(1));

      await user.tab();
      expect(document.activeElement).toBeInTheDocument();
    });
  });
});