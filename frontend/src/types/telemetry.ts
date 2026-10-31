/**
 * Tipos e interfaces de telemetria, dispositivos e monitoramento do InfraWatch NOC.
 * Alinhado com o schema REST (/api/v1/events/telemetry), streaming SSE e DESIGN.md.
 */

export type DeviceStatus = "UP" | "DOWN" | "DEG" | "MAINT";
export type DeviceSeverity = "healthy" | "critical" | "degraded" | "maint";
export type NormalizedStatus = "DOWN" | "DEG" | "UP" | "MAINT";

export interface LatencyMetricPoint {
  timestamp: string;
  latency_ms: number;
}

export interface DayAvailability {
  date: string;
  uptime_pct: number;
  has_incident?: boolean;
}

export interface TelemetryMetricPointDTO {
  latency_ms: number;
  timestamp?: string;
}

export interface TelemetryDeviceDTO {
  id?: string;
  device_id?: string;
  name: string;
  hostname?: string;
  ip_address?: string;
  port?: number;
  protocol?: string;
  category?: "ROUTER" | "SWITCH" | "FIREWALL" | "SERVER" | "DATABASE" | "API_GATEWAY";
  status?: string;
  tenant_id?: string;
  tenant_name?: string;
  model_description?: string;
  last_latency_ms?: number | null;
  last_packet_loss?: number;
  recent_metrics?: TelemetryMetricPointDTO[];
}

export interface TelemetryApiResponse {
  total: number;
  items: TelemetryDeviceDTO[];
}

export interface MonitoredDevice {
  device_id: string;
  name: string;
  hostname?: string;
  ip_address: string;
  port?: number;
  protocol?: string;
  category?: "ROUTER" | "SWITCH" | "FIREWALL" | "SERVER" | "DATABASE" | "API_GATEWAY";
  status: DeviceStatus;
  severity: DeviceSeverity;
  tenant_id?: string;
  tenant_name?: string;
  model_description?: string;
  location?: string;
  last_latency_ms?: number | null;
  last_packet_loss?: number;
  cpu_usage_pct?: number;
  ram_usage_pct?: number;
  ports_summary?: string;
  uptime_duration?: string;
  downtime_duration?: string;
  root_cause?: string;
  ticket_id?: string;
  last_monitored_at?: string;
  recent_latency?: number[];
  availability_90d?: DayAvailability[];
}

export interface NocTelemetrySummary {
  total: number;
  up_count: number;
  deg_count: number;
  down_count: number;
  maint_count: number;
  availability_pct: number;
  sla_target_pct: number;
  mttr_formatted: string;
  mttr_diff: string;
  aggregated_traffic_gbps: number;
  traffic_ingress_gbps: number;
  traffic_egress_gbps: number;
  items: MonitoredDevice[];
}

export interface NocIncident {
  id: string;
  code: string;
  title: string;
  severity: "CRITICAL" | "WARNING" | "INFO";
  target_device: string;
  time_ago: string;
  summary: string;
  sla_remaining: string;
  status: "OPEN" | "ACKNOWLEDGED" | "RESOLVED";
}

export type IncidentSeverity = "critical" | "warning" | "info";

export interface IncidentItem {
  id: string;
  ticketId: string;
  priorityLabel: string;
  severity: IncidentSeverity;
  title: string;
  timeAgo: string;
  description: string;
  slaOrStatusText: string;
  actionType: "ack_resolve" | "timeline";
  operatorName?: string;
}

export type ToastType = "success" | "warning" | "info" | "error";

export interface ToastMessage {
  text: string;
  type: ToastType;
}

export interface TrafficChartPoint {
  time: string;
  throughput: number;
  baseline: number;
  latency: number;
}

export type DashboardViewMode = "nominal" | "skeleton" | "empty" | "error";
export type SeverityFilterType = "all" | "critical" | "degraded" | "healthy";

export interface NocKpiStats {
  total: number;
  up: number;
  deg: number;
  down: number;
  maint?: number;
}

export interface CriticalAlarmData {
  id: string;
  hostname: string;
  ip: string;
  location?: string;
  downDuration: string;
  packetLoss: string;
  glpiTicketId?: string;
  impactedClients?: string;
}

export interface StatusTickerData {
  total?: number;
  up?: number;
  degraded?: number;
  down?: number;
  maintenance?: number;
}

export interface TvDeviceItem {
  id: string;
  hostname: string;
  category: string;
  protocol: string;
  ip: string;
  status: "UP" | "DOWN" | "DEGRADADO" | "MANUTENÇÃO";
  rtt: string;
  rttUnit: string;
  heroSub: string;
  metricLabel: string;
  metricBadge: string;
  bottomLeft: string;
  bottomRight: string;
}

export interface TvIncidentItem {
  id: string;
  severity: "CRITICAL" | "HIGH" | "MEDIUM";
  device: string;
  ip: string;
  client: string;
  title: string;
  startedAgo: string;
  slaRemaining: string;
  glpiTicket: string;
  assignee: string;
  status: "INVESTIGANDO" | "EM ATENDIMENTO" | "MITIGANDO";
}

export interface TvBackboneLink {
  id: string;
  name: string;
  type: string;
  capacity: string;
  utilization: string;
  utilizationPercent: number;
  rtt: string;
  packetLoss: string;
  status: "HEALTHY" | "DEGRADED" | "DOWN";
}

