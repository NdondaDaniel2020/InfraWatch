import { apiClient } from "./apiClient";
import type {
  ClientSlaSummary,
  ClientServiceItem,
  SanitizedEndpoint,
  ClientDeviceDTO,
  ClientDeviceListResponse,
  SlaMonthlyHistoryItem,
  OrganizationSlaReportDetails,
  CreateSupportTicketInput,
  SupportTicketResponse,
} from "../types/clientPortal";

function requireNumber(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`Resposta inválida do backend para o campo "${field}".`);
  }
  return value;
}

function normalizeStatus(value?: string | null): "UP" | "DEG" | "DOWN" {
  const normalized = (value || "UP").toUpperCase();
  if (normalized === "DOWN") return "DOWN";
  if (normalized === "DEG" || normalized === "DEGRADED") return "DEG";
  return "UP";
}

function normalizeSummary(data: any): ClientSlaSummary {
  return {
    tenantId: String(data.tenant_id ?? data.tenantId ?? ""),
    tenantName: String(data.tenant_name ?? data.tenantName ?? "Organização"),
    uptimeCurrentMonthPct: requireNumber(
      data.uptime_current_month_pct ?? data.uptimeCurrentMonthPct,
      "uptime_current_month_pct"
    ),
    slaTargetPct: requireNumber(
      data.sla_target_pct ?? data.slaTargetPct,
      "sla_target_pct"
    ),
    downtimeBalanceFormatted: String(
      data.downtime_balance_formatted ?? data.downtimeBalanceFormatted ?? "—"
    ),
    mttrMinutesAvg: requireNumber(
      data.mttr_minutes_avg ?? data.mttrMinutesAvg,
      "mttr_minutes_avg"
    ),
    nextMaintenanceWindow: String(
      data.next_maintenance_window ??
        data.nextMaintenanceWindow ??
        "Nenhuma parada agendada"
    ),
    cycleMonthLabel: String(
      data.cycle_month_label ?? data.cycleMonthLabel ?? "Ciclo vigente"
    ),
  };
}

function mapDeviceToService(item: ClientDeviceDTO): ClientServiceItem {
  const status = normalizeStatus(item.status);
  return {
    id: String(item.id),
    name: item.name,
    category: item.category || "Sem categoria",
    status,
    statusLabel:
      status === "UP" ? "Nominal" : status === "DEG" ? "Degradação" : "Falha",
    ...(typeof item.last_latency_ms === "number"
      ? { responseTimeMs: item.last_latency_ms }
      : {}),
    tags: item.protocol ? [item.protocol] : [],
  };
}

