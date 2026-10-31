import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import axios, { AxiosResponse, InternalAxiosRequestConfig } from "axios";
import { api } from "../../src/services/api";
import {
  setInMemoryAccessToken,
  getInMemoryAccessToken,
  getStoredRefreshToken,
  resetInterceptorsState,
  setOnTokenExpired,
  handleUnauthorized,
  setTokens,
} from "../../src/services/interceptors";
import { apiClient } from "../../src/services/apiClient";

describe("Cliente Axios & Interceptors com Fila Atômica (Issue #275)", () => {
  beforeEach(() => {
    resetInterceptorsState();
    localStorage.clear();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    resetInterceptorsState();
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("deve gerenciar estado do access token em memória e refresh token em storage", () => {
    expect(getInMemoryAccessToken()).toBeNull();
    expect(getStoredRefreshToken()).toBeNull();

    setTokens("access-123", "refresh-456");

    expect(getInMemoryAccessToken()).toBe("access-123");
    expect(getStoredRefreshToken()).toBe("refresh-456");

    handleUnauthorized();

    expect(getInMemoryAccessToken()).toBeNull();
    expect(getStoredRefreshToken()).toBeNull();
  });

  it("deve disparar evento customizado e callback ao detectar sessão não autorizada", () => {
    const expiredCallback = vi.fn();
    setOnTokenExpired(expiredCallback);

    const eventListener = vi.fn();
    window.addEventListener("infrawatch:unauthorized", eventListener);

    handleUnauthorized();

    expect(expiredCallback).toHaveBeenCalledTimes(1);
    expect(eventListener).toHaveBeenCalledTimes(1);

    window.removeEventListener("infrawatch:unauthorized", eventListener);
  });

  it("deve injetar cabeçalho Authorization Bearer quando o access token estiver disponível", async () => {
    setInMemoryAccessToken("my-valid-token");

    const mockAdapter = vi.fn().mockImplementation((config: InternalAxiosRequestConfig) => {
      expect(config.headers.Authorization).toBe("Bearer my-valid-token");
      return Promise.resolve({
        data: { ok: true },
        status: 200,
        statusText: "OK",
        headers: {},
        config,
      } as AxiosResponse);
    });

    api.defaults.adapter = mockAdapter;

    const result = await apiClient.get<{ ok: boolean }>("/api/v1/test");
    expect(result).toEqual({ ok: true });
    expect(mockAdapter).toHaveBeenCalledTimes(1);
  });

  it("não deve injetar cabeçalho Authorization se access token for nulo", async () => {
    setInMemoryAccessToken(null);

    const mockAdapter = vi.fn().mockImplementation((config: InternalAxiosRequestConfig) => {
      expect(config.headers.Authorization).toBeUndefined();
      return Promise.resolve({
        data: { public: true },
        status: 200,
        statusText: "OK",
        headers: {},
        config,
      } as AxiosResponse);
    });

    api.defaults.adapter = mockAdapter;

    const result = await apiClient.get<{ public: boolean }>("/api/v1/public");
    expect(result).toEqual({ public: true });
    expect(mockAdapter).toHaveBeenCalledTimes(1);
  });

  it("deve executar Silent Refresh transparente em caso de 401 e reexecutar a requisição", async () => {
    setTokens("expired-token", "valid-refresh-token");

    let callCount = 0;
    const mockAdapter = vi.fn().mockImplementation((config: InternalAxiosRequestConfig) => {
      callCount++;
      if (callCount === 1) {
        // Primeira requisição recebe 401
        return Promise.reject({
          response: { status: 401, data: { detail: "Token expirado" } },
          config,
          isAxiosError: true,
        });
      }

      // Segunda chamada (reexecução após refresh)
      expect(config.headers.Authorization).toBe("Bearer new-access-token");
      return Promise.resolve({
        data: { message: "Sucesso após renovação" },
        status: 200,
        statusText: "OK",
        headers: {},
        config,
      } as AxiosResponse);
    });

    api.defaults.adapter = mockAdapter;

    // Mock do refresh do axios base
    const axiosPostSpy = vi.spyOn(axios, "post").mockResolvedValueOnce({
      data: {
        access_token: "new-access-token",
        refresh_token: "new-refresh-token",
      },
    });

    const result = await apiClient.get<{ message: string }>("/api/v1/protected");

    expect(result).toEqual({ message: "Sucesso após renovação" });
    expect(axiosPostSpy).toHaveBeenCalledTimes(1);
    expect(getInMemoryAccessToken()).toBe("new-access-token");
    expect(getStoredRefreshToken()).toBe("new-refresh-token");
    expect(callCount).toBe(2);
  });

  it("deve resolver múltiplas requisições paralelas recebendo 401 através da fila atômica disparando apenas 1 refresh", async () => {
    setTokens("old-token", "shared-refresh-token");

    const callsMap: Record<string, number> = {};

    const mockAdapter = vi.fn().mockImplementation((config: InternalAxiosRequestConfig) => {
      const url = config.url || "";
      callsMap[url] = (callsMap[url] || 0) + 1;

      if (callsMap[url] === 1) {
        return Promise.reject({
          response: { status: 401, data: { detail: "Unauthorized" } },
          config,
          isAxiosError: true,
        });
      }

      return Promise.resolve({
        data: { url, tokenReceived: config.headers.Authorization },
        status: 200,
        statusText: "OK",
        headers: {},
        config,
      } as AxiosResponse);
    });

    api.defaults.adapter = mockAdapter;

    // Mock com leve atraso para testar o enfileiramento das outras requisições
    const axiosPostSpy = vi.spyOn(axios, "post").mockImplementation(async () => {
      await new Promise((r) => setTimeout(r, 20));
      return {
        data: {
          access_token: "refreshed-token-999",
          refresh_token: "refreshed-token-999",
        },
      };
    });

    // 3 requisições disparadas simultaneamente
    const [res1, res2, res3] = await Promise.all([
      apiClient.get<any>("/api/v1/resource-1"),
      apiClient.get<any>("/api/v1/resource-2"),
      apiClient.get<any>("/api/v1/resource-3"),
    ]);

    // O refresh deve ter sido chamado EXATAMENTE 1 vez
    expect(axiosPostSpy).toHaveBeenCalledTimes(1);

    expect(res1.tokenReceived).toBe("Bearer refreshed-token-999");
    expect(res2.tokenReceived).toBe("Bearer refreshed-token-999");
    expect(res3.tokenReceived).toBe("Bearer refreshed-token-999");
  });

  it("deve limpar credenciais e rejeitar chamadas se a renovação de token falhar com 401", async () => {
    setTokens("expired-token", "revoked-refresh-token");

    const expiredCallback = vi.fn();
    setOnTokenExpired(expiredCallback);

    const mockAdapter = vi.fn().mockImplementation((config: InternalAxiosRequestConfig) => {
      return Promise.reject({
        response: { status: 401, data: { detail: "Token expirado" } },
        config,
        isAxiosError: true,
      });
    });

    api.defaults.adapter = mockAdapter;

    // Refresh falha com 401
    vi.spyOn(axios, "post").mockRejectedValueOnce({
      response: { status: 401, data: { detail: "Refresh token revogado" } },
      isAxiosError: true,
    });

    await expect(apiClient.get("/api/v1/any-route")).rejects.toThrow();

    expect(getInMemoryAccessToken()).toBeNull();
    expect(getStoredRefreshToken()).toBeNull();
    expect(expiredCallback).toHaveBeenCalledTimes(1);
  });
});
