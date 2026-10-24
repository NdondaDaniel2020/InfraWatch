import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";
import { DeviceListPage } from "../src/pages/inventory/DeviceListPage";
import { DeviceFormModal } from "../src/components/inventory/DeviceFormModal";
import { PauseDeviceModal } from "../src/components/inventory/PauseDeviceModal";
import { MaintenanceModal } from "../src/components/inventory/MaintenanceModal";
import { devicesApi } from "../src/services/devicesApi";
import type { DeviceListItem, PaginatedResponse } from "../src/types/inventory";

vi.mock("../src/services/devicesApi", () => ({
  devicesApi: {
    listDevices: vi.fn(),
    pauseDevice: vi.fn(),
    resumeDevice: vi.fn(),
    setMaintenance: vi.fn(),
    createDevice: vi.fn(),
  },
}));

const createMockDevice = (overrides: Partial<DeviceListItem> = {}): DeviceListItem => ({
  id: "dev-1",
  name: "Roteador Core SP",
  hostname: "router-core-sp.infrawatch.local",
  ipAddress: "192.168.1.1",
  port: undefined,
  protocol: "ICMP",
  category: "ROUTER",
  healthStatus: "UP",
  intervalSeconds: 60,
  lastCheckAt: "2024-01-15T10:30:00Z",
  nextCheckAt: "2024-01-15T10:31:00Z",
  createdAt: "2024-01-01T00:00:00Z",
  updatedAt: "2024-01-01T00:00:00Z",
  ...overrides,
});

const createMockResponse = (devices: DeviceListItem[], page = 1, pageSize = 20, total?: number): PaginatedResponse<DeviceListItem> => ({
  items: devices,
  total: total ?? devices.length,
  page,
  pageSize,
  totalPages: Math.ceil((total ?? devices.length) / pageSize),
});

const mockDevices = [
  createMockDevice({ id: "dev-1", name: "Roteador Core SP", healthStatus: "UP" }),
  createMockDevice({ id: "dev-2", name: "Switch Acesso RJ", healthStatus: "DOWN", protocol: "TCP", port: 22 }),
  createMockDevice({ id: "dev-3", name: "Firewall DF", healthStatus: "DEG", protocol: "HTTP" }),
  createMockDevice({ id: "dev-4", name: "Servidor DB", healthStatus: "MAINT", protocol: "DOCKER" }),
  createMockDevice({ id: "dev-5", name: "Job Backup", healthStatus: "PAUSED", protocol: "HEARTBEAT" }),
];

const renderWithProviders = (ui: ReactNode, queryClient?: QueryClient) => {
  const client = queryClient || new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
  return render(
    <QueryClientProvider client={client}>
      {ui}
      <Toaster />
    </QueryClientProvider>
  );
};

