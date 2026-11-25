/**
 * Cliente de API para Gestão Operacional de Incidentes (Issue #32, Issue #261, Issue #277).
 * Integração com backend FastAPI (/api/v1/incidents), GLPI v9.5.7, Acknowledge do operador,
 * Resolução com Causa Raiz (RCA) e emissão de eventos SSE em tempo real (ADR-004, ADR-009).
 */

import { apiClient } from "./apiClient";
import { getGlpiTicketUrl } from "../utils/glpi";
import type {
  IncidentSeverity,
  IncidentStatus,
  FailureCategory,
  IncidentTimelineEvent,
  IncidentItem,
  ResolveIncidentPayload,
  IncidentsKpiSummary,
  IncidentDTO,
  IncidentListResponse,
} from "../types/incidents";

export type {
  IncidentSeverity,
  IncidentStatus,
  FailureCategory,
  IncidentTimelineEvent,
  IncidentItem,
  ResolveIncidentPayload,
  IncidentsKpiSummary,
  IncidentDTO,
  IncidentListResponse,
};

function formatDuration(startedAt?: string, endedAt?: string | null): string {
  if (!startedAt) return "N/D";
  const start = new Date(startedAt).getTime();
  const end = endedAt ? new Date(endedAt).getTime() : Date.now();
  if (isNaN(start) || isNaN(end) || end < start) return "N/D";
  const diffSec = Math.floor((end - start) / 1000);
  const hours = Math.floor(diffSec / 3600);
  const mins = Math.floor((diffSec % 3600) / 60);
  const secs = diffSec % 60;
  if (hours > 0) {
    return `${String(hours).padStart(2, "0")}h ${String(mins).padStart(2, "0")}m ${String(secs).padStart(2, "0")}s`;
  }
  return `${String(mins).padStart(2, "0")}m ${String(secs).padStart(2, "0")}s`;
}

export function dtoToIncidentItem(dto: IncidentDTO | Record<string, unknown>): IncidentItem {
  const d = dto as Record<string, unknown>;
  const idStr = String(d.id ?? "");
  const sevLower = String(d.severity || "degraded").toLowerCase() as IncidentSeverity;
  const statusUpper = String(d.status || "TRIGGERED").toUpperCase() as IncidentStatus;
  const startedAt = d.started_at
    ? new Date(String(d.started_at)).toISOString()
    : new Date().toISOString();
  const durationStr = formatDuration(
    typeof d.started_at === "string" ? d.started_at : undefined,
    typeof d.resolved_at === "string" ? d.resolved_at : undefined
  );

  let priorityLabel = "P2 DEGRADADO";
  if (sevLower === "critical") {
    priorityLabel = "P1 CRÍTICO";
  } else if (statusUpper === "RESOLVED" || sevLower === "resolved") {
    priorityLabel = "P3 RESOLVIDO";
  }

  const opName =
    (d.acknowledged_by as string | undefined) ||
    (d.operator_id ? `Operador #${String(d.operator_id).slice(0, 6)}` : null);
  const assignedOp = opName
    ? {
        id: String(d.operator_id || "op"),
        name: opName,
        initials:
          opName
            .split(" ")
            .map((w: string) => w[0])
            .join("")
            .slice(0, 2)
            .toUpperCase() || "OP",
        role: "NOC Analyst",
      }
    : null;

  const glpiId = typeof d.glpi_ticket_id === "number" ? d.glpi_ticket_id : null;

  return {
    id: idStr,
    code: (d.code as string) || `INC-${idStr.slice(0, 8).toUpperCase()}`,
    title: (d.title as string) || "Incidente Operacional",
    target_device: {
      name:
        (d.device_name as string) ||
        (d.device_id
          ? `DEV-${String(d.device_id).slice(0, 8).toUpperCase()}`
          : "Dispositivo N/D"),
      ip: (d.device_ip as string) || "N/D",
      model: (d.device_model as string) || "N/D",
      location: d.device_location as string | undefined,
    },
    organization_name: (d.organization_name as string) || "Organização",
    organization_domain: d.organization_domain as string | undefined,
    severity: sevLower,
    status: statusUpper,
    started_at: startedAt,
    duration_str: durationStr,
    sla_remaining_str: statusUpper === "RESOLVED" ? "Encerrado" : "Monitoramento Ativo",
    glpi_ticket_id: glpiId,
    glpi_url:
      (d.glpi_url as string) ||
      (glpiId ? getGlpiTicketUrl(glpiId) : undefined),
    priority_label: priorityLabel,
    assigned_operator: assignedOp,
    root_cause: (d.root_cause as string) || undefined,
    corrective_action: (d.corrective_action as string) || undefined,
    failure_category: d.failure_category as FailureCategory | undefined,
    is_sla_exempt: Boolean(d.is_sla_exempt ?? false),
    timeline: Array.isArray(d.timeline) ? (d.timeline as IncidentTimelineEvent[]) : [],
  };
}

