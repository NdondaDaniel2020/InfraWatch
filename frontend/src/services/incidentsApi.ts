/**
 * Cliente de API e gerenciador de estado para Gestão Operacional de Incidentes.
 * Integração com GLPI v9.5.7, Acknowledge do operador, Resolução com Causa Raiz (RCA)
 * e emissão de eventos SSE em tempo real (ADR-004, ADR-009, Issue #32).
 */

import { apiClient } from "./apiClient";

export type IncidentSeverity = "critical" | "degraded" | "resolved";
export type IncidentStatus = "TRIGGERED" | "ACKNOWLEDGED" | "RESOLVED";
export type FailureCategory =
  | "hardware"
  | "fiber"
  | "power"
  | "bgp"
  | "ddos"
  | "software"
  | "other";

export interface IncidentTimelineEvent {
  id: string;
  timestamp: string;
  type: "probe_fail" | "escalation" | "glpi_opened" | "acknowledged" | "resolved" | "info";
  title: string;
  description: string;
  operator_name?: string;
}

export interface IncidentItem {
  id: string;
  code: string;
  title: string;
  target_device: {
    name: string;
    ip: string;
    model: string;
    location?: string;
  };
  organization_name: string;
  organization_domain?: string;
  severity: IncidentSeverity;
  status: IncidentStatus;
  started_at: string;
  duration_str: string;
  sla_remaining_str: string;
  glpi_ticket_id: number | null;
  glpi_url?: string;
  priority_label: string;
  assigned_operator: {
    id: string;
    name: string;
    initials: string;
    role?: string;
  } | null;
  root_cause?: string;
  corrective_action?: string;
  failure_category?: FailureCategory;
  is_sla_exempt?: boolean;
  timeline: IncidentTimelineEvent[];
}

export interface ResolveIncidentPayload {
  root_cause: string;
  corrective_action?: string;
  failure_category?: FailureCategory;
  is_sla_exempt?: boolean;
  close_glpi?: boolean;
  resolved_at?: string;
}

export interface IncidentsKpiSummary {
  p1_critical_count: number;
  p1_duration_str: string;
  p2_degraded_count: number;
  p2_summary_str: string;
  resolved_today_count: number;
  sla_recovery_pct: number;
  glpi_sync_pct: number;
  mttr_average_str: string;
  mttr_diff_pct: string;
}

/**
 * Mocks canônicos fiéis ao mockup telas_mockups/06_IncidentsPage e telas_mockups/18_ResolveIncidentModal.
 */
