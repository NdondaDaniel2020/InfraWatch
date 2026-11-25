import { apiClient } from "./apiClient";
import { clientPortalApi } from "./clientPortalApi";
import type {
  MaintenanceWindow,
  MaintenanceWindowDTO,
  MaintenanceWindowListResponse,
  CreateMaintenanceInput,
  MaintenanceFilters,
  MaintenanceKpiSummary,
  SlaMetricOverview,
  SlaDeviceBreakdown,
  SlaExportFormat,
  SlaReportingPeriod,
  OrganizationDailySlaData,
  DeviceSlaReport,
} from "../types/sla";
import type {
  ClientSlaSummary,
  OrganizationSlaReportDetails,
} from "../types/clientPortal";

const BASE_PATH_MAINT = "/api/v1/maintenance-windows";
const BASE_PATH_SLA = "/api/v1/sla";

export function resolveSlaPeriodRange(
  period?: SlaReportingPeriod
): { startPeriod?: string; endPeriod?: string } {
  if (!period) return {};

  const now = new Date();
  if (period === "current_month") {
    const start = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)
    );
    return { startPeriod: start.toISOString(), endPeriod: now.toISOString() };
  }

  const daysByPeriod: Record<Exclude<SlaReportingPeriod, "current_month">, number> = {
    last_7d: 7,
    last_30d: 30,
    last_90d: 90,
  };
  const days = daysByPeriod[period];
  const start = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  return { startPeriod: start.toISOString(), endPeriod: now.toISOString() };
}