export function calculateIncidentsKpis(incidents: IncidentItem[] = []): IncidentsKpiSummary {
  const critical = incidents.filter(
    (i) => i.severity === "critical" && i.status !== "RESOLVED"
  );
  const degraded = incidents.filter(
    (i) => i.severity === "degraded" && i.status !== "RESOLVED"
  );
  const resolved = incidents.filter(
    (i) => i.status === "RESOLVED" || i.severity === "resolved"
  );

  const total = incidents.length;
  const withGlpi = incidents.filter((i) => i.glpi_ticket_id !== null).length;
  const glpiSyncPct = total > 0 ? Math.round((withGlpi / total) * 100) : 100;

  const exemptOrMet = incidents.filter((i) => i.is_sla_exempt || i.status === "RESOLVED").length;
  const slaRecoveryPct = total > 0 ? parseFloat(((exemptOrMet / total) * 100).toFixed(1)) : 100;

  return {
    p1_critical_count: critical.length,
    p1_duration_str: critical[0]?.duration_str || "00m 00s",
    p2_degraded_count: degraded.length,
    p2_summary_str: degraded.map((d) => d.target_device.name).join(" & ") || "Nenhum ativo degradado",
    resolved_today_count: resolved.length,
    sla_recovery_pct: slaRecoveryPct,
    glpi_sync_pct: glpiSyncPct,
    mttr_average_str: total > 0 ? "Em apuração" : "0m",
    mttr_diff_pct: "0%",
  };
}

const subscribers: Array<(incidents: IncidentItem[]) => void> = [];

function notifySubscribers(incidents: IncidentItem[]): void {
  subscribers.forEach((cb) => {
    try {
      cb(incidents);
    } catch {
      // noop
    }
  });
}

export const incidentsApi = {
  /**
   * Assina atualizações em tempo real nos incidentes.
   */
  subscribe(callback: (incidents: IncidentItem[]) => void): () => void {
    subscribers.push(callback);
    return () => {
      const idx = subscribers.indexOf(callback);
      if (idx !== -1) subscribers.splice(idx, 1);
    };
  },

  /**
   * Lista incidentes com filtros opcionais consumindo /api/v1/incidents.
   */
  async listIncidents(filters?: {
    severity?: string;
    search?: string;
    organization?: string;
    device_id?: string;
  }): Promise<IncidentItem[]> {
    const params = new URLSearchParams();
    if (filters?.severity && filters.severity !== "all") {
      params.append("status", filters.severity.toUpperCase());
    }
    if (
      filters?.organization &&
      filters.organization !== "all" &&
      !filters.organization.includes("Todas")
    ) {
      params.append("organization_id", filters.organization);
    }
    if (filters?.device_id) {
      params.append("device_id", filters.device_id);
    }

    const query = params.toString() ? `?${params.toString()}` : "";
    const response = await apiClient.get<IncidentListResponse | IncidentDTO[]>(
      `/api/v1/incidents${query}`
    );

    let items: IncidentDTO[] = [];
    if (Array.isArray(response)) {
      items = response;
    } else if (response && Array.isArray(response.items)) {
      items = response.items;
    }

    let mapped = items.map(dtoToIncidentItem);

    if (filters?.search && filters.search.trim()) {
      const q = filters.search.toLowerCase().trim();
      mapped = mapped.filter(
        (i) =>
          i.code.toLowerCase().includes(q) ||
          i.target_device.name.toLowerCase().includes(q) ||
          i.target_device.ip.includes(q) ||
          i.title.toLowerCase().includes(q) ||
          (i.glpi_ticket_id && String(i.glpi_ticket_id).includes(q))
      );
    }

    if (filters?.severity && filters.severity !== "all") {
      mapped = mapped.filter((i) => i.severity === filters.severity);
    }

    notifySubscribers(mapped);
    return mapped;
  },

  /**
   * Obtém detalhes de um incidente específico.
   */
  async getIncidentById(id: string): Promise<IncidentItem> {
    const dto = await apiClient.get<IncidentDTO>(`/api/v1/incidents/${id}`);
    if (!dto || !dto.id) {
      throw new Error(`Incidente ${id} não encontrado.`);
    }
    return dtoToIncidentItem(dto);
  },

  /**
   * Reconhece (Acknowledge) a ocorrência pelo operador logado.
   */
  async acknowledgeIncident(
    incidentId: string,
    payload?: { acknowledged_at?: string }
  ): Promise<IncidentItem> {
    const dto = await apiClient.post<IncidentDTO>(
      `/api/v1/incidents/${incidentId}/acknowledge`,
      {
        acknowledged_at: payload?.acknowledged_at || new Date().toISOString(),
      }
    );
    return dtoToIncidentItem(dto);
  },

  /**
   * Abertura manual de chamado GLPI em 1 clique (POST /api/v1/incidents/{id}/glpi-ticket).
   */
  async createGlpiTicket(incidentId: string): Promise<IncidentItem> {
    const dto = await apiClient.post<IncidentDTO>(
      `/api/v1/incidents/${incidentId}/glpi-ticket`,
      {}
    );
    return dtoToIncidentItem(dto);
  },

  /**
   * Resolve e encerra a ocorrência exigindo Causa Raiz Técnica (POST /api/v1/incidents/{id}/resolve).
   */
  async resolveIncident(
    incidentId: string,
    payload: ResolveIncidentPayload
  ): Promise<IncidentItem> {
    if (!payload.root_cause || payload.root_cause.trim().length < 20) {
      throw new Error("A Causa Raiz Técnica (RCA) é obrigatória (mínimo de 20 caracteres).");
    }

    const dto = await apiClient.post<IncidentDTO>(
      `/api/v1/incidents/${incidentId}/resolve`,
      {
        root_cause: payload.root_cause,
        resolved_at: payload.resolved_at || new Date().toISOString(),
      }
    );
    return dtoToIncidentItem(dto);
  },

  /**
   * Obtém indicadores consolidados dos KPIs da página de incidentes a partir dos dados reais.
   */
  getKpiSummary(incidents?: IncidentItem[]): IncidentsKpiSummary {
    return calculateIncidentsKpis(incidents || []);
  },
};
