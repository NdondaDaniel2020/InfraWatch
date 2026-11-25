import type { SanitizedEndpoint } from "./clientPortal";

export type MaintenanceStatus =
  | "PENDING_APPROVAL"
  | "APPROVED"
  | "IN_PROGRESS"
  | "COMPLETED"
  | "CANCELLED";

export interface MaintenanceWindowDTO {
  id: string | number;
  rfc_number?: string;
  title?: string;
  description?: string;
  device_id?: string;
  device_name?: string;
  client_name?: string;
  client_category?: string;
  start_time?: string;
  end_time?: string;
  duration_minutes?: number;
  alarm_suppression?: boolean;
  is_approved?: boolean;
  status?: string;
}

export interface MaintenanceWindowListResponse {
  items: MaintenanceWindowDTO[];
  total: number;
}

export interface MaintenanceWindow {
  id: string;
  rfcNumber: string;
  title: string;
  description: string;
  targetDeviceIds: string[];
  targetDeviceNames: string[];
  clientName: string;
  clientCategory?: "TELECOM" | "BANKING" | "ENERGY" | "ENTERPRISE" | string;
  startTimeUtc: string;
  endTimeUtc: string;
  durationMinutes: number;
  status: MaintenanceStatus;
  approvedBy?: string;
  approvedAt?: string;
  alarmSuppression: boolean;
  slaExemption: boolean;
  rollbackPlan?: string;
}

export interface CreateMaintenanceInput {
  title: string;
  description: string;
  targetDeviceIds: string[];
  clientName: string;
  organizationId?: string;
  startTimeUtc: string;
  endTimeUtc: string;
  alarmSuppression: boolean;
  slaExemption: boolean;
  rollbackPlan?: string;
}

export interface MaintenanceFilters {
  status?: MaintenanceStatus | "ALL";
  search?: string;
  client?: string;
  period?: "MONTH" | "Q4" | "YEAR";
}

export interface MaintenanceKpiSummary {
  activeNowCount: number;
  scheduledCount: number;
  exemptedHoursMonth: number;
  contractualLimitHours: number;
}

export type SlaReportingPeriod =
  | "last_7d"
  | "last_30d"
  | "current_month"
  | "last_90d";

export interface SlaMetricOverview {
  tenantId: string;
  tenantName: string;
  tenantCategory?: "TELECOM" | "BANKING" | "ENERGY" | "ENTERPRISE";
  targetSlaPct: number;
  currentUptimePct: number;
  marginPct: number;
  mttrMinutes: number;
  mtbfHours: number;
  exemptedDowntimeMinutes: number;
  unexemptedDowntimeMinutes: number;
  totalIncidents?: number;
  periodLabel: string;
  daysRemainingInCycle?: number;
  nextMaintenanceWindow?: string;
  downtimeBalanceFormatted?: string;
  cycleMonthLabel?: string;
  servicesCount?: number;
}

export interface SlaDeviceBreakdown {
  deviceId: string;
  deviceName: string;
  ipAddress?: string;
  tier?: "TIER-1" | "TIER-2" | "TIER-3";
  category?: string;
  nominalUptimePct: number;
  netUptimePct: number;
  exemptedMaintenanceMinutes: number;
  unplannedOutageMinutes?: number;
  status: "COMPLIANT" | "AT_RISK" | "BREACHED";
}

export type SlaExportFormat = "csv" | "json";

export interface NocSlaReportExportPayload {
  tenantId: string;
  tenantName: string;
  periodLabel: string;
  selectedPeriod: SlaReportingPeriod;
  viewMode: "devices" | "endpoints";
  targetSlaPct: number;
  currentUptimePct: number;
  marginPct?: number;
  mttrMinutes: number;
  mtbfHours?: number;
  exemptedDowntimeMinutes?: number;
  unexemptedDowntimeMinutes?: number;
  devices?: SlaDeviceBreakdown[];
  endpoints?: SanitizedEndpoint[];
  digitalSignature?: string;
}

export interface DailySlaPoint {
  day: string;
  date: string;
  uptimePct: number | null;
  type: "nominal" | "maint" | "incident" | "today" | "future";
  note: string;
  incidentsCount?: number;
  maintenanceCount?: number;
}

export interface OrganizationDailySlaData {
  tenantId: string;
  tenantName: string;
  year: number;
  month: number;
  periodLabel: string;
  targetPct: number;
  totalDays: number;
  currentDay: number;
  days: DailySlaPoint[];
}

export interface DeviceSlaReport {
  device_id: string | null;
  start_period?: string;
  end_period?: string;
  total_period_hours?: number;
  unplanned_downtime_minutes?: number;
  exempted_downtime_minutes?: number;
  uptime_percentage?: number;
  uptimePercentage?: number;
  availability_pct?: number;
  sla_target?: number;
  slaTarget?: number;
  sla_met?: boolean;
  mttr_minutes?: number;
  mttrMinutes?: number;
  mtbf_hours?: number;
  mtbfHours?: number;
  incidents_count?: number;
  exempted_incidents_count?: number;
}