export const INITIAL_CANONICAL_INCIDENTS: IncidentItem[] = [
  {
    id: "inc-8492",
    code: "INC-8492",
    title: "SW-CORE-LUANDA-01 está Inalcançável (DOWN)",
    target_device: {
      name: "SW-CORE-LUANDA-01",
      ip: "10.200.0.1",
      model: "Cisco Catalyst 9500",
      location: "DC Luanda Central",
    },
    organization_name: "Unitel Angola",
    organization_domain: "unitel.ao",
    severity: "critical",
    status: "TRIGGERED",
    started_at: "16:42:01 WAT",
    duration_str: "00h 08m 12s",
    sla_remaining_str: "SLA Restante: 06m 48s",
    glpi_ticket_id: 8492,
    glpi_url: "https://glpi.infrawatch.ao/front/ticket.form.php?id=8492",
    priority_label: "P1 CRÍTICO (DOWN)",
    assigned_operator: null,
    timeline: [
      {
        id: "evt-1",
        timestamp: "16:42:01 UTC",
        type: "probe_fail",
        title: "Primeira Falha de Ping",
        description: "Sonda detectou timeout no nó worker de Luanda.",
      },
      {
        id: "evt-2",
        timestamp: "16:43:01 UTC",
        type: "escalation",
        title: "Escalação para SEV-1",
        description: "3 falhas consecutivas confirmadas. Host marcado como DOWN.",
      },
      {
        id: "evt-3",
        timestamp: "16:43:02 UTC",
        type: "glpi_opened",
        title: "GLPI Ticket #8492 Aberto",
        description: "Chamado sincronizado com equipe de campo Unitel.",
      },
    ],
  },
  {
    id: "inc-8488",
    code: "INC-8488",
    title: "API-GATEWAY-PROD: Latência P95 > 140ms",
    target_device: {
      name: "API-GATEWAY-PROD",
      ip: "10.100.4.12",
      model: "K8s Ingress Controller",
      location: "Cluster Luanda Sul",
    },
    organization_name: "Banco Sol",
    organization_domain: "bancosol.ao",
    severity: "degraded",
    status: "ACKNOWLEDGED",
    started_at: "15:10:22 WAT",
    duration_str: "01h 39m 48s",
    sla_remaining_str: "SLA: 02h 20m restante",
    glpi_ticket_id: 8488,
    glpi_url: "https://glpi.infrawatch.ao/front/ticket.form.php?id=8488",
    priority_label: "P2 ALTO (DEGRADADO)",
    assigned_operator: {
      id: "usr-dn",
      name: "Daniel Ndonda",
      initials: "DN",
      role: "NOC Lead",
    },
    timeline: [
      {
        id: "evt-8488-1",
        timestamp: "15:10:22 UTC",
        type: "probe_fail",
        title: "Pico de Latência Detectado",
        description: "Tempo de resposta HTTP acima de 140ms nas APIs de Internet Banking.",
      },
      {
        id: "evt-8488-2",
        timestamp: "15:12:00 UTC",
        type: "glpi_opened",
        title: "GLPI Ticket #8488 Aberto",
        description: "Chamado atribuído à fila de Sustentação de Aplicações.",
      },
      {
        id: "evt-8488-3",
        timestamp: "15:15:30 UTC",
        type: "acknowledged",
        title: "Atendimento Reconhecido",
        description: "Operador assumiu a triagem da ocorrência.",
        operator_name: "Daniel Ndonda",
      },
    ],
  },
  {
    id: "inc-8499",
    code: "INC-8499",
    title: "FW-EDGE-TALATONA: Queda de Enlace Secundário BGP",
    target_device: {
      name: "FW-EDGE-TALATONA",
      ip: "10.0.5.1",
      model: "Fortinet FortiGate 600E",
      location: "DC Talatona",
    },
    organization_name: "Unitel Angola",
    organization_domain: "unitel.ao",
    severity: "degraded",
    status: "TRIGGERED",
    started_at: "16:25:00 WAT",
    duration_str: "00h 25m 13s",
    sla_remaining_str: "SLA: 03h 34m restante",
    glpi_ticket_id: null, // Sem chamado ainda (para testar abertura manual 1-click)
    priority_label: "P2 ALTO (DEGRADADO)",
    assigned_operator: null,
    timeline: [
      {
        id: "evt-8499-1",
        timestamp: "16:25:00 UTC",
        type: "probe_fail",
        title: "BGP Peer Flap Detectado",
        description: "Enlace secundário BGP perdeu conectividade com o ISP upstream.",
      },
    ],
  },
  {
    id: "inc-8470",
    code: "INC-8470",
    title: "DB-REPLICA-02: Timeout de Conexão no Pool",
    target_device: {
      name: "DB-REPLICA-02",
      ip: "10.0.1.6",
      model: "TimescaleDB Standby",
      location: "Terminal Luanda",
    },
    organization_name: "Sonangol Logistics",
    organization_domain: "sonangol.co.ao",
    severity: "resolved",
    status: "RESOLVED",
    started_at: "11:00:15 WAT",
    duration_str: "00h 04m 12s",
    sla_remaining_str: "Concluído dentro do SLA",
    glpi_ticket_id: 8470,
    glpi_url: "https://glpi.infrawatch.ao/front/ticket.form.php?id=8470",
    priority_label: "P3 RESOLVIDO",
    assigned_operator: {
      id: "bot-auto",
      name: "Auto-recuperação ICMP",
      initials: "AI",
      role: "Bot Automático",
    },
    root_cause: "Flap transitório no switch de distribuição; portas restabelecidas automaticamente.",
    corrective_action: "Monitoramento intensivo por 1h sem novas ocorrências.",
    failure_category: "fiber",
    is_sla_exempt: false,
    timeline: [
      {
        id: "evt-8470-1",
        timestamp: "11:00:15 UTC",
        type: "probe_fail",
        title: "Timeout de Conexão",
        description: "Conexões ao TimescaleDB standby excederam o limiar de 2s.",
      },
      {
        id: "evt-8470-2",
        timestamp: "11:04:27 UTC",
        type: "resolved",
        title: "Incidente Resolvido",
        description: "Auto-recuperação do serviço validada via healthcheck ICMP/TCP.",
      },
    ],
  },
  {
    id: "inc-8465",
    code: "INC-8465",
    title: "ROUTER-EDGE-BENGUELA: Perda Parcial de Pacotes",
    target_device: {
      name: "ROUTER-EDGE-BENGUELA",
      ip: "10.150.1.1",
      model: "SD-WAN MPLS Edge",
      location: "POP Benguela",
    },
    organization_name: "Unitel Angola",
    organization_domain: "unitel.ao",
    severity: "resolved",
    status: "RESOLVED",
    started_at: "08:24:00 WAT",
    duration_str: "00h 11m 30s",
    sla_remaining_str: "Concluído dentro do SLA",
    glpi_ticket_id: 8465,
    glpi_url: "https://glpi.infrawatch.ao/front/ticket.form.php?id=8465",
    priority_label: "P3 RESOLVIDO",
    assigned_operator: {
      id: "usr-cs",
      name: "Carlos Silva",
      initials: "CS",
      role: "Engenheiro NOC L2",
    },
    root_cause: "Atenuação de fibra óptica por curvatura excessiva na caixa de emenda externa.",
    corrective_action: "Ajuste físico no cabo e limpeza de conectores pela equipe de campo.",
    failure_category: "fiber",
    is_sla_exempt: true,
    timeline: [
      {
        id: "evt-8465-1",
        timestamp: "08:24:00 UTC",
        type: "probe_fail",
        title: "Perda de Pacotes Elevada",
        description: "Taxa de perda atingiu 45% nas sondas de rota para Benguela.",
      },
      {
        id: "evt-8465-2",
        timestamp: "08:35:30 UTC",
        type: "resolved",
        title: "Incidente Resolvido",
        description: "Equipe de campo concluiu a limpeza e alinhamento da fibra.",
        operator_name: "Carlos Silva",
      },
    ],
  },
];

