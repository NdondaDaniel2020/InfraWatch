/**
 * Tipos e interfaces de telemetria, dispositivos e monitoramento do InfraWatch NOC.
 * Alinhado com o schema REST (/api/v1/events/telemetry), streaming SSE e DESIGN.md.
 */

export type DeviceStatus = "UP" | "DOWN" | "DEG" | "MAINT";
export type DeviceSeverity = "healthy" | "critical" | "degraded" | "maint";

export interface LatencyMetricPoint {
  timestamp: string;
  latency_ms: number;
}

export interface DayAvailability {
  date: string;
  uptime_pct: number;
  has_incident?: boolean;
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

export type DashboardViewMode = "nominal" | "skeleton" | "empty" | "error";
export type SeverityFilterType = "all" | "critical" | "degraded" | "healthy";
