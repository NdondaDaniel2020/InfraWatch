import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { GlobalErrorBoundary } from "../src/components/common/GlobalErrorBoundary";
import { AuthContext } from "../src/context/AuthContext";
import { TelemetryProvider } from "../src/context/TelemetryContext";
import { AppRoutes } from "../src/routes/AppRoutes";
import type { AuthContextValue, AuthUser, UserRole } from "../src/types/auth";

/**
 * Cria mock do contexto de autenticação para testes determinísticos de roteamento.
 */
function createAuthMock(
  overrides?: Partial<AuthContextValue>,
  role: UserRole = "NOC_OPERATOR",
  isAuthenticated: boolean = true
): AuthContextValue {
  const user: AuthUser = {
    id: "user-test-01",
    email: "operator@infrawatch.io",
    name: "Operador NOC",
    role,
    initials: "OP",
  };

  return {
    user: isAuthenticated ? user : null,
    accessToken: isAuthenticated ? "mock-jwt-token" : null,
    isAuthenticated,
    isLoading: false,
    mfaPendingToken: null,
    login: vi.fn(),
    submitMfaChallenge: vi.fn(),
    completeGoogleLogin: vi.fn(),
    setSession: vi.fn(),
    logout: vi.fn(),
    clearMfaPending: vi.fn(),
    hasRole: (roles: UserRole | UserRole[]) => {
      if (!isAuthenticated) return false;
      const target = Array.isArray(roles) ? roles : [roles];
      return target.includes(role);
    },
    ...overrides,
  };
}

