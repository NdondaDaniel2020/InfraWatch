import { apiClient } from "./apiClient";
import type {
  DeviceDetail,
  TimescaleMetricsResponse,
  ManualProbeResult,
  TimescalePeriod,
  OpticalInterfaceItem,
  TimescaleMetricsBucket,
} from "../types/deviceDetail";

const BASE_PATH = "/api/v1/devices";

interface TelemetryPointItem {
  metric_type: string;
  value: number;
  packet_loss?: number;
  status?: string;
  timestamp: string;
}

interface MonitoredDeviceDetailResponse {
  device_id: string;
  name: string;
  last_latency_ms?: number | null;
  last_packet_loss?: number | null;
  recent_metrics?: TelemetryPointItem[];
}

export const deviceDetailApi = {
  async getDeviceDetail(id: string): Promise<DeviceDetail> {
    return apiClient.get<DeviceDetail>(`${BASE_PATH}/${id}`);
  },

  async getTimescaleMetrics(
    id: string,
    period: TimescalePeriod = "24h"
  ): Promise<TimescaleMetricsResponse> {
    // 1. Tenta obter série temporal completa agregada via /api/v1/devices/{id}/metrics
    try {
      const res = await apiClient.get<TimescaleMetricsResponse>(
        `${BASE_PATH}/${id}/metrics?period=${encodeURIComponent(period)}`
      );
      if (res && Array.isArray(res.buckets)) {
        return res;
      }
    } catch {
      // Endpoint dedicado não disponível ou sem agregação direta, tenta canal de telemetria
    }

    // 2. Consulta histórico de telemetria real do ativo via /api/v1/events/telemetry/{id}
    try {
      const telemetry = await apiClient.get<MonitoredDeviceDetailResponse>(
        `/api/v1/events/telemetry/${encodeURIComponent(id)}?metric_limit=200`
      );

      if (telemetry && Array.isArray(telemetry.recent_metrics) && telemetry.recent_metrics.length > 0) {
        const latencyPoints = telemetry.recent_metrics.filter(
          (m) => m.metric_type === "latency_ms" || m.metric_type === "rtt_ms"
        );

        if (latencyPoints.length > 0) {
          // Ordena cronologicamente para exibição no gráfico
          const sorted = [...latencyPoints].sort(
            (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
          );

          const buckets: TimescaleMetricsBucket[] = sorted.map((m) => {
            const val = Number(m.value) || 0;
            return {
              timestamp: m.timestamp,
              rttMinMs: val,
              rttP95Ms: val,
              rttMaxMs: val,
              packetLossPct: Number(m.packet_loss) || 0,
            };
          });

          const values = buckets.map((b) => b.rttP95Ms);
          const losses = buckets.map((b) => b.packetLossPct);
          const sortedValues = [...values].sort((a, b) => a - b);
          const p95Index = Math.min(
            sortedValues.length - 1,
            Math.floor(sortedValues.length * 0.95)
          );

          return {
            buckets,
            period,
            summary: {
              minMs: Math.min(...values),
              p95Ms: sortedValues[p95Index] ?? 0,
              maxMs: Math.max(...values),
              avgLossPct: losses.length > 0 ? losses.reduce((a, b) => a + b, 0) / losses.length : 0,
            },
          };
        }
      }
    } catch {
      // Falha ao obter telemetria secundária
    }

    // 3. Fallback canônico seguro com lista vazia para ativos sem telemetria registrada
    return {
      buckets: [],
      period,
      summary: {
        minMs: 0,
        p95Ms: 0,
        maxMs: 0,
        avgLossPct: 0,
      },
    };
  },

  async triggerManualProbe(id: string): Promise<ManualProbeResult> {
    return apiClient.post<ManualProbeResult>(`${BASE_PATH}/${id}/probe`, {});
  },

  async getDeviceInterfaces(id: string): Promise<OpticalInterfaceItem[]> {
    return apiClient.get<OpticalInterfaceItem[]>(`${BASE_PATH}/${id}/interfaces`);
  },
};