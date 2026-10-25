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
  responseTimeMs: number;
  throughputFormatted: string;
  successRatePct: number;
  tags: string[];
  stability30DaysPct: number;
  advisoryAlert?: string;
  activeEndpointsCount?: string;
}

export interface SanitizedEndpoint {
  id: string;
  domainName: string;
  serviceType: string;
  protocol: string;
  status: "UP" | "DEG" | "DOWN";
  sla30dPct: number;
  latencyAvgMs: number;
  datacenterRegion: string;
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