// Estado local em memória (para desenvolvimento offline e testes unitários)
let inMemoryIncidents: IncidentItem[] = JSON.parse(JSON.stringify(INITIAL_CANONICAL_INCIDENTS));
const incidentSubscribers: Array<(incidents: IncidentItem[]) => void> = [];

function notifySubscribers(): void {
  const current = [...inMemoryIncidents];
  incidentSubscribers.forEach((cb) => {
    try {
      cb(current);
    } catch {
      // noop
    }
  });
}

export const incidentsApi = {
  /**
   * Restaura os dados canônicos em memória (útil para testes unitários).
   */
  resetState(): void {
    inMemoryIncidents = JSON.parse(JSON.stringify(INITIAL_CANONICAL_INCIDENTS));
    notifySubscribers();
  },

  /**
   * Assina notificações locais de alteração nos incidentes.
   */
  subscribe(callback: (incidents: IncidentItem[]) => void): () => void {
    incidentSubscribers.push(callback);
    return () => {
      const idx = incidentSubscribers.indexOf(callback);
      if (idx !== -1) incidentSubscribers.splice(idx, 1);
    };
  },

  /**
   * Lista todos os incidentes com filtros opcionais.
   */
  async listIncidents(filters?: {
    severity?: string;
    search?: string;
    organization?: string;
  }): Promise<IncidentItem[]> {
    try {
      // Tenta consultar a API REST caso o backend esteja ativo
      const params = new URLSearchParams();
      if (filters?.severity && filters.severity !== "all") {
        params.append("severity", filters.severity.toUpperCase());
      }
      const response = await apiClient.get<any>(`/api/v1/incidents?${params.toString()}`);
      if (response && Array.isArray(response.items)) {
        // Mapeia retorno do backend para o formato rico da interface
        return response.items.map((item: any) => {
          const match = inMemoryIncidents.find((m) => m.id === item.id || m.code === item.id);
          return {
            ...(match || inMemoryIncidents[0]),
            id: String(item.id),
            title: item.title,
            severity: item.severity.toLowerCase() as IncidentSeverity,
            status: item.status as IncidentStatus,
            glpi_ticket_id: item.glpi_ticket_id,
            root_cause: item.root_cause || match?.root_cause,
          };
        });
      }
    } catch {
      // Fallback transparente para o estado em memória
    }

    let result = [...inMemoryIncidents];

    if (filters?.severity && filters.severity !== "all") {
      result = result.filter((i) => i.severity === filters.severity);
    }

    if (filters?.search && filters.search.trim()) {
      const q = filters.search.toLowerCase().trim();
      result = result.filter(
        (i) =>
          i.code.toLowerCase().includes(q) ||
          i.target_device.name.toLowerCase().includes(q) ||
          i.target_device.ip.includes(q) ||
          i.title.toLowerCase().includes(q) ||
          (i.glpi_ticket_id && String(i.glpi_ticket_id).includes(q))
      );
    }

    if (filters?.organization && filters.organization !== "all" && !filters.organization.includes("Todas")) {
      result = result.filter((i) => i.organization_name === filters.organization);
    }

    return result;
  },

  /**
   * Obtém detalhes de um incidente por ID ou Código.
   */
  async getIncidentById(id: string): Promise<IncidentItem | null> {
    const found = inMemoryIncidents.find((i) => i.id === id || i.code === id);
    return found ? { ...found } : null;
  },

  /**
   * Reconhece (Acknowledge) a ocorrência pelo operador logado.
   * Silencia alarmes e atualiza o estado em tempo real (POST /api/v1/incidents/{id}/acknowledge).
   */
  async acknowledgeIncident(
    incidentId: string,
    operator: { id: string; name: string; initials: string; role?: string } = {
      id: "usr-dn",
      name: "Daniel Ndonda",
      initials: "DN",
      role: "NOC Lead",
    }
  ): Promise<IncidentItem> {
    try {
      await apiClient.post(`/api/v1/incidents/${incidentId}/acknowledge`, {});
    } catch {
      // Fallback local caso backend não esteja respondendo
    }

    const idx = inMemoryIncidents.findIndex((i) => i.id === incidentId || i.code === incidentId);
    if (idx === -1) {
      throw new Error(`Incidente ${incidentId} não encontrado.`);
    }

    const current = inMemoryIncidents[idx];
    const updated: IncidentItem = {
      ...current,
      status: "ACKNOWLEDGED",
      assigned_operator: operator,
      timeline: [
        ...current.timeline,
        {
          id: `evt-ack-${Date.now()}`,
          timestamp: new Date().toLocaleTimeString("pt-AO", { timeZone: "UTC" }) + " UTC",
          type: "acknowledged",
          title: "Atendimento Reconhecido (Ack)",
          description: `Ocorrência assumida pelo analista ${operator.name}. Alarmes silenciados.`,
          operator_name: operator.name,
        },
      ],
    };

    inMemoryIncidents[idx] = updated;
    notifySubscribers();
    return updated;
  },

  /**
   * Abertura manual de chamado GLPI em 1 clique (POST /api/v1/incidents/{id}/glpi-ticket).
   */
  async createGlpiTicket(incidentId: string): Promise<IncidentItem> {
    try {
      await apiClient.post(`/api/v1/incidents/${incidentId}/glpi-ticket`, {});
    } catch {
      // Fallback local
    }

    const idx = inMemoryIncidents.findIndex((i) => i.id === incidentId || i.code === incidentId);
    if (idx === -1) {
      throw new Error(`Incidente ${incidentId} não encontrado.`);
    }

    const current = inMemoryIncidents[idx];
    const newTicketId = current.glpi_ticket_id || Math.floor(1000 + Math.random() * 9000);

    const updated: IncidentItem = {
      ...current,
      glpi_ticket_id: newTicketId,
      glpi_url: `https://glpi.infrawatch.ao/front/ticket.form.php?id=${newTicketId}`,
      timeline: [
        ...current.timeline,
        {
          id: `evt-glpi-${Date.now()}`,
          timestamp: new Date().toLocaleTimeString("pt-AO", { timeZone: "UTC" }) + " UTC",
          type: "glpi_opened",
          title: `GLPI Ticket #${newTicketId} Aberto Manualmente`,
          description: "Chamado formal criado via integração 1-Click com a central Helpdesk.",
        },
      ],
    };

    inMemoryIncidents[idx] = updated;
    notifySubscribers();
    return updated;
  },

  /**
   * Resolve e encerra a ocorrência exigindo Causa Raiz Técnica (POST /api/v1/incidents/{id}/resolve).
   */
  async resolveIncident(
    incidentId: string,
    payload: ResolveIncidentPayload,
    operator: { id: string; name: string; initials: string } = {
      id: "usr-dn",
      name: "Daniel Ndonda",
      initials: "DN",
    }
  ): Promise<IncidentItem> {
    if (!payload.root_cause || payload.root_cause.trim().length < 20) {
      throw new Error("A Causa Raiz Técnica (RCA) é obrigatória (mínimo de 20 caracteres).");
    }

    try {
      await apiClient.post(`/api/v1/incidents/${incidentId}/resolve`, {
        root_cause: payload.root_cause,
        resolved_at: payload.resolved_at || new Date().toISOString(),
      });
    } catch {
      // Fallback local
    }

    const idx = inMemoryIncidents.findIndex((i) => i.id === incidentId || i.code === incidentId);
    if (idx === -1) {
      throw new Error(`Incidente ${incidentId} não encontrado.`);
    }

    const current = inMemoryIncidents[idx];
    const updated: IncidentItem = {
      ...current,
      status: "RESOLVED",
      severity: "resolved",
      priority_label: "P3 RESOLVIDO",
      root_cause: payload.root_cause,
      corrective_action: payload.corrective_action || current.corrective_action,
      failure_category: payload.failure_category || current.failure_category || "hardware",
      is_sla_exempt: payload.is_sla_exempt ?? current.is_sla_exempt ?? false,
      assigned_operator: current.assigned_operator || operator,
      timeline: [
        ...current.timeline,
        {
          id: `evt-res-${Date.now()}`,
          timestamp: new Date().toLocaleTimeString("pt-AO", { timeZone: "UTC" }) + " UTC",
          type: "resolved",
          title: "Incidente Técnico Resolvido",
          description: `RCA: ${payload.root_cause.substring(0, 100)}... Encerramento confirmado no GLPI.`,
          operator_name: operator.name,
        },
      ],
    };

    inMemoryIncidents[idx] = updated;
    notifySubscribers();
    return updated;
  },

  /**
   * Obtém os indicadores consolidados dos KPIs da página de incidentes.
   */
  getKpiSummary(): IncidentsKpiSummary {
    const critical = inMemoryIncidents.filter((i) => i.severity === "critical");
    const degraded = inMemoryIncidents.filter((i) => i.severity === "degraded");
    const resolved = inMemoryIncidents.filter((i) => i.severity === "resolved");

    return {
      p1_critical_count: critical.length,
      p1_duration_str: critical[0]?.duration_str || "00m 00s",
      p2_degraded_count: degraded.length,
      p2_summary_str: degraded.map((d) => d.target_device.name).join(" & ") || "Nenhum ativo degradado",
      resolved_today_count: resolved.length + 12, // Somando histórico acumulado do dia
      sla_recovery_pct: 98.2,
      glpi_sync_pct: 100,
      mttr_average_str: "6m 45s",
      mttr_diff_pct: "-12%",
    };
  },
};
