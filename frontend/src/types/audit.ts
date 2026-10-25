/**
 * Tipagens para a Trilha de Auditoria Forense & Compliance (Append-Only).
 * Baseado no modelo ADR-012, RFC 5424 e RFC 3161.
 */

export type AuditActionType =
  | "DEVICE_PAUSED"
  | "INCIDENT_ACK"
  | "GLPI_SYNC"
  | "SLA_EXEMPT_REQ"
  | "SESSION_MFA"
  | "USER_ROLE_UPDATED"
  | "CONFIG_CHANGE"
  | "ORG_CREATED"
  | string;

export type AuditActorRole = "SUPER_ADMIN" | "NOC_OPERATOR" | "ORG_ADMIN" | "SYSTEM" | string;

export interface AuditLogEntry {
  id: string;
  action: AuditActionType;
  resource_type: string;
  resource_id: string;
  actor_user_id: string | null;
  actor_name?: string;
  actor_role: AuditActorRole;
  organization_id: string | null;
  result: "SUCCESS" | "FAILURE" | string;
  details: Record<string, unknown> | null;
  ip_address: string | null;
  created_at: string;
  previous_hash: string | null;
  hash: string;
  merkle_root?: string;
}

export interface AuditListResponse {
  items: AuditLogEntry[];
  total: number;
  page: number;
  page_size: number;
}

export interface AuditIntegrityVerificationResponse {
  is_valid: boolean;
  total_records: number;
  violations: string[];
  verification_time_ms?: number;
  validators_active?: string;
  last_block_hash?: string;
  algorithm?: string;
}

export interface AuditFilterParams {
  search?: string;
  role?: string;
  action?: string;
  time_range?: string;
  organization_id?: string;
  page?: number;
  page_size?: number;
}