describe("Roteamento React Router e RBAC Guards (Issue #215)", () => {
  describe("1. Guards de Autenticação", () => {
    it("deve redirecionar usuário não autenticado para /login ao tentar acessar rota privada", () => {
      const authMock = createAuthMock({}, "NOC_OPERATOR", false);

      render(
        <MemoryRouter initialEntries={["/noc"]}>
          <AuthContext.Provider value={authMock}>
            <TelemetryProvider enabled={false}>
              <AppRoutes />
            </TelemetryProvider>
          </AuthContext.Provider>
        </MemoryRouter>
      );

      // Deve estar na tela de login
      expect(screen.getByTestId("login-page")).toBeInTheDocument();
      expect(screen.queryByTestId("noc-dashboard-page")).not.toBeInTheDocument();
    });

    it("deve permitir acesso à rota privada quando usuário estiver autenticado", () => {
      const authMock = createAuthMock({}, "NOC_OPERATOR", true);

      render(
        <MemoryRouter initialEntries={["/noc"]}>
          <AuthContext.Provider value={authMock}>
            <TelemetryProvider enabled={false}>
              <AppRoutes />
            </TelemetryProvider>
          </AuthContext.Provider>
        </MemoryRouter>
      );

      expect(screen.getByTestId("noc-dashboard-page")).toBeInTheDocument();
      expect(screen.queryByTestId("login-page")).not.toBeInTheDocument();
    });
  });

  describe("2. Controle de Acesso Baseado em Papéis (RBAC)", () => {
    it("deve redirecionar CLIENT_VIEWER para /portal ao tentar acessar rota operacional do NOC", () => {
      const authMock = createAuthMock({}, "CLIENT_VIEWER", true);

      render(
        <MemoryRouter initialEntries={["/noc"]}>
          <AuthContext.Provider value={authMock}>
            <TelemetryProvider enabled={false}>
              <AppRoutes />
            </TelemetryProvider>
          </AuthContext.Provider>
        </MemoryRouter>
      );

      // Deve ser redirecionado para o Portal do Cliente
      expect(screen.getByTestId("client-portal-page")).toBeInTheDocument();
      expect(screen.queryByTestId("noc-dashboard-page")).not.toBeInTheDocument();
    });

    it("deve redirecionar para 403 quando NOC_OPERATOR tentar acessar rota exclusiva de SUPER_ADMIN (/audit)", () => {
      const authMock = createAuthMock({}, "NOC_OPERATOR", true);

      render(
        <MemoryRouter initialEntries={["/audit"]}>
          <AuthContext.Provider value={authMock}>
            <TelemetryProvider enabled={false}>
              <AppRoutes />
            </TelemetryProvider>
          </AuthContext.Provider>
        </MemoryRouter>
      );

      expect(screen.getByTestId("access-denied-page")).toBeInTheDocument();
      expect(screen.getByText(/Acesso Não Autorizado \(403\)/i)).toBeInTheDocument();
    });

    it("deve permitir que SUPER_ADMIN acesse rotas administrativas (/audit e /security)", () => {
      const authMock = createAuthMock({}, "SUPER_ADMIN", true);
      const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false } },
      });

      render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter initialEntries={["/audit"]}>
            <AuthContext.Provider value={authMock}>
              <TelemetryProvider enabled={false}>
                <AppRoutes />
              </TelemetryProvider>
            </AuthContext.Provider>
          </MemoryRouter>
        </QueryClientProvider>
      );

      expect(screen.getByTestId("audit-logs-page")).toBeInTheDocument();
    });

    it("deve permitir que ORG_ADMIN acesse /devices e /maintenance, mas bloquear /noc e /dr", () => {
      const authMock = createAuthMock({}, "ORG_ADMIN", true);
      const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false } },
      });

      // 1. Acesso permitido a /devices
      const { unmount: unmountDevices } = render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter initialEntries={["/devices"]}>
            <AuthContext.Provider value={authMock}>
              <TelemetryProvider enabled={false}>
                <AppRoutes />
              </TelemetryProvider>
            </AuthContext.Provider>
          </MemoryRouter>
        </QueryClientProvider>
      );
      expect(screen.getByTestId("devices-page")).toBeInTheDocument();
      unmountDevices();

      // 2. Acesso permitido a /maintenance
      const { unmount: unmountMaint } = render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter initialEntries={["/maintenance"]}>
            <AuthContext.Provider value={authMock}>
              <TelemetryProvider enabled={false}>
                <AppRoutes />
              </TelemetryProvider>
            </AuthContext.Provider>
          </MemoryRouter>
        </QueryClientProvider>
      );
      expect(screen.getByTestId("maintenance-windows-page")).toBeInTheDocument();
      unmountMaint();

      // 3. Acesso bloqueado (403) a /noc
      const { unmount: unmountNoc } = render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter initialEntries={["/noc"]}>
            <AuthContext.Provider value={authMock}>
              <TelemetryProvider enabled={false}>
                <AppRoutes />
              </TelemetryProvider>
            </AuthContext.Provider>
          </MemoryRouter>
        </QueryClientProvider>
      );
      expect(screen.getByTestId("access-denied-page")).toBeInTheDocument();
      unmountNoc();

      // 4. Acesso bloqueado (403) a /dr
      render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter initialEntries={["/dr"]}>
            <AuthContext.Provider value={authMock}>
              <TelemetryProvider enabled={false}>
                <AppRoutes />
              </TelemetryProvider>
            </AuthContext.Provider>
          </MemoryRouter>
        </QueryClientProvider>
      );
      expect(screen.getByTestId("access-denied-page")).toBeInTheDocument();
    });
  });

  describe("3. Shell da Aplicação (AppLayout, Header e Sidebar)", () => {
    it("deve renderizar Header e Sidebar estruturais mantendo o conteúdo da rota", () => {
      const authMock = createAuthMock({}, "NOC_OPERATOR", true);
      const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false } },
      });

      render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter initialEntries={["/devices"]}>
            <AuthContext.Provider value={authMock}>
              <TelemetryProvider enabled={false}>
                <AppRoutes />
              </TelemetryProvider>
            </AuthContext.Provider>
          </MemoryRouter>
        </QueryClientProvider>
      );

      expect(screen.getByTestId("app-header")).toBeInTheDocument();
      expect(screen.getByTestId("app-sidebar")).toBeInTheDocument();
      expect(screen.getByTestId("status-ticker")).toBeInTheDocument();
      expect(screen.getByTestId("devices-page")).toBeInTheDocument();
    });

    it("deve exibir relógio UTC ativo no Header", async () => {
      const authMock = createAuthMock({}, "NOC_OPERATOR", true);

      render(
        <MemoryRouter initialEntries={["/noc"]}>
          <AuthContext.Provider value={authMock}>
            <TelemetryProvider enabled={false}>
              <AppRoutes />
            </TelemetryProvider>
          </AuthContext.Provider>
        </MemoryRouter>
      );

      const utcClock = screen.getByTestId("utc-clock");
      expect(utcClock).toBeInTheDocument();
      expect(utcClock.textContent).toMatch(/UTC/i);
    });

    it("deve filtrar itens de menu da Sidebar conforme os papéis permitidos", () => {
      // Para CLIENT_VIEWER: apenas SLA e Portal do Cliente devem estar visíveis
      const authMock = createAuthMock({}, "CLIENT_VIEWER", true);

      render(
        <MemoryRouter initialEntries={["/portal"]}>
          <AuthContext.Provider value={authMock}>
            <TelemetryProvider enabled={false}>
              <AppRoutes />
            </TelemetryProvider>
          </AuthContext.Provider>
        </MemoryRouter>
      );

      expect(screen.getByText("Portal do Cliente")).toBeInTheDocument();
      expect(screen.getByText("Relatórios SLA")).toBeInTheDocument();
      expect(screen.queryByText("Cockpit NOC")).not.toBeInTheDocument();
      expect(screen.queryByText("Trilha de Auditoria")).not.toBeInTheDocument();
      expect(screen.queryByText("Backup & DR")).not.toBeInTheDocument();
    });
  });

  describe("4. Rota Especial Wallboard TV (/tv)", () => {
    it("deve renderizar Wallboard TV em tela cheia sem Header e sem Sidebar do Shell", () => {
      const authMock = createAuthMock({}, "NOC_OPERATOR", true);

      render(
        <MemoryRouter initialEntries={["/tv"]}>
          <AuthContext.Provider value={authMock}>
            <TelemetryProvider enabled={false}>
              <AppRoutes />
            </TelemetryProvider>
          </AuthContext.Provider>
        </MemoryRouter>
      );

      expect(screen.getByTestId("tv-wallboard-page")).toBeInTheDocument();
      expect(screen.queryByTestId("app-sidebar")).not.toBeInTheDocument();
    });
  });

  describe("5. GlobalErrorBoundary", () => {
    it("deve capturar falhas críticas de renderização e exibir tela de contingência com botão de recarga", () => {
      // Silencia o console.error esperado do teste de erro
      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      const FaultyComponent = () => {
        throw new Error("Simulação de Falha Crítica no Render");
      };

      render(
        <GlobalErrorBoundary>
          <FaultyComponent />
        </GlobalErrorBoundary>
      );

      expect(screen.getByTestId("global-error-boundary")).toBeInTheDocument();
      expect(screen.getByText(/Falha Inesperada no Cockpit/i)).toBeInTheDocument();
      expect(screen.getByText(/Simulação de Falha Crítica no Render/i)).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Recarregar Cockpit/i })).toBeInTheDocument();

      consoleSpy.mockRestore();
    });
  });
});
