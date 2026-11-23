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
    getAvailableDevices: vi.fn(),
    createNode: vi.fn(),
    updateNodePosition: vi.fn(),
    deleteNode: vi.fn(),
    createEdge: vi.fn(),
    updateEdge: vi.fn(),
    deleteEdge: vi.fn(),
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

const mockNavigate = vi.fn();

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

vi.mock("../src/services/adminApi", () => ({
  adminApi: {
    listOrganizations: vi.fn().mockResolvedValue({
      items: [
        { id: "org-unitel", name: "Unitel Angola" },
        { id: "org-banco-sol", name: "Banco Sol S.A." },
      ],
      total: 2,
      page: 1,
      size: 100,
    }),
  },
}));

vi.mock("../src/context/AuthContext", () => ({
  useAuth: () => ({
    user: {
      id: "u-1",
      email: "admin@infrawatch.ao",
      role: "SUPER_ADMIN",
      organization_name: "InfraWatch Global Core",
    },
    isAuthenticated: true,
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
    (topologyApi.getAvailableDevices as any).mockResolvedValue([
      {
        id: "dev-avail-1",
        name: "SW-ACCESS-01",
        category: "SWITCH",
        ip_address: "10.0.1.50",
        status: "UP",
        is_in_topology: false,
      },
      {
        id: "dev-avail-2",
        name: "SW-CORE-LUANDA-01",
        category: "SWITCH",
        ip_address: "10.0.1.10",
        status: "UP",
        is_in_topology: true,
      },
    ]);
    (topologyApi.createNode as any).mockResolvedValue({
      id: "node-new-1",
      label: "RT-NEW-EDGE",
      node_type: "router",
      organization_id: "org-unitel",
    });
    (topologyApi.deleteNode as any).mockResolvedValue(undefined);
    (topologyApi.createEdge as any).mockResolvedValue({
      id: "edge-new-1",
      source_node_id: "node-1",
      target_node_id: "node-2",
      link_type: "fiber",
      bandwidth_gbps: 10,
    });
    (topologyApi.updateEdge as any).mockResolvedValue({
      id: "edge-1",
      link_type: "fiber",
      bandwidth_gbps: 40,
    });
    (topologyApi.deleteEdge as any).mockResolvedValue(undefined);
    (topologyApi.updateNodePosition as any).mockResolvedValue({
      id: "node-1",
      position_x: 300,
      position_y: 400,
    });
  });

  it("deve renderizar a barra de controle tática, o canvas e o nó selecionado por padrão", async () => {
    renderWithProviders(<TopologyMapPage />);

    expect(screen.getByTestId("topology-toolbar")).toBeInTheDocument();
    expect(screen.getByText("TOPOLOGIA")).toBeInTheDocument();
    expect(screen.getByText("Grafo Interativo de Enlaces & Tráfego")).toBeInTheDocument();
    expect(screen.getByText("LLDP/CDP Sincronizado")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Redefinir zoom para 100%/i })).toHaveTextContent("100%");

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

  it("deve renderizar contadores dinâmicos na toolbar e link de visão 360 com deviceId", async () => {
    (topologyApi.getTopologyGraph as any).mockResolvedValue({
      nodes: [
        {
          id: "node-1",
          label: "SW-CORE-TEST",
          category: "switch",
          status: "UP",
          deviceId: "device-uuid-999",
          ip: "10.0.1.1",
        },
        {
          id: "node-2",
          label: "RT-EDGE-TEST",
          category: "router",
          status: "UP",
          ip: "10.0.0.1",
        },
      ],
      edges: [],
      totalNodes: 2,
      totalEdges: 0,
      cluster: "LUANDA-CORE",
    });

    renderWithProviders(<TopologyMapPage />);

    await waitFor(() => {
      expect(screen.getByText("Todos (2)")).toBeInTheDocument();
      expect(screen.getByText("Roteadores (1)")).toBeInTheDocument();
      expect(screen.getByText("Switches (1)")).toBeInTheDocument();
      expect(screen.getByText("DB / API (0)")).toBeInTheDocument();
    });

    const link360 = screen.getByRole("link", { name: /Visão 360°/i });
    expect(link360).toHaveAttribute("href", "/devices/device-uuid-999");
  });

  it("deve renderizar o seletor de organizações e alternar a topologia ao selecionar outro tenant", async () => {
    (topologyApi.getTopologyGraph as any).mockResolvedValue({
      nodes: mockTopologyNodes,
      edges: mockTopologyEdges,
      totalNodes: mockTopologyNodes.length,
      totalEdges: mockTopologyEdges.length,
      cluster: "LUANDA-CORE",
    });

    renderWithProviders(<TopologyMapPage />);

    await waitFor(() => {
      expect(screen.getByTestId("topology-org-select")).toBeInTheDocument();
    });

    const select = screen.getByTestId("topology-org-select") as HTMLSelectElement;
    expect(select.value).toBe("org-unitel");

    fireEvent.change(select, { target: { value: "org-banco-sol" } });
    expect(select.value).toBe("org-banco-sol");

    await waitFor(() => {
      expect(topologyApi.getTopologyGraph).toHaveBeenCalledWith("org-banco-sol");
    });
  });

  it("deve alternar entre Modo Monitoramento e Modo Edição exibindo banner e botão de adicionar nó", async () => {
    renderWithProviders(<TopologyMapPage />);

    // Por padrão está no modo monitoramento
    const editBtn = screen.getByTestId("topology-edit-mode-btn");
    expect(editBtn).toHaveTextContent("Editar Topologia");
    expect(screen.queryByTestId("topology-add-node-btn")).not.toBeInTheDocument();

    // Ativa Modo Edição
    fireEvent.click(editBtn);

    expect(screen.getByTestId("topology-edit-mode-btn")).toHaveTextContent("Modo Edição");
    expect(screen.getByTestId("topology-add-node-btn")).toBeInTheDocument();
    expect(
      screen.getByText(/Modo Edição Ativo: Arraste nós para reposicionar/i)
    ).toBeInTheDocument();

    // Desativa Modo Edição
    fireEvent.click(editBtn);
    expect(screen.queryByTestId("topology-add-node-btn")).not.toBeInTheDocument();
  });

  it("deve abrir AddNodeModal e cadastrar nó customizado na organização", async () => {
    renderWithProviders(<TopologyMapPage />);

    // Aguarda carregar as organizações
    await waitFor(() => {
      expect(screen.getByTestId("topology-org-select")).toBeInTheDocument();
    });

    // Ativa Modo Edição
    fireEvent.click(screen.getByTestId("topology-edit-mode-btn"));

    // Clica em Adicionar Nó
    fireEvent.click(screen.getByTestId("topology-add-node-btn"));

    await waitFor(() => {
      expect(screen.getByTestId("add-node-modal")).toBeInTheDocument();
    });

    // Alterna para tab customizado
    fireEvent.click(screen.getByText("Nó Externo / Lógico"));

    const inputLabel = screen.getByPlaceholderText(/Ex: RT-EDGE-02 ou AWS-DIRECT-CONNECT/i);
    fireEvent.change(inputLabel, { target: { value: "ROUTER-CUSTOM-01" } });

    const btnSubmit = screen.getByRole("button", { name: "Criar Nó" });
    fireEvent.click(btnSubmit);

    await waitFor(() => {
      expect(topologyApi.createNode).toHaveBeenCalledWith(
        expect.objectContaining({
          label: "ROUTER-CUSTOM-01",
          node_type: "router",
        }),
        "org-unitel"
      );
    });
  });

  it("deve permitir remover nó pelo drawer no Modo Edição", async () => {
    renderWithProviders(<TopologyMapPage />);

    // Ativa Modo Edição
    fireEvent.click(screen.getByTestId("topology-edit-mode-btn"));

    await waitFor(() => {
      expect(screen.getByTestId("drawer-delete-node-btn")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId("drawer-delete-node-btn"));

    await waitFor(() => {
      expect(topologyApi.deleteNode).toHaveBeenCalled();
    });
  });

  it("deve navegar para /devices/{uuid} ao clicar duas vezes no nó", async () => {
    renderWithProviders(<TopologyMapPage />);

    await waitFor(() => {
      expect(screen.getByTestId("topology-node-SW-CORE-LUANDA-01")).toBeInTheDocument();
    });

    const nodeElement = screen.getByTestId("topology-node-SW-CORE-LUANDA-01");
    fireEvent.doubleClick(nodeElement);

    expect(mockNavigate).toHaveBeenCalledWith("/devices/SW-CORE-LUANDA-01");
  });

  it("deve conter links diretos para /devices/{uuid} no drawer do nó selecionado", async () => {
    renderWithProviders(<TopologyMapPage />);

    await waitFor(() => {
      expect(screen.getByTestId("drawer-view-360-link")).toBeInTheDocument();
    });

    expect(screen.getByTestId("drawer-view-360-link")).toHaveAttribute(
      "href",
      "/devices/SW-CORE-LUANDA-01"
    );
  });
});
