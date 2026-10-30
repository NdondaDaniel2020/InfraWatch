/**
 * Cliente HTTP unificado para a API do InfraWatch.
 * Implementa ADR-033 e Issue #275:
 * - Delegação transparente para o cliente Axios centralizado ('api').
 * - Access Token gerenciado em memória volátil (mitigação de XSS) e integrado com interceptors.
 * - Fila atômica de Silent Refresh (FIFO) com proteção contra condições de corrida no 401.
 * - Injeção automática de header 'Authorization: Bearer <token>'.
 */

import { AxiosError } from "axios";
import { api } from "./api";
import {
  getInMemoryAccessToken,
  setInMemoryAccessToken,
  getStoredRefreshToken,
  setStoredRefreshToken,
  setOnTokenExpired,
  setTokens,
  handleUnauthorized,
} from "./interceptors";

export {
  getInMemoryAccessToken,
  setInMemoryAccessToken,
  getStoredRefreshToken,
  setStoredRefreshToken,
  setOnTokenExpired,
  setTokens,
  handleUnauthorized,
};

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

export interface RequestOptions extends RequestInit {
  skipAuth?: boolean;
}

/**
 * Executa requisição autenticada utilizando a instância do Axios com retry e silent refresh.
 */
export async function apiRequest<T>(
  endpoint: string,
  options: RequestOptions = {}
): Promise<T> {
  const { skipAuth = false, headers, method = "GET", body } = options;

  let requestHeaders: Record<string, string> | undefined;

  if (headers) {
    requestHeaders = {};
    if (headers instanceof Headers) {
      headers.forEach((value, key) => {
        requestHeaders![key] = value;
      });
    } else if (Array.isArray(headers)) {
      headers.forEach(([key, value]) => {
        requestHeaders![key] = value;
      });
    } else {
      Object.assign(requestHeaders, headers);
    }
  }

  let dataToSend: unknown = body;
  if (typeof body === "string") {
    try {
      dataToSend = JSON.parse(body);
    } catch {
      dataToSend = body;
    }
  }

  try {
    const response = await api.request<T>({
      url: endpoint,
      method: method as any,
      data: dataToSend,
      headers: requestHeaders,
      ...({ skipAuth } as any),
    });

    return response.data;
  } catch (error) {
    if (error instanceof AxiosError) {
      const status = error.response?.status ?? 500;
      const respData = error.response?.data;

      const errorMessage =
        (typeof respData === "object" &&
          respData !== null &&
          "detail" in respData &&
          typeof (respData as { detail: unknown }).detail === "string")
          ? (respData as { detail: string }).detail
          : error.message || `Erro HTTP ${status}`;

      throw new ApiError(errorMessage, status, respData);
    }

    if (error instanceof ApiError) {
      throw error;
    }

    throw new ApiError(
      (error as Error)?.message || "Erro de rede na comunicação com a API",
      500,
      error
    );
  }
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

export default apiClient;
