import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { useAuthStore } from "../src/stores/authStore";
import { setTokens, getInMemoryAccessToken } from "../src/services/interceptors";
import { authApi } from "../src/services/authApi";

describe("Segurança de Sessão e Isolamento de Tokens (ADR-033)", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    useAuthStore.getState().reset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("accessToken deve ser mantido estritamente em memória volátil e nunca no localStorage", () => {
    const mockAccessToken = "mock.jwt.access.token";
    const mockRefreshToken = "mock.jwt.refresh.token";

    setTokens(mockAccessToken, mockRefreshToken);

    // 1. Em memória deve estar disponível
    expect(getInMemoryAccessToken()).toBe(mockAccessToken);
    expect(useAuthStore.getState().accessToken).toBe(mockAccessToken);

    // 2. No localStorage NÃO deve existir accessToken em infrawatch_auth
    const storedAuth = localStorage.getItem("infrawatch_auth");
    if (storedAuth) {
      const parsed = JSON.parse(storedAuth);
      expect(parsed.state.accessToken).toBeUndefined();
    }
  });

  it("logout() deve enviar o refresh token atual para a rota de revogação do backend", async () => {
    const mockRefreshToken = "active-refresh-token-xyz";
    useAuthStore.getState().setTokens("active-access-token", mockRefreshToken);
    useAuthStore.getState().setUser({
      id: "usr-1",
      email: "operator@infrawatch.io",
      name: "Operador",
      role: "NOC_OPERATOR",
    });

    const logoutSpy = vi.spyOn(authApi, "logout").mockResolvedValue({
      status: "success",
      message: "Sessão revogada com sucesso.",
    });

    await useAuthStore.getState().logout();

    expect(logoutSpy).toHaveBeenCalledTimes(1);
    expect(logoutSpy).toHaveBeenCalledWith(mockRefreshToken);

    // Após logout, o estado e storages devem ser limpos
    expect(useAuthStore.getState().accessToken).toBeNull();
    expect(useAuthStore.getState().refreshToken).toBeNull();
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
  });
});
