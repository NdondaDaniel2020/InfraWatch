import { apiClient } from "./apiClient";
import type {
  MaintenanceWindow,
  CreateMaintenanceInput,
  MaintenanceFilters,
  MaintenanceKpiSummary,
  SlaMetricOverview,
  SlaDeviceBreakdown,
  SlaExportFormat,
} from "../types/sla";

const BASE_PATH_MAINT = "/api/v1/maintenance-windows";
const BASE_PATH_SLA = "/api/v1/sla";

export const slaApi = {
  async listMaintenanceWindows(
    filters?: MaintenanceFilters
  ): Promise<MaintenanceWindow[]> {
    const params = new URLSearchParams();
    if (filters?.status && filters.status !== "ALL") {
      params.append("status", filters.status);
    }
    if (filters?.search) {
      params.append("search", filters.search);
    }
    if (filters?.client && filters.client !== "all") {
      params.append("client", filters.client);
    }
    if (filters?.period) {
      params.append("period", filters.period);
    }
    const query = params.toString() ? `?${params.toString()}` : "";
    return apiClient.get<MaintenanceWindow[]>(`${BASE_PATH_MAINT}${query}`);
  },

  async getMaintenanceKpiSummary(): Promise<MaintenanceKpiSummary> {
    return apiClient.get<MaintenanceKpiSummary>(`${BASE_PATH_MAINT}/kpis`);
  },

  async createMaintenanceWindow(
    data: CreateMaintenanceInput
  ): Promise<MaintenanceWindow> {
    return apiClient.post<MaintenanceWindow>(BASE_PATH_MAINT, data);
  },

  async approveMaintenanceWindow(id: string): Promise<MaintenanceWindow> {
    return apiClient.post<MaintenanceWindow>(`${BASE_PATH_MAINT}/${id}/approve`, {});
  },

  async getSlaOverview(tenantId: string, period?: string): Promise<SlaMetricOverview> {
    const query = period ? `?period=${encodeURIComponent(period)}` : "";
    return apiClient.get<SlaMetricOverview>(`${BASE_PATH_SLA}/tenants/${tenantId}${query}`);
  },

  async getSlaDeviceBreakdown(tenantId: string): Promise<SlaDeviceBreakdown[]> {
    return apiClient.get<SlaDeviceBreakdown[]>(`${BASE_PATH_SLA}/tenants/${tenantId}/devices`);
  },

  async exportSlaReport(tenantId: string, format: SlaExportFormat): Promise<string> {
    return apiClient.get<string>(
      `${BASE_PATH_SLA}/tenants/${tenantId}/export?format=${format}`
    );
  },
};
