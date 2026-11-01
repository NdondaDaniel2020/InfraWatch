import { apiClient } from "./apiClient";
import type {
  DeviceDetail,
  TimescaleMetricsResponse,
  ManualProbeResult,
  TimescalePeriod,
  OpticalInterfaceItem,
} from "../types/deviceDetail";

const BASE_PATH = "/api/v1/devices";

export const deviceDetailApi = {
  async getDeviceDetail(id: string): Promise<DeviceDetail> {
    return apiClient.get<DeviceDetail>(`${BASE_PATH}/${id}`);
  },

  async getTimescaleMetrics(
    id: string,
    period: TimescalePeriod = "24h"
  ): Promise<TimescaleMetricsResponse> {
    return apiClient.get<TimescaleMetricsResponse>(
      `${BASE_PATH}/${id}/metrics?period=${encodeURIComponent(period)}`
    );
  },

  async triggerManualProbe(id: string): Promise<ManualProbeResult> {
    return apiClient.post<ManualProbeResult>(`${BASE_PATH}/${id}/probe`, {});
  },

  async getDeviceInterfaces(id: string): Promise<OpticalInterfaceItem[]> {
    return apiClient.get<OpticalInterfaceItem[]>(`${BASE_PATH}/${id}/interfaces`);
  },
};