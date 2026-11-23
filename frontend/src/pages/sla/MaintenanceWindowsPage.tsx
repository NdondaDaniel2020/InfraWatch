import React, { useState, useMemo, useCallback, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import {
  Calendar,
  PlusCircle,
  Search,
  CheckCircle2,
  Clock,
  List,
  CalendarDays,
  AlertTriangle,
  FileText,
  RotateCcw,
  ShieldCheck,
} from "lucide-react";
import { MaintenanceCard } from "../../components/sla/MaintenanceCard";
import { MaintenanceGanttTimeline } from "../../components/sla/MaintenanceGanttTimeline";
import { CreateMaintenanceModal } from "../../components/sla/CreateMaintenanceModal";
import { slaApi } from "../../services/slaApi";
import { adminApi } from "../../services/adminApi";
import { devicesApi } from "../../services/devicesApi";
import type {
  MaintenanceStatus,
  CreateMaintenanceInput,
  MaintenanceKpiSummary,
} from "../../types/sla";
import { useAuth } from "../../context/AuthContext";
import { toast } from "sonner";

const DEFAULT_MAINTENANCE_KPIS: MaintenanceKpiSummary = {
  activeNowCount: 0,
  scheduledCount: 0,
  exemptedHoursMonth: 0,
  contractualLimitHours: 8,
};

export const MaintenanceWindowsPage: React.FC = () => {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const isOperator =
    user?.role === "SUPER_ADMIN" || user?.role === "NOC_OPERATOR";
  const canSchedule = isOperator || user?.role === "ORG_ADMIN";

  const [viewMode, setViewMode] = useState<"cards" | "gantt">("cards");
  const [activeTab, setActiveTab] = useState<MaintenanceStatus | "ALL">("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedClient, setSelectedClient] = useState("all");
  const [selectedPeriod, setSelectedPeriod] = useState("month");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const PAGE_SIZE = 5;

  const { data: organizationsData } = useQuery({
    queryKey: ["slaOrganizations"],
    queryFn: async () => {
      const res = await adminApi.listOrganizations({ size: 100 });
      return res ?? { items: [], total: 0, page: 1, page_size: 100 };
    },
    enabled: isOperator,
  });

  const organizations = useMemo(
    () => organizationsData?.items ?? [],
    [organizationsData]
  );

  const { data: devicesData } = useQuery({
    queryKey: ["slaDevicesList"],
    queryFn: async () => {
      const res = await devicesApi.listDevices({ pageSize: 100 });
      return res?.items ?? [];
    },
  });

  const devices = useMemo(() => devicesData ?? [], [devicesData]);

  const {
    data: maintenances = [],
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ["maintenanceWindows", activeTab, selectedClient],
    queryFn: () =>
      slaApi.listMaintenanceWindows({
        status: activeTab === "ALL" ? undefined : activeTab,
        client: selectedClient === "all" ? undefined : selectedClient,
      }),
  });

  const { data: kpiSummary = DEFAULT_MAINTENANCE_KPIS } = useQuery({
    queryKey: ["maintenanceKpis"],
    queryFn: () => slaApi.getMaintenanceKpiSummary(),
  });

  const approveMutation = useMutation({
    mutationFn: (id: string) => slaApi.approveMaintenanceWindow(id),
    onSuccess: (updated) => {
      toast.success(
        `Isenção de SLA homologada para ${updated?.rfcNumber || "RFC"}!`
      );
      queryClient.invalidateQueries({ queryKey: ["maintenanceWindows"] });
    },
    onError: () => {
      toast.error("Falha ao homologar isenção de SLA.");
    },
  });

  const createMutation = useMutation({
    mutationFn: (input: CreateMaintenanceInput) =>
      slaApi.createMaintenanceWindow(input),
    onSuccess: (created) => {
      setIsModalOpen(false);
      toast.success(
        `Parada técnica ${created?.rfcNumber || "agendada"} com sucesso!`
      );
      queryClient.invalidateQueries({ queryKey: ["maintenanceWindows"] });
    },
    onError: () => {
      toast.error("Falha ao registrar parada técnica.");
    },
  });

  const handleApprove = useCallback(
    (id: string) => {
      approveMutation.mutate(id);
    },
    [approveMutation]
  );

  const handleCreate = useCallback(
    (input: CreateMaintenanceInput) => {
      createMutation.mutate(input);
    },
    [createMutation]
  );

  const safeMaintenances = useMemo(() => {
    return Array.isArray(maintenances) ? maintenances : [];
  }, [maintenances]);

  const counts = useMemo(() => {
    return {
      all: safeMaintenances.length,
      scheduled: safeMaintenances.filter((m) => m.status === "APPROVED").length,
      inProgress: safeMaintenances.filter((m) => m.status === "IN_PROGRESS").length,
      pending: safeMaintenances.filter((m) => m.status === "PENDING_APPROVAL").length,
      completed: safeMaintenances.filter((m) => m.status === "COMPLETED").length,
    };
  }, [safeMaintenances]);

  const filteredMaintenances = useMemo(() => {
    return safeMaintenances.filter((m) => {
      if (activeTab !== "ALL" && m.status !== activeTab) return false;
      if (selectedClient !== "all") {
        const matchesClient = m.clientName
          .toLowerCase()
          .includes(selectedClient.toLowerCase());
        if (!matchesClient) return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchesRfc = m.rfcNumber.toLowerCase().includes(q);
        const matchesTitle = m.title.toLowerCase().includes(q);
        const matchesClient = m.clientName.toLowerCase().includes(q);
        const matchesDevice = m.targetDeviceNames.some((d) =>
          d.toLowerCase().includes(q)
        );
        if (!matchesRfc && !matchesTitle && !matchesClient && !matchesDevice) {
          return false;
        }
      }
      return true;
    });
  }, [safeMaintenances, activeTab, selectedClient, searchQuery]);

  useEffect(() => {
    setCurrentPage(1);
  }, [activeTab, selectedClient, searchQuery]);

  const totalPages = Math.max(1, Math.ceil(filteredMaintenances.length / PAGE_SIZE));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const paginatedMaintenances = useMemo(() => {
    const start = (safeCurrentPage - 1) * PAGE_SIZE;
    return filteredMaintenances.slice(start, start + PAGE_SIZE);
  }, [filteredMaintenances, safeCurrentPage]);

  const clientOptions = useMemo(() => {
    const fromMaintenances = safeMaintenances.map((m) => m.clientName);
    const fromOrgs = organizations.map((o) => o.name);
    return Array.from(new Set([...fromMaintenances, ...fromOrgs])).filter(
      Boolean
    );
  }, [safeMaintenances, organizations]);

  const nextScheduledText = useMemo(() => {
    const upcoming = safeMaintenances
      .filter((m) => m.status === "APPROVED")
      .sort(
        (a, b) =>
          new Date(a.startTimeUtc).getTime() - new Date(b.startTimeUtc).getTime()
      )[0];

    if (!upcoming) return "Nenhuma parada iminente";
    const d = new Date(upcoming.startTimeUtc);
    const day = d.toLocaleDateString("pt-BR", { day: "2-digit" });
    const month = d.toLocaleDateString("pt-BR", { month: "long" });
    const hours = d.toLocaleTimeString("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
    });
    return `Próxima: ${day} de ${month} às ${hours} WAT`;
  }, [safeMaintenances]);

  const handleExportRfcs = () => {
    toast.info("Exportando dossiê de RFCs e isenções em formato auditado…");
    if (!filteredMaintenances.length) {
      toast.warning("Nenhuma RFC disponível para exportação com os filtros atuais.");
      return;
    }

    const headers = [
      "RFC",
      "Titulo",
      "Cliente",
      "Status",
      "Inicio_UTC",
      "Fim_UTC",
      "Duracao_Minutos",
      "Isencao_SLA",
      "Dispositivos",
    ];

    const rows = filteredMaintenances.map((m) => [
      m.rfcNumber,
      `"${m.title.replace(/"/g, '""')}"`,
      `"${m.clientName.replace(/"/g, '""')}"`,
      m.status,
      m.startTimeUtc,
      m.endTimeUtc,
      m.durationMinutes,
      m.slaExemption ? "SIM" : "NAO",
      `"${(m.targetDeviceNames || []).join("; ")}"`,
    ]);

    const csvContent =
      "data:text/csv;charset=utf-8," +
      [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute(
      "download",
      `infrawatch_rfcs_manutencao_${new Date().toISOString().slice(0, 10)}.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleClearFilters = () => {
    setActiveTab("ALL");
    setSearchQuery("");
    setSelectedClient("all");
    setSelectedPeriod("month");
    setCurrentPage(1);
  };

  const hoursExemptedInt = Math.floor(kpiSummary.exemptedHoursMonth);
  const minutesExemptedInt = Math.round((kpiSummary.exemptedHoursMonth % 1) * 60);
  const exemptedPct = Math.min(
    Math.round(
      (kpiSummary.exemptedHoursMonth / (kpiSummary.contractualLimitHours || 8)) * 100
    ),
    100
  );

  return (
    <main
      data-testid="maintenance-windows-page"
      className="p-4 md:p-6 flex flex-col gap-6 w-full text-slate-100 font-sans"
      role="main"
    >
      {/* CABEÇALHO DA PÁGINA COM BREADCRUMB E AÇÕES PRINCIPAIS */}
      <section className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 pb-4 border-b border-obsidian-800">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2 text-xs font-mono">
            <Link to="/noc" className="text-slate-400 hover:text-slate-200 transition-colors">
              Cockpit NOC
            </Link>
            <span className="text-obsidian-700">/</span>
            <span className="text-sky-400 font-semibold">Janelas de Manutenção Programada</span>
          </div>
          <h1 className="text-2xl font-display font-extrabold text-white tracking-tight">
            Janelas de Manutenção Programada &amp; Isenções de SLA
          </h1>
          <p className="text-xs text-slate-400 max-w-3xl leading-relaxed">
            Gestão de paradas técnicas e intervenções de infraestrutura com supressão automática de alarmes e homologação de isenção contratual de SLA (ADR-009) perante o BNA e clientes enterprise.
          </p>
        </div>

        {/* Ações do Topo */}
        <div className="flex items-center flex-wrap gap-2.5 shrink-0">
          <button
            type="button"
            onClick={handleExportRfcs}
            className="h-9 px-3 rounded-lg bg-obsidian-900 hover:bg-obsidian-850 border border-obsidian-800 text-xs font-medium text-slate-300 hover:text-white flex items-center gap-1.5 transition-colors focus-visible:ring-2 focus-visible:ring-sky-400"
          >
            <FileText className="w-4 h-4 text-slate-400" />
            <span>Exportar RFCs</span>
          </button>

          {canSchedule && (
            <button
              type="button"
              onClick={() => setIsModalOpen(true)}
              className="h-9 px-4 rounded-lg bg-sky-500 hover:bg-sky-400 text-obsidian-950 text-xs font-bold flex items-center gap-2 transition-colors focus-visible:ring-2 focus-visible:ring-sky-400 shadow-lg"
            >
              <PlusCircle className="w-4 h-4 text-obsidian-950" />
              <span>+ Agendar Nova Parada Técnica</span>
            </button>
          )}
        </div>
      </section>

      {/* OVERLAY DE ERRO DE CONEXÃO RFC (Gerenciado automaticamente em background) */}
      {isError && (
        <section
          data-testid="maint-error-overlay"
          className="bg-rose-950/40 border border-rose-500/60 p-4 rounded-xl flex items-center justify-between gap-4 text-xs font-mono shadow-md"
        >
          <div className="flex items-center gap-3">
            <AlertTriangle className="w-6 h-6 text-rose-400 shrink-0 animate-pulse" />
            <div>
              <div className="font-bold text-rose-300">FALHA NO SERVIÇO DE SINCRONIZAÇÃO DE RFCS</div>
              <div className="text-rose-400/80">
                {error instanceof Error
                  ? error.message
                  : "Não foi possível consultar a fila de mudanças programadas no GLPI/ServiceNow. Tentando reconexão…"}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => refetch()}
            className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-bold transition-colors shrink-0"
          >
            Reconectar
          </button>
        </section>
      )}

      {/* KPI METRIC CARDS (3 CARDS DE GOVERNANÇA) */}
      <section id="kpi-section" className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Card 1: Janelas Ativas Agora */}
        <div className="p-4 rounded-xl bg-obsidian-900 border border-obsidian-800 flex flex-col justify-between gap-3 shadow-md">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-mono uppercase tracking-wider text-slate-400 font-semibold">
              Janelas Ativas Agora
            </span>
            <div className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-mono font-semibold">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
              NOMINAL
            </div>
          </div>
          <div className="flex flex-col gap-0.5">
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-mono font-bold text-white tabular-nums">
                {kpiSummary.activeNowCount}
              </span>
              <span className="text-xs font-medium text-slate-400">em andamento agora</span>
            </div>
            <p className="text-xs text-slate-400 flex items-center gap-1.5 mt-1 font-mono">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>
                {kpiSummary.activeNowCount === 0
                  ? "Zero paradas ativas no ciclo de telemetria"
                  : `${kpiSummary.activeNowCount} parada(s) em andamento no ciclo`}
              </span>
            </p>
          </div>
          <div className="w-full bg-obsidian-950 h-1.5 rounded-full overflow-hidden border border-obsidian-800">
            <div
              className="bg-emerald-400 h-full rounded-full transition-all"
              style={{ width: kpiSummary.activeNowCount > 0 ? "50%" : "100%" }}
            />
          </div>
        </div>

        {/* Card 2: Próximas Janelas Agendadas */}
        <div className="p-4 rounded-xl bg-obsidian-900 border border-obsidian-800 flex flex-col justify-between gap-3 shadow-md">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-mono uppercase tracking-wider text-slate-400 font-semibold">
              Janelas Agendadas
            </span>
            <div className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-sky-500/10 border border-sky-500/30 text-sky-400 text-xs font-mono font-semibold">
              <CalendarDays className="w-3.5 h-3.5 text-sky-400" />
              PLANEADO
            </div>
          </div>
          <div className="flex flex-col gap-0.5">
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-mono font-bold text-sky-400 tabular-nums">
                {kpiSummary.scheduledCount}
              </span>
              <span className="text-xs font-medium text-slate-400">paradas programadas</span>
            </div>
            <p className="text-xs font-mono text-slate-400 flex items-center gap-1.5 mt-1 truncate">
              <Clock className="w-4 h-4 text-sky-400 shrink-0" />
              <span className="truncate">{nextScheduledText}</span>
            </p>
          </div>
          <div className="w-full bg-obsidian-950 h-1.5 rounded-full overflow-hidden border border-obsidian-800">
            <div
              className="bg-sky-400 h-full rounded-full transition-all"
              style={{
                width: kpiSummary.scheduledCount > 0 ? "66%" : "10%",
              }}
            />
          </div>
        </div>

        {/* Card 3: Horas Isentas Acumuladas no Mês */}
        <div className="p-4 rounded-xl bg-obsidian-900 border border-obsidian-800 flex flex-col justify-between gap-3 shadow-md">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-mono uppercase tracking-wider text-slate-400 font-semibold">
              Horas Isentas no Mês (SLA)
            </span>
            <div className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-mono font-semibold">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
              HOMOLOGADO
            </div>
          </div>
          <div className="flex flex-col gap-0.5">
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-mono font-bold text-white tabular-nums">
                {String(hoursExemptedInt).padStart(2, "0")}h {String(minutesExemptedInt).padStart(2, "0")}m
              </span>
              <span className="text-xs font-mono text-slate-400">
                / {kpiSummary.contractualLimitHours}h teto contratual
              </span>
            </div>
            <p className="text-xs text-slate-400 flex items-center gap-1.5 mt-1 font-mono">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>Impacto 0.00% no SLA contratual • ADR-009</span>
            </p>
          </div>
          <div className="w-full bg-obsidian-950 h-1.5 rounded-full overflow-hidden border border-obsidian-800">
            <div
              className="bg-sky-400 h-full rounded-full transition-all"
              style={{ width: `${Math.max(exemptedPct, 5)}%` }}
            />
          </div>
        </div>
      </section>

      {/* BARRA DE FILTROS & PESQUISA DE RFCS */}
      <section className="flex flex-col gap-3">
        {/* Abas de Status e Modos de Exibição */}
        <div className="flex items-center justify-between border-b border-obsidian-800 pb-2 flex-wrap gap-2">
          <div className="flex items-center gap-2 overflow-x-auto py-1">
            <button
              type="button"
              onClick={() => setActiveTab("ALL")}
              className={`px-3 py-1.5 rounded-lg font-medium text-xs border flex items-center gap-2 shrink-0 transition-colors ${
                activeTab === "ALL"
                  ? "bg-obsidian-850 text-white border-obsidian-700"
                  : "text-slate-400 hover:text-white hover:bg-obsidian-900 border-transparent"
              }`}
            >
              <span>Todas as Janelas</span>
              <span className="px-1.5 py-0.5 rounded-full bg-obsidian-950 text-slate-300 font-mono text-[10px]">
                {counts.all}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("APPROVED")}
              className={`px-3 py-1.5 rounded-lg font-medium text-xs border flex items-center gap-2 shrink-0 transition-colors ${
                activeTab === "APPROVED"
                  ? "bg-obsidian-850 text-white border-obsidian-700"
                  : "text-slate-400 hover:text-white hover:bg-obsidian-900 border-transparent"
              }`}
            >
              <span>Agendadas</span>
              <span className="px-1.5 py-0.5 rounded-full bg-obsidian-950 text-sky-400 font-mono text-[10px]">
                {counts.scheduled}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("IN_PROGRESS")}
              className={`px-3 py-1.5 rounded-lg font-medium text-xs border flex items-center gap-2 shrink-0 transition-colors ${
                activeTab === "IN_PROGRESS"
                  ? "bg-obsidian-850 text-white border-obsidian-700"
                  : "text-slate-400 hover:text-white hover:bg-obsidian-900 border-transparent"
              }`}
            >
              <span>Em Andamento</span>
              <span className="px-1.5 py-0.5 rounded-full bg-obsidian-950 text-amber-400 font-mono text-[10px]">
                {counts.inProgress}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("PENDING_APPROVAL")}
              className={`px-3 py-1.5 rounded-lg font-medium text-xs border flex items-center gap-2 shrink-0 transition-colors ${
                activeTab === "PENDING_APPROVAL"
                  ? "bg-obsidian-850 text-white border-obsidian-700"
                  : "text-slate-400 hover:text-white hover:bg-obsidian-900 border-transparent"
              }`}
            >
              <span>Pendentes</span>
              <span className="px-1.5 py-0.5 rounded-full bg-obsidian-950 text-amber-300 font-mono text-[10px]">
                {counts.pending}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("COMPLETED")}
              className={`px-3 py-1.5 rounded-lg font-medium text-xs border flex items-center gap-2 shrink-0 transition-colors ${
                activeTab === "COMPLETED"
                  ? "bg-obsidian-850 text-white border-obsidian-700"
                  : "text-slate-400 hover:text-white hover:bg-obsidian-900 border-transparent"
              }`}
            >
              <span>Concluídas</span>
              <span className="px-1.5 py-0.5 rounded-full bg-obsidian-950 text-emerald-400 font-mono text-[10px]">
                {counts.completed}
              </span>
            </button>
          </div>

          {/* Modos de Exibição (Cards vs Timeline Gantt) */}
          <div className="flex items-center gap-1.5 text-xs text-slate-400 font-mono">
            <span className="text-[10px] uppercase text-slate-500">Visualização:</span>
            <button
              type="button"
              id="btn-view-cards"
              onClick={() => setViewMode("cards")}
              className={`p-1.5 rounded transition-colors ${
                viewMode === "cards"
                  ? "bg-obsidian-850 text-sky-400 border border-obsidian-700"
                  : "text-slate-400 hover:text-white hover:bg-obsidian-900"
              }`}
              title="Lista de Cartões RFC"
            >
              <List className="w-4 h-4" />
            </button>
            <button
              type="button"
              id="btn-view-gantt"
              onClick={() => setViewMode("gantt")}
              className={`p-1.5 rounded transition-colors ${
                viewMode === "gantt"
                  ? "bg-obsidian-850 text-sky-400 border border-obsidian-700"
                  : "text-slate-400 hover:text-white hover:bg-obsidian-900"
              }`}
              title="Exibir Linha do Tempo Gantt"
            >
              <CalendarDays className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Inputs de Filtro */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3 bg-obsidian-900 p-3 rounded-xl border border-obsidian-800 items-center">
          {/* Busca Textual */}
          <div className="md:col-span-5 relative flex items-center">
            <Search className="w-4 h-4 absolute left-3 text-slate-400 pointer-events-none" />
            <input
              type="text"
              id="maint-search-input"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar por Ativo (ex: SW-CORE), RFC ou Responsável…"
              className="w-full bg-obsidian-950 border border-obsidian-800 rounded-lg pl-9 pr-3 py-1.5 text-xs text-white placeholder:text-slate-500 font-mono focus:outline-none focus:border-sky-500 transition-colors"
            />
          </div>

          {/* Filtro de Contratante */}
          <div className="md:col-span-3 flex items-center gap-2">
            <label className="text-[10px] font-mono text-slate-400 uppercase shrink-0">
              Cliente:
            </label>
            <select
              value={selectedClient}
              onChange={(e) => setSelectedClient(e.target.value)}
              className="w-full bg-obsidian-950 border border-obsidian-800 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-sky-500 transition-colors"
            >
              <option value="all">Todas as Contratantes</option>
              {clientOptions.map((clientName) => (
                <option key={clientName} value={clientName}>
                  {clientName}
                </option>
              ))}
            </select>
          </div>

          {/* Filtro de Período */}
          <div className="md:col-span-3 flex items-center gap-2">
            <label className="text-[10px] font-mono text-slate-400 uppercase shrink-0">
              Período:
            </label>
            <select
              value={selectedPeriod}
              onChange={(e) => setSelectedPeriod(e.target.value)}
              className="w-full bg-obsidian-950 border border-obsidian-800 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-sky-500 transition-colors"
            >
              <option value="month">Mês Atual (Outubro 2026)</option>
              <option value="q4">Trimestre Q4 2026</option>
              <option value="year">Ano Fiscal 2026</option>
            </select>
          </div>

          {/* Botão Limpar */}
          <div className="md:col-span-1 flex justify-end">
            <button
              type="button"
              onClick={handleClearFilters}
              className="w-full py-1.5 px-2 bg-obsidian-850 hover:bg-obsidian-800 text-slate-400 hover:text-white rounded-lg border border-obsidian-700 text-[11px] font-mono font-medium flex items-center justify-center gap-1 transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Limpar</span>
            </button>
          </div>
        </div>
      </section>

      {/* RENDERIZAÇÃO CONDICIONAL POR ESTADO (Skeleton / Empty / Nominal) */}
      {isLoading ? (
        <section
          data-testid="maint-skeleton-container"
          className="space-y-4 animate-pulse"
        >
          <div className="h-32 bg-obsidian-900 border border-obsidian-800 rounded-xl" />
          <div className="h-32 bg-obsidian-900 border border-obsidian-800 rounded-xl" />
          <div className="h-32 bg-obsidian-900 border border-obsidian-800 rounded-xl" />
        </section>
      ) : filteredMaintenances.length === 0 ? (
        <section
          data-testid="maint-empty-container"
          className="py-16 px-4 text-center bg-obsidian-900 border border-obsidian-800 rounded-xl space-y-4 shadow-md"
        >
          <div className="w-16 h-16 mx-auto rounded-full bg-sky-500/10 border border-sky-500/30 flex items-center justify-center text-sky-400">
            <Calendar className="w-7 h-7" />
          </div>
          <div className="space-y-1">
            <h3 className="font-display font-bold text-base text-white">
              Nenhuma Janela de Manutenção Programada
            </h3>
            <p className="text-xs text-slate-400 max-w-md mx-auto">
              Não existem RFCs ativas ou agendadas para os filtros selecionados no período vigente.
            </p>
          </div>
          <button
            type="button"
            onClick={handleClearFilters}
            className="px-4 py-2 rounded-lg bg-obsidian-850 hover:bg-obsidian-800 border border-obsidian-700 text-slate-200 text-xs font-mono transition-colors"
          >
            Restaurar Filtros Operacionais
          </button>
        </section>
      ) : (
        <>
          {viewMode === "gantt" ? (
            <MaintenanceGanttTimeline maintenances={filteredMaintenances} />
          ) : (
            <section
              data-testid="maint-cards-container"
              className="flex flex-col gap-4"
            >
              {paginatedMaintenances.map((maint) => (
                <MaintenanceCard
                  key={maint.id}
                  maintenance={maint}
                  onApprove={handleApprove}
                  canApprove={isOperator}
                />
              ))}

              {/* Barra de Paginação dos Cartões RFC */}
              <div
                data-testid="maint-pagination"
                className="p-3.5 px-4 rounded-xl bg-obsidian-900 border border-obsidian-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs font-mono shadow-md mt-2"
              >
                <div className="flex items-center gap-2 text-slate-400">
                  <CheckCircle2 className="w-3.5 h-3.5 text-sky-400" />
                  <span>
                    Exibindo{" "}
                    <strong className="text-white">
                      {filteredMaintenances.length === 0
                        ? 0
                        : (safeCurrentPage - 1) * PAGE_SIZE + 1}
                      –
                      {Math.min(safeCurrentPage * PAGE_SIZE, filteredMaintenances.length)}
                    </strong>{" "}
                    de <strong className="text-white">{filteredMaintenances.length}</strong>{" "}
                    registros RFC
                  </span>
                  <span className="text-obsidian-700 hidden sm:inline">|</span>
                  <span className="text-slate-500 hidden sm:inline">
                    Página {safeCurrentPage} de {totalPages}
                  </span>
                </div>

                {totalPages > 1 && (
                  <nav
                    aria-label="Paginação de RFCs"
                    className="flex items-center gap-1"
                    data-testid="maint-cards-pagination"
                  >
                    <button
                      type="button"
                      onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                      disabled={safeCurrentPage <= 1}
                      className="px-2.5 py-1 rounded bg-obsidian-950 border border-obsidian-800 text-slate-400 hover:text-white hover:bg-obsidian-850 transition disabled:opacity-30 disabled:pointer-events-none cursor-pointer text-xs"
                    >
                      Anterior
                    </button>

                    {Array.from({ length: totalPages }).map((_, idx) => {
                      const pageNum = idx + 1;
                      const isActive = pageNum === safeCurrentPage;
                      return (
                        <button
                          key={pageNum}
                          type="button"
                          onClick={() => setCurrentPage(pageNum)}
                          className={`min-w-[28px] h-7 px-2 rounded text-xs font-semibold transition cursor-pointer flex items-center justify-center ${
                            isActive
                              ? "bg-sky-500 text-obsidian-950 font-bold shadow"
                              : "bg-obsidian-950 border border-obsidian-800 text-slate-400 hover:text-white hover:bg-obsidian-850"
                          }`}
                        >
                          {pageNum}
                        </button>
                      );
                    })}

                    <button
                      type="button"
                      onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                      disabled={safeCurrentPage >= totalPages}
                      className="px-2.5 py-1 rounded bg-obsidian-950 border border-obsidian-800 text-slate-300 hover:text-white hover:bg-obsidian-850 transition disabled:opacity-30 disabled:pointer-events-none cursor-pointer text-xs"
                    >
                      Próximo
                    </button>
                  </nav>
                )}
              </div>
            </section>
          )}
        </>
      )}

      {/* Modal de Agendamento */}
      <CreateMaintenanceModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSubmit={handleCreate}
        isSubmitting={createMutation.isPending}
        organizations={organizations}
        devices={devices}
        existingMaintenances={safeMaintenances}
      />
    </main>
  );
};
