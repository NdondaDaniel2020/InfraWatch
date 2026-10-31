import axios, { AxiosInstance } from "axios";
import { ENV } from "../utils/env";

/**
 * Instância centralizada do cliente HTTP Axios para o InfraWatch.
 * Baseada no padrão arquitetural do BidLive (src/shared/http/api.ts).
 * 
 * - baseURL parametrizada via ENV.API_BASE_URL (same-origin ou dev standalone)
 * - timeout padrão de 15 segundos
 * - cabeçalho Content-Type padronizado
 */
export const api: AxiosInstance = axios.create({
  baseURL: ENV.API_BASE_URL || undefined,
  timeout: 15000,
  adapter: typeof fetch !== "undefined" ? "fetch" : undefined,
  headers: {
    "Content-Type": "application/json",
  },
});

export default api;
