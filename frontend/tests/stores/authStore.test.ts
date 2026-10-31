import { describe, it, expect, beforeEach, vi } from "vitest";
import { useAuthStore } from "../../src/stores/authStore";
import { authApi } from "../../src/services/authApi";
import type { AuthUser, TokenResponse, MfaChallengeResponse } from "../../src/types/auth";

vi.mock("../../src/services/authApi", () => ({
  authApi: {
    login: vi.fn(),
    loginMfaChallenge: vi.fn(),
    googleCallback: vi.fn(),
    logout: vi.fn(),
  },
}));

describe("Zustand AuthStore (Issue #276)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    sessionStorage.clear();
    useAuthStore.getState().reset();
  });

  it("deve iniciar com estado desautenticado limpo", () => {
    const state = useAuthStore.getState();
    expect(state.user).toBeNull();
    expect(state.accessToken).toBeNull();
    expect(state.refreshToken).toBeNull();
    expect(state.isAuthenticated).toBe(false);
    expect(state.isLoading).toBe(false);
    expect(state.mfaPendingToken).toBeNull();
  });

  it("deve realizar login nominal com sucesso e atualizar credenciais", async () => {
    const mockTokenResponse: TokenResponse = {
      access_token: "jwt-access-token",
      refresh_token: "jwt-refresh-token",
      token_type: "bearer",
      expires_in: 3600,
      user: {
        id: "usr-1",
        email: "admin@infrawatch.ao",
        full_name: "Administrador Geral",
        role: "SUPER_ADMIN",
        is_active: true,
        mfa_enabled: false,
      },
    };

    vi.mocked(authApi.login).mockResolvedValueOnce(mockTokenResponse);

    const result = await useAuthStore.getState().login({
      email: "admin@infrawatch.ao",
      password: "SecretPassword123!",
    });

    expect(result.success).toBe(true);
    expect(result.mfaRequired).toBe(false);

    const state = useAuthStore.getState();
    expect(state.isAuthenticated).toBe(true);
    expect(state.accessToken).toBe("jwt-access-token");
    expect(state.refreshToken).toBe("jwt-refresh-token");
    expect(state.user?.name).toBe("Administrador Geral");
    expect(state.user?.role).toBe("SUPER_ADMIN");
  });

  it("deve ativar mfaPendingToken quando o backend exigir desafio MFA", async () => {
    const mockMfaResponse: MfaChallengeResponse = {
      mfa_required: true,
      mfa_pending_token: "mfa-temp-token-xyz",
    };

    vi.mocked(authApi.login).mockResolvedValueOnce(mockMfaResponse);

    const result = await useAuthStore.getState().login({
      email: "mfa@infrawatch.ao",
      password: "SecretPassword123!",
    });

    expect(result.success).toBe(false);
    expect(result.mfaRequired).toBe(true);

    const state = useAuthStore.getState();
    expect(state.isAuthenticated).toBe(false);
    expect(state.mfaPendingToken).toBe("mfa-temp-token-xyz");
  });

  it("deve autenticar com sucesso após responder ao desafio MFA", async () => {
    useAuthStore.setState({ mfaPendingToken: "mfa-temp-token-xyz" });

    const mockTokenResponse: TokenResponse = {
      access_token: "mfa-access-token",
      refresh_token: "mfa-refresh-token",
      token_type: "bearer",
      expires_in: 3600,
      user: {
        id: "usr-2",
        email: "operador@infrawatch.ao",
        full_name: "Operador NOC",
        role: "NOC_OPERATOR",
        is_active: true,
        mfa_enabled: true,
      },
    };

    vi.mocked(authApi.loginMfaChallenge).mockResolvedValueOnce(mockTokenResponse);

    const user = await useAuthStore.getState().submitMfaChallenge("123456");

    expect(user.role).toBe("NOC_OPERATOR");
    expect(useAuthStore.getState().isAuthenticated).toBe(true);
    expect(useAuthStore.getState().mfaPendingToken).toBeNull();
    expect(useAuthStore.getState().accessToken).toBe("mfa-access-token");
  });

  it("deve verificar roles e permissões RBAC com hasRole", () => {
    const mockUser: AuthUser = {
      id: "usr-3",
      email: "noc@infrawatch.ao",
      name: "Operador 1",
      role: "NOC_OPERATOR",
    };

    useAuthStore.getState().setUser(mockUser);
    useAuthStore.getState().setTokens("token", "refresh");

    expect(useAuthStore.getState().hasRole("NOC_OPERATOR")).toBe(true);
    expect(useAuthStore.getState().hasRole("SUPER_ADMIN")).toBe(false);
    expect(useAuthStore.getState().hasRole(["SUPER_ADMIN", "NOC_OPERATOR"])).toBe(true);
    expect(useAuthStore.getState().hasRole(["ORG_ADMIN", "CLIENT_VIEWER"])).toBe(false);
  });

  it("deve limpar estado e storage no logout", async () => {
    useAuthStore.setState({
      user: {
        id: "usr-1",
        email: "teste@infrawatch.ao",
        name: "Teste",
        role: "SUPER_ADMIN",
      },
      accessToken: "token-ativo",
      refreshToken: "refresh-ativo",
      isAuthenticated: true,
    });

    vi.mocked(authApi.logout).mockResolvedValueOnce({
      status: "success",
      message: "Desconectado",
    });

    await useAuthStore.getState().logout();

    const state = useAuthStore.getState();
    expect(state.user).toBeNull();
    expect(state.accessToken).toBeNull();
    expect(state.refreshToken).toBeNull();
    expect(state.isAuthenticated).toBe(false);
    expect(localStorage.getItem("infrawatch_auth")).toBeNull();
  });
});
