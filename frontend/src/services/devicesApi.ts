import { apiClient } from "./apiClient";
import type {
  DeviceListItem,
  DeviceDetail,
  CreateDeviceRequest,
  UpdateDeviceRequest,
  PauseDeviceRequest,
  ResumeDeviceRequest,
  SetMaintenanceRequest,
  DeviceFilters,
  PaginatedResponse,
} from "../types/inventory";

const BASE_PATH = "/api/v1/devices";

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
    return apiClient.get<PaginatedResponse<DeviceListItem>>(`${BASE_PATH}/?${query}`);
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
    return apiClient.get<PaginatedResponse<DeviceListItem>>(`${BASE_PATH}/search?${queryString}`);
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
};