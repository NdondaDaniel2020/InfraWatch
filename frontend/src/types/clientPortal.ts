/**
 * Tipos e interfaces do Portal do Cliente e Notificações (Issue #261).
 * Totalmente desacoplados de mocks, serviços e componentes visuais.
 */

export interface ClientSlaSummary {
  tenantId: string;
  tenantName: string;
  uptimeCurrentMonthPct: number;
  slaTargetPct: number;
  downtimeBalanceFormatted: string;
  mttrMinutesAvg: number;
  nextMaintenanceWindow: string;
  cycleMonthLabel: string;
}

export interface ClientServiceItem {
  id: string;
  name: string;
  category: string;
  status: "UP" | "DEG" | "DOWN";
  statusLabel: string;
  responseTimeMs?: number;
  throughputFormatted?: string;
  successRatePct?: number;
  tags: string[];
  stability30DaysPct?: number;
  advisoryAlert?: string;
  activeEndpointsCount?: string;
}

export interface SanitizedEndpoint {
  id: string;
  domainName: string;
  serviceType: string;
  protocol: string;
  status: "UP" | "DEG" | "DOWN";
  sla30dPct?: number;
  latencyAvgMs?: number;
  datacenterRegion?: string;
}

export interface ClientNotification {
  id: string;
  title: string;
  summary: string;
  timestampWat: string;
  impactSlaFormatted: string;
  isRead: boolean;
  type: "resolved" | "maintenance" | "advisory";
  severity: "info" | "warning" | "success";
}

export interface ClientDeviceDTO {
  id: string | number;
  name: string;
  hostname?: string;
  category?: string;
  status?: string;
  protocol?: string;
  ip_address?: string;
  last_latency_ms?: number;
}

export interface ClientDeviceListResponse {
  items: ClientDeviceDTO[];
  total: number;
}

export interface SlaMonthlyHistoryItem {
  cycleLabel: string;
  month: string;
  uptimePct: number;
  targetPct: number;
  mttrMinutes: number;
  incidentsCount: number;
  unplannedDowntimeMinutes: number;
  exemptedDowntimeMinutes: number;
  status: "CONFORME" | "VIOLADO";
}

export interface SlaHistoryResponse {
  tenantId: string;
  tenantName: string;
  items: SlaMonthlyHistoryItem[];
}

export interface SlaDeviceReportItem {
  deviceId: string;
  deviceName: string;
  category: string;
  uptimeGrossPct: number;
  uptimeNetPct: number;
  rfcExemptedMinutes: number;
  slaTargetPct: number;
  mttrMinutes: number;
  status: string;
}

export interface OrganizationSlaReportDetails {
  organizationId: string;
  organizationName: string;
  periodLabel: string;
  startPeriod: string;
  endPeriod: string;
  uptimeNetPct: number;
  uptimeGrossPct: number;
  slaTargetPct: number;
  slaMet: boolean;
  mttrMinutes: number;
  mtbfHours: number;
  totalDevices: number;
  unplannedDowntimeMinutes: number;
  exemptedDowntimeMinutes: number;
  devices: SlaDeviceReportItem[];
  digitalSignature: string;
}

export interface CreateSupportTicketInput {
  title: string;
  description: string;
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  deviceId?: string;
}

export interface SupportTicketResponse {
  ticketId: string;
  protocol: string;
  title: string;
  severity: string;
  status: string;
  createdAt: string;
  glpiTicketId?: number;
  message: string;
}

