import React from "react";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { AuthProvider, useAuth } from "../src/context/AuthContext";
import { LoginPage } from "../src/pages/auth/LoginPage";
import { MfaChallengePage } from "../src/pages/auth/MfaChallengePage";
import { ForgotPasswordPage } from "../src/pages/auth/ForgotPasswordPage";
import { ResetPasswordPage } from "../src/pages/auth/ResetPasswordPage";
import { SecuritySettingsPage } from "../src/pages/settings/SecuritySettingsPage";
import { authApi } from "../src/services/authApi";
import { securityApi } from "../src/services/securityApi";
import {
  getInMemoryAccessToken,
  getStoredRefreshToken,
  setInMemoryAccessToken,
  setStoredRefreshToken,
} from "../src/services/apiClient";

// Mocks dos serviços da API
vi.mock("../src/services/authApi", () => ({
  authApi: {
    login: vi.fn(),
    loginMfaChallenge: vi.fn(),
    refresh: vi.fn(),
    logout: vi.fn(),
    getMe: vi.fn(),
    getGoogleAuthUrl: vi.fn(),
    googleCallback: vi.fn(),
    requestPasswordReset: vi.fn(),
    confirmPasswordReset: vi.fn(),
  },
}));

vi.mock("../src/services/securityApi", () => ({
  securityApi: {
    setupMfa: vi.fn(),
    enableMfa: vi.fn(),
    disableMfa: vi.fn(),
    regenerateBackupCodes: vi.fn(),
    listSessions: vi.fn(),
    revokeSession: vi.fn(),
    revokeAllSessions: vi.fn(),
  },
}));