function mapReportToOverview(
  summary: ClientSlaSummary,
  report: OrganizationSlaReportDetails
): SlaMetricOverview {
  return {
    tenantId: report.organizationId || summary.tenantId,
    tenantName: report.organizationName || summary.tenantName,
    targetSlaPct: report.slaTargetPct,
    currentUptimePct: report.uptimeNetPct,
    marginPct: Number((report.uptimeNetPct - report.slaTargetPct).toFixed(2)),
    mttrMinutes: report.mttrMinutes,
    mtbfHours: report.mtbfHours,
    exemptedDowntimeMinutes: report.exemptedDowntimeMinutes,
    unexemptedDowntimeMinutes: report.unplannedDowntimeMinutes,
    periodLabel: report.periodLabel,
    nextMaintenanceWindow: summary.nextMaintenanceWindow,
    downtimeBalanceFormatted: summary.downtimeBalanceFormatted,
    cycleMonthLabel: summary.cycleMonthLabel,
  };
}

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
    const res = await apiClient.get<MaintenanceWindowListResponse | MaintenanceWindowDTO[]>(`${BASE_PATH_MAINT}${query}`);

    if (Array.isArray(res)) {
      return res as unknown as MaintenanceWindow[];
    }
    if (res && Array.isArray(res.items)) {
      return res.items.map((item: MaintenanceWindowDTO): MaintenanceWindow => {
        const start = item.start_time ? new Date(item.start_time).getTime() : 0;
        const end = item.end_time ? new Date(item.end_time).getTime() : 0;
        const calculatedDuration =
          start && end && end > start
            ? Math.round((end - start) / 60000)
            : typeof item.duration_minutes === "number"
            ? item.duration_minutes
            : 0;

        const devName = item.device_name || (item.device_id ? `Ativo #${String(item.device_id).slice(0, 8)}` : "Infraestrutura Global");

        return {
          id: String(item.id),
          rfcNumber:
            item.rfc_number ||
            `RFC-${String(item.id).slice(0, 8).toUpperCase()}`,
          title: item.title || item.description || "Manutenção Programada",
          description: item.description || "",
          targetDeviceIds: item.device_id ? [String(item.device_id)] : [],
          targetDeviceNames: item.device_name ? [item.device_name] : (item.device_id ? [devName] : []),
          clientName: item.client_name || "Organização",
          clientCategory: item.client_category || "ENTERPRISE",
          startTimeUtc: item.start_time || new Date().toISOString(),
          endTimeUtc: item.end_time || new Date().toISOString(),
          durationMinutes: calculatedDuration,
          status: item.is_approved ? "APPROVED" : "PENDING_APPROVAL",
          alarmSuppression: Boolean(item.alarm_suppression ?? item.is_approved),
          slaExemption: Boolean(item.is_approved),
        };
      });
    }

    throw new Error("Resposta inválida do backend para janelas de manutenção.");
  },

  async getMaintenanceKpiSummary(): Promise<MaintenanceKpiSummary> {
    const res = await apiClient.get<Record<string, unknown>>(`${BASE_PATH_MAINT}/kpis`);
    if (!res) {
      throw new Error("Resposta inválida do backend para KPIs de manutenção.");
    }
    const exempted = res.exempted_hours_month ?? res.exemptedHoursMonth;
    if (typeof exempted !== "number") {
      throw new Error("Resposta inválida do backend para KPIs de manutenção.");
    }
    return {
      activeNowCount: Number(res.active_now_count ?? res.activeNowCount ?? 0),
      scheduledCount: Number(res.scheduled_count ?? res.scheduledCount ?? 0),
      exemptedHoursMonth: exempted,
      contractualLimitHours: Number(res.contractual_limit_hours ?? res.contractualLimitHours ?? 8),
    };
  },

  async createMaintenanceWindow(
    data: CreateMaintenanceInput
  ): Promise<Record<string, unknown>> {
    const payload: Record<string, unknown> = {
      description: data.title ? `${data.title} — ${data.description}` : data.description,
      start_time: data.startTimeUtc,
      end_time: data.endTimeUtc,
      is_approved: Boolean(data.slaExemption),
    };
    if (data.targetDeviceIds && data.targetDeviceIds.length > 0) {
      const candidateId = data.targetDeviceIds[0];
      if (/^[0-9a-fA-F-]{36}$/.test(candidateId)) {
        payload.device_id = candidateId;
      }
    }
    if (data.organizationId && /^[0-9a-fA-F-]{36}$/.test(data.organizationId)) {
      payload.organization_id = data.organizationId;
    }
    return apiClient.post(BASE_PATH_MAINT, payload);
  },

  async approveMaintenanceWindow(id: string): Promise<MaintenanceWindow> {
    return apiClient.post<MaintenanceWindow>(`${BASE_PATH_MAINT}/${id}/approve`, {});
  },

  async getSlaOverview(
    organizationId: string,
    period?: SlaReportingPeriod
  ): Promise<SlaMetricOverview> {
    if (!organizationId) {
      throw new Error("Organização não identificada para consultar o SLA.");
    }

    const range = resolveSlaPeriodRange(period);
    const [summary, report] = await Promise.all([
      clientPortalApi.getSlaSummary(organizationId),
      clientPortalApi.getSlaReport(organizationId, range),
    ]);
    return mapReportToOverview(summary, report);
  },

  async getSlaDeviceBreakdown(
    organizationId: string,
    period?: SlaReportingPeriod
  ): Promise<SlaDeviceBreakdown[]> {
    if (!organizationId) {
      throw new Error("Organização não identificada para consultar os ativos de SLA.");
    }

    const report = await clientPortalApi.getSlaReport(
      organizationId,
      resolveSlaPeriodRange(period)
    );

    return report.devices.map((device) => ({
      deviceId: device.deviceId,
      deviceName: device.deviceName,
      ipAddress: device.ipAddress ?? undefined,
      category: device.category,
      nominalUptimePct: device.uptimeGrossPct,
      netUptimePct: device.uptimeNetPct,
      exemptedMaintenanceMinutes: device.rfcExemptedMinutes,
      status: device.status === "CONFORME" ? "COMPLIANT" : "BREACHED",
    }));
  },

  async getSlaReportDetails(
    organizationId: string,
    period?: SlaReportingPeriod
  ): Promise<OrganizationSlaReportDetails> {
    if (!organizationId) {
      throw new Error("Organização não identificada para emitir o relatório de SLA.");
    }
    return clientPortalApi.getSlaReport(
      organizationId,
      resolveSlaPeriodRange(period)
    );
  },

  async exportSlaReport(
    organizationId: string,
    format: SlaExportFormat
  ): Promise<string> {
    if (format === "json") {
      const report = await clientPortalApi.getSlaReport(organizationId);
      return JSON.stringify(report, null, 2);
    }
    return apiClient.get<string>(
      `${BASE_PATH_SLA}/organizations/${encodeURIComponent(organizationId)}/export`
    );
  },

  async getDeviceSla(deviceId: string): Promise<DeviceSlaReport> {
    return apiClient.get<DeviceSlaReport>(`${BASE_PATH_SLA}/devices/${encodeURIComponent(deviceId)}`);
  },

  async getDailySla(
    organizationId: string,
    _period?: SlaReportingPeriod
  ): Promise<OrganizationDailySlaData> {
    if (!organizationId) {
      throw new Error("Organização não identificada para consultar o SLA diário.");
    }
    return clientPortalApi.getDailySla(organizationId);
  },
};
