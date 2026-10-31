import axios, { AxiosError, AxiosInstance, InternalAxiosRequestConfig } from "axios";
import { api } from "./api";
import { resolveApiUrl } from "../utils/env";
import { useAuthStore } from "../stores/authStore";

const REFRESH_TOKEN_STORAGE_KEY = "infrawatch_refresh_token";

let onTokenExpiredCallback: (() => void) | null = null;

export function getInMemoryAccessToken(): string | null {
  return useAuthStore.getState().accessToken;
}

export function setInMemoryAccessToken(token: string | null): void {
  const currentRefresh = useAuthStore.getState().refreshToken;
  useAuthStore.getState().setTokens(token, currentRefresh);
}

export function getStoredRefreshToken(): string | null {
  const token = useAuthStore.getState().refreshToken;
  if (token) return token;
  try {
    return localStorage.getItem(REFRESH_TOKEN_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function setStoredRefreshToken(token: string | null): void {
  const currentAccess = useAuthStore.getState().accessToken;
  useAuthStore.getState().setTokens(currentAccess, token);
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

export function setTokens(accessToken: string | null, refreshToken: string | null): void {
  useAuthStore.getState().setTokens(accessToken, refreshToken);
  try {
    if (refreshToken) {
      localStorage.setItem(REFRESH_TOKEN_STORAGE_KEY, refreshToken);
    } else {
      localStorage.removeItem(REFRESH_TOKEN_STORAGE_KEY);
    }
  } catch {
    // Silencioso
  }
}

export function setOnTokenExpired(callback: () => void): void {
  onTokenExpiredCallback = callback;
}

export function handleUnauthorized(): void {
  useAuthStore.getState().reset();
  try {
    localStorage.removeItem(REFRESH_TOKEN_STORAGE_KEY);
    localStorage.removeItem("infrawatch_auth");
  } catch {
    // Silencioso
  }
  onTokenExpiredCallback?.();

  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("infrawatch:unauthorized"));
  }
}

// =============================================================================
// Controle de Fila Atômica (FIFO Queue) para Silent Refresh Concorrente
// =============================================================================

interface FailedQueueItem {
  resolve: (token: string) => void;
  reject: (error: unknown) => void;
}

let isRefreshing = false;
let failedQueue: FailedQueueItem[] = [];

export function getIsRefreshing(): boolean {
  return isRefreshing;
}

export function getFailedQueueLength(): number {
  return failedQueue.length;
}

export function resetInterceptorsState(): void {
  isRefreshing = false;
  failedQueue = [];
  onTokenExpiredCallback = null;
  useAuthStore.getState().reset();
}

function processQueue(error: unknown, token: string | null = null): void {
  failedQueue.forEach((promise) => {
    if (token) {
      promise.resolve(token);
    } else {
      promise.reject(error);
    }
  });

  failedQueue = [];
}

/**
 * Registra os interceptors de Request e Response com fila atômica de renovação.
 */
export function setupInterceptors(axiosInstance: AxiosInstance): void {
  // 1. Interceptor de Request: injeção de token Bearer
  axiosInstance.interceptors.request.use(
    (config: InternalAxiosRequestConfig) => {
      const token = getInMemoryAccessToken();

      if (token && config.headers) {
        config.headers.Authorization = `Bearer ${token}`;
      }

      return config;
    },
    (error) => Promise.reject(error)
  );

  // 2. Interceptor de Response: captura de 401 e silent refresh com fila FIFO
  axiosInstance.interceptors.response.use(
    (response) => response,
    async (error: AxiosError) => {
      const originalRequest = error.config as InternalAxiosRequestConfig & {
        _retry?: boolean;
        skipAuth?: boolean;
      };

      if (!originalRequest || !error.response || error.response.status !== 401) {
        return Promise.reject(error);
      }

      // Se a rota for configurada para ignorar autenticação, propaga o erro diretamente
      if (originalRequest.skipAuth) {
        return Promise.reject(error);
      }

      // Evita loops infinitos de renovação para rotas de autenticação
      const requestUrl = originalRequest.url ?? "";
      if (
        requestUrl.includes("/auth/refresh") ||
        requestUrl.includes("/auth/login")
      ) {
        return Promise.reject(error);
      }

      // Se esta requisição já foi retentada após refresh e falhou de novo, rejeita
      if (originalRequest._retry) {
        return Promise.reject(error);
      }

      // Cenário de corrida: outra requisição já disparou o refresh; enfileira esta
      if (isRefreshing) {
        return new Promise<string>((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        })
          .then((token) => {
            if (originalRequest.headers) {
              originalRequest.headers.Authorization = `Bearer ${token}`;
            }
            return axiosInstance(originalRequest);
          })
          .catch((err) => Promise.reject(err));
      }

      // Primeira requisição a receber 401: assume a liderança do refresh
      originalRequest._retry = true;
      isRefreshing = true;

      const refreshToken = getStoredRefreshToken();

      if (!refreshToken) {
        isRefreshing = false;
        handleUnauthorized();
        return Promise.reject(error);
      }

      try {
        const refreshUrl = resolveApiUrl("/api/v1/auth/refresh");

        // Executa com a instância base do axios (sem os interceptors da instância api)
        const response = await axios.post<{
          access_token: string;
          refresh_token: string;
        }>(
          refreshUrl,
          { refresh_token: refreshToken },
          { headers: { "Content-Type": "application/json" } }
        );

        const { access_token, refresh_token: newRefreshToken } = response.data;

        setTokens(access_token, newRefreshToken);

        if (originalRequest.headers) {
          originalRequest.headers.Authorization = `Bearer ${access_token}`;
        }

        // Despeja a fila de requisições pendentes com o novo token
        processQueue(null, access_token);

        // Reexecuta a requisição original
        return axiosInstance(originalRequest);
      } catch (refreshError) {
        processQueue(refreshError, null);
        handleUnauthorized();
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }
  );
}

// Configura os interceptors na instância padrão 'api'
setupInterceptors(api);