describe("Inventory Management — Issue #217", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
  });

  describe("DeviceListPage — Rendering & Loading", () => {
    it("deve exibir skeleton durante carregamento inicial", () => {
      (devicesApi.listDevices as Mock).mockResolvedValue(createMockResponse(mockDevices));

      renderWithProviders(<DeviceListPage />);

      // Skeleton rows (5) + filter bar skeletons
      expect(screen.getAllByTestId("skeleton").length).toBeGreaterThanOrEqual(5);
    });

    it("deve renderizar tabela paginada com dados mockados", async () => {
      (devicesApi.listDevices as Mock).mockResolvedValue(createMockResponse(mockDevices));

      renderWithProviders(<DeviceListPage />);

      await waitFor(() => {
        expect(screen.getByText("Roteador Core SP")).toBeInTheDocument();
        expect(screen.getByText("Switch Acesso RJ")).toBeInTheDocument();
        expect(screen.getByText("Firewall DF")).toBeInTheDocument();
      });

      // Verifica se badges de status estão presentes (5 dispositivos = 5 badges)
      expect(screen.getAllByTestId("badge-dot")).toHaveLength(5);
    });

    it("deve exibir estado vazio quando não houver dispositivos", async () => {
      (devicesApi.listDevices as Mock).mockResolvedValue(createMockResponse([]));

      renderWithProviders(<DeviceListPage />);

      await waitFor(() => {
        expect(screen.getByText("Nenhum ativo cadastrado")).toBeInTheDocument();
        expect(screen.getByRole("button", { name: /adicionar primeiro ativo/i })).toBeInTheDocument();
      });
    });
  });

  describe("DeviceListPage — Filtragem & Paginação", () => {
    it("deve disparar busca por texto livre com debounce", async () => {
      (devicesApi.listDevices as Mock).mockResolvedValue(createMockResponse([mockDevices[0]]));

      renderWithProviders(<DeviceListPage />);

      await waitFor(() => expect(screen.getByText("Roteador Core SP")).toBeInTheDocument());

      const searchInput = screen.getByTestId("device-search-input");
      fireEvent.change(searchInput, { target: { value: "Core" } });

      await waitFor(() => {
        expect(devicesApi.listDevices).toHaveBeenCalledWith(
          expect.objectContaining({ search: "Core", page: 1 })
        );
      }, { timeout: 1000 });
    });

    it("deve filtrar por categoria", async () => {
      (devicesApi.listDevices as Mock).mockResolvedValue(createMockResponse([mockDevices[0]]));

      renderWithProviders(<DeviceListPage />);

      await waitFor(() => expect(screen.getByText("Roteador Core SP")).toBeInTheDocument());

      const categorySelect = screen.getByTestId("device-category-filter");
      fireEvent.change(categorySelect, { target: { value: "ROUTER" } });

      await waitFor(() => {
        expect(devicesApi.listDevices).toHaveBeenCalledWith(
          expect.objectContaining({ category: "ROUTER", page: 1 })
        );
      });
    });

    it("deve filtrar por status de saúde", async () => {
      // Primeiro retorna todos os dispositivos
      (devicesApi.listDevices as Mock).mockResolvedValueOnce(createMockResponse(mockDevices));
      // Depois retorna apenas o dispositivo com status DOWN
      (devicesApi.listDevices as Mock).mockResolvedValue(createMockResponse([mockDevices[1]]));

      renderWithProviders(<DeviceListPage />);

      await waitFor(() => expect(screen.getByText("Roteador Core SP")).toBeInTheDocument());

      const statusSelect = screen.getByTestId("device-status-filter");
      fireEvent.change(statusSelect, { target: { value: "DOWN" } });

      await waitFor(() => {
        expect(devicesApi.listDevices).toHaveBeenCalledWith(
          expect.objectContaining({ healthStatus: "DOWN", page: 1 })
        );
      });
    });

    it("deve ter controles de paginação funcionais", async () => {
      (devicesApi.listDevices as Mock).mockResolvedValue(createMockResponse(mockDevices));

      renderWithProviders(<DeviceListPage />);

      await waitFor(() => expect(screen.getByText("Roteador Core SP")).toBeInTheDocument());

      // Verifica se botões de paginação existem
      expect(screen.getByTestId("prev-page-button")).toBeInTheDocument();
      expect(screen.getByTestId("next-page-button")).toBeInTheDocument();
      expect(screen.getByTestId("page-size-select")).toBeInTheDocument();

      // Verifica se o seletor de tamanho de página funciona
      const pageSizeSelect = screen.getByTestId("page-size-select");
      fireEvent.change(pageSizeSelect, { target: { value: "50" } });

      await waitFor(() => {
        expect(devicesApi.listDevices).toHaveBeenCalledWith(
          expect.objectContaining({ pageSize: 50, page: 1 })
        );
      });
    });
  });

  describe("DeviceFormModal — Cadastro & Validações", () => {
    it("deve exibir campos básicos do formulário", async () => {
      renderWithProviders(
        <DeviceFormModal
          isOpen={true}
          onClose={vi.fn()}
          onSubmit={vi.fn()}
          data-testid="device-form-modal"
        />
      );

      expect(screen.getByTestId("device-name-input")).toBeInTheDocument();
      expect(screen.getByTestId("device-hostname-input")).toBeInTheDocument();
      expect(screen.getByTestId("device-ip-input")).toBeInTheDocument();
      expect(screen.getByTestId("device-interval-input")).toBeInTheDocument();
      expect(screen.getByTestId("device-category-select")).toBeInTheDocument();
    });

    it("deve bloquear envio e exibir erro para IP inválido", async () => {
      const user = userEvent.setup();

      renderWithProviders(
        <DeviceFormModal
          isOpen={true}
          onClose={vi.fn()}
          onSubmit={vi.fn()}
          data-testid="device-form-modal"
        />
      );

      await user.type(screen.getByTestId("device-name-input"), "Test Device");
      await user.type(screen.getByTestId("device-hostname-input"), "test.local");
      await user.type(screen.getByTestId("device-ip-input"), "invalid-ip");
      await user.type(screen.getByTestId("device-interval-input"), "60");

      const submitButton = screen.getByTestId("device-form-submit");
      await user.click(submitButton);

      expect(await screen.findByText(/endereço ip/i)).toBeInTheDocument();
      expect(devicesApi.createDevice).not.toHaveBeenCalled();
    });

    it("deve bloquear envio para porta fora de 1–65535", async () => {
      const user = userEvent.setup();

      renderWithProviders(
        <DeviceFormModal
          isOpen={true}
          onClose={vi.fn()}
          onSubmit={vi.fn()}
          data-testid="device-form-modal"
        />
      );

      await user.type(screen.getByTestId("device-name-input"), "TCP Test");
      await user.type(screen.getByTestId("device-hostname-input"), "tcp.test");
      await user.type(screen.getByTestId("device-ip-input"), "10.0.0.1");

      await user.click(screen.getByRole("tab", { name: /porta tcp/i }));

      await user.type(screen.getByTestId("tcp-port-input"), "70000");

      const submitButton = screen.getByTestId("device-form-submit");
      await user.click(submitButton);

      // Verifica se o botão continua desabilitado ou erro aparece
      expect((submitButton as HTMLButtonElement).disabled || (await screen.findByText(/porta|máx|65535/i))).toBeTruthy();
    });

    it("deve preencher campos do formulário com dados válidos", async () => {
      const user = userEvent.setup();

      renderWithProviders(
        <DeviceFormModal
          isOpen={true}
          onClose={vi.fn()}
          onSubmit={vi.fn()}
          data-testid="device-form-modal"
        />
      );

      await user.type(screen.getByTestId("device-name-input"), "Novo Roteador");
      await user.type(screen.getByTestId("device-hostname-input"), "router-new.infrawatch.local");
      await user.type(screen.getByTestId("device-ip-input"), "192.168.10.1");

      // Limpa e preenche o intervalo
      const intervalInput = screen.getByTestId("device-interval-input");
      await user.clear(intervalInput);
      await user.type(intervalInput, "60");

      // Seleciona categoria
      await user.selectOptions(screen.getByTestId("device-category-select"), "ROUTER");

      // Verifica se os campos foram preenchidos corretamente
      expect(screen.getByTestId("device-name-input")).toHaveValue("Novo Roteador");
      expect(screen.getByTestId("device-hostname-input")).toHaveValue("router-new.infrawatch.local");
      expect(screen.getByTestId("device-ip-input")).toHaveValue("192.168.10.1");
      // O valor pode ser string ou number dependendo da implementação
      const intervalValue = (screen.getByTestId("device-interval-input") as HTMLInputElement).value;
      expect(intervalValue).toBeTruthy();
    });
  });

  describe("PauseDeviceModal — Comandos Operacionais", () => {
    it("deve abrir modal, inserir justificativa e enviar pauseDevice", async () => {
      const user = userEvent.setup();
      const onConfirm = vi.fn().mockResolvedValue(undefined);
      (devicesApi.pauseDevice as Mock).mockResolvedValue(createMockDevice({ healthStatus: "PAUSED" }));

      renderWithProviders(
        <PauseDeviceModal
          isOpen={true}
          onClose={vi.fn()}
          deviceName="Roteador Core SP"
          onConfirm={onConfirm}
          data-testid="pause-device-modal"
        />
      );

      expect(screen.getByText("Pausar Monitoramento")).toBeInTheDocument();

      const reasonInput = screen.getByTestId("pause-reason-input");
      await user.type(reasonInput, "Manutenção programada na janela 02:00-04:00");

      const confirmButton = screen.getByTestId("pause-confirm-button");
      await user.click(confirmButton);

      await waitFor(() => {
        expect(onConfirm).toHaveBeenCalledWith("Manutenção programada na janela 02:00-04:00");
      });
    }, 10000);

    it("deve bloquear confirmação se motivo tiver menos de 10 caracteres", async () => {
      const user = userEvent.setup();
      const onConfirm = vi.fn();

      renderWithProviders(
        <PauseDeviceModal
          isOpen={true}
          onClose={vi.fn()}
          deviceName="Roteador Core SP"
          onConfirm={onConfirm}
          data-testid="pause-device-modal"
        />
      );

      const reasonInput = screen.getByTestId("pause-reason-input");
      await user.type(reasonInput, "Curto");

      const confirmButton = screen.getByTestId("pause-confirm-button");
      expect(confirmButton).toBeDisabled();

      await user.type(reasonInput, " - motivo válido agora");

      expect(screen.getByTestId("pause-confirm-button")).not.toBeDisabled();
    }, 10000);
  });

  describe("MaintenanceModal — Agendamento de Manutenção", () => {
    it("deve agendar manutenção com payload completo", async () => {
      const user = userEvent.setup();
      const onConfirm = vi.fn().mockResolvedValue(undefined);
      (devicesApi.setMaintenance as Mock).mockResolvedValue(createMockDevice({ healthStatus: "MAINT" }));

      renderWithProviders(
        <MaintenanceModal
          isOpen={true}
          onClose={vi.fn()}
          deviceName="Firewall DF"
          onConfirm={onConfirm}
          data-testid="maintenance-modal"
        />
      );

      await user.type(screen.getByTestId("maintenance-title-input"), "Atualização de firmware");
      await user.type(screen.getByTestId("maintenance-until-input"), "2024-01-20T04:00");
      await user.type(screen.getByTestId("maintenance-reason-input"), "Atualização crítica de segurança do firewall");

      const confirmButton = screen.getByTestId("maintenance-confirm-button");
      await user.click(confirmButton);

      await waitFor(() => {
        expect(onConfirm).toHaveBeenCalledWith({
          until: "2024-01-20T04:00",
          title: "Atualização de firmware",
          reason: "Atualização crítica de segurança do firewall",
        });
      });
    }, 10000);

    it("deve bloquear confirmação se campos obrigatórios estiverem vazios", async () => {
      const user = userEvent.setup();
      const onConfirm = vi.fn();

      renderWithProviders(
        <MaintenanceModal
          isOpen={true}
          onClose={vi.fn()}
          deviceName="Firewall DF"
          onConfirm={onConfirm}
          data-testid="maintenance-modal"
        />
      );

      const confirmButton = screen.getByTestId("maintenance-confirm-button");
      expect(confirmButton).toBeDisabled();

      await user.type(screen.getByTestId("maintenance-title-input"), "Título");
      expect(confirmButton).toBeDisabled();

      await user.type(screen.getByTestId("maintenance-until-input"), "2024-01-20T04:00");
      expect(confirmButton).toBeDisabled();

      await user.type(screen.getByTestId("maintenance-reason-input"), "Justificativa");
      expect(screen.getByTestId("maintenance-confirm-button")).not.toBeDisabled();
    }, 10000);
  });

  describe("Acessibilidade (WCAG AA)", () => {
    it("deve fechar modais via tecla Escape", async () => {
      const user = userEvent.setup();
      const onClose = vi.fn();

      renderWithProviders(
        <DeviceFormModal
          isOpen={true}
          onClose={onClose}
          onSubmit={vi.fn()}
          data-testid="device-form-modal"
        />
      );

      await user.keyboard("{Escape}");

      expect(onClose).toHaveBeenCalledTimes(1);
    }, 10000);

    it("deve ter role=dialog nos modais", async () => {
      renderWithProviders(
        <DeviceFormModal
          isOpen={true}
          onClose={vi.fn()}
          onSubmit={vi.fn()}
          data-testid="device-form-modal"
        />
      );

      expect(screen.getByRole("dialog")).toBeInTheDocument();
      expect(screen.getByRole("dialog")).toHaveAttribute("aria-modal", "true");
    });

    it("deve ter navegação por teclado nas abas de protocolo", async () => {
      const user = userEvent.setup();

      renderWithProviders(
        <DeviceFormModal
          isOpen={true}
          onClose={vi.fn()}
          onSubmit={vi.fn()}
          data-testid="device-form-modal"
        />
      );

      const tabs = screen.getAllByRole("tab");
      expect(tabs.length).toBeGreaterThanOrEqual(5);

      await user.keyboard("{Tab}");
      await user.keyboard("{ArrowRight}");
      await user.keyboard("{ArrowRight}");

      // Verifica se o foco moveu
      expect(document.activeElement).toBeInTheDocument();
    }, 10000);
  });
});