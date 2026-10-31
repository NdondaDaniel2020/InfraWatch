import { apiClient } from "./apiClient";
import type {
  DeviceListItem,
  DeviceDetail,
  CreateDeviceRequest,
  UpdateDeviceRequest,
  PauseDeviceRequest,
  ResumeDeviceRequest,
  SetMaintenanceRequest,
  TestProbeRequest,
  TestProbeResponse,
  DeviceFilters,
  PaginatedResponse,
} from "../types/inventory";

const BASE_PATH = "/api/v1/devices";

export function normalizeDeviceListItem(raw: any): DeviceListItem {
  const rawStatus = String(raw?.healthStatus || raw?.status || (raw?.is_paused ? "PAUSED" : "UP")).toUpperCase();
  let healthStatus: DeviceHealthStatus = "UP";
  if (rawStatus === "DOWN") healthStatus = "DOWN";
  else if (rawStatus === "DEG" || rawStatus === "DEGRADED") healthStatus = "DEG";
  else if (rawStatus === "MAINT" || rawStatus === "MAINTENANCE") healthStatus = "MAINT";
  else if (rawStatus === "PAUSED" || raw?.is_paused) healthStatus = "PAUSED";
  else healthStatus = "UP";

  const rawProtocol = String(raw?.protocol || "ICMP").toUpperCase() as ProberProtocol;
  const rawCategory = String(raw?.category || "OTHER").toUpperCase() as DeviceCategory;

  return {
    id: raw?.id || "",
    name: raw?.name || "Sem Nome",
    hostname: raw?.hostname || raw?.name || raw?.ip_address || "—",
    ipAddress: raw?.ipAddress || raw?.ip_address || "—",
    port: raw?.port,
    protocol: rawProtocol,
    category: rawCategory,
    healthStatus,
    intervalSeconds: raw?.intervalSeconds || raw?.interval_seconds || 60,
    lastCheckAt: raw?.lastCheckAt || raw?.last_check_at,
    nextCheckAt: raw?.nextCheckAt || raw?.next_check_at,
    createdAt: raw?.createdAt || raw?.created_at || "",
    updatedAt: raw?.updatedAt || raw?.updated_at || "",
  };
}

function normalizePaginatedDevices(res: any): PaginatedResponse<DeviceListItem> {
  const rawItems = Array.isArray(res?.items) ? res.items : Array.isArray(res) ? res : [];
  const pageSize = res?.pageSize ?? res?.page_size ?? 20;
  const total = res?.total ?? rawItems.length;
  const totalPages = res?.totalPages ?? res?.total_pages ?? Math.max(1, Math.ceil(total / (pageSize || 1)));

  return {
    items: rawItems.map(normalizeDeviceListItem),
    total,
    page: res?.page ?? 1,
    pageSize,
    totalPages,
  };
}

function buildQueryString(params: Record<string, unknown>): string {
  const searchParams = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      searchParams.append(key, String(value));
    }
  });
  return searchParams.toString();
}

export const devicesApi = {
  async listDevices(filters: DeviceFilters = {}): Promise<PaginatedResponse<DeviceListItem>> {
    const query = buildQueryString({
      page: filters.page ?? 1,
      page_size: filters.pageSize ?? 20,
      search: filters.search,
      category: filters.category,
      health_status: filters.healthStatus,
      protocol: filters.protocol,
      sort_by: filters.sortBy,
      sort_order: filters.sortOrder,
    });
    const res = await apiClient.get<any>(`${BASE_PATH}/?${query}`);
    return normalizePaginatedDevices(res);
  },

  async searchDevices(query: string, filters: Omit<DeviceFilters, "search"> = {}): Promise<PaginatedResponse<DeviceListItem>> {
    const queryString = buildQueryString({
      q: query,
      page: filters.page ?? 1,
      page_size: filters.pageSize ?? 20,
      category: filters.category,
      health_status: filters.healthStatus,
      protocol: filters.protocol,
    });
    const res = await apiClient.get<any>(`${BASE_PATH}/search?${queryString}`);
    return normalizePaginatedDevices(res);
  },

  async getDevice(id: string): Promise<DeviceDetail> {
    return apiClient.get<DeviceDetail>(`${BASE_PATH}/${id}`);
  },

  async createDevice(payload: CreateDeviceRequest): Promise<DeviceDetail> {
    return apiClient.post<DeviceDetail>(`${BASE_PATH}/`, payload);
  },

  async updateDevice(id: string, payload: UpdateDeviceRequest): Promise<DeviceDetail> {
    return apiClient.put<DeviceDetail>(`${BASE_PATH}/${id}`, payload);
  },

  async pauseDevice(id: string, payload: PauseDeviceRequest): Promise<DeviceDetail> {
    return apiClient.post<DeviceDetail>(`${BASE_PATH}/${id}/pause`, payload);
  },

  async resumeDevice(id: string, payload: ResumeDeviceRequest = {}): Promise<DeviceDetail> {
    return apiClient.post<DeviceDetail>(`${BASE_PATH}/${id}/resume`, payload);
  },

  async setMaintenance(id: string, payload: SetMaintenanceRequest): Promise<DeviceDetail> {
    return apiClient.post<DeviceDetail>(`${BASE_PATH}/${id}/maintenance`, payload);
  },

  async testProbe(payload: TestProbeRequest): Promise<TestProbeResponse> {
    return apiClient.post<TestProbeResponse>(`${BASE_PATH}/test-probe`, payload);
  },
};