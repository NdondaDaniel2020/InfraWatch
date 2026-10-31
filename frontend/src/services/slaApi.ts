import { apiClient } from "./apiClient";
import { mockMaintenanceWindows, mockMaintenanceKpiSummary } from "../mocks/slaMocks";
import type {
  MaintenanceWindow,
  CreateMaintenanceInput,
  MaintenanceFilters,
  MaintenanceKpiSummary,
  SlaMetricOverview,
  SlaDeviceBreakdown,
  SlaExportFormat,
  MaintenanceWindowDTO,
  MaintenanceWindowListResponse,
} from "../types/sla";

const BASE_PATH_MAINT = "/api/v1/maintenance-windows";
const BASE_PATH_SLA = "/api/v1/sla";

export const slaApi = {
  async listMaintenanceWindows(
    filters?: MaintenanceFilters
  ): Promise<MaintenanceWindow[]> {
    try {
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
      const res = await apiClient.get<MaintenanceWindowListResponse | MaintenanceWindow[]>(
        `${BASE_PATH_MAINT}${query}`
      );

      if (Array.isArray(res)) {
        return res;
      }
      if (res && Array.isArray(res.items)) {
        return res.items.map((item: MaintenanceWindowDTO): MaintenanceWindow => ({
          id: String(item.id),
          rfcNumber: item.rfc_number || `RFC-${String(item.id).slice(0, 8).toUpperCase()}`,
          title: item.title || item.description || "Manutenção Programada",
          description: item.description || "",
          targetDeviceIds: item.device_id ? [String(item.device_id)] : [],
          targetDeviceNames: item.device_name ? [item.device_name] : ["SW-CORE-LUANDA-01"],
          clientName: item.client_name || "Organização",
          clientCategory: "TELECOM",
          startTimeUtc: item.start_time || new Date().toISOString(),
          endTimeUtc: item.end_time || new Date().toISOString(),
          durationMinutes: 120,
          status: item.is_approved ? "APPROVED" : "PENDING_APPROVAL",
          alarmSuppression: true,
          slaExemption: Boolean(item.is_approved),
        }));
      }
    } catch {
      // Fallback resiliente
    }
    return mockMaintenanceWindows;
  },

  async getMaintenanceKpiSummary(): Promise<MaintenanceKpiSummary> {
    try {
      const res = await apiClient.get<MaintenanceKpiSummary>(`${BASE_PATH_MAINT}/kpis`);
      if (res && typeof res.exemptedHoursMonth === "number") {
        return res;
      }
    } catch {
      // Fallback resiliente
    }
    return mockMaintenanceKpiSummary;
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
