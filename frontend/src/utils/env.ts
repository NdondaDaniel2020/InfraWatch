/**
 * Utilitário centralizado de configuração de ambiente e resolução de URLs.
 * Implementa padrão arquitetural de inferência dinâmica de protocolo e host
 * com suporte transparente a same-origin (Gateway Nginx) e dev standalone.
 * Referência: Issue #274 e padrão BidLive (env.utils.ts).
 */

const isBrowser = typeof window !== "undefined";
const wsProto = isBrowser && window.location.protocol === "https:" ? "wss:" : "ws:";
const host = isBrowser ? window.location.host : "";

/**
 * Remove barras finais redundantes de uma URL base.
 */
function stripTrailingSlash(url: string): string {
  return url.replace(/\/+$/, "");
}

/**
 * Garante que o endpoint inicie com uma barra única.
 */
function ensureLeadingSlash(endpoint: string): string {
  return endpoint.startsWith("/") ? endpoint : `/${endpoint}`;
}

const rawApiUrl = (import.meta.env?.VITE_API_URL ?? "").trim();
const rawSseUrl = (import.meta.env?.VITE_SSE_URL ?? "").trim();
const rawWsUrl = (import.meta.env?.VITE_WS_BASE_URL ?? "").trim();

const normalizedApiBase = rawApiUrl ? stripTrailingSlash(rawApiUrl) : "";

export const ENV = {
  /** Ambiente de execução (development, production, test) */
  MODE: import.meta.env?.MODE ?? "development",
  IS_DEV: Boolean(import.meta.env?.DEV),
  IS_PROD: Boolean(import.meta.env?.PROD),

  /** Habilitação explícita de dados mockados em desenvolvimento */
  ENABLE_MOCKS: import.meta.env?.VITE_ENABLE_MOCKS === "true",

  /** Título da aplicação */
  APP_TITLE: import.meta.env?.VITE_APP_TITLE ?? "InfraWatch NOC",

  /**
   * URL base da API REST.
   * Se vazia, as chamadas serão relativas (same-origin pelo Gateway Nginx).
   * Se configurada (ex: http://localhost:8000), será prefixada nas requisições.
   */
  API_BASE_URL: normalizedApiBase,

  /**
   * URL completa do endpoint de Server-Sent Events (SSE).
   */
  SSE_STREAM_URL: rawSseUrl
    ? rawSseUrl
    : normalizedApiBase
    ? `${normalizedApiBase}/api/v1/events/stream`
    : "/api/v1/events/stream",

  /**
   * URL base para conexões WebSocket com protocolo dinâmico (ws:// ou wss://).
   */
  WS_BASE_URL: rawWsUrl
    ? stripTrailingSlash(rawWsUrl)
    : host
    ? `${wsProto}//${host}`
    : "",
} as const;

/**
 * Resolve a URL final de um endpoint de API.
 * - Mantém inalteradas URLs absolutas já prefixadas com http:// ou https://.
 * - Concatena API_BASE_URL quando configurado (evitando barras duplas).
 * - Retorna caminho relativo same-origin quando API_BASE_URL não estiver configurado.
 */
export function resolveApiUrl(endpoint: string): string {
  if (endpoint.startsWith("http://") || endpoint.startsWith("https://")) {
    return endpoint;
  }

  const cleanEndpoint = ensureLeadingSlash(endpoint);

  if (!ENV.API_BASE_URL) {
    return cleanEndpoint;
  }

  return `${ENV.API_BASE_URL}${cleanEndpoint}`;
}

export default ENV;
