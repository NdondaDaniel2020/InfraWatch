import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { Toaster } from "sonner";
import { TopologyMapPage } from "../src/pages/topology/TopologyMapPage";
import { topologyApi } from "../src/services/topologyApi";
import { mockTopologyNodes, mockTopologyEdges } from "../src/mocks/topologyMocks";

vi.mock("../src/services/topologyApi", () => ({
  topologyApi: {
    getTopologyGraph: vi.fn(),
    runPingTrace: vi.fn(),
    isolateNode: vi.fn(),
  },
}));

vi.mock("../src/context/TelemetryContext", () => ({
  useTelemetry: () => ({
    isConnected: true,
    status: "CONNECTED",
    deviceMetrics: {},
    activeAlerts: [],
    activeAlertsCount: 0,
  }),
}));

const renderWithProviders = (ui: ReactNode) => {
  const client = new QueryClient({
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

describe("Dashboard de Topologia de Rede Interativa (Issue #168)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (topologyApi.getTopologyGraph as any).mockResolvedValue({
      nodes: mockTopologyNodes,
      edges: mockTopologyEdges,
      totalNodes: mockTopologyNodes.length,
      totalEdges: mockTopologyEdges.length,
      cluster: "LUANDA-CORE",
    });
    (topologyApi.runPingTrace as any).mockResolvedValue({
      rttMs: 2.1,
      hops: ["10.0.0.1", "10.0.1.1"],
      packetLoss: 0,
    });
    (topologyApi.isolateNode as any).mockResolvedValue({
      success: true,
      message: "Nó RT-BRANCH-BENGUELA isolado da rota de trânsito OSPF/BGP com sucesso.",
    });
  });

  it("deve renderizar a barra de controle tática, o canvas e o nó selecionado por padrão", async () => {
    renderWithProviders(<TopologyMapPage />);

    expect(screen.getByTestId("topology-toolbar")).toBeInTheDocument();
    expect(screen.getByText("TOPOLOGIA")).toBeInTheDocument();
    expect(screen.getByText("Grafo Interativo de Enlaces & Tráfego")).toBeInTheDocument();
    expect(screen.getByText("LLDP/CDP Sincronizado")).toBeInTheDocument();

    // Nós no canvas
    await waitFor(
      () => {
        expect(screen.getByTestId("topology-node-SW-CORE-LUANDA-01")).toBeInTheDocument();
        expect(screen.getByTestId("topology-node-RT-EDGE-01")).toBeInTheDocument();
        expect(screen.getByTestId("topology-node-RT-BRANCH-BENGUELA")).toBeInTheDocument();
      },
      { timeout: 10000 }
    );

    // Drawer lateral aberto por padrão com o SW-CORE-LUANDA-01
    expect(screen.getByTestId("topology-inspector-drawer")).toBeInTheDocument();
    expect(screen.getAllByText("SW-CORE-LUANDA-01").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("MATRIZ DE PORTAS (24 SFP+)")).toBeInTheDocument();
  }, 30000);

  it("deve renderizar os estados alternativos: Skeleton, Empty e Error", async () => {
    // 1. Simular Skeleton
    const { unmount: unmountSkeleton } = renderWithProviders(
      <TopologyMapPage initialViewState="skeleton" />
    );
    expect(screen.getByTestId("topology-skeleton")).toBeInTheDocument();
    unmountSkeleton();

    // 2. Simular Empty
    const { unmount: unmountEmpty } = renderWithProviders(
      <TopologyMapPage initialViewState="empty" />
    );
    expect(screen.getByTestId("topology-empty")).toBeInTheDocument();
    expect(screen.getByText("Nenhum Ativo Descoberto")).toBeInTheDocument();
    unmountEmpty();

    // 3. Simular Error
    renderWithProviders(<TopologyMapPage initialViewState="error" />);
    expect(screen.getByTestId("topology-error")).toBeInTheDocument();
    expect(screen.getByText("Falha de Comunicação com Coletor gRPC")).toBeInTheDocument();
  });

  it("deve filtrar nós da topologia ao selecionar categoria Roteadores", async () => {
    const user = userEvent.setup();
    renderWithProviders(<TopologyMapPage />);

    const routerFilterBtn = screen.getByRole("button", { name: /Roteadores/i });
    await user.click(routerFilterBtn);

    await waitFor(() => {
      expect(screen.getByTestId("topology-node-RT-EDGE-01")).toBeInTheDocument();
      expect(screen.getByTestId("topology-node-RT-BRANCH-BENGUELA")).toBeInTheDocument();
      expect(screen.queryByTestId("topology-node-SW-CORE-LUANDA-01")).not.toBeInTheDocument();
    });
  });

  it("deve atualizar o drawer ao clicar no nó crítico rompido e permitir isolamento", async () => {
    renderWithProviders(<TopologyMapPage />);

    await waitFor(() => {
      expect(screen.getByTestId("topology-node-RT-BRANCH-BENGUELA")).toBeInTheDocument();
    });

    const benguelaNode = screen.getByTestId("topology-node-RT-BRANCH-BENGUELA");
    fireEvent.click(benguelaNode);

    await waitFor(() => {
      expect(screen.getByText(/CRITICAL DOWN \(FIBRA ROMPIDA\)/i)).toBeInTheDocument();
      expect(screen.getByText(/ENLACE PRINCIPAL ROMPIDO/i)).toBeInTheDocument();
    });

    const isolateButton = screen.getByRole("button", { name: /ISOLAR DA ROTA OSPF\/BGP/i });
    fireEvent.click(isolateButton);

    expect(topologyApi.isolateNode).toHaveBeenCalledWith("RT-BRANCH-BENGUELA");
  });

  it("deve executar ping/trace a partir do drawer", async () => {
    renderWithProviders(<TopologyMapPage />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Ping \/ Trace/i })).toBeInTheDocument();
    });

    const pingButton = screen.getByRole("button", { name: /Ping \/ Trace/i });
    fireEvent.click(pingButton);

    expect(topologyApi.runPingTrace).toHaveBeenCalledWith("SW-CORE-LUANDA-01");
  }, 30000);
});