export const clientPortalApi = {
  /**
   * Obtém o resumo de SLA contratual da organização do usuário.
   * Lança erro quando o backend não responde ou devolve um contrato inválido.
   */
  async getSlaSummary(organizationId?: string | null): Promise<ClientSlaSummary> {
    const url = organizationId
      ? `/api/v1/sla/organizations/${encodeURIComponent(organizationId)}/summary`
      : "/api/v1/sla/summary";
    const res = await apiClient.get<any>(url);
    return normalizeSummary(res);
  },

  /**
   * Obtém a lista de serviços monitorados e sanitizados para o cliente.
   * Não inventa métricas ausentes no payload do backend.
   */
  async getClientServices(organizationId?: string | null): Promise<ClientServiceItem[]> {
    const params = new URLSearchParams();
    if (organizationId) params.set("org_id", organizationId);
    const query = params.toString();
    const url = query ? `/api/v1/devices?${query}` : "/api/v1/devices";
    const res = await apiClient.get<ClientDeviceListResponse>(url);

    if (!res || !Array.isArray(res.items)) {
      throw new Error("Resposta inválida do backend para a lista de dispositivos.");
    }

    return res.items.map(mapDeviceToService);
  },

  /**
   * Obtém o histórico mensal analítico de SLA da organização.
   */
  async getSlaHistory(
    organizationId?: string | null,
    months: number = 6
  ): Promise<SlaMonthlyHistoryItem[]> {
    if (!organizationId) {
      throw new Error("Organização não identificada para consultar o histórico de SLA.");
    }

    const url = `/api/v1/sla/organizations/${encodeURIComponent(organizationId)}/history?months=${months}`;
    const res = await apiClient.get<any>(url);

    if (!res || !Array.isArray(res.items)) {
      throw new Error("Resposta inválida do backend para o histórico de SLA.");
    }

    return res.items.map((item: any): SlaMonthlyHistoryItem => ({
      cycleLabel: String(item.cycle_label ?? item.cycleLabel ?? ""),
      month: String(item.month ?? ""),
      uptimePct: requireNumber(item.uptime_pct ?? item.uptimePct, "uptime_pct"),
      targetPct: requireNumber(item.target_pct ?? item.targetPct, "target_pct"),
      mttrMinutes: requireNumber(item.mttr_minutes ?? item.mttrMinutes, "mttr_minutes"),
      incidentsCount: requireNumber(
        item.incidents_count ?? item.incidentsCount,
        "incidents_count"
      ),
      unplannedDowntimeMinutes: requireNumber(
        item.unplanned_downtime_minutes ?? item.unplannedDowntimeMinutes,
        "unplanned_downtime_minutes"
      ),
      exemptedDowntimeMinutes: requireNumber(
        item.exempted_downtime_minutes ?? item.exemptedDowntimeMinutes,
        "exempted_downtime_minutes"
      ),
      status: item.status === "VIOLADO" ? "VIOLADO" : "CONFORME",
    }));
  },

  /**
   * Obtém os dados detalhados para emissão e assinatura do Relatório Oficial de SLA.
   */
  async getSlaReport(
    organizationId?: string | null,
    period?: { startPeriod?: string; endPeriod?: string }
  ): Promise<OrganizationSlaReportDetails> {
    if (!organizationId) {
      throw new Error("Organização não identificada para emitir o relatório de SLA.");
    }

    const params = new URLSearchParams();
    if (period?.startPeriod) params.set("start_period", period.startPeriod);
    if (period?.endPeriod) params.set("end_period", period.endPeriod);
    const query = params.toString();
    const url = `/api/v1/sla/organizations/${encodeURIComponent(organizationId)}/report${
      query ? `?${query}` : ""
    }`;
    const res = await apiClient.get<any>(url);

    if (!res || (!res.organization_id && !res.organizationId)) {
      throw new Error("Resposta inválida do backend para o relatório de SLA.");
    }

    const digitalSignature = String(
      res.digital_signature ?? res.digitalSignature ?? ""
    );
    if (!digitalSignature) {
      throw new Error("O relatório devolvido pelo backend não contém assinatura digital.");
    }

    return {
      organizationId: String(res.organization_id ?? res.organizationId),
      organizationName: String(
        res.organization_name ?? res.organizationName ?? "Organização"
      ),
      periodLabel: String(res.period_label ?? res.periodLabel ?? ""),
      startPeriod: String(res.start_period ?? res.startPeriod ?? ""),
      endPeriod: String(res.end_period ?? res.endPeriod ?? ""),
      uptimeNetPct: requireNumber(
        res.uptime_net_pct ?? res.uptimeNetPct,
        "uptime_net_pct"
      ),
      uptimeGrossPct: requireNumber(
        res.uptime_gross_pct ?? res.uptimeGrossPct,
        "uptime_gross_pct"
      ),
      slaTargetPct: requireNumber(
        res.sla_target_pct ?? res.slaTargetPct,
        "sla_target_pct"
      ),
      slaMet: Boolean(res.sla_met ?? res.slaMet),
      mttrMinutes: requireNumber(res.mttr_minutes ?? res.mttrMinutes, "mttr_minutes"),
      mtbfHours: requireNumber(res.mtbf_hours ?? res.mtbfHours, "mtbf_hours"),
      totalDevices: requireNumber(
        res.total_devices ?? res.totalDevices,
        "total_devices"
      ),
      unplannedDowntimeMinutes: requireNumber(
        res.unplanned_downtime_minutes ?? res.unplannedDowntimeMinutes,
        "unplanned_downtime_minutes"
      ),
      exemptedDowntimeMinutes: requireNumber(
        res.exempted_downtime_minutes ?? res.exemptedDowntimeMinutes,
        "exempted_downtime_minutes"
      ),
      devices: Array.isArray(res.devices)
        ? res.devices.map((d: any) => ({
            deviceId: String(d.device_id ?? d.deviceId),
            deviceName: String(d.device_name ?? d.deviceName ?? ""),
            category: String(d.category ?? "—"),
            uptimeGrossPct: requireNumber(
              d.uptime_gross_pct ?? d.uptimeGrossPct,
              "device.uptime_gross_pct"
            ),
            uptimeNetPct: requireNumber(
              d.uptime_net_pct ?? d.uptimeNetPct,
              "device.uptime_net_pct"
            ),
            rfcExemptedMinutes: requireNumber(
              d.rfc_exempted_minutes ?? d.rfcExemptedMinutes,
              "device.rfc_exempted_minutes"
            ),
            slaTargetPct: requireNumber(
              d.sla_target_pct ?? d.slaTargetPct,
              "device.sla_target_pct"
            ),
            mttrMinutes: requireNumber(
              d.mttr_minutes ?? d.mttrMinutes,
              "device.mttr_minutes"
            ),
            status: String(d.status ?? "INDEFINIDO"),
          }))
        : [],
      digitalSignature,
    };
  },

  /**
   * Abre um chamado técnico formal de suporte para a organização.
   */
  async openSupportTicket(
    organizationId: string,
    input: CreateSupportTicketInput
  ): Promise<SupportTicketResponse> {
    const url = `/api/v1/sla/organizations/${encodeURIComponent(organizationId)}/support-ticket`;
    return apiClient.post<SupportTicketResponse>(url, {
      title: input.title,
      description: input.description,
      severity: input.severity,
      device_id: input.deviceId || null,
    });
  },

  /**
   * Obtém os endpoints sanitizados do cliente.
   */
  async getSanitizedEndpoints(organizationId?: string): Promise<SanitizedEndpoint[]> {
    const params = new URLSearchParams();
    if (organizationId) params.set("org_id", organizationId);
    const query = params.toString();
    const url = query ? `/api/v1/devices?${query}` : "/api/v1/devices";
    const res = await apiClient.get<ClientDeviceListResponse>(url);

    if (!res || !Array.isArray(res.items)) {
      throw new Error("Resposta inválida do backend para a lista de endpoints.");
    }

    return res.items.map((item: ClientDeviceDTO) => ({
      id: String(item.id),
      domainName: item.hostname || item.name,
      serviceType: item.category || "Sem categoria",
      protocol: item.protocol || "—",
      status: normalizeStatus(item.status),
      ...(typeof item.last_latency_ms === "number"
        ? { latencyAvgMs: item.last_latency_ms }
        : {}),
    }));
  },
};
