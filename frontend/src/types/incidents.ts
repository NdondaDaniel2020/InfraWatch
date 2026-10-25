/**
 * Tipos e interfaces de Gestão Operacional de Incidentes (Issue #32, Issue #261).
 * Totalmente desacoplados de serviços e componentes visuais.
 */

export type IncidentSeverity = "critical" | "degraded" | "resolved";
export type IncidentStatus = "TRIGGERED" | "ACKNOWLEDGED" | "RESOLVED";

export type FailureCategory =
  | "hardware"
  | "fiber"
  | "power"
  | "bgp"
  | "ddos"
  | "software"
  | "other";

export interface IncidentTimelineEvent {
  id: string;
  timestamp: string;
  type: "probe_fail" | "escalation" | "glpi_opened" | "acknowledged" | "resolved" | "info";
  title: string;
  description: string;
  operator_name?: string;
}

export interface IncidentItem {
  id: string;
  code: string;
  title: string;
  target_device: {
    name: string;
    ip: string;
    model: string;
    location?: string;
  };
  organization_name: string;
  organization_domain?: string;
  severity: IncidentSeverity;
  status: IncidentStatus;
  started_at: string;
  duration_str: string;
  sla_remaining_str: string;
  glpi_ticket_id: number | null;
  glpi_url?: string;
  priority_label: string;
  assigned_operator: {
    id: string;
    name: string;
    initials: string;
    role?: string;
  } | null;
  root_cause?: string;
  corrective_action?: string;
  failure_category?: FailureCategory;
  is_sla_exempt?: boolean;
  timeline: IncidentTimelineEvent[];
}

export interface ResolveIncidentPayload {
  root_cause: string;
  corrective_action?: string;
  failure_category?: FailureCategory;
  is_sla_exempt?: boolean;
  close_glpi?: boolean;
  resolved_at?: string;
}

export interface IncidentsKpiSummary {
  p1_critical_count: number;
  p1_duration_str: string;
  p2_degraded_count: number;
  p2_summary_str: string;
  resolved_today_count: number;
  sla_recovery_pct: number;
  glpi_sync_pct: number;
  mttr_average_str: string;
  mttr_diff_pct: string;
}
