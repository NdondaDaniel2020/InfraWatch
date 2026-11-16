/**
 * Tipagens TypeScript para a Central de Configurações e Diagnóstico de Integrações (Issue #268).
 */

export interface IntegrationStatusItem {
  name: string;
  enabled: boolean;
  endpoint: string | null;
  configured: boolean;
  source?: "database" | "environment";
  updated_at?: string | null;
  updated_by_email?: string | null;
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
  timescale_active?: boolean | null;
  redis_persistence?: string | null;
}

export interface GlpiSettingsUpdateRequest {
  endpoint: string;
  enabled?: boolean;
  app_token?: string;
  user_token?: string;
  timeout_seconds?: number;
  validate_connectivity?: boolean;
}

export interface ZabbixSettingsUpdateRequest {
  endpoint: string;
  enabled?: boolean;
  api_token?: string;
  username?: string;
  password?: string;
  timeout_seconds?: number;
  validate_connectivity?: boolean;
}

export interface TelegramSettingsUpdateRequest {
  bot_token?: string;
  default_chat_id?: string;
  enabled?: boolean;
  validate_connectivity?: boolean;
}

export interface WhatsappSettingsUpdateRequest {
  gateway_url: string;
  enabled?: boolean;
  api_token?: string;
  default_recipient?: string;
  validate_connectivity?: boolean;
}

export interface SmtpSettingsUpdateRequest {
  host: string;
  port?: number;
  tls?: boolean;
  from_address: string;
  user?: string;
  password?: string;
  default_recipient?: string;
  enabled?: boolean;
  validate_connectivity?: boolean;
}

export interface WebhookSettingsUpdateRequest {
  url?: string;
  enabled?: boolean;
  validate_connectivity?: boolean;
}

export interface IntegrationUpdateResponse {
  success: boolean;
  name: string;
  message: string;
  source: "database" | "environment";
  details?: Record<string, unknown>;
}
