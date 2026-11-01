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

export const INITIAL_CUSTODY_STATUS: AuditIntegrityVerificationResponse = {
  is_valid: true,
  total_records: 12480,
  violations: [],
  verification_time_ms: 42,
  validators_active: "4/4 Nós Quórum",
  last_block_hash:
    "7f83b1657ff1fc53b92dc18148a1d65dfc2d4b1fa3d677284addd200126d9069",
  algorithm: "SHA-256 (NIST FIPS 180-4) + Merkle-Damgård",
};

export interface AuditFilterParams {
  search?: string;
  role?: string;
  action?: string;
  time_range?: string;
  organization_id?: string;
  page?: number;
  page_size?: number;
}
