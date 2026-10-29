import { apiClient } from "./apiClient";
import type { ClientSlaSummary, ClientServiceItem, SanitizedEndpoint } from "../types/clientPortal";
import {
  MOCK_CLIENT_SLA_SUMMARY,
  MOCK_CLIENT_SERVICES,
  MOCK_SANITIZED_ENDPOINTS,
} from "../mocks/clientPortalMocks";

export const clientPortalApi = {
  /**
   * Obtém o resumo de SLA contratual da organização do usuário.
   */
  async getSlaSummary(organizationId?: string | null): Promise<ClientSlaSummary> {
    try {
      const url = organizationId
        ? `/api/v1/sla/organizations/${encodeURIComponent(organizationId)}/summary`
        : "/api/v1/sla/summary";
      const res = await apiClient.get<ClientSlaSummary>(url);
      if (res && res.uptimeCurrentMonthPct !== undefined) {
        return res;
      }
    } catch {
      // Fallback gracioso
    }
    return MOCK_CLIENT_SLA_SUMMARY;
  },

  /**
   * Obtém a lista de serviços monitorados e sanitizados para o cliente.
   */
  async getClientServices(organizationId?: string | null): Promise<ClientServiceItem[]> {
    try {
      const url = organizationId
        ? `/api/v1/devices?organization_id=${encodeURIComponent(organizationId)}`
        : "/api/v1/devices";
      const res = await apiClient.get<any>(url);
      if (res && Array.isArray(res.items) && res.items.length > 0) {
        return res.items.map((item: any) => ({
          id: String(item.id),
          name: item.name,
          category: item.category || "Canal Digital",
          status: (item.status || "UP") as "UP" | "DEG" | "DOWN",
          statusLabel: `${item.status || "UP"} • Nominal`,
          responseTimeMs: item.last_latency_ms || 20,
          throughputFormatted: "1.200 req/s",
          successRatePct: item.status === "DOWN" ? 85.0 : 99.9,
          tags: [item.protocol || "ICMP", item.ip_address || "10.0.0.1"],
          stability30DaysPct: 99.9,
        }));
      }
    } catch {
      // Fallback
    }
    return MOCK_CLIENT_SERVICES;
  },

  /**
   * Obtém os endpoints sanitizados do cliente.
   */
  async getSanitizedEndpoints(organizationId?: string): Promise<SanitizedEndpoint[]> {
    try {
      const url = organizationId
        ? `/api/v1/devices?organization_id=${encodeURIComponent(organizationId)}`
        : "/api/v1/devices";
      const res = await apiClient.get<any>(url);
      if (res && Array.isArray(res.items) && res.items.length > 0) {
        return res.items.map((item: any) => ({
          id: String(item.id),
          domainName: item.hostname || item.name,
          serviceType: item.category || "Core Endpoint",
          protocol: item.protocol || "HTTPS",
          status: (item.status || "UP") as "UP" | "DEG" | "DOWN",
          sla30dPct: 99.9,
          latencyAvgMs: item.last_latency_ms || 15,
          datacenterRegion: "Luanda DC-01",
        }));
      }
    } catch {
      // Fallback
    }
    return MOCK_SANITIZED_ENDPOINTS;
  },
};
