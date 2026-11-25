import { apiClient } from "./apiClient";
import type {
  DeviceListItem,
  DeviceDetail,
  DeviceHealthStatus,
  ProberProtocol,
  DeviceCategory,
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

export function normalizeDeviceListItem(raw: unknown): DeviceListItem {
  const item = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const rawStatus = String(item.healthStatus || item.status || (item.is_paused ? "PAUSED" : "UP")).toUpperCase();
  let healthStatus: DeviceHealthStatus = "UP";
  if (rawStatus === "DOWN") healthStatus = "DOWN";
  else if (rawStatus === "DEG" || rawStatus === "DEGRADED") healthStatus = "DEG";
  else if (rawStatus === "MAINT" || rawStatus === "MAINTENANCE") healthStatus = "MAINT";
  else if (rawStatus === "PAUSED" || item.is_paused) healthStatus = "PAUSED";
  else healthStatus = "UP";

  const rawProtocol = String(item.protocol || "ICMP").toUpperCase() as ProberProtocol;
  const rawCategory = String(item.category || "OTHER").toUpperCase() as DeviceCategory;

  return {
    id: String(item.id || ""),
    name: String(item.name || "Sem Nome"),
    hostname: String(item.hostname || item.name || item.ip_address || "—"),
    ipAddress: String(item.ipAddress || item.ip_address || "—"),
    port: typeof item.port === "number" ? item.port : undefined,
    protocol: rawProtocol,
    category: rawCategory,
    healthStatus,
    intervalSeconds: Number(item.intervalSeconds || item.interval_seconds || 60),
    lastCheckAt: typeof item.lastCheckAt === "string" ? item.lastCheckAt : typeof item.last_check_at === "string" ? item.last_check_at : undefined,
    nextCheckAt: typeof item.nextCheckAt === "string" ? item.nextCheckAt : typeof item.next_check_at === "string" ? item.next_check_at : undefined,
    createdAt: String(item.createdAt || item.created_at || ""),
    updatedAt: String(item.updatedAt || item.updated_at || ""),
  };
}

function normalizePaginatedDevices(res: unknown): PaginatedResponse<DeviceListItem> {
  const data = (res && typeof res === "object" ? res : {}) as Record<string, unknown>;
  const rawItems = Array.isArray(data.items) ? data.items : Array.isArray(res) ? (res as unknown[]) : [];
  const pageSize = Number(data.pageSize ?? data.page_size ?? 10);
  const total = Number(data.total ?? rawItems.length);
  const totalPages = Number(data.totalPages ?? data.total_pages ?? Math.max(1, Math.ceil(total / (pageSize || 1))));

  return {
    items: rawItems.map(normalizeDeviceListItem),
    total,
    page: Number(data.page ?? 1),
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
      page_size: filters.pageSize ?? 10,
      search: filters.search,
      category: filters.category,
      status: filters.healthStatus,
      health_status: filters.healthStatus,
      protocol: filters.protocol,
      sort_by: filters.sortBy,
      sort_order: filters.sortOrder,
    });
    const res = await apiClient.get<Record<string, unknown>>(`${BASE_PATH}/?${query}`);
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
    const res = await apiClient.get<Record<string, unknown>>(`${BASE_PATH}/search?${queryString}`);
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