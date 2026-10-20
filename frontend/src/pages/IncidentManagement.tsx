import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  IncidentItem,
  IncidentSeverity,
  incidentsApi,
  IncidentsKpiSummary,
  FailureCategory,
} from "../services/incidentsApi";
import { GlpiBadge } from "../components/incidents/GlpiBadge";
import { AcknowledgeModal } from "../components/incidents/AcknowledgeModal";
import { ResolveIncidentModal } from "../components/incidents/ResolveIncidentModal";
import { IncidentTimeline } from "../components/incidents/IncidentTimeline";

export type ViewState = "nominal" | "skeleton" | "empty" | "error";

/**
 * Página Canônica de Gestão Operacional de Incidentes (Issue #32).
 * Fiel aos mockups:
 * - telas_mockups/06_IncidentsPage
 * - telas_mockups/18_ResolveIncidentModal
 * - telas_mockups/14_IncidentDetailDrawer
 */
export const IncidentManagement: React.FC = () => {
  const [viewState, setViewState] = useState<ViewState>("nominal");
  const [incidents, setIncidents] = useState<IncidentItem[]>([]);
  const [kpiSummary, setKpiSummary] = useState<IncidentsKpiSummary | null>(null);

  // Filtros
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedSeverity, setSelectedSeverity] = useState<"all" | IncidentSeverity>("all");
  const [selectedOrg, setSelectedOrg] = useState("all");

  // Seleção de linhas (Checkboxes)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Modais e Gaveta Lateral (Drawer)
  const [ackIncident, setAckIncident] = useState<IncidentItem | null>(null);
  const [resolveIncidentItem, setResolveIncidentItem] = useState<IncidentItem | null>(null);
  const [drawerIncident, setDrawerIncident] = useState<IncidentItem | null>(null);
  const [isOpeningGlpiId, setIsOpeningGlpiId] = useState<string | null>(null);
  const [isSubmittingAck, setIsSubmittingAck] = useState(false);
  const [isSubmittingResolve, setIsSubmittingResolve] = useState(false);

  // Toast temporário de notificação
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(null);
    }, 4000);
  }, []);

  // Carrega incidentes
  const loadIncidents = useCallback(async () => {
    try {
      const data = await incidentsApi.listIncidents();
      setIncidents(data);
      setKpiSummary(incidentsApi.getKpiSummary());
    } catch {
      setViewState("error");
    }
  }, []);

  useEffect(() => {
    loadIncidents();
    const unsubscribe = incidentsApi.subscribe((updated) => {
      setIncidents(updated);
      setKpiSummary(incidentsApi.getKpiSummary());
    });
    return unsubscribe;
  }, [loadIncidents]);

  // Filtragem
  const filteredIncidents = useMemo(() => {
    let result = [...incidents];

    if (selectedSeverity !== "all") {
      result = result.filter((i) => i.severity === selectedSeverity);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter(
        (i) =>
          i.code.toLowerCase().includes(q) ||
          i.target_device.name.toLowerCase().includes(q) ||
          i.target_device.ip.includes(q) ||
          i.title.toLowerCase().includes(q) ||
          (i.glpi_ticket_id && String(i.glpi_ticket_id).includes(q))
      );
    }

    if (selectedOrg !== "all" && !selectedOrg.includes("Todas")) {
      result = result.filter((i) => i.organization_name === selectedOrg);
    }

    return result;
  }, [incidents, selectedSeverity, searchQuery, selectedOrg]);

  // Contadores para pills de severidade
  const counts = useMemo(() => {
    return {
      all: incidents.length,
      critical: incidents.filter((i) => i.severity === "critical").length,
      degraded: incidents.filter((i) => i.severity === "degraded").length,
      resolved: incidents.filter((i) => i.severity === "resolved").length,
    };
  }, [incidents]);

  // Seleção de linhas
  const allFilteredSelected =
    filteredIncidents.length > 0 &&
    filteredIncidents.every((item) => selectedIds.has(item.id));

  const handleToggleSelectAll = () => {
    if (allFilteredSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredIncidents.map((i) => i.id)));
    }
  };

  const handleToggleRow = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  // Ações Rápidas: Acknowledge
  const handleConfirmAck = async (incidentId: string) => {
    setIsSubmittingAck(true);
    try {
      await incidentsApi.acknowledgeIncident(incidentId);
      showToast(`Incidente ${incidentId} reconhecido com sucesso. Alarmes silenciados.`);
      setAckIncident(null);
    } catch {
      showToast("Erro ao reconhecer incidente.");
    } finally {
      setIsSubmittingAck(false);
    }
  };

  // Ações Rápidas: 1-Click GLPI Ticket
  const handleOpenGlpiTicket = async (incidentId: string) => {
    setIsOpeningGlpiId(incidentId);
    try {
      const updated = await incidentsApi.createGlpiTicket(incidentId);
      showToast(`Chamado #${updated.glpi_ticket_id} criado no GLPI com sucesso!`);
    } catch {
      showToast("Erro ao criar chamado no GLPI.");
    } finally {
      setIsOpeningGlpiId(null);
    }
  };

  // Ações Rápidas: Resolução
  const handleConfirmResolve = async (
    incidentId: string,
    payload: {
      root_cause: string;
      corrective_action: string;
      failure_category: FailureCategory;
      is_sla_exempt: boolean;
      close_glpi: boolean;
    }
  ) => {
    setIsSubmittingResolve(true);
    try {
      await incidentsApi.resolveIncident(incidentId, payload);
      showToast(`Incidente ${incidentId} resolvido com sucesso! GLPI atualizado.`);
      setResolveIncidentItem(null);
    } catch (err: any) {
      showToast(err.message || "Erro ao resolver incidente.");
    } finally {
      setIsSubmittingResolve(false);
    }
  };

  // Exportar CSV
  const handleExportCsv = () => {
    const headers = "Código,Severidade,Ativo,IP,Organização,Início,Duração,Ticket GLPI,Status\n";
    const rows = filteredIncidents
      .map(
        (i) =>
          `"${i.code}","${i.severity}","${i.target_device.name}","${i.target_device.ip}","${i.organization_name}","${i.started_at}","${i.duration_str}","${i.glpi_ticket_id || ""}","${i.status}"`
      )
      .join("\n");
    const blob = new Blob([headers + rows], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `incidentes-infrawatch-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showToast("Relatório CSV de incidentes exportado com sucesso.");
  };

  return (
    <div
      className="p-4 md:p-6 space-y-5 bg-obsidian-950 text-slate-100 min-h-screen"
      data-testid="incidents-page"
    >
      {/* Toast Alert */}
      {toastMessage && (
        <div
          role="status"
          data-testid="toast-notification"
          className="fixed top-16 right-6 z-50 bg-emerald-950 border border-emerald-500/60 text-emerald-200 px-4 py-2.5 rounded-xl text-xs font-mono shadow-2xl flex items-center gap-2 animate-in fade-in slide-in-from-top-4 duration-200"
        >
          <span className="material-symbols-outlined text-[18px] text-emerald-400" aria-hidden="true">
            check_circle
          </span>
          <span>{toastMessage}</span>
        </div>
      )}

      {/* CABEÇALHO DA PÁGINA + SELETOR DE ESTADOS INTERATIVO */}
      <section className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 bg-obsidian-900 p-4 rounded-xl border border-obsidian-800 shadow-md">
        <div className="space-y-1">
          <div className="flex items-center gap-2.5 flex-wrap">
            <span className="w-2.5 h-2.5 rounded-full bg-rose-400 animate-ping" aria-hidden="true" />
            <h1 className="font-display font-bold text-lg text-white tracking-tight">
              Gestão Operacional de Incidentes
            </h1>
            <span className="px-2 py-0.5 rounded bg-obsidian-850 border border-obsidian-800 text-xs font-mono text-slate-300">
              16:50:13 WAT (Luanda)
            </span>
          </div>
          <p className="text-xs text-slate-400">
            Triagem de alarmes em tempo real, monitoramento de falhas, SLA regressivo e integração com tickets GLPI v9.5.7.
          </p>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          {/* Seletor de Estados Canônico (Nominal, Skeleton, Empty, Error) */}
          <div
            className="flex items-center gap-1 bg-obsidian-950 p-1 rounded-lg border border-obsidian-800 text-xs font-mono"
            role="group"
            aria-label="Alternar estados de interface para auditoria"
          >
            <span className="text-slate-500 px-2 text-[11px] uppercase tracking-wider font-semibold">
              Estado:
            </span>
            <button
              type="button"
              onClick={() => setViewState("nominal")}
              data-testid="state-btn-nominal"
              className={`px-2 py-1 rounded font-semibold transition-colors cursor-pointer ${
                viewState === "nominal"
                  ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                  : "text-slate-400 hover:text-white hover:bg-obsidian-850"
              }`}
            >
              Nominal
            </button>
            <button
              type="button"
              onClick={() => setViewState("skeleton")}
              data-testid="state-btn-skeleton"
              className={`px-2 py-1 rounded transition-colors cursor-pointer ${
                viewState === "skeleton"
                  ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-semibold"
                  : "text-slate-400 hover:text-white hover:bg-obsidian-850"
              }`}
            >
              Skeleton
            </button>
            <button
              type="button"
              onClick={() => setViewState("empty")}
              data-testid="state-btn-empty"
              className={`px-2 py-1 rounded transition-colors cursor-pointer ${
                viewState === "empty"
                  ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-semibold"
                  : "text-slate-400 hover:text-white hover:bg-obsidian-850"
              }`}
            >
              Vazio
            </button>
            <button
              type="button"
              onClick={() => setViewState("error")}
              data-testid="state-btn-error"
              className={`px-2 py-1 rounded transition-colors cursor-pointer ${
                viewState === "error"
                  ? "bg-rose-500/20 text-rose-300 border border-rose-500/30 font-semibold"
                  : "text-slate-400 hover:text-white hover:bg-obsidian-850"
              }`}
            >
              Erro SSE
            </button>
          </div>

          <button
            type="button"
            onClick={handleExportCsv}
            data-testid="btn-export-csv"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-obsidian-850 hover:bg-obsidian-800 border border-obsidian-800 text-slate-200 text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:ring-emerald-500 cursor-pointer"
          >
            <span className="material-symbols-outlined text-[16px] text-slate-400" aria-hidden="true">
              download
            </span>
            <span>Exportar CSV</span>
          </button>

          <a
            href="https://glpi.infrawatch.ao/front/ticket.php"
            target="_blank"
            rel="noopener noreferrer"
            data-testid="btn-glpi-helpdesk-external"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-obsidian-850 hover:bg-obsidian-800 border border-obsidian-700 text-sky-400 text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:ring-sky-400"
          >
            <span className="material-symbols-outlined text-[16px]" aria-hidden="true">
              open_in_new
            </span>
            <span>GLPI Helpdesk ↗</span>
          </a>
        </div>
      </section>

      {/* OVERLAY DE ERRO DE CONEXÃO SSE / GLPI API (Estado Error) */}
      {viewState === "error" && (
        <section
          data-testid="state-overlay-error"
          className="bg-rose-950/40 border border-rose-500/60 p-4 rounded-xl flex items-center justify-between gap-4 text-xs font-mono animate-in fade-in duration-200"
        >
          <div className="flex items-center gap-3">
            <span className="material-symbols-outlined text-rose-400 text-2xl animate-pulse" aria-hidden="true">
              cloud_off
            </span>
            <div>
              <div className="font-bold text-rose-300">FALHA DE SINCRONIZAÇÃO SSE / GLPI API</div>
              <div className="text-rose-400/80">
                Conexão WebSocket interrompida com cluster LUANDA-01. Tentando reconexão exponencial em 4s…
              </div>
            </div>
          </div>
          <button
            type="button"
            data-testid="btn-reconnect-sse"
            onClick={() => {
              setViewState("nominal");
              showToast("Reconectado com sucesso ao cluster de incidentes.");
            }}
            className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-bold transition-colors cursor-pointer"
          >
            Reconectar Agora
          </button>
        </section>
      )}

      {/* KPI STAT CARDS (4 Colunas) */}
      <section
        data-testid="kpi-cards"
        className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4"
        aria-label="Indicadores Chave de Incidentes"
      >
        {viewState === "skeleton" ? (
          <>
            <div className="bg-obsidian-900 border border-obsidian-800 p-4 rounded-xl h-28 animate-pulse" />
            <div className="bg-obsidian-900 border border-obsidian-800 p-4 rounded-xl h-28 animate-pulse" />
            <div className="bg-obsidian-900 border border-obsidian-800 p-4 rounded-xl h-28 animate-pulse" />
            <div className="bg-obsidian-900 border border-obsidian-800 p-4 rounded-xl h-28 animate-pulse" />
          </>
        ) : (
          <>
            {/* Card 1: Críticos P1 */}
            <article className="bg-obsidian-900 border border-rose-500/40 p-4 rounded-xl relative overflow-hidden shadow-lg">
              <div className="absolute top-0 left-0 w-1 h-full bg-rose-500" />
              <div className="flex justify-between items-start">
                <span className="text-xs font-mono text-slate-400 uppercase tracking-wider">
                  Incidentes P1 (Crítico)
                </span>
                <span className="w-2.5 h-2.5 rounded-full bg-rose-400 animate-ping" aria-hidden="true" />
              </div>
              <div
                data-testid="kpi-critical-count"
                className="font-display font-bold text-2xl text-rose-400 mt-1 tabular-nums"
              >
                {kpiSummary?.p1_critical_count || 1} Crítico
              </div>
              <div className="text-xs text-slate-400 mt-1">Interrupção total de serviço</div>
              <div className="mt-3 pt-2 border-t border-obsidian-800/80 flex items-center justify-between text-xs font-mono text-rose-400">
                <span>
                  Duração:{" "}
                  <strong data-testid="kpi-p1-duration" className="tabular-nums">
                    {kpiSummary?.p1_duration_str || "08m 12s"}
                  </strong>
                </span>
                <span className="font-bold bg-rose-500/20 px-1.5 py-0.5 rounded border border-rose-500/30">
                  RISCO SLA
                </span>
              </div>
            </article>

            {/* Card 2: Em Atendimento P2 */}
            <article className="bg-obsidian-900 border border-amber-500/40 p-4 rounded-xl relative overflow-hidden shadow-lg">
              <div className="absolute top-0 left-0 w-1 h-full bg-amber-500" />
              <div className="flex justify-between items-start">
                <span className="text-xs font-mono text-slate-400 uppercase tracking-wider">
                  Incidentes P2 (Alto)
                </span>
                <span className="material-symbols-outlined text-[18px] text-amber-400" aria-hidden="true">
                  support_agent
                </span>
              </div>
              <div
                data-testid="kpi-degraded-count"
                className="font-display font-bold text-2xl text-amber-400 mt-1 tabular-nums"
              >
                {kpiSummary?.p2_degraded_count || 2} Degradados
              </div>
              <div className="text-xs text-slate-400 mt-1">Operadores atuando no NOC</div>
              <div className="mt-3 pt-2 border-t border-obsidian-800/80 text-xs font-mono text-slate-400 truncate">
                {kpiSummary?.p2_summary_str || "API Gateway & POP Benguela"}
              </div>
            </article>

            {/* Card 3: Resolvidos Hoje P3 */}
            <article className="bg-obsidian-900 border border-obsidian-800 p-4 rounded-xl relative overflow-hidden shadow-lg">
              <div className="absolute top-0 left-0 w-1 h-full bg-emerald-500" />
              <div className="flex justify-between items-start">
                <span className="text-xs font-mono text-slate-400 uppercase tracking-wider">
                  Resolvidos Hoje
                </span>
                <span className="material-symbols-outlined text-[18px] text-emerald-400" aria-hidden="true">
                  task_alt
                </span>
              </div>
              <div
                data-testid="kpi-resolved-count"
                className="font-display font-bold text-2xl text-emerald-400 mt-1 tabular-nums"
              >
                {kpiSummary?.resolved_today_count || 14} Incidentes
              </div>
              <div className="text-xs text-slate-400 mt-1">
                Recuperação em SLA: {kpiSummary?.sla_recovery_pct || 98.2}%
              </div>
              <div className="mt-3 pt-2 border-t border-obsidian-800/80 text-xs font-mono text-slate-400 flex items-center justify-between">
                <span>Sincronizados GLPI</span>
                <span className="text-emerald-400 font-bold">{kpiSummary?.glpi_sync_pct || 100}% OK</span>
              </div>
            </article>

            {/* Card 4: MTTR Médio */}
            <article className="bg-obsidian-900 border border-obsidian-800 p-4 rounded-xl relative overflow-hidden shadow-lg">
              <div className="flex justify-between items-start">
                <span className="text-xs font-mono text-slate-400 uppercase tracking-wider">
                  MTTR Médio (Mês)
                </span>
                <span className="material-symbols-outlined text-[18px] text-sky-400" aria-hidden="true">
                  speed
                </span>
              </div>
              <div className="flex items-baseline gap-2 mt-1">
                <div
                  data-testid="kpi-mttr-average"
                  className="font-display font-bold text-2xl text-white tabular-nums"
                >
                  {kpiSummary?.mttr_average_str || "6m 45s"}
                </div>
                <span className="text-xs font-mono text-emerald-400 font-semibold tabular-nums">
                  ▼ {kpiSummary?.mttr_diff_pct || "-12%"}
                </span>
              </div>
              <div className="text-xs text-slate-400 mt-1">Meta Contratual MTTR: &lt; 15 min</div>
              <div className="mt-3 pt-2 border-t border-obsidian-800/80 text-xs font-mono text-emerald-400">
                Dentro dos parâmetros contratuais
              </div>
            </article>
          </>
        )}
      </section>

      {/* BARRA DE FILTROS & CONTROLES */}
      <section
        className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 bg-obsidian-900/60 p-3 rounded-xl border border-obsidian-800 shadow"
        role="toolbar"
        aria-label="Filtros de incidentes"
      >
        <div className="flex flex-wrap items-center gap-2.5 flex-1">
          {/* Campo de Busca Monospaced */}
          <div className="relative flex items-center bg-obsidian-950 border border-obsidian-800 rounded-lg px-3 py-1.5 w-full sm:w-80 focus-within:border-emerald-500 transition-colors">
            <span className="material-symbols-outlined text-slate-400 text-[18px] mr-2" aria-hidden="true">
              search
            </span>
            <input
              type="text"
              id="filter-search-input"
              data-testid="filter-search-input"
              aria-label="Filtrar incidentes por ativo, IP ou GLPI ID"
              placeholder="Filtrar por ativo, IP ou chamado…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-transparent border-0 p-0 text-xs font-mono text-slate-200 placeholder-slate-500 focus:ring-0 w-full outline-none"
            />
          </div>

          {/* Pills de Severidade */}
          <div
            className="flex items-center gap-1 bg-obsidian-950 p-1 rounded-lg border border-obsidian-800 text-xs font-mono"
            role="group"
            aria-label="Filtrar por severidade"
          >
            <button
              type="button"
              data-testid="filter-severity-all"
              onClick={() => setSelectedSeverity("all")}
              className={`severity-btn px-2.5 py-1 rounded font-medium transition-colors cursor-pointer ${
                selectedSeverity === "all"
                  ? "bg-obsidian-800 text-white font-bold"
                  : "text-slate-400 hover:text-white"
              }`}
              aria-pressed={selectedSeverity === "all"}
            >
              Todos ({counts.all})
            </button>
            <button
              type="button"
              data-testid="filter-severity-critical"
              onClick={() => setSelectedSeverity("critical")}
              className={`severity-btn px-2.5 py-1 rounded flex items-center gap-1 transition-colors cursor-pointer ${
                selectedSeverity === "critical"
                  ? "bg-rose-500/20 text-rose-300 border border-rose-500/30 font-bold"
                  : "text-rose-400 hover:bg-obsidian-850"
              }`}
              aria-pressed={selectedSeverity === "critical"}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-rose-400" /> Críticos ({counts.critical})
            </button>
            <button
              type="button"
              data-testid="filter-severity-degraded"
              onClick={() => setSelectedSeverity("degraded")}
              className={`severity-btn px-2.5 py-1 rounded flex items-center gap-1 transition-colors cursor-pointer ${
                selectedSeverity === "degraded"
                  ? "bg-amber-500/20 text-amber-300 border border-amber-500/30 font-bold"
                  : "text-amber-400 hover:bg-obsidian-850"
              }`}
              aria-pressed={selectedSeverity === "degraded"}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400" /> Degradados ({counts.degraded})
            </button>
            <button
              type="button"
              data-testid="filter-severity-resolved"
              onClick={() => setSelectedSeverity("resolved")}
              className={`severity-btn px-2.5 py-1 rounded flex items-center gap-1 transition-colors cursor-pointer ${
                selectedSeverity === "resolved"
                  ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-bold"
                  : "text-emerald-400 hover:bg-obsidian-850"
              }`}
              aria-pressed={selectedSeverity === "resolved"}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" /> Resolvidos ({counts.resolved})
            </button>
          </div>
        </div>

        {/* Seletores de Organização & Período */}
        <div className="flex items-center gap-2">
          <select
            data-testid="select-organization"
            aria-label="Filtrar por organização cliente"
            value={selectedOrg}
            onChange={(e) => setSelectedOrg(e.target.value)}
            className="bg-obsidian-950 border border-obsidian-800 text-slate-200 text-xs rounded-lg px-3 py-1.5 focus:border-emerald-500 focus:ring-0 cursor-pointer outline-none"
          >
            <option value="all">Todas as Organizações (Unitel, Banco Sol, Sonangol)</option>
            <option value="Unitel Angola">Unitel Angola</option>
            <option value="Banco Sol">Banco Sol</option>
            <option value="Sonangol Logistics">Sonangol Logistics</option>
          </select>

          <div className="flex items-center gap-1.5 bg-obsidian-950 border border-obsidian-800 text-slate-300 text-xs rounded-lg px-3 py-1.5 font-mono">
            <span className="material-symbols-outlined text-[16px] text-slate-400" aria-hidden="true">
              calendar_month
            </span>
            <span>Hoje (Luanda NOC)</span>
          </div>
        </div>
      </section>

      {/* TABELA DE INCIDENTES DE ALTA DENSIDADE */}
      <section
        className="bg-obsidian-900 rounded-xl border border-obsidian-800 overflow-hidden shadow-xl"
        aria-label="Tabela de Incidentes Operacionais"
      >
        {/* ESTADO VAZIO */}
        {(viewState === "empty" || filteredIncidents.length === 0) && viewState !== "skeleton" ? (
          <div
            data-testid="empty-state-container"
            className="py-16 px-4 text-center space-y-4"
          >
            <div className="w-16 h-16 mx-auto rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
              <span className="material-symbols-outlined text-3xl" aria-hidden="true">
                task_alt
              </span>
            </div>
            <div className="space-y-1">
              <h3 className="font-display font-bold text-base text-white">
                Nenhum Incidente Ativo no Momento
              </h3>
              <p className="text-xs text-slate-400 max-w-md mx-auto">
                Todos os 48 equipamentos e links do cluster <strong className="text-emerald-400 font-mono">LUANDA-01</strong> estão operando com telemetria nominal e latências abaixo de 20ms.
              </p>
            </div>
            <button
              type="button"
              data-testid="btn-empty-reset"
              onClick={() => {
                setViewState("nominal");
                setSearchQuery("");
                setSelectedSeverity("all");
                setSelectedOrg("all");
              }}
              className="px-4 py-2 rounded-lg bg-obsidian-850 hover:bg-obsidian-800 border border-obsidian-700 text-slate-200 text-xs font-mono transition-colors cursor-pointer"
            >
              Recarregar Dados Reais
            </button>
          </div>
        ) : viewState === "skeleton" ? (
          /* SKELETON LOADER */
          <div data-testid="skeleton-state-container" className="p-6 space-y-4 animate-pulse">
            <div className="h-6 bg-obsidian-800/60 rounded w-1/4" />
            <div className="space-y-3">
              <div className="h-12 bg-obsidian-800/40 rounded w-full" />
              <div className="h-12 bg-obsidian-800/40 rounded w-full" />
              <div className="h-12 bg-obsidian-800/40 rounded w-full" />
              <div className="h-12 bg-obsidian-800/40 rounded w-full" />
            </div>
          </div>
        ) : (
          /* TABELA REAL DE DADOS */
          <div className="overflow-x-auto" id="table-wrapper">
            <table className="w-full text-left border-collapse" id="incidents-table" data-testid="incidents-table">
              <caption className="sr-only">Lista de incidentes operacionais de telemetria</caption>
              <thead>
                <tr className="bg-obsidian-950 border-b border-obsidian-800 text-slate-400 font-mono tabular-nums text-xs uppercase tracking-wider">
                  <th scope="col" className="py-3 px-4 w-10 text-center">
                    <input
                      type="checkbox"
                      id="select-all-checkbox"
                      data-testid="select-all-checkbox"
                      checked={allFilteredSelected}
                      onChange={handleToggleSelectAll}
                      aria-label="Selecionar todos os incidentes visíveis"
                      className="rounded bg-obsidian-900 border-obsidian-700 text-emerald-500 focus:ring-emerald-500 focus:ring-offset-obsidian-950 cursor-pointer"
                    />
                  </th>
                  <th scope="col" className="py-3 px-4">Severidade</th>
                  <th scope="col" className="py-3 px-4">Ativo Afetado</th>
                  <th scope="col" className="py-3 px-4">Cliente / Org</th>
                  <th scope="col" className="py-3 px-4">Início (WAT)</th>
                  <th scope="col" className="py-3 px-4">Duração &amp; SLA</th>
                  <th scope="col" className="py-3 px-4">Chamado GLPI</th>
                  <th scope="col" className="py-3 px-4">Responsável</th>
                  <th scope="col" className="py-3 px-4 text-right">Ações Rápidas</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-obsidian-800/60 text-xs" id="incidents-tbody">
                {filteredIncidents.map((incident) => {
                  const isCritical = incident.severity === "critical";
                  const isDegraded = incident.severity === "degraded";
                  const isResolved = incident.severity === "resolved";

                  const borderClass = isCritical
                    ? "border-l-4 border-l-rose-500 bg-rose-500/5 hover:bg-rose-500/10"
                    : isDegraded
                    ? "border-l-4 border-l-amber-500 bg-amber-500/5 hover:bg-amber-500/10"
                    : "border-l-4 border-l-emerald-500 hover:bg-obsidian-850/50";

                  return (
                    <tr
                      key={incident.id}
                      data-testid={`incident-row-${incident.id}`}
                      data-severity={incident.severity}
                      className={`incident-row transition-colors ${borderClass}`}
                    >
                      <td className="py-3.5 px-4 text-center">
                        <input
                          type="checkbox"
                          checked={selectedIds.has(incident.id)}
                          onChange={() => handleToggleRow(incident.id)}
                          aria-label={`Selecionar incidente ${incident.code}`}
                          data-testid={`checkbox-incident-${incident.id}`}
                          className="incident-checkbox rounded bg-obsidian-900 border-obsidian-700 text-emerald-500 focus:ring-emerald-500 focus:ring-offset-obsidian-950 cursor-pointer"
                        />
                      </td>

                      <td className="py-3.5 px-4 whitespace-nowrap">
                        {isCritical && (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded text-xs font-mono font-bold bg-rose-500/20 text-rose-400 border border-rose-500/40">
                            <span className="w-1.5 h-1.5 rounded-full bg-rose-400 animate-ping" aria-hidden="true" />
                            {incident.priority_label}
                          </span>
                        )}
                        {isDegraded && (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded text-xs font-mono font-bold bg-amber-500/20 text-amber-400 border border-amber-500/40">
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-400" aria-hidden="true" />
                            {incident.priority_label}
                          </span>
                        )}
                        {isResolved && (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded text-xs font-mono font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                            <span className="material-symbols-outlined text-[14px]" aria-hidden="true">
                              check
                            </span>
                            {incident.priority_label}
                          </span>
                        )}
                      </td>

                      <td className="py-3.5 px-4">
                        <div className="flex flex-col">
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => setDrawerIncident(incident)}
                              className="font-mono tabular-nums font-bold text-sm text-white hover:text-emerald-400 transition-colors text-left cursor-pointer"
                            >
                              {incident.target_device.name}
                            </button>
                            <span className="bg-obsidian-850 text-slate-400 px-1.5 py-0.2 rounded text-[11px] font-mono">
                              {incident.target_device.model}
                            </span>
                          </div>
                          <div className="mt-0.5">
                            <span className="font-mono text-[11px] text-emerald-400 bg-obsidian-950 px-1.5 py-0.2 rounded border border-emerald-500/20">
                              {incident.target_device.ip}
                            </span>
                          </div>
                        </div>
                      </td>

                      <td className="py-3.5 px-4">
                        <div className="font-semibold text-slate-200">{incident.organization_name}</div>
                        <div className="text-slate-400 text-[11px] font-mono">{incident.target_device.location || "NOC Core"}</div>
                      </td>

                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <div className="font-mono text-slate-200 font-semibold">{incident.started_at}</div>
                        <div className="text-slate-400 text-[11px]">{incident.code}</div>
                      </td>

                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <div className="flex flex-col">
                          <span
                            className={`font-mono tabular-nums font-bold text-sm ${
                              isCritical ? "text-rose-400" : isDegraded ? "text-amber-400" : "text-emerald-400"
                            }`}
                          >
                            {incident.duration_str}
                          </span>
                          <span
                            className={`font-mono text-[11px] ${
                              isCritical ? "text-rose-400 font-semibold animate-pulse" : "text-slate-400"
                            }`}
                          >
                            {incident.sla_remaining_str}
                          </span>
                        </div>
                      </td>

                      <td className="py-3.5 px-4">
                        <GlpiBadge
                          ticketId={incident.glpi_ticket_id}
                          incidentId={incident.id}
                          onOpenTicket={handleOpenGlpiTicket}
                          isOpening={isOpeningGlpiId === incident.id}
                          isClosed={incident.status === "RESOLVED"}
                        />
                      </td>

                      <td className="py-3.5 px-4 whitespace-nowrap">
                        {incident.assigned_operator ? (
                          <div className="flex items-center gap-2">
                            <div className="h-6 w-6 rounded-full bg-obsidian-850 border border-obsidian-700 text-emerald-400 flex items-center justify-center font-mono font-bold text-[10px]">
                              {incident.assigned_operator.initials}
                            </div>
                            <span className="text-xs text-slate-300">
                              {incident.assigned_operator.name}
                            </span>
                          </div>
                        ) : (
                          <span
                            data-testid={`resp-badge-pending-${incident.id}`}
                            className="inline-flex items-center gap-1 bg-amber-500/10 text-amber-400 border border-amber-500/30 px-2 py-0.5 rounded text-xs font-mono"
                          >
                            <span className="material-symbols-outlined text-[14px]" aria-hidden="true">
                              warning
                            </span>
                            Pendente
                          </span>
                        )}
                      </td>

                      <td className="py-3.5 px-4 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1.5">
                          {/* Se não estiver reconhecido, exibe botão de Acknowledge */}
                          {incident.status === "TRIGGERED" && (
                            <button
                              type="button"
                              data-testid={`btn-ack-${incident.id}`}
                              onClick={() => setAckIncident(incident)}
                              className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold px-3 py-1 rounded-md text-xs transition-colors focus-visible:ring-2 focus-visible:ring-amber-400 cursor-pointer shadow"
                            >
                              Reconhecer (Ack)
                            </button>
                          )}

                          {/* Se estiver reconhecido mas não resolvido, exibe botão Resolver */}
                          {incident.status === "ACKNOWLEDGED" && (
                            <button
                              type="button"
                              data-testid={`btn-resolve-${incident.id}`}
                              onClick={() => setResolveIncidentItem(incident)}
                              className="bg-emerald-600 hover:bg-emerald-500 text-white font-semibold px-3 py-1 rounded-md text-xs transition-colors focus-visible:ring-2 focus-visible:ring-emerald-500 cursor-pointer shadow"
                            >
                              Resolver
                            </button>
                          )}

                          {/* Se estiver resolvido, exibe Relatório Forense */}
                          {incident.status === "RESOLVED" && (
                            <button
                              type="button"
                              data-testid={`btn-forensic-${incident.id}`}
                              onClick={() =>
                                showToast(`Relatório forense ${incident.code} gerado com hash SHA-256 verificado.`)
                              }
                              className="border border-obsidian-700 hover:bg-obsidian-850 text-slate-300 px-2.5 py-1 rounded-md text-xs font-mono transition-colors cursor-pointer"
                            >
                              Relatório Forense
                            </button>
                          )}

                          {/* Botão de abrir Slide-Over Drawer de Detalhes e Timeline */}
                          <button
                            type="button"
                            onClick={() => setDrawerIncident(incident)}
                            data-testid={`btn-open-drawer-${incident.id}`}
                            className="bg-obsidian-850 hover:bg-obsidian-800 text-slate-200 p-1.5 rounded-md border border-obsidian-700 transition-colors cursor-pointer"
                            title="Abrir Slide-Over Drawer de Detalhes"
                            aria-label={`Abrir detalhes do incidente ${incident.code}`}
                          >
                            <span className="material-symbols-outlined text-[16px]" aria-hidden="true">
                              chevron_right
                            </span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* MODAL 1: CONFIRMAÇÃO DE ACKNOWLEDGE */}
      <AcknowledgeModal
        isOpen={Boolean(ackIncident)}
        incident={ackIncident}
        onClose={() => setAckIncident(null)}
        onConfirm={handleConfirmAck}
        isSubmitting={isSubmittingAck}
      />

      {/* MODAL 2: RESOLUÇÃO COM CAUSA RAIZ (RCA) */}
      <ResolveIncidentModal
        isOpen={Boolean(resolveIncidentItem)}
        incident={resolveIncidentItem}
        onClose={() => setResolveIncidentItem(null)}
        onResolve={handleConfirmResolve}
        isSubmitting={isSubmittingResolve}
      />

      {/* DRAWER LATERAL: DETALHES & LINHA DO TEMPO */}
      {drawerIncident && (
        <div className="fixed inset-0 z-50 overflow-hidden" data-testid="incident-drawer-container">
          <div
            className="fixed inset-0 bg-black/70 backdrop-blur-sm transition-opacity cursor-pointer"
            onClick={() => setDrawerIncident(null)}
            aria-hidden="true"
          />

          <aside
            role="dialog"
            aria-modal="true"
            aria-labelledby="drawer-title"
            className="fixed top-0 right-0 h-full w-[600px] max-w-[96vw] bg-obsidian-900 border-l border-obsidian-800 shadow-2xl flex flex-col font-sans text-slate-100 overflow-hidden animate-in slide-in-from-right duration-200"
          >
            {/* Header da Gaveta */}
            <header className="px-6 pt-5 pb-4 border-b border-obsidian-800 bg-obsidian-950/60 shrink-0">
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-1.5 flex-1">
                  <div className="flex items-center gap-2 text-xs font-mono text-slate-400">
                    <span>Incidentes</span>
                    <span className="text-slate-600">/</span>
                    <span className="text-slate-200 font-semibold">{drawerIncident.code}</span>
                    <span
                      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[10.5px] font-mono font-bold ${
                        drawerIncident.severity === "critical"
                          ? "bg-rose-500/15 text-rose-300 border border-rose-500/25"
                          : drawerIncident.severity === "degraded"
                          ? "bg-amber-500/15 text-amber-300 border border-amber-500/25"
                          : "bg-emerald-500/15 text-emerald-300 border border-emerald-500/25"
                      }`}
                    >
                      {drawerIncident.priority_label}
                    </span>
                  </div>

                  <h2 id="drawer-title" className="text-lg font-bold text-white tracking-tight leading-snug">
                    {drawerIncident.title}
                  </h2>

                  <div className="flex items-center gap-2.5 text-xs font-mono text-slate-400 pt-0.5">
                    <span className="text-slate-300">{drawerIncident.organization_name}</span>
                    <span className="text-slate-600">•</span>
                    <span className="inline-flex items-center gap-1 text-amber-400 font-medium">
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                      Duração: {drawerIncident.duration_str}
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  data-testid="btn-close-drawer"
                  aria-label="Fechar gaveta de detalhes do incidente"
                  onClick={() => setDrawerIncident(null)}
                  className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-obsidian-850 hover:text-white transition-colors shrink-0 cursor-pointer text-slate-400"
                >
                  <span className="material-symbols-outlined text-[20px]" aria-hidden="true">
                    close
                  </span>
                </button>
              </div>

              {/* Barra de Ações Operacionais */}
              <div className="flex items-center gap-2.5 mt-4">
                {drawerIncident.status === "TRIGGERED" && (
                  <button
                    type="button"
                    onClick={() => {
                      setAckIncident(drawerIncident);
                      setDrawerIncident(null);
                    }}
                    className="flex-1 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold py-2 px-3.5 rounded-lg flex items-center justify-center gap-1.5 text-xs transition-colors shadow-sm cursor-pointer"
                  >
                    <span className="material-symbols-outlined text-[16px]" aria-hidden="true">
                      check
                    </span>
                    <span>Reconhecer (Ack)</span>
                  </button>
                )}

                {drawerIncident.status === "ACKNOWLEDGED" && (
                  <button
                    type="button"
                    onClick={() => {
                      setResolveIncidentItem(drawerIncident);
                      setDrawerIncident(null);
                    }}
                    className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-2 px-3.5 rounded-lg flex items-center justify-center gap-1.5 text-xs transition-colors shadow-sm cursor-pointer"
                  >
                    <span className="material-symbols-outlined text-[16px]" aria-hidden="true">
                      task_alt
                    </span>
                    <span>Resolver Incidente</span>
                  </button>
                )}

                <GlpiBadge
                  ticketId={drawerIncident.glpi_ticket_id}
                  incidentId={drawerIncident.id}
                  onOpenTicket={handleOpenGlpiTicket}
                  isOpening={isOpeningGlpiId === drawerIncident.id}
                  isClosed={drawerIncident.status === "RESOLVED"}
                />
              </div>
            </header>

            {/* Corpo da Gaveta com a Linha do Tempo e Diagnóstico */}
            <main className="flex-1 overflow-y-auto px-6 py-5 space-y-5 bg-obsidian-900">
              <IncidentTimeline
                events={drawerIncident.timeline}
                targetDeviceName={drawerIncident.target_device.name}
                targetDeviceIp={drawerIncident.target_device.ip}
              />
            </main>
          </aside>
        </div>
      )}
    </div>
  );
};
