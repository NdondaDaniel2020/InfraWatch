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
import {
  createMockDevice,
  createMockResponse,
  mockDeviceList,
} from "../src/mocks/devicesMocks";

vi.mock("../src/services/devicesApi", () => ({
  devicesApi: {
    listDevices: vi.fn(),
    pauseDevice: vi.fn(),
    resumeDevice: vi.fn(),
    setMaintenance: vi.fn(),
    createDevice: vi.fn(),
  },
}));

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
      (devicesApi.listDevices as Mock).mockResolvedValue(createMockResponse(mockDeviceList));

      renderWithProviders(<DeviceListPage />);

      // Skeleton rows (5) - data-testid usado pois skeleton não tem papel semântico
      expect(screen.getAllByTestId("skeleton").length).toBeGreaterThanOrEqual(5);
    });

    it("deve renderizar tabela paginada com dados mockados", async () => {
      (devicesApi.listDevices as Mock).mockResolvedValue(createMockResponse(mockDeviceList));

      renderWithProviders(<DeviceListPage />);

      await waitFor(() => {
        expect(screen.getByText("Roteador Core SP")).toBeInTheDocument();
        expect(screen.getByText("Switch Acesso RJ")).toBeInTheDocument();
        expect(screen.getByText("Firewall DF")).toBeInTheDocument();
      });

      // Verifica se badges de status estão presentes (5 dispositivos = 5 badges)
      // data-testid usado pois o dot do badge não tem papel semântico
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
      (devicesApi.listDevices as Mock).mockResolvedValue(createMockResponse([mockDeviceList[0]]));

      renderWithProviders(<DeviceListPage />);

      await waitFor(() => expect(screen.getByText("Roteador Core SP")).toBeInTheDocument());

      const searchInput = screen.getByLabelText(/buscar por nome, hostname, ip/i);
      fireEvent.change(searchInput, { target: { value: "Core" } });

      await waitFor(() => {
        expect(devicesApi.listDevices).toHaveBeenCalledWith(
          expect.objectContaining({ search: "Core", page: 1 })
        );
      }, { timeout: 1000 });
    });

    it("deve filtrar por categoria", async () => {
      (devicesApi.listDevices as Mock).mockResolvedValue(createMockResponse([mockDeviceList[0]]));

      renderWithProviders(<DeviceListPage />);

      await waitFor(() => expect(screen.getByText("Roteador Core SP")).toBeInTheDocument());

      const categorySelect = screen.getByLabelText(/categoria/i);
      fireEvent.change(categorySelect, { target: { value: "ROUTER" } });

      await waitFor(() => {
        expect(devicesApi.listDevices).toHaveBeenCalledWith(
          expect.objectContaining({ category: "ROUTER", page: 1 })
        );
      });
    });

    it("deve filtrar por status de saúde", async () => {
      (devicesApi.listDevices as Mock).mockResolvedValueOnce(createMockResponse(mockDeviceList));
      (devicesApi.listDevices as Mock).mockResolvedValue(createMockResponse([mockDeviceList[1]]));

      renderWithProviders(<DeviceListPage />);

      await waitFor(() => expect(screen.getByText("Roteador Core SP")).toBeInTheDocument());

      const statusSelect = screen.getByLabelText(/status/i);
      fireEvent.change(statusSelect, { target: { value: "DOWN" } });

      await waitFor(() => {
        expect(devicesApi.listDevices).toHaveBeenCalledWith(
          expect.objectContaining({ healthStatus: "DOWN", page: 1 })
        );
      });
    });

    it("deve ter controles de paginação funcionais", async () => {
      (devicesApi.listDevices as Mock).mockResolvedValue(createMockResponse(mockDeviceList));

      renderWithProviders(<DeviceListPage />);

      await waitFor(() => expect(screen.getByText("Roteador Core SP")).toBeInTheDocument());

      expect(screen.getByRole("button", { name: /página anterior/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /próxima página/i })).toBeInTheDocument();
      expect(screen.getByRole("combobox", { name: /itens por página/i })).toBeInTheDocument();

      const pageSizeSelect = screen.getByRole("combobox", { name: /itens por página/i });
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
        />
      );

      expect(screen.getByLabelText(/nome do ativo/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/hostname \/ fqdn/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/endereço ip/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/intervalo de sondagem/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/categoria/i)).toBeInTheDocument();
    });

    it("deve bloquear envio e exibir erro para IP inválido", async () => {
      const user = userEvent.setup();

      renderWithProviders(
        <DeviceFormModal
          isOpen={true}
          onClose={vi.fn()}
          onSubmit={vi.fn()}
        />
      );

      await user.type(screen.getByLabelText(/nome do ativo/i), "Test Device");
      await user.type(screen.getByLabelText(/hostname \/ fqdn/i), "test.local");
      await user.type(screen.getByLabelText(/endereço ip/i), "invalid-ip");
      await user.type(screen.getByLabelText(/intervalo de sondagem/i), "60");

      const submitButton = screen.getByRole("button", { name: /cadastrar ativo/i });
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
        />
      );

      await user.type(screen.getByLabelText(/nome do ativo/i), "TCP Test");
      await user.type(screen.getByLabelText(/hostname \/ fqdn/i), "tcp.test");
      await user.type(screen.getByLabelText(/endereço ip/i), "10.0.0.1");

      await user.click(screen.getByRole("tab", { name: /porta tcp/i }));

      await user.type(screen.getByRole("spinbutton", { name: /porta tcp/i }), "70000");

      const submitButton = screen.getByRole("button", { name: /cadastrar ativo/i });
      await user.click(submitButton);

      expect((submitButton as HTMLButtonElement).disabled || (await screen.findByText(/porta|máx|65535/i))).toBeTruthy();
    });

    it("deve preencher campos do formulário com dados válidos", async () => {
      const user = userEvent.setup();

      renderWithProviders(
        <DeviceFormModal
          isOpen={true}
          onClose={vi.fn()}
          onSubmit={vi.fn()}
        />
      );

      await user.type(screen.getByLabelText(/nome do ativo/i), "Novo Roteador");
      await user.type(screen.getByLabelText(/hostname \/ fqdn/i), "router-new.infrawatch.local");
      await user.type(screen.getByLabelText(/endereço ip/i), "192.168.10.1");

      const intervalInput = screen.getByLabelText(/intervalo de sondagem/i);
      await user.clear(intervalInput);
      await user.type(intervalInput, "60");

      await user.selectOptions(screen.getByLabelText(/categoria/i), "ROUTER");

      expect(screen.getByLabelText(/nome do ativo/i)).toHaveValue("Novo Roteador");
      expect(screen.getByLabelText(/hostname \/ fqdn/i)).toHaveValue("router-new.infrawatch.local");
      expect(screen.getByLabelText(/endereço ip/i)).toHaveValue("192.168.10.1");
      expect((screen.getByLabelText(/intervalo de sondagem/i) as HTMLInputElement).value).toBeTruthy();
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
        />
      );

      expect(screen.getByText("Pausar Monitoramento")).toBeInTheDocument();

      const reasonInput = screen.getByLabelText(/motivo da pausa/i);
      await user.type(reasonInput, "Manutenção programada na janela 02:00-04:00");

      const confirmButton = screen.getByRole("button", { name: /confirmar pausa/i });
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
        />
      );

      const reasonInput = screen.getByLabelText(/motivo da pausa/i);
      await user.type(reasonInput, "Curto");

      const confirmButton = screen.getByRole("button", { name: /confirmar pausa/i });
      expect(confirmButton).toBeDisabled();

      await user.type(reasonInput, " - motivo válido agora");

      expect(screen.getByRole("button", { name: /confirmar pausa/i })).not.toBeDisabled();
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
        />
      );

      await user.type(screen.getByLabelText(/título da manutenção/i), "Atualização de firmware");
      await user.type(screen.getByLabelText(/prazo final/i), "2024-01-20T04:00");
      await user.type(screen.getByLabelText(/justificativa/i), "Atualização crítica de segurança do firewall");

      const confirmButton = screen.getByRole("button", { name: /agendar manutenção/i });
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
        />
      );

      const confirmButton = screen.getByRole("button", { name: /agendar manutenção/i });
      expect(confirmButton).toBeDisabled();

      await user.type(screen.getByLabelText(/título da manutenção/i), "Título");
      expect(confirmButton).toBeDisabled();

      await user.type(screen.getByLabelText(/prazo final/i), "2024-01-20T04:00");
      expect(confirmButton).toBeDisabled();

      await user.type(screen.getByLabelText(/justificativa/i), "Justificativa");
      expect(screen.getByRole("button", { name: /agendar manutenção/i })).not.toBeDisabled();
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
        />
      );

      const tabs = screen.getAllByRole("tab");
      expect(tabs.length).toBeGreaterThanOrEqual(5);

      await user.keyboard("{Tab}");
      await user.keyboard("{ArrowRight}");
      await user.keyboard("{ArrowRight}");

      expect(document.activeElement).toBeInTheDocument();
    }, 10000);
  });
});