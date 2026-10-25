export type MaintenanceStatus =
  | "PENDING_APPROVAL"
  | "APPROVED"
  | "IN_PROGRESS"
  | "COMPLETED"
  | "CANCELLED";

export interface MaintenanceWindow {
  id: string;
  rfcNumber: string;
  title: string;
  description: string;
  targetDeviceIds: string[];
  targetDeviceNames: string[];
  clientName: string;
  clientCategory: "TELECOM" | "BANKING" | "ENERGY" | "ENTERPRISE";
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

export interface SlaMetricOverview {
  tenantId: string;
  tenantName: string;
  tenantCategory: "TELECOM" | "BANKING" | "ENERGY" | "ENTERPRISE";
  targetSlaPct: number;
  currentUptimePct: number;
  marginPct: number;
  mttrMinutes: number;
  mtbfHours: number;
  exemptedDowntimeMinutes: number;
  unexemptedDowntimeMinutes: number;
  totalIncidents: number;
  periodLabel: string;
  daysRemainingInCycle: number;
}

export interface SlaDeviceBreakdown {
  deviceId: string;
  deviceName: string;
  ipAddress: string;
  tier: "TIER-1" | "TIER-2" | "TIER-3";
  nominalUptimePct: number;
  netUptimePct: number;
  exemptedMaintenanceMinutes: number;
  unplannedOutageMinutes: number;
  status: "COMPLIANT" | "AT_RISK" | "BREACHED";
}

export type SlaExportFormat = "csv" | "json";
