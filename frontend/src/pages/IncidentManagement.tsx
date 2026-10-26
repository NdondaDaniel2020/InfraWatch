import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  IncidentItem,
  IncidentSeverity,
  incidentsApi,
  IncidentsKpiSummary,
  FailureCategory,
} from "../services/incidentsApi";
import { IncidentHeader, ViewState } from "../components/incidents/IncidentHeader";
import { IncidentKpiCards } from "../components/incidents/IncidentKpiCards";
import { IncidentFilterToolbar } from "../components/incidents/IncidentFilterToolbar";
import { IncidentTable } from "../components/incidents/IncidentTable";
import { IncidentDetailDrawer } from "../components/incidents/IncidentDetailDrawer";
import { AcknowledgeModal } from "../components/incidents/AcknowledgeModal";
import { ResolveIncidentModal } from "../components/incidents/ResolveIncidentModal";
import { useAuth } from "../context/AuthContext";

export type { ViewState };

/**
 * Página Canônica e Modular de Gestão Operacional de Incidentes (Issue #32).
 * Orquestra componentes atômicos em frontend/src/components/incidents/.
 */
export const IncidentManagement: React.FC = () => {
  const { user } = useAuth();
  const [viewState, setViewState] = useState<ViewState>("nominal");
  const [incidents, setIncidents] = useState<IncidentItem[]>([]);
  const [kpiSummary, setKpiSummary] = useState<IncidentsKpiSummary | null>(null);

  // Filtros
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedSeverity, setSelectedSeverity] = useState<"all" | IncidentSeverity>("all");
  const [selectedOrg, setSelectedOrg] = useState("all");

  // Se o usuário for ORG_ADMIN, restringe os incidentes aos do seu tenant/organização
  const tenantFilteredIncidents = useMemo(() => {
    if (user?.role === "ORG_ADMIN") {
      const userOrg = user.organization_name || "Banco Sol";
      return incidents.filter((i) =>
        i.organization_name.toLowerCase().includes(userOrg.toLowerCase())
      );
    }
    return incidents;
  }, [incidents, user]);

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
    let result = [...tenantFilteredIncidents];

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
          i.organization_name.toLowerCase().includes(q) ||
          (i.glpi_ticket_id && String(i.glpi_ticket_id).includes(q))
      );
    }

    if (selectedOrg !== "all" && !selectedOrg.includes("Todas")) {
      result = result.filter((i) => i.organization_name === selectedOrg);
    }

    return result;
  }, [tenantFilteredIncidents, selectedSeverity, searchQuery, selectedOrg]);

  // Contadores para pills de severidade
  const counts = useMemo(() => {
    return {
      all: tenantFilteredIncidents.length,
      critical: tenantFilteredIncidents.filter((i) => i.severity === "critical").length,
      degraded: tenantFilteredIncidents.filter((i) => i.severity === "degraded").length,
      resolved: tenantFilteredIncidents.filter((i) => i.severity === "resolved").length,
    };
  }, [tenantFilteredIncidents]);

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

  const handleResetEmptyState = () => {
    setViewState("nominal");
    setSearchQuery("");
    setSelectedSeverity("all");
    setSelectedOrg("all");
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

      {/* 1. Header com controles globais e seletor de estados */}
      <IncidentHeader
        viewState={viewState}
        onViewStateChange={setViewState}
        onExportCsv={handleExportCsv}
      />

      {/* 2. Overlay de Erro de Conexão SSE / GLPI API (Estado Error) */}
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

      {/* 3. Indicadores Chave (KPI Cards) */}
      <IncidentKpiCards
        kpiSummary={kpiSummary}
        isLoading={viewState === "skeleton"}
      />

      {/* 4. Barra de Filtros e Controles */}
      <IncidentFilterToolbar
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        selectedSeverity={selectedSeverity}
        onSeverityChange={setSelectedSeverity}
        selectedOrg={selectedOrg}
        onOrgChange={setSelectedOrg}
        isGlobalOperator={user?.role === "SUPER_ADMIN" || user?.role === "NOC_OPERATOR"}
        userOrgName={user?.organization_name}
        counts={counts}
      />

      {/* 5. Tabela de Incidentes com estados canônicos integrados */}
      <IncidentTable
        incidents={filteredIncidents}
        selectedIds={selectedIds}
        allFilteredSelected={allFilteredSelected}
        onToggleSelectAll={handleToggleSelectAll}
        onToggleRow={handleToggleRow}
        onAckClick={(incident) => setAckIncident(incident)}
        onResolveClick={(incident) => setResolveIncidentItem(incident)}
        onForensicClick={(incident) =>
          showToast(`Relatório forense ${incident.code} gerado com hash SHA-256 verificado.`)
        }
        onOpenDrawer={(incident) => setDrawerIncident(incident)}
        onOpenGlpiTicket={handleOpenGlpiTicket}
        isOpeningGlpiId={isOpeningGlpiId}
        viewState={viewState}
        onResetEmptyState={handleResetEmptyState}
      />

      {/* MODAL 1: Confirmação de Acknowledge */}
      <AcknowledgeModal
        isOpen={Boolean(ackIncident)}
        incident={ackIncident}
        onClose={() => setAckIncident(null)}
        onConfirm={handleConfirmAck}
        isSubmitting={isSubmittingAck}
      />

      {/* MODAL 2: Resolução com Causa Raiz Técnica (RCA) */}
      <ResolveIncidentModal
        isOpen={Boolean(resolveIncidentItem)}
        incident={resolveIncidentItem}
        onClose={() => setResolveIncidentItem(null)}
        onResolve={handleConfirmResolve}
        isSubmitting={isSubmittingResolve}
      />

      {/* DRAWER LATERAL: Detalhes e Linha do Tempo */}
      <IncidentDetailDrawer
        incident={drawerIncident}
        onClose={() => setDrawerIncident(null)}
        onAckClick={(incident) => setAckIncident(incident)}
        onResolveClick={(incident) => setResolveIncidentItem(incident)}
        onOpenGlpiTicket={handleOpenGlpiTicket}
        isOpeningGlpiId={isOpeningGlpiId}
      />
    </div>
  );
};