describe("Módulo de Autenticação, IAM & Segurança (Issue #216)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setInMemoryAccessToken(null);
    setStoredRefreshToken(null);
    localStorage.clear();
    sessionStorage.clear();
  });

  // =========================================================================
  // 1. GESTÃO SEGURA DE TOKENS EM MEMÓRIA (ADR-033)
  // =========================================================================
  describe("1. Gestão Segura de Tokens em Memória (ADR-033)", () => {
    it("deve armazenar Access Token unicamente em memória e persistir apenas o Refresh Token", async () => {
      vi.mocked(authApi.login).mockResolvedValueOnce({
        access_token: "jwt-in-memory-token-123",
        refresh_token: "rotative-refresh-token-456",
        token_type: "Bearer",
        expires_in: 900,
        user: {
          id: "usr-01",
          email: "operador@infrawatch.io",
          full_name: "Daniel Ndonda",
          role: "NOC_OPERATOR",
        },
      });

      const TestLoginConsumer: React.FC = () => {
        const { login, isAuthenticated } = useAuth();
        return (
          <div>
            <button
              onClick={() =>
                login({ email: "operador@infrawatch.io", password: "Password123!" })
              }
            >
              Fazer Login
            </button>
            <span data-testid="auth-status">
              {isAuthenticated ? "Autenticado" : "Não autenticado"}
            </span>
          </div>
        );
      };

      const user = userEvent.setup();
      render(
        <AuthProvider initialState={{ isLoading: false }}>
          <TestLoginConsumer />
        </AuthProvider>
      );

      await user.click(screen.getByRole("button", { name: /fazer login/i }));

      await waitFor(() => {
        expect(screen.getByTestId("auth-status")).toHaveTextContent("Autenticado");
      });

      // Assert ADR-033: Access token em memória volátil, NUNCA no localStorage
      expect(getInMemoryAccessToken()).toBe("jwt-in-memory-token-123");
      expect(localStorage.getItem("jwt-in-memory-token-123")).toBeNull();
      expect(localStorage.getItem("accessToken")).toBeNull();

      // Refresh token persistido para suportar F5
      expect(getStoredRefreshToken()).toBe("rotative-refresh-token-456");
    });
  });

  // =========================================================================
  // 2. FORMULÁRIO DE LOGIN (LoginPage)
  // =========================================================================
  describe("2. Formulário de Login Oficial (LoginPage)", () => {
    it("deve renderizar campos com labels semânticos e alternar visualização de senha", async () => {
      const user = userEvent.setup();

      render(
        <MemoryRouter>
          <AuthProvider initialState={{ isLoading: false }}>
            <LoginPage />
          </AuthProvider>
        </MemoryRouter>
      );

      const emailInput = screen.getByLabelText(/endereço de e-mail/i);
      const passwordInput = screen.getByLabelText(/senha de acesso/i);

      expect(emailInput).toBeInTheDocument();
      expect(passwordInput).toHaveAttribute("type", "password");

      // Clica no botão de alternar senha
      const toggleBtn = screen.getByRole("button", { name: /exibir senha/i });
      await user.click(toggleBtn);

      expect(passwordInput).toHaveAttribute("type", "text");
    });

    it("deve exibir aviso corporativo de governança e não exibir opção pública de criação de conta", () => {
      render(
        <MemoryRouter>
          <AuthProvider initialState={{ isLoading: false }}>
            <LoginPage />
          </AuthProvider>
        </MemoryRouter>
      );

      // Não deve existir botão ou link de auto-cadastro na tela de login
      expect(screen.queryByRole("button", { name: /criar conta/i })).not.toBeInTheDocument();
      expect(screen.queryByText(/inicie a avaliação de 14 dias/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/começar teste grátis/i)).not.toBeInTheDocument();

      // Deve exibir mensagem institucional de acesso via Administrador da organização
      expect(screen.getByText(/solicite uma credencial ao/i)).toBeInTheDocument();
      expect(screen.getByText(/administrador da sua organização/i)).toBeInTheDocument();
    });

    it("deve exibir alerta acessível ao tentar submeter com campos vazios", async () => {
      const user = userEvent.setup();

      render(
        <MemoryRouter>
          <AuthProvider initialState={{ isLoading: false }}>
            <LoginPage />
          </AuthProvider>
        </MemoryRouter>
      );

      const submitBtn = screen.getByRole("button", { name: /entrar no cockpit/i });
      await user.click(submitBtn);

      const alert = await screen.findByRole("alert");
      expect(alert).toHaveTextContent(/preencha o e-mail e a senha/i);
    });

    it("deve exibir erro do backend quando as credenciais forem inválidas", async () => {
      vi.mocked(authApi.login).mockRejectedValueOnce(
        new Error("Credenciais inválidas.")
      );

      const user = userEvent.setup();
      render(
        <MemoryRouter>
          <AuthProvider initialState={{ isLoading: false }}>
            <LoginPage />
          </AuthProvider>
        </MemoryRouter>
      );

      await user.type(screen.getByLabelText(/endereço de e-mail/i), "errado@infrawatch.io");
      await user.type(screen.getByLabelText(/senha de acesso/i), "senhaErrada123");
      await user.click(screen.getByRole("button", { name: /entrar no cockpit/i }));

      const alert = await screen.findByRole("alert");
      expect(alert).toHaveTextContent(/credenciais inválidas/i);
    });

    it("deve redirecionar para a tela de MFA quando o usuário possuir autenticação em duas etapas ativa", async () => {
      vi.mocked(authApi.login).mockResolvedValueOnce({
        mfa_required: true,
        mfa_pending_token: "pending-mfa-token-xyz",
      });

      const user = userEvent.setup();
      render(
        <MemoryRouter initialEntries={["/login"]}>
          <AuthProvider initialState={{ isLoading: false }}>
            <Routes>
              <Route path="/login" element={<LoginPage />} />
              <Route
                path="/login/mfa-challenge"
                element={<div data-testid="mfa-page-rendered">Desafio MFA</div>}
              />
            </Routes>
          </AuthProvider>
        </MemoryRouter>
      );

      await user.type(screen.getByLabelText(/endereço de e-mail/i), "admin@infrawatch.io");
      await user.type(screen.getByLabelText(/senha de acesso/i), "AdminPassword123!");
      await user.click(screen.getByRole("button", { name: /entrar no cockpit/i }));

      await waitFor(() => {
        expect(screen.getByTestId("mfa-page-rendered")).toBeInTheDocument();
      });
    });
  });

  // =========================================================================
  // 3. TELA DE DESAFIO MFA (MfaChallengePage)
  // =========================================================================
  describe("3. Desafio MFA TOTP (MfaChallengePage)", () => {
    it("deve validar código de 6 dígitos e autenticar com sucesso", async () => {
      vi.mocked(authApi.loginMfaChallenge).mockResolvedValueOnce({
        access_token: "mfa-jwt-token-999",
        refresh_token: "mfa-refresh-token-888",
        token_type: "Bearer",
        expires_in: 900,
        user: {
          id: "usr-admin-01",
          email: "admin@infrawatch.io",
          full_name: "Super Admin",
          role: "SUPER_ADMIN",
        },
      });

      const user = userEvent.setup();
      render(
        <MemoryRouter initialEntries={["/login/mfa-challenge"]}>
          <AuthProvider
            initialState={{
              isLoading: false,
              mfaPendingToken: "valid-pending-token",
            }}
          >
            <Routes>
              <Route path="/login/mfa-challenge" element={<MfaChallengePage />} />
              <Route path="/noc" element={<div data-testid="noc-dashboard">NOC Dashboard</div>} />
            </Routes>
          </AuthProvider>
        </MemoryRouter>
      );

      const codeInput = screen.getByLabelText(/código totp/i);
      await user.type(codeInput, "123456");
      await user.click(screen.getByRole("button", { name: /confirmar e acessar/i }));

      await waitFor(() => {
        expect(authApi.loginMfaChallenge).toHaveBeenCalledWith({
          mfa_pending_token: "valid-pending-token",
          code: "123456",
        });
      });
    });

    it("deve permitir alternar para modo de código de backup", async () => {
      const user = userEvent.setup();
      render(
        <MemoryRouter initialEntries={["/login/mfa-challenge"]}>
          <AuthProvider
            initialState={{
              isLoading: false,
              mfaPendingToken: "valid-pending-token",
            }}
          >
            <MfaChallengePage />
          </AuthProvider>
        </MemoryRouter>
      );

      const toggleBackupBtn = screen.getByRole("button", {
        name: /usar código de backup de emergência/i,
      });
      await user.click(toggleBackupBtn);

      expect(screen.getByLabelText(/código de recuperação/i)).toBeInTheDocument();
    });
  });

  // =========================================================================
  // 4. RECUPERAÇÃO DE SENHA (ForgotPasswordPage & ResetPasswordPage)
  // =========================================================================
  describe("4. Recuperação e Redefinição de Senha", () => {
    it("deve enviar solicitação de recuperação de senha com feedback de sucesso", async () => {
      vi.mocked(authApi.requestPasswordReset).mockResolvedValueOnce({
        status: "ok",
        message: "Instruções enviadas para seu e-mail.",
      });

      const user = userEvent.setup();
      render(
        <MemoryRouter>
          <ForgotPasswordPage />
        </MemoryRouter>
      );

      await user.type(screen.getByLabelText(/e-mail cadastrado/i), "user@infrawatch.io");
      await user.click(screen.getByRole("button", { name: /enviar link de redefinição/i }));

      const successAlert = await screen.findByTestId("forgot-password-success-alert");
      expect(successAlert).toHaveTextContent(/instruções enviadas/i);
    });

    it("deve validar se as senhas coincidem na redefinição", async () => {
      const user = userEvent.setup();
      render(
        <MemoryRouter initialEntries={["/password-reset/confirm?token=sample-token"]}>
          <ResetPasswordPage />
        </MemoryRouter>
      );

      await user.type(screen.getByLabelText("Nova Senha"), "SenhaForte123!");
      await user.type(screen.getByLabelText("Confirmar Nova Senha"), "SenhaDiferente999!");
      await user.click(screen.getByRole("button", { name: /atualizar senha/i }));

      const alert = await screen.findByRole("alert");
      expect(alert).toHaveTextContent(/as senhas informadas não coincidem/i);
    });
  });

  // =========================================================================
  // 5. PAINEL DE SEGURANÇA E SESSÕES (SecuritySettingsPage)
  // =========================================================================
  describe("5. Painel de Segurança e Gestão de Sessões", () => {
    it("deve listar sessões ativas e permitir revogação individual", async () => {
      vi.mocked(securityApi.listSessions).mockResolvedValueOnce({
        sessions: [
          {
            id: "session-current-1",
            device_name: "Chrome 124 no Linux",
            ip_address: "192.168.1.50",
            created_at: new Date().toISOString(),
            expires_at: new Date(Date.now() + 86400000).toISOString(),
            is_current: true,
          },
          {
            id: "session-remote-2",
            device_name: "Safari no iPhone 15",
            ip_address: "10.0.0.12",
            created_at: new Date().toISOString(),
            expires_at: new Date(Date.now() + 86400000).toISOString(),
            is_current: false,
          },
        ],
        total: 2,
      });

      vi.mocked(securityApi.revokeSession).mockResolvedValueOnce({
        message: "Sessão revogada.",
        revoked_count: 1,
      });

      const user = userEvent.setup();
      render(
        <AuthProvider
          initialState={{
            isLoading: false,
            user: {
              id: "usr-01",
              name: "Daniel Ndonda",
              email: "daniel@infrawatch.io",
              role: "SUPER_ADMIN",
              mfa_enabled: false,
            },
            accessToken: "token-test",
          }}
        >
          <SecuritySettingsPage />
        </AuthProvider>
      );

      expect(await screen.findByText("Chrome 124 no Linux")).toBeInTheDocument();
      expect(screen.getByText("Safari no iPhone 15")).toBeInTheDocument();

      // Encerra a sessão remota
      const revokeBtn = screen.getByRole("button", {
        name: /desconectar dispositivo safari no iphone 15/i,
      });
      await user.click(revokeBtn);

      await waitFor(() => {
        expect(securityApi.revokeSession).toHaveBeenCalledWith("session-remote-2");
      });
    });

    it("deve paginar lista de sessões quando houver múltiplos dispositivos", async () => {
      const mockManySessions = Array.from({ length: 15 }, (_, i) => ({
        id: `session-${i + 1}`,
        device_name: `Dispositivo #${i + 1}`,
        ip_address: `192.168.1.${10 + i}`,
        created_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 86400000).toISOString(),
        is_current: i === 0,
      }));

      vi.mocked(securityApi.listSessions).mockResolvedValueOnce({
        sessions: mockManySessions,
        total: 15,
      });

      const user = userEvent.setup();
      render(
        <AuthProvider
          initialState={{
            isLoading: false,
            user: {
              id: "usr-01",
              name: "Daniel Ndonda",
              email: "daniel@infrawatch.io",
              role: "SUPER_ADMIN",
              mfa_enabled: false,
            },
            accessToken: "token-test",
          }}
        >
          <SecuritySettingsPage />
        </AuthProvider>
      );

      // Página 1: dispositivos 1 a 5 visíveis, dispositivo 6 não visível
      expect(await screen.findByText("Dispositivo #1")).toBeInTheDocument();
      expect(screen.getByText("Dispositivo #5")).toBeInTheDocument();
      expect(screen.queryByText("Dispositivo #6")).not.toBeInTheDocument();

      // Paginação informando 1 a 5 de 15
      expect(screen.getByTestId("sessions-pagination-container")).toBeInTheDocument();
      expect(screen.getByText(/mostrando/i)).toBeInTheDocument();

      // Navega para a página 2
      const nextBtn = screen.getByTestId("sessions-pagination-next");
      await user.click(nextBtn);

      // Página 2: dispositivos 6 a 10 visíveis, dispositivo 1 não visível
      expect(await screen.findByText("Dispositivo #6")).toBeInTheDocument();
      expect(screen.getByText("Dispositivo #10")).toBeInTheDocument();
      expect(screen.queryByText("Dispositivo #1")).not.toBeInTheDocument();
    });

    it("deve iniciar fluxo de configuração de MFA exibindo o segredo Base32", async () => {
      vi.mocked(securityApi.listSessions).mockResolvedValueOnce({
        sessions: [],
        total: 0,
      });

      vi.mocked(securityApi.setupMfa).mockResolvedValueOnce({
        secret: "JBSWY3DPEHPK3PXP",
        otpauth_uri: "otpauth://totp/InfraWatch:user@test.io?secret=JBSWY3DPEHPK3PXP",
      });

      const user = userEvent.setup();
      render(
        <AuthProvider
          initialState={{
            isLoading: false,
            user: {
              id: "usr-01",
              name: "Daniel Ndonda",
              email: "daniel@infrawatch.io",
              role: "SUPER_ADMIN",
              mfa_enabled: false,
            },
            accessToken: "token-test",
          }}
        >
          <SecuritySettingsPage />
        </AuthProvider>
      );

      const setupBtn = await screen.findByRole("button", {
        name: /configurar mfa agora/i,
      });
      await user.click(setupBtn);

      expect(await screen.findByText("JBSWY3DPEHPK3PXP")).toBeInTheDocument();
      expect(screen.getByTestId("mfa-qrcode-container")).toBeInTheDocument();
    });

    it("deve exibir e permitir download dos códigos de backup após confirmar ativação do MFA", async () => {
      vi.mocked(securityApi.listSessions).mockResolvedValueOnce({
        sessions: [],
        total: 0,
      });

      vi.mocked(securityApi.setupMfa).mockResolvedValueOnce({
        secret: "JBSWY3DPEHPK3PXP",
        otpauth_uri: "otpauth://totp/InfraWatch:user@test.io?secret=JBSWY3DPEHPK3PXP",
      });

      vi.mocked(securityApi.enableMfa).mockResolvedValueOnce({
        message: "MFA ativado com sucesso.",
        backup_codes: [
          "A1B2-C3D4",
          "E5F6-G7H8",
          "I9J0-K1L2",
          "M3N4-O5P6",
          "Q7R8-S9T0",
          "U1V2-W3X4",
          "Y5Z6-A7B8",
          "C9D0-E1F2",
          "G3H4-I5J6",
          "K7L8-M9N0",
        ],
      });

      const createObjectURLMock = vi.fn().mockReturnValue("blob:http://localhost/mock-blob-url");
      const revokeObjectURLMock = vi.fn();
      globalThis.URL.createObjectURL = createObjectURLMock;
      globalThis.URL.revokeObjectURL = revokeObjectURLMock;
      const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

      const user = userEvent.setup();
      render(
        <AuthProvider
          initialState={{
            isLoading: false,
            user: {
              id: "usr-01",
              name: "Daniel Ndonda",
              email: "daniel@infrawatch.io",
              role: "SUPER_ADMIN",
              mfa_enabled: false,
            },
            accessToken: "token-test",
          }}
        >
          <SecuritySettingsPage />
        </AuthProvider>
      );

      const setupBtn = await screen.findByRole("button", {
        name: /configurar mfa agora/i,
      });
      await user.click(setupBtn);

      expect(await screen.findByText("JBSWY3DPEHPK3PXP")).toBeInTheDocument();

      const codeInput = screen.getByPlaceholderText("000000");
      fireEvent.change(codeInput, { target: { value: "123456" } });

      const submitBtn = screen.getByRole("button", { name: /ativar mfa/i });
      fireEvent.click(submitBtn);

      expect(await screen.findByText("Códigos de Backup")).toBeInTheDocument();
      expect(screen.getByText("A1B2-C3D4")).toBeInTheDocument();
      expect(screen.getByText("K7L8-M9N0")).toBeInTheDocument();

      const copyBtn = screen.getByRole("button", { name: /copiar códigos/i });
      const downloadBtn = screen.getByRole("button", { name: /baixar \(\.txt\)/i });
      expect(copyBtn).toBeInTheDocument();
      expect(downloadBtn).toBeInTheDocument();

      await user.click(downloadBtn);

      expect(createObjectURLMock).toHaveBeenCalled();
      expect(revokeObjectURLMock).toHaveBeenCalled();
      expect(clickSpy).toHaveBeenCalled();
      clickSpy.mockRestore();
    });
  });
});
