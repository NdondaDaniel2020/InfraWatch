/**
 * Cliente HTTP unificado para a API do InfraWatch.
 * Implementa ADR-033:
 * - Access Token armazenado estritamente em memória volátil (in-memory).
 * - Fila atômica de Silent Refresh com proteção contra corrida no status 401.
 * - Injeção automática de header 'Authorization: Bearer <token>'.
 */

const REFRESH_TOKEN_STORAGE_KEY = "infrawatch_refresh_token";

// Armazenamento estritamente em memória volátil do Access Token (mitigação de XSS)
let inMemoryAccessToken: string | null = null;
let onTokenExpiredCallback: (() => void) | null = null;

export function setInMemoryAccessToken(token: string | null): void {
  inMemoryAccessToken = token;
}

export function getInMemoryAccessToken(): string | null {
  return inMemoryAccessToken;
}

export function getStoredRefreshToken(): string | null {
  try {
    return localStorage.getItem(REFRESH_TOKEN_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function setStoredRefreshToken(token: string | null): void {
  try {
    if (token) {
      localStorage.setItem(REFRESH_TOKEN_STORAGE_KEY, token);
    } else {
      localStorage.removeItem(REFRESH_TOKEN_STORAGE_KEY);
    }
  } catch {
    // Falha silenciosa em ambientes sem acesso a storage
  }
}

export function setOnTokenExpired(callback: () => void): void {
  onTokenExpiredCallback = callback;
}

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public data?: unknown
  ) {
    super(message);
    this.name = "ApiError";
  }
}

interface RequestOptions extends RequestInit {
  skipAuth?: boolean;
}

// Controle de concorrência para Silent Refresh (evita rotação dupla)
let isRefreshing = false;
let refreshSubscribers: Array<(token: string | null) => void> = [];

function subscribeTokenRefresh(callback: (token: string | null) => void): void {
  refreshSubscribers.push(callback);
}

function onRefreshed(token: string | null): void {
  refreshSubscribers.forEach((cb) => cb(token));
  refreshSubscribers = [];
}

/**
 * Executa requisição autenticada com retry automático em caso de token expirado (401).
 */
export async function apiRequest<T>(
  endpoint: string,
  options: RequestOptions = {}
): Promise<T> {
  const { skipAuth = false, headers, ...restOptions } = options;
  const requestHeaders = new Headers(headers);

  // Define Content-Type JSON caso não seja envio de FormData
  if (!(restOptions.body instanceof FormData) && !requestHeaders.has("Content-Type")) {
    requestHeaders.set("Content-Type", "application/json");
  }

  // Injeta Access Token se disponível e não for rota pública
  if (!skipAuth && inMemoryAccessToken) {
    requestHeaders.set("Authorization", `Bearer ${inMemoryAccessToken}`);
  }

  const url = endpoint.startsWith("http") ? endpoint : endpoint;

  let response = await fetch(url, {
    ...restOptions,
    headers: requestHeaders,
  });

  // Se receber 401 e a rota necessita de autenticação, tenta Silent Refresh
  if (response.status === 401 && !skipAuth) {
    const rawRefreshToken = getStoredRefreshToken();

    if (!rawRefreshToken) {
      setInMemoryAccessToken(null);
      onTokenExpiredCallback?.();
      throw new ApiError("Sessão expirada. Faça login novamente.", 401);
    }

    if (!isRefreshing) {
      isRefreshing = true;

      try {
        const refreshResponse = await fetch("/api/v1/auth/refresh", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ refresh_token: rawRefreshToken }),
        });

        if (!refreshResponse.ok) {
          throw new Error("Falha ao renovar token");
        }

        const data = (await refreshResponse.json()) as {
          access_token: string;
          refresh_token: string;
        };

        setInMemoryAccessToken(data.access_token);
        setStoredRefreshToken(data.refresh_token);
        isRefreshing = false;
        onRefreshed(data.access_token);
      } catch (err) {
        isRefreshing = false;
        setInMemoryAccessToken(null);
        setStoredRefreshToken(null);
        onRefreshed(null);
        onTokenExpiredCallback?.();
        throw new ApiError("Sessão expirada. Faça login novamente.", 401, err);
      }
    }

    // Aguarda a conclusão da renovação em andamento
    const newToken = await new Promise<string | null>((resolve) => {
      subscribeTokenRefresh((token) => resolve(token));
    });

    if (!newToken) {
      throw new ApiError("Não foi possível autenticar a requisição.", 401);
    }

    // Reenvia a requisição original com o novo token
    requestHeaders.set("Authorization", `Bearer ${newToken}`);
    response = await fetch(url, {
      ...restOptions,
      headers: requestHeaders,
    });
  }

  // Processa a resposta
  const contentType = response.headers.get("content-type");
  const isJson = contentType && contentType.includes("application/json");
  const data = isJson ? await response.json() : await response.text();

  if (!response.ok) {
    const errorMessage =
      (typeof data === "object" && data !== null && "detail" in data && typeof (data as { detail: unknown }).detail === "string")
        ? (data as { detail: string }).detail
        : response.statusText || `Erro HTTP ${response.status}`;

    throw new ApiError(errorMessage, response.status, data);
  }

  return data as T;
}

export const apiClient = {
  get: <T>(endpoint: string, options: RequestOptions = {}) =>
    apiRequest<T>(endpoint, { method: "GET", ...options }),
  post: <T>(endpoint: string, body?: unknown, options: RequestOptions = {}) =>
    apiRequest<T>(endpoint, {
      method: "POST",
      body: body ? JSON.stringify(body) : undefined,
      ...options,
    }),
  put: <T>(endpoint: string, body?: unknown, options: RequestOptions = {}) =>
    apiRequest<T>(endpoint, {
      method: "PUT",
      body: body ? JSON.stringify(body) : undefined,
      ...options,
    }),
  delete: <T>(endpoint: string, options: RequestOptions = {}) =>
    apiRequest<T>(endpoint, { method: "DELETE", ...options }),
};
