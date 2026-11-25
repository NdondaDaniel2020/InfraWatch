/**
 * Gateway de API para Telemetria em tempo real e monitoramento de ativos (Issue #215).
 * Centraliza requisições REST de observabilidade, desacoplando páginas e componentes do apiClient.
 */

import { apiClient } from "./apiClient";
import type {
  DeviceSeverity,
  DeviceStatus,
  MonitoredDevice,
  TelemetryApiResponse,
  TelemetryDeviceDTO,
} from "../types/telemetry";

const BASE_PATH = "/api/v1";

/**
 * Normaliza um item bruto da API ou do cache em MonitoredDevice fortemente tipado.
 */
export function normalizeMonitoredDevice(
  item: TelemetryDeviceDTO | Record<string, unknown>
): MonitoredDevice {
  const d = item as Record<string, unknown>;
  const statusStr = String(
    d.status || d.healthStatus || (d.is_paused ? "MAINT" : "UP")
  ).toUpperCase();

  const status: DeviceStatus =
    statusStr === "DOWN"
      ? "DOWN"
      : statusStr === "DEG" || statusStr === "DEGRADED"
        ? "DEG"
        : statusStr === "MAINT" || statusStr === "MAINTENANCE" || Boolean(d.is_paused)
          ? "MAINT"
          : "UP";

  const severity: DeviceSeverity =
    status === "DOWN"
      ? "critical"
      : status === "DEG"
        ? "degraded"
        : status === "MAINT"
          ? "maint"
          : "healthy";

  const protocol = String(d.protocol || "ICMP").toUpperCase();
  const rawCat = String(d.category || "SERVER").toUpperCase();
  const validCategories = ["ROUTER", "SWITCH", "FIREWALL", "SERVER", "DATABASE", "API_GATEWAY"] as const;
  const category = (validCategories.includes(rawCat as (typeof validCategories)[number])
    ? rawCat
    : "SERVER") as (typeof validCategories)[number];

  const lastLatency = typeof d.last_latency_ms === "number" ? d.last_latency_ms : null;
  const loss =
    typeof d.last_packet_loss === "number"
      ? d.last_packet_loss
      : status === "DOWN"
        ? 100
        : 0;

  let recentMetrics: number[] = [];
  if (Array.isArray(d.recent_metrics) && d.recent_metrics.length > 0) {
    recentMetrics = d.recent_metrics.map((m: unknown) => {
      if (typeof m === "number") return m;
      if (typeof m === "object" && m !== null && "latency_ms" in m) {
        return Number((m as { latency_ms: unknown }).latency_ms) || 0;
      }
      return 0;
    });
  } else if (lastLatency != null && lastLatency > 0) {
    recentMetrics = [lastLatency];
  }

  // Calcula tempo real decorrido se o ativo estiver DOWN e possuir last_monitored_at
  let realDowntime: string | undefined = typeof d.downtime_duration === "string" ? d.downtime_duration : undefined;
  if (!realDowntime && status === "DOWN" && d.last_monitored_at) {
    const diffMs = Date.now() - new Date(String(d.last_monitored_at)).getTime();
    if (!isNaN(diffMs) && diffMs > 0) {
      const totalSec = Math.floor(diffMs / 1000);
      const h = Math.floor(totalSec / 3600);
      const m = Math.floor((totalSec % 3600) / 60);
      const s = totalSec % 60;
      realDowntime = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
    }
  }

  return {
    device_id: String(d.device_id || d.id || "dev-unknown"),
    name: String(d.name || "Ativo"),
    hostname: d.hostname ? String(d.hostname) : d.ip_address ? String(d.ip_address) : String(d.name || ""),
    ip_address: d.ip_address ? String(d.ip_address) : d.ipAddress ? String(d.ipAddress) : "—",
    port: typeof d.port === "number" ? d.port : undefined,
    protocol,
    category,
    status,
    severity,
    tenant_id: d.organization_id ? String(d.organization_id) : d.tenant_id ? String(d.tenant_id) : "unitel",
    tenant_name: d.datacenter_region ? String(d.datacenter_region) : d.tenant_name ? String(d.tenant_name) : "Cluster Central",
    model_description: d.model_description
      ? String(d.model_description)
      : `${category} • ${d.datacenter_region || "Cluster Central"}`,
    last_latency_ms: lastLatency,
    last_packet_loss: loss,
    recent_latency: recentMetrics,
    last_monitored_at: d.last_monitored_at ? String(d.last_monitored_at) : d.lastCheckAt ? String(d.lastCheckAt) : undefined,
    root_cause: d.root_cause
      ? String(d.root_cause)
      : status === "DOWN"
        ? "Sonda inalcançável (loss 100%)"
        : undefined,
    uptime_duration: d.uptime_duration
      ? String(d.uptime_duration)
      : status === "UP"
        ? "99.9% Nominal"
        : undefined,
    downtime_duration: realDowntime,
    ticket_id: d.ticket_id ? String(d.ticket_id) : d.ticketId ? String(d.ticketId) : undefined,
  };
}

export const telemetryApi = {
  /**
   * Consulta a lista de dispositivos monitorados com telemetria ativa.
   */
  async getEventsTelemetry(params?: {
    organization_id?: string;
    limit?: number;
  }): Promise<MonitoredDevice[]> {
    const searchParams = new URLSearchParams();
    if (params?.organization_id) {
      searchParams.set("org_id", params.organization_id);
    }
    if (params?.limit) {
      searchParams.set("limit", String(params.limit));
    }
    const query = searchParams.toString();
    const url = query ? `${BASE_PATH}/events/telemetry?${query}` : `${BASE_PATH}/events/telemetry`;

    const resp = await apiClient.get<TelemetryApiResponse | TelemetryDeviceDTO[]>(url);
    const rawItems = Array.isArray(resp)
      ? resp
      : resp && Array.isArray(resp.items)
        ? resp.items
        : [];

    return rawItems.map(normalizeMonitoredDevice);
  },

  /**
   * Consulta visão geral de telemetria rápida (/api/v1/telemetry/overview).
   */
  async getOverview(): Promise<MonitoredDevice[]> {
    const resp = await apiClient.get<{ devices?: TelemetryDeviceDTO[] }>(
      `${BASE_PATH}/telemetry/overview`
    );
    const rawItems = Array.isArray(resp?.devices) ? resp.devices : [];
    return rawItems.map(normalizeMonitoredDevice);
  },

  /**
   * Consulta histórico telemétrico de um dispositivo específico.
   */
  async getDeviceTelemetry(
    deviceId: string,
    metricLimit: number = 200
  ): Promise<Record<string, unknown> | null> {
    const url = `${BASE_PATH}/events/telemetry/${encodeURIComponent(deviceId)}?metric_limit=${metricLimit}`;
    return await apiClient.get<Record<string, unknown>>(url);
  },
};
