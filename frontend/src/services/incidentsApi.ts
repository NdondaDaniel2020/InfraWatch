/**
 * Cliente de API para Gestão Operacional de Incidentes (Issue #32, Issue #261, Issue #277).
 * Integração com backend FastAPI (/api/v1/incidents), GLPI v9.5.7, Acknowledge do operador,
 * Resolução com Causa Raiz (RCA) e emissão de eventos SSE em tempo real (ADR-004, ADR-009).
 */

import { apiClient } from "./apiClient";
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

export function dtoToIncidentItem(dto: any): IncidentItem {
  const idStr = String(dto.id);
  const sevLower = (dto.severity || "degraded").toLowerCase() as IncidentSeverity;
  const statusUpper = (dto.status || "TRIGGERED").toUpperCase() as IncidentStatus;
  const startedAt = dto.started_at
    ? new Date(dto.started_at).toISOString()
    : new Date().toISOString();
  const durationStr = formatDuration(dto.started_at, dto.resolved_at);

  let priorityLabel = "P2 DEGRADADO";
  if (sevLower === "critical") {
    priorityLabel = "P1 CRÍTICO";
  } else if (statusUpper === "RESOLVED" || sevLower === "resolved") {
    priorityLabel = "P3 RESOLVIDO";
  }

  const opName =
    dto.acknowledged_by ||
    (dto.operator_id ? `Operador #${String(dto.operator_id).slice(0, 6)}` : null);
  const assignedOp = opName
    ? {
        id: String(dto.operator_id || "op"),
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

  const glpiId = typeof dto.glpi_ticket_id === "number" ? dto.glpi_ticket_id : null;

  return {
    id: idStr,
    code: dto.code || `INC-${idStr.slice(0, 8).toUpperCase()}`,
    title: dto.title || "Incidente Operacional",
    target_device: {
      name:
        dto.device_name ||
        (dto.device_id
          ? `DEV-${String(dto.device_id).slice(0, 8).toUpperCase()}`
          : "Dispositivo N/D"),
      ip: dto.device_ip || "N/D",
      model: dto.device_model || "N/D",
      location: dto.device_location,
    },
    organization_name: dto.organization_name || "Organização",
    organization_domain: dto.organization_domain,
    severity: sevLower,
    status: statusUpper,
    started_at: startedAt,
    duration_str: durationStr,
    sla_remaining_str: statusUpper === "RESOLVED" ? "Encerrado" : "Monitoramento Ativo",
    glpi_ticket_id: glpiId,
    glpi_url:
      dto.glpi_url ||
      (glpiId ? `https://glpi.infrawatch.ao/front/ticket.form.php?id=${glpiId}` : undefined),
    priority_label: priorityLabel,
    assigned_operator: assignedOp,
    root_cause: dto.root_cause || undefined,
    corrective_action: dto.corrective_action || undefined,
    failure_category: dto.failure_category,
    is_sla_exempt: dto.is_sla_exempt ?? false,
    timeline: Array.isArray(dto.timeline) ? dto.timeline : [],
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
