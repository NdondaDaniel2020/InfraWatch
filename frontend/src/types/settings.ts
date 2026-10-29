/**
 * Tipagens TypeScript para a Central de Configurações e Diagnóstico de Integrações (Issue #268).
 */

export interface IntegrationStatusItem {
  name: string;
  enabled: boolean;
  endpoint: string | null;
  configured: boolean;
  details: Record<string, unknown>;
}

export interface IntegrationStatusResponse {
  integrations: IntegrationStatusItem[];
  environment: string;
}

export interface GlpiTestRequest {
  base_url?: string;
  app_token?: string;
  user_token?: string;
}

export interface GlpiTestResponse {
  success: boolean;
  latency_ms: number;
  message: string;
  session_token_obtained: boolean;
  ticket_id?: number | null;
  error?: string | null;
}

export interface ZabbixTestRequest {
  api_url?: string;
  api_token?: string;
  username?: string;
  password?: string;
}

export interface ZabbixTestResponse {
  success: boolean;
  latency_ms: number;
  message: string;
  api_version?: string | null;
  hosts_count: number;
  error?: string | null;
}

export interface NotificationTestRequest {
  channel: "telegram" | "whatsapp" | "smtp" | "webhook";
  recipient?: string;
  severity?: "CRITICAL" | "DEGRADED" | "RESOLVED" | "INFO";
}

export interface NotificationTestResponse {
  success: boolean;
  channel: string;
  latency_ms: number;
  message: string;
  error?: string | null;
}

export interface InfraTestResponse {
  postgres_ok: boolean;
  postgres_latency_ms: number;
  redis_ok: boolean;
  redis_latency_ms: number;
  message: string;
}
