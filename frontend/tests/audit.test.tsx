import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { Toaster } from "sonner";
import { AuditLogsPage } from "../src/pages/audit/AuditLogsPage";
import { AuditFilterBar } from "../src/components/audit/AuditFilterBar";
import { AdminManagementPage } from "../src/pages/admin/AdminManagementPage";
import { auditApi } from "../src/services/auditApi";
import { adminApi } from "../src/services/adminApi";
import {
  mockAuditLogs,
  mockCustodyVerificationSuccess,
  mockCustodyVerificationTampered,
  mockAdminUsers,
  mockAdminOrganizations,
} from "../src/mocks/auditMocks";

vi.mock("../src/services/auditApi", () => ({
  auditApi: {
    getAuditLogs: vi.fn(),
    verifyIntegrity: vi.fn(),
    exportLedgerJson: vi.fn(),
  },
}));

vi.mock("../src/services/adminApi", () => ({
  adminApi: {
    listUsers: vi.fn(),
    createUser: vi.fn(),
    updateUserRole: vi.fn(),
    activateUser: vi.fn(),
    deactivateUser: vi.fn(),
    listOrganizations: vi.fn(),
    createOrganization: vi.fn(),
  },
}));

vi.mock("../src/context/AuthContext", () => ({
  useAuth: () => ({
    user: { id: "usr-daniel", name: "Daniel Ndonda", role: "SUPER_ADMIN" },
    isAuthenticated: true,
    hasRole: () => true,
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

describe("Trilha de Auditoria Forense & Governança Administrativa (Issue #226)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (auditApi.verifyIntegrity as Mock).mockResolvedValue(mockCustodyVerificationSuccess);
  });

  describe("Página de Auditoria Forense (/admin/audit)", () => {
    it("deve renderizar o banner de integridade, contadores de registros e tabela forense", async () => {
      (auditApi.getAuditLogs as Mock).mockResolvedValue({
        items: mockAuditLogs,
        total: mockAuditLogs.length,
        page: 1,
        page_size: 10,
      });

      renderWithProviders(<AuditLogsPage />);

      await waitFor(() => {
        expect(
          screen.getByText("Trilha de Auditoria Forense & Compliance (Append-Only)")
        ).toBeInTheDocument();
        expect(screen.getByText("ÍNTEGRA E VÁLIDA")).toBeInTheDocument();
        expect(screen.getByText("MERKLE PROOF OK")).toBeInTheDocument();
        expect(
          screen.getAllByText("7f83b1657ff1fc53b92dc18148a1d65dfc2d4b1fa3d677284addd200126d9069").length
        ).toBeGreaterThanOrEqual(1);
        expect(
          screen.getAllByText("SW-CORE-LUANDA-01").length
        ).toBeGreaterThanOrEqual(1);
        expect(screen.getByText("#INC-2026-081")).toBeInTheDocument();
      });
    });

    it("deve disparar a verificação criptográfica ao clicar no botão de validar cadeia", async () => {
      const user = userEvent.setup();
      (auditApi.getAuditLogs as Mock).mockResolvedValue({
        items: mockAuditLogs,
        total: mockAuditLogs.length,
        page: 1,
        page_size: 10,
      });
      (auditApi.verifyIntegrity as Mock).mockResolvedValue(mockCustodyVerificationSuccess);

      renderWithProviders(<AuditLogsPage />);

      await waitFor(() => {
        expect(screen.getByTestId("verify-chain-button")).toBeInTheDocument();
      });

      const verifyButton = screen.getByTestId("verify-chain-button");
      await user.click(verifyButton);

      await waitFor(() => {
        expect(auditApi.verifyIntegrity).toHaveBeenCalledTimes(2);
      });
    });

    it("deve exibir banner de alerta crítico quando a cadeia estiver adulterada", async () => {
      const user = userEvent.setup();
      (auditApi.getAuditLogs as Mock).mockResolvedValue({
        items: mockAuditLogs,
        total: mockAuditLogs.length,
        page: 1,
        page_size: 10,
      });
      (auditApi.verifyIntegrity as Mock).mockResolvedValue(mockCustodyVerificationTampered);

      renderWithProviders(<AuditLogsPage />);

      await waitFor(() => {
        expect(screen.getByTestId("verify-chain-button")).toBeInTheDocument();
      });

      await user.click(screen.getByTestId("verify-chain-button"));

      await waitFor(() => {
        expect(screen.getByText("CADEIA ADULTERADA / VIOLAÇÃO")).toBeInTheDocument();
        expect(screen.getByText("VIOLAÇÃO CRIPTOGRÁFICA")).toBeInTheDocument();
        expect(
          screen.getByText(/Quebra de encadeamento no bloco #evt-98103/)
        ).toBeInTheDocument();
      });
    });

    it("deve atualizar o painel inspector JSONB ao selecionar uma linha da tabela", async () => {
      const user = userEvent.setup();
      (auditApi.getAuditLogs as Mock).mockResolvedValue({
        items: mockAuditLogs,
        total: mockAuditLogs.length,
        page: 1,
        page_size: 10,
      });

      renderWithProviders(<AuditLogsPage />);

      await waitFor(() => {
        expect(screen.getByText("#INC-2026-081")).toBeInTheDocument();
      });

      // Clica na linha do evento #INC-2026-081
      await user.click(screen.getByText("#INC-2026-081"));

      await waitFor(() => {
        expect(
          screen.getByText("Diff de Estado JSONB — Evento #evt-98103")
        ).toBeInTheDocument();
      });
    });

    it("deve acionar exportação de ledger JSON", async () => {
      const user = userEvent.setup();
      (auditApi.getAuditLogs as Mock).mockResolvedValue({
        items: mockAuditLogs,
        total: mockAuditLogs.length,
        page: 1,
        page_size: 10,
      });

      renderWithProviders(<AuditLogsPage />);

      await waitFor(() => {
        expect(screen.getByText("Exportar Ledger (.json)")).toBeInTheDocument();
      });

      await user.click(screen.getByText("Exportar Ledger (.json)"));

      expect(auditApi.exportLedgerJson).toHaveBeenCalledWith(mockAuditLogs);
    });

    it("deve restringir papéis e ações de alto nível no AuditFilterBar quando não for administrador global (ORG_ADMIN)", () => {
      const filters = { search: "", role: "ALL", action: "ALL", page: 1, page_size: 10 };
      const onChange = vi.fn();

      const { rerender } = render(
        <AuditFilterBar
          filters={filters}
          onChange={onChange}
          onRefresh={vi.fn()}
          isLiveStream={false}
          onToggleLiveStream={vi.fn()}
          isGlobalAdmin={false}
        />
      );

      // No modo ORG_ADMIN: NÃO deve existir SUPER_ADMIN nem SYSTEM
      expect(screen.getByText("Todos os Papéis da Organização")).toBeInTheDocument();
      expect(screen.queryByText("SYSTEM (WORKER / AUTH)")).not.toBeInTheDocument();
      expect(screen.queryByText("DEVICE_PAUSED")).not.toBeInTheDocument();
      expect(screen.queryByText("GLPI_SYNC")).not.toBeInTheDocument();

      // No modo SUPER_ADMIN: deve conter todos os papéis de alto nível
      rerender(
        <AuditFilterBar
          filters={filters}
          onChange={onChange}
          onRefresh={vi.fn()}
          isLiveStream={false}
          onToggleLiveStream={vi.fn()}
          isGlobalAdmin={true}
        />
      );

      expect(screen.getByText("Todos os Papéis (SUPER_ADMIN, NOC, ORG, SYSTEM)")).toBeInTheDocument();
      expect(screen.getByText("SYSTEM (WORKER / AUTH)")).toBeInTheDocument();
      expect(screen.getByText("DEVICE_PAUSED")).toBeInTheDocument();
      expect(screen.getByText("GLPI_SYNC")).toBeInTheDocument();
    });
  });

  describe("Página de Gestão Administrativa (/admin/management)", () => {
    it("deve renderizar a listagem de usuários e permitir alternância para organizações", async () => {
      const user = userEvent.setup();
      (adminApi.listUsers as Mock).mockResolvedValue({
        items: mockAdminUsers,
        total: mockAdminUsers.length,
        page: 1,
        page_size: 20,
      });
      (adminApi.listOrganizations as Mock).mockResolvedValue({
        items: mockAdminOrganizations,
        total: mockAdminOrganizations.length,
        page: 1,
        page_size: 20,
      });

      renderWithProviders(<AdminManagementPage />);

      await waitFor(() => {
        expect(
          screen.getByText("Gestão Administrativa de Usuários e Organizações")
        ).toBeInTheDocument();
        expect(screen.getByText("Daniel Ndonda")).toBeInTheDocument();
        expect(screen.getByText("operador.noc@infrawatch.ao")).toBeInTheDocument();
      });

      // Alternar para aba de organizações
      const orgTabButton = screen.getByRole("button", { name: /Organizações Clientes/i });
      await user.click(orgTabButton);

      await waitFor(() => {
        expect(screen.getByText("Banco Sol S.A.")).toBeInTheDocument();
        expect(screen.getByText("Unitel Angola")).toBeInTheDocument();
      });
    });

    it("deve acionar mutação de alteração de papel RBAC", async () => {
      const user = userEvent.setup();
      (adminApi.listUsers as Mock).mockResolvedValue({
        items: mockAdminUsers,
        total: mockAdminUsers.length,
        page: 1,
        page_size: 20,
      });
      (adminApi.updateUserRole as Mock).mockResolvedValue({
        ...mockAdminUsers[1],
        role: "SUPER_ADMIN",
      });

      renderWithProviders(<AdminManagementPage />);

      await waitFor(() => {
        expect(
          screen.getByLabelText("Alterar papel de Operador NOC 01")
        ).toBeInTheDocument();
      });

      const select = screen.getByLabelText("Alterar papel de Operador NOC 01");
      await user.selectOptions(select, "SUPER_ADMIN");

      await waitFor(() => {
        expect(adminApi.updateUserRole).toHaveBeenCalledWith("usr-operador", {
          role: "SUPER_ADMIN",
        });
      });
    });

    it("deve acionar mutação para suspender conta de usuário ativo", async () => {
      const user = userEvent.setup();
      vi.spyOn(window, "confirm").mockReturnValue(true);

      (adminApi.listUsers as Mock).mockResolvedValue({
        items: mockAdminUsers,
        total: mockAdminUsers.length,
        page: 1,
        page_size: 20,
      });
      (adminApi.deactivateUser as Mock).mockResolvedValue({
        ...mockAdminUsers[1],
        is_active: false,
      });

      renderWithProviders(<AdminManagementPage />);

      await waitFor(() => {
        expect(screen.getByText("Operador NOC 01")).toBeInTheDocument();
      });

      const suspendButtons = screen.getAllByRole("button", { name: "Suspender" });
      expect(suspendButtons.length).toBeGreaterThan(0);
      await user.click(suspendButtons[0]);

      await waitFor(() => {
        expect(adminApi.deactivateUser).toHaveBeenCalled();
      });
    });

    it("deve abrir modal e cadastrar novo usuário com sucesso", async () => {
      const user = userEvent.setup();
      (adminApi.listUsers as Mock).mockResolvedValue({
        items: mockAdminUsers,
        total: mockAdminUsers.length,
        page: 1,
        page_size: 20,
      });
      (adminApi.listOrganizations as Mock).mockResolvedValue({
        items: mockAdminOrganizations,
        total: mockAdminOrganizations.length,
        page: 1,
        page_size: 20,
      });
      (adminApi.createUser as Mock).mockResolvedValue({
        id: "usr-new-001",
        full_name: "Novo Colaborador",
        email: "novo.colaborador@empresa.ao",
        role: "CLIENT_VIEWER",
        is_active: true,
        is_verified: true,
        organization_id: null,
        created_at: new Date().toISOString(),
      });

      renderWithProviders(<AdminManagementPage />);

      await waitFor(() => {
        expect(screen.getByTestId("create-user-btn")).toBeInTheDocument();
      });

      await user.click(screen.getByTestId("create-user-btn"));

      expect(screen.getByText("Novo Usuário Administrativo")).toBeInTheDocument();

      await user.type(screen.getByPlaceholderText("Ex: Ana Paula Silva"), "Novo Colaborador");
      await user.type(screen.getByPlaceholderText("Ex: ana.silva@empresa.com"), "novo.colaborador@empresa.ao");
      await user.type(screen.getByPlaceholderText("Mínimo 8 caracteres"), "SenhaSegura#2026");

      await user.click(screen.getByRole("button", { name: "Cadastrar Usuário" }));

      await waitFor(() => {
        expect(adminApi.createUser).toHaveBeenCalledWith({
          full_name: "Novo Colaborador",
          email: "novo.colaborador@empresa.ao",
          password: "SenhaSegura#2026",
          role: "CLIENT_VIEWER",
          organization_id: null,
        });
      });
    });

    it("deve abrir modal e cadastrar nova organização com campos reais e sem CNPJ", async () => {
      const user = userEvent.setup();
      (adminApi.listOrganizations as Mock).mockResolvedValue({
        items: mockAdminOrganizations,
        total: mockAdminOrganizations.length,
        page: 1,
        page_size: 20,
      });
      (adminApi.createOrganization as Mock).mockResolvedValue({
        id: "org-new-001",
        name: "Nova Empresa S.A.",
        slug: "nova-empresa",
        contact_email: "contato@novaempresa.ao",
        contact_phone: "+244 923 000 000",
        tier: "ENTERPRISE_GOLD",
        sla_target_default: 99.90,
        is_active: true,
        created_at: new Date().toISOString(),
      });

      renderWithProviders(<AdminManagementPage />);

      // Alternar para aba organizações
      await user.click(screen.getByRole("button", { name: /Organizações Clientes/i }));

      await waitFor(() => {
        expect(screen.getByTestId("create-organization-btn")).toBeInTheDocument();
      });

      await user.click(screen.getByTestId("create-organization-btn"));

      expect(screen.getByText("Nova Organização Cliente")).toBeInTheDocument();

      await user.type(screen.getByPlaceholderText("Ex: Banco Sol S.A."), "Nova Empresa S.A.");
      await user.type(screen.getByPlaceholderText("contato@cliente.ao"), "contato@novaempresa.ao");

      await user.click(screen.getByRole("button", { name: "Cadastrar Organização" }));

      await waitFor(() => {
        expect(adminApi.createOrganization).toHaveBeenCalledWith({
          name: "Nova Empresa S.A.",
          slug: "nova-empresa-s-a",
          contact_email: "contato@novaempresa.ao",
          contact_phone: undefined,
          tier: "STANDARD",
          sla_target_default: 99.50,
        });
      });
    });
  });
});
