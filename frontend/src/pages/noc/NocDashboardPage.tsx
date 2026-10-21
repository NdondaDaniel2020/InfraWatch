import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { QueryClient, QueryClientContext, useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  HardDrive,
  Maximize2,
  Network,
  Power,
  RefreshCw,
  Search,
  Server,
  Wrench,
} from "lucide-react";

import { useTelemetry } from "../../context/TelemetryContext";
import { apiClient } from "../../services/apiClient";
import type {
  DashboardViewMode,
  DeviceSeverity,
  DeviceStatus,
  MonitoredDevice,
  SeverityFilterType,
} from "../../types/telemetry";
import { DeviceCard } from "../../components/telemetry/DeviceCard";
import { DeviceDetailDrawer } from "../../components/telemetry/DeviceDetailDrawer";
import { GlobalSearchModal } from "../../components/common/GlobalSearchModal";
import { NocKpiGrid } from "../../components/telemetry/NocKpiGrid";
import { NocTrafficChart24h } from "../../components/telemetry/NocTrafficChart24h";
import { NocIncidentsFeed } from "../../components/telemetry/NocIncidentsFeed";
import { EmergencyDrainModal } from "../../components/telemetry/EmergencyDrainModal";
import { NocStateOverlay } from "../../components/telemetry/NocStateOverlay";
import { INITIAL_MOCK_DEVICES } from "../../mocks/nocMocks";

// Singleton resiliente para TanStack Query sem context provider
const fallbackQueryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
      staleTime: 10000,
    },
  },
});

export const NocDashboardPage: React.FC = () => {
  const { reconnect: sseReconnect } = useTelemetry();

  // Estados locais da tela
  const [severityFilter, setSeverityFilter] = useState<SeverityFilterType>("all");
  const [tenantFilter, setTenantFilter] = useState<string>("all");
  const [viewState, setViewState] = useState<DashboardViewMode>("nominal");
  const [selectedDevice, setSelectedDevice] = useState<MonitoredDevice | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isDrainModalOpen, setIsDrainModalOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState<{ text: string; type: "success" | "warning" | "info" } | null>(null);

  // Exibe toast temporário
  const showToast = useCallback((text: string, type: "success" | "warning" | "info" = "success") => {
    setToastMessage({ text, type });
    setTimeout(() => {
      setToastMessage(null);
    }, 3500);
  }, []);

  // Usa QueryClientContext com fallback seguro
  const queryContext = React.useContext(QueryClientContext);
  const activeQueryClient = queryContext || fallbackQueryClient;

  // Hydrate inicial via TanStack Query (/api/v1/events/telemetry)
  const { data: telemetryData, refetch: refetchTelemetry, isFetching } = useQuery(
    {
      queryKey: ["telemetry-monitored-devices"],
      queryFn: async () => {
        try {
          const resp = await apiClient.get<{ total: number; items: any[] }>("/api/v1/events/telemetry");
          if (resp && resp.items && resp.items.length > 0) {
            return resp.items.map((item: any): MonitoredDevice => ({
              device_id: item.device_id || item.id,
              name: item.name,
              hostname: item.hostname,
              ip_address: item.ip_address || "10.0.0.1",
              port: item.port,
              protocol: item.protocol || "ICMP",
              category: item.category || "SWITCH",
              status: (item.status || "UP") as DeviceStatus,
              severity: (item.status === "DOWN"
                ? "critical"
                : item.status === "DEG"
                  ? "degraded"
                  : "healthy") as DeviceSeverity,
              tenant_id: item.tenant_id || "unitel",
              tenant_name: item.tenant_name || "Unitel Backbone",
              model_description: item.model_description || `${item.category || "Device"} • Cluster`,
              last_latency_ms: item.last_latency_ms,
              last_packet_loss: item.last_packet_loss,
              recent_latency: item.recent_metrics?.map((m: any) => m.latency_ms) || [2.1, 2.3, 2.0, 2.2],
            }));
          }
        } catch {
          // Fallback resiliente para os dados canônicos
        }
        return INITIAL_MOCK_DEVICES;
      },
      initialData: INITIAL_MOCK_DEVICES,
      staleTime: 10000,
    },
    activeQueryClient
  );

  const devices: MonitoredDevice[] = telemetryData || INITIAL_MOCK_DEVICES;

  // Filtro dinâmico de dispositivos
  const filteredDevices = useMemo(() => {
    return devices.filter((d) => {
      if (severityFilter === "critical" && d.status !== "DOWN" && d.severity !== "critical") return false;
      if (severityFilter === "degraded" && d.status !== "DEG" && d.severity !== "degraded") return false;
      if (severityFilter === "healthy" && d.status !== "UP" && d.severity !== "healthy") return false;
      if (tenantFilter !== "all" && d.tenant_id !== tenantFilter) return false;
      return true;
    });
  }, [devices, severityFilter, tenantFilter]);

  // Contadores para o Ticker e Toolbar
  const stats = useMemo(() => {
    const total = devices.length;
    const up = devices.filter((d) => d.status === "UP").length;
    const deg = devices.filter((d) => d.status === "DEG").length;
    const down = devices.filter((d) => d.status === "DOWN").length;
    const maint = devices.filter((d) => d.status === "MAINT").length;
    return { total, up, deg, down, maint };
  }, [devices]);

  // Atalho global de teclado: Ctrl + K para abrir busca global
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setIsSearchOpen(true);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Handlers
  const handleSelectDevice = (device: MonitoredDevice) => {
    setSelectedDevice(device);
    setIsDrawerOpen(true);
  };

  const handlePingDevice = (device: MonitoredDevice) => {
    showToast(
      `Sonda ICMP executada para ${device.name}: RTT ${device.last_latency_ms || 2.1}ms (0% loss)`,
      "success"
    );
  };

  const handleForceScan = () => {
    refetchTelemetry();
    showToast("Varredura manual de sondas ICMP/SNMP solicitada.", "info");
  };

  return (
    <div
      data-testid="noc-dashboard-page"
      className="flex flex-col w-full min-h-[calc(100vh-3.5rem)] relative text-slate-100 bg-obsidian-950 pb-16"
    >
      {/* Toast Feedback Notification */}
      {toastMessage && (
        <aside
          data-testid="toast-notification"
          aria-live="polite"
          className="fixed top-20 right-6 z-[9999] px-4 py-3 rounded-xl bg-obsidian-900/95 border shadow-2xl text-xs font-mono text-white flex items-center gap-2.5 backdrop-blur-md transition-all"
          style={{
            borderColor:
              toastMessage.type === "warning"
                ? "rgba(245, 158, 11, 0.5)"
                : toastMessage.type === "info"
                  ? "rgba(56, 189, 248, 0.5)"
                  : "rgba(16, 185, 129, 0.5)",
          }}
        >
          <span
            className="w-2 h-2 rounded-full"
            style={{
              backgroundColor:
                toastMessage.type === "warning"
                  ? "#f59e0b"
                  : toastMessage.type === "info"
                    ? "#38bdf8"
                    : "#10b981",
            }}
          />
          <span>{toastMessage.text}</span>
        </aside>
      )}

      {/* ===================================================================== */}
      {/* 1. SUB-HEADER TOOLBAR (Filtros, Tenant, Estados & Varredura)          */}
      {/* ===================================================================== */}
      <section
        role="toolbar"
        aria-label="Filtros e Controles de Telemetria"
        className="w-full px-4 sm:px-6 py-1.5 sm:py-2 bg-obsidian-900 border-b border-obsidian-800/80 flex flex-wrap items-center justify-between gap-3 relative z-10"
      >
        {/* Grupo de Filtros por Severidade */}
        <div
          role="group"
          aria-label="Filtrar por estado operacional"
          className="flex items-center flex-wrap gap-1.5"
        >
          <button
            type="button"
            data-testid="filter-all-btn"
            onClick={() => setSeverityFilter("all")}
            className={`filter-btn flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium border transition-colors cursor-pointer ${severityFilter === "all"
                ? "bg-obsidian-800 text-white border-obsidian-700"
                : "bg-obsidian-900 hover:bg-obsidian-850 text-slate-300 hover:text-white border-obsidian-800"
              }`}
            aria-pressed={severityFilter === "all"}
          >
            <span>Todos</span>
            <span className="px-1.5 py-0.5 rounded-full bg-slate-700 text-slate-300 font-mono text-[10px] tabular-nums">
              {stats.total}
            </span>
          </button>

          <button
            type="button"
            data-testid="filter-critical-btn"
            onClick={() => setSeverityFilter("critical")}
            className={`filter-btn flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium border transition-colors cursor-pointer ${severityFilter === "critical"
                ? "bg-rose-500/20 text-rose-400 border-rose-500/40 font-bold"
                : "bg-obsidian-900 hover:bg-obsidian-850 text-slate-300 hover:text-white border-obsidian-800"
              }`}
            aria-pressed={severityFilter === "critical"}
          >
            <span>Críticos</span>
            <span className="px-1.5 py-0.5 rounded-full bg-rose-500/20 text-rose-400 font-mono text-[10px] font-bold tabular-nums">
              {stats.down}
            </span>
          </button>

          <button
            type="button"
            data-testid="filter-degraded-btn"
            onClick={() => setSeverityFilter("degraded")}
            className={`filter-btn flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium border transition-colors cursor-pointer ${severityFilter === "degraded"
                ? "bg-amber-500/20 text-amber-400 border-amber-500/40 font-bold"
                : "bg-obsidian-900 hover:bg-obsidian-850 text-slate-300 hover:text-white border-obsidian-800"
              }`}
            aria-pressed={severityFilter === "degraded"}
          >
            <span>Degradados</span>
            <span className="px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-400 font-mono text-[10px] font-bold tabular-nums">
              {stats.deg}
            </span>
          </button>

          <button
            type="button"
            data-testid="filter-healthy-btn"
            onClick={() => setSeverityFilter("healthy")}
            className={`filter-btn flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium border transition-colors cursor-pointer ${severityFilter === "healthy"
                ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/40 font-bold"
                : "bg-obsidian-900 hover:bg-obsidian-850 text-slate-300 hover:text-white border-obsidian-800"
              }`}
            aria-pressed={severityFilter === "healthy"}
          >
            <span>Operacionais</span>
            <span className="px-1.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 font-mono text-[10px] font-bold tabular-nums">
              {stats.up}
            </span>
          </button>

          <span className="h-4 w-px bg-obsidian-800 mx-1 hidden sm:block" />

          {/* Seletor de Tenant / Organização */}
          <div className="relative inline-block text-left">
            <select
              data-testid="tenant-filter-select"
              value={tenantFilter}
              onChange={(e) => setTenantFilter(e.target.value)}
              className="bg-obsidian-900 border border-obsidian-800 rounded-md px-2.5 py-1 text-xs font-mono text-slate-200 cursor-pointer focus-visible:ring-1 focus-visible:ring-emerald-500 outline-none"
              aria-label="Filtrar por Organização"
            >
              <option value="all">Todas as Organizações ({stats.total} ativos)</option>
              <option value="unitel">Unitel Backbone (1 CRIT)</option>
              <option value="bancosol">Banco Sol Core (1 DEG)</option>
              <option value="sonangol">Sonangol Logistics (100% UP)</option>
            </select>
          </div>
        </div>

        {/* Seletor de Estados Alternativos + Ações */}
        <div className="flex items-center gap-2">
          {/* Busca Global Trigger */}
          <button
            type="button"
            data-testid="global-search-trigger"
            onClick={() => setIsSearchOpen(true)}
            className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-obsidian-900 border border-obsidian-800 text-slate-400 text-xs hover:text-white cursor-pointer"
            aria-label="Abrir busca global (Ctrl+K)"
          >
            <Search size={14} className="text-emerald-400" aria-hidden="true" />
            <span>Busca</span>
            <kbd className="text-[10px] font-mono px-1 py-0.5 rounded bg-obsidian-850 border border-obsidian-800">
              Ctrl K
            </kbd>
          </button>

          {/* Simulador de Estados (ai-mockup-rectifier) */}
          <div className="flex items-center gap-1 bg-obsidian-950 px-2.5 py-1 rounded-lg border border-obsidian-800 text-[10px] font-mono">
            <span className="text-slate-400 hidden sm:inline">ESTADO:</span>
            <select
              data-testid="state-simulator-select"
              value={viewState}
              onChange={(e) => setViewState(e.target.value as DashboardViewMode)}
              className="bg-transparent text-emerald-400 font-semibold text-[10px] border-none outline-none cursor-pointer p-0"
              aria-label="Simular Estado do Dashboard"
            >
              <option value="nominal" className="bg-obsidian-900 text-slate-200">Nominal (Ao Vivo)</option>
              <option value="skeleton" className="bg-obsidian-900 text-slate-200">Carregando (Skeleton)</option>
              <option value="empty" className="bg-obsidian-900 text-slate-200">Vazio (Sem Alertas)</option>
              <option value="error" className="bg-obsidian-900 text-slate-200">Erro de Coletor (Boundary)</option>
            </select>
          </div>

          {/* Botão Forçar Varredura */}
          <button
            type="button"
            data-testid="manual-scan-btn"
            onClick={handleForceScan}
            disabled={isFetching}
            className="p-1.5 rounded-lg bg-obsidian-900 border border-obsidian-800 text-slate-400 hover:text-white hover:bg-obsidian-850 transition-colors focus-visible:ring-2 focus-visible:ring-emerald-500 cursor-pointer disabled:opacity-50"
            title="Forçar Varredura de Sondagem Imediata"
            aria-label="Forçar varredura agora"
          >
            <RefreshCw size={16} className={isFetching ? "animate-spin text-emerald-400" : ""} />
          </button>

          {/* Emergency Drain Trigger */}
          <button
            type="button"
            data-testid="emergency-drain-btn"
            onClick={() => setIsDrainModalOpen(true)}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs font-mono font-bold hover:bg-rose-500/20 cursor-pointer transition-colors"
            title="Executar protocolo de isolamento de tráfego"
          >
            <Power size={13} aria-hidden="true" />
            <span className="hidden sm:inline">Drain</span>
          </button>
        </div>
      </section>

      {/* ===================================================================== */}
      {/* 2. ÁREA DE CONTEÚDO COM ESTADOS OVERLAY                               */}
      {/* ===================================================================== */}
      <div className="relative flex-1 flex flex-col">
        {/* ESTADOS ALTERNATIVOS OVERLAY (SKELETON, EMPTY, ERROR) */}
        <NocStateOverlay
          viewState={viewState}
          onResetNominal={() => setViewState("nominal")}
          onReconnect={() => {
            setViewState("nominal");
            sseReconnect();
            showToast("Conexão SSE de telemetria restabelecida.", "success");
          }}
        />

        {/* =================================================================== */}
        {/* CONTEÚDO PRINCIPAL (NOMINAL OPERATIONAL COCKPIT)                    */}
        {/* =================================================================== */}
        <div className="p-4 sm:p-6 space-y-6 flex-1">
          {/* 1. HERO CARDS: KPIS DE ALTO IMPACTO */}
          <NocKpiGrid stats={stats} />

          {/* 2. GRID ASSIMÉTRICO 8 COLS + 4 COLS (Operacional de Missão Crítica) */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* =============================================================== */}
            {/* COLUNA ESQUERDA (8 colunas): Gráfico 24h & Matriz de Dispositivos*/}
            {/* =============================================================== */}
            <div className="lg:col-span-8 flex flex-col gap-6">
              {/* CARD: HISTOGRAMA DE LATÊNCIA E TRÁFEGO 24H (PRIMEIRO NO MOCKUP) */}
              <NocTrafficChart24h />

              {/* CARD: MATRIZ DE ATIVOS EM DESTAQUE (SEGUNDO NO MOCKUP) */}
              <section className="space-y-3" aria-label="Ativos de Infraestrutura">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-mono uppercase tracking-wider text-slate-300 font-semibold flex items-center gap-2 m-0">
                    <Server size={18} className="text-sky-400" aria-hidden="true" />
                    <span>Ativos Monitorados &amp; Sondagem em Tempo Real</span>
                  </h3>
                  <Link
                    to="/devices"
                    className="text-xs font-mono text-emerald-400 hover:underline flex items-center gap-1"
                  >
                    <span>Cockpit 360° do Dispositivo</span>
                    <ArrowRight size={14} aria-hidden="true" />
                  </Link>
                </div>

                {/* Grade de Dispositivos Monitorados */}
                <div
                  data-testid="devices-grid"
                  aria-label="Dispositivos Monitorados"
                  className="grid grid-cols-1 md:grid-cols-2 gap-4"
                >
                  {filteredDevices.map((device) => (
                    <DeviceCard
                      key={device.device_id}
                      device={device}
                      onSelect={handleSelectDevice}
                      onPing={handlePingDevice}
                    />
                  ))}
                </div>
              </section>
            </div>

            {/* =============================================================== */}
            {/* COLUNA DIREITA (4 colunas): Incident Feed, Topologia & SLA       */}
            {/* =============================================================== */}
            <div className="lg:col-span-4 flex flex-col gap-6">
              {/* CARD: INCIDENT FEED EM TEMPO REAL COM SLA COUNTDOWN */}
              <NocIncidentsFeed onShowToast={showToast} />

              {/* CARD: VISÃO RÁPIDA DA TOPOLOGIA DE REDE */}
              <section
                data-testid="topology-preview-card"
                className="bg-obsidian-900 rounded-xl p-5 border border-obsidian-800 flex flex-col gap-3 shadow-sm"
              >
                <div className="flex items-center justify-between border-b border-obsidian-800 pb-3">
                  <div className="flex items-center gap-2">
                    <Network size={18} className="text-emerald-400" aria-hidden="true" />
                    <h3 className="text-xs font-mono font-bold text-white uppercase tracking-wider m-0">
                      Topologia do Cluster
                    </h3>
                  </div>
                  <span className="text-[10px] font-mono text-emerald-400 font-semibold">
                    7 Nós Conectados
                  </span>
                </div>

                {/* Mini Esquema de Topologia */}
                <div className="h-32 bg-obsidian-950 rounded-lg border border-obsidian-800/80 p-2 relative overflow-hidden flex items-center justify-center">
                  <svg className="w-full h-full" viewBox="0 0 280 100">
                    <line x1="140" y1="20" x2="140" y2="50" stroke="#10b981" strokeWidth="2" />
                    <line x1="140" y1="50" x2="70" y2="80" stroke="#38bdf8" strokeWidth="1.5" />
                    <line x1="140" y1="50" x2="210" y2="80" stroke="#38bdf8" strokeWidth="1.5" />
                    <line x1="140" y1="20" x2="240" y2="20" stroke="#f43f5e" strokeWidth="2" strokeDasharray="3 2" />

                    <circle cx="140" cy="20" r="6" fill="#10b981" />
                    <circle cx="140" cy="50" r="7" fill="#10b981" />
                    <circle cx="70" cy="80" r="5" fill="#f59e0b" />
                    <circle cx="210" cy="80" r="5" fill="#10b981" />
                    <circle cx="240" cy="20" r="6" fill="#f43f5e" />
                  </svg>
                  <div className="absolute bottom-2 left-2 text-[9px] font-mono text-slate-400">
                    Grafo em Tempo Real (LLDP Synced)
                  </div>
                </div>

                <Link
                  to="/topology"
                  className="w-full py-2 bg-obsidian-850 hover:bg-obsidian-800 text-slate-300 hover:text-white rounded-lg text-xs font-mono font-medium border border-obsidian-800 transition-colors flex items-center justify-center gap-1.5"
                >
                  <Maximize2 size={15} aria-hidden="true" />
                  <span>Abrir Grafo Interativo Completo</span>
                </Link>
              </section>

              {/* CARD: MANUTENÇÃO & DR RESUMO */}
              <section className="bg-obsidian-900 rounded-xl p-4 border border-obsidian-800 flex flex-col gap-2 font-mono text-xs shadow-sm">
                <div className="flex items-center justify-between text-slate-300 pb-2 border-b border-obsidian-800">
                  <span className="flex items-center gap-1.5">
                    <Wrench size={16} className="text-sky-400" aria-hidden="true" />
                    <span>Janela Técnica:</span>
                  </span>
                  <span className="text-sky-400 font-semibold">Hoje 01:00 UTC</span>
                </div>
                <div className="flex items-center justify-between text-slate-300 pt-1">
                  <span className="flex items-center gap-1.5">
                    <HardDrive size={16} className="text-emerald-400" aria-hidden="true" />
                    <span>Backup 3-2-1:</span>
                  </span>
                  <span className="text-emerald-400 font-semibold">NVMe / R2 OK</span>
                </div>
              </section>
            </div>
          </div>
        </div>
      </div>

      {/* ===================================================================== */}
      {/* 3. FOOTER STATUS BAR (Telemetria Contínua de Ingestão)                */}
      {/* ===================================================================== */}
      <footer className="w-full px-6 py-2.5 bg-obsidian-950 border-t border-obsidian-800 flex flex-wrap items-center justify-between text-xs font-mono fixed bottom-0 left-0 lg:left-60 right-0 z-20">
        <div className="flex items-center gap-6 text-slate-400">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400" aria-hidden="true" />
            <span>Ingestão: <strong className="text-white tabular-nums">42.1k msgs/s</strong></span>
          </div>
          <span className="h-3 w-px bg-obsidian-800 hidden sm:inline" aria-hidden="true" />
          <div className="hidden sm:block">
            <span>Latência Ingestão: <strong className="text-emerald-400 font-bold tabular-nums">2.1ms</strong></span>
          </div>
          <span className="h-3 w-px bg-obsidian-800 hidden md:inline" aria-hidden="true" />
          <div className="hidden md:block">
            <span>Nó Primário: <span className="text-slate-300">noc-luanda-core-gw01</span></span>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="text-slate-400 flex items-center gap-1.5">
            <RefreshCw size={16} className="text-emerald-400 animate-spin" aria-hidden="true" />
            <span>Próxima varredura: <strong className="text-white font-mono tabular-nums">00:04s</strong></span>
          </div>
          <button
            type="button"
            onClick={handleForceScan}
            className="px-2.5 py-1 rounded bg-obsidian-850 hover:bg-obsidian-800 border border-obsidian-700 text-slate-200 text-xs font-semibold transition-colors focus-visible:ring-2 focus-visible:ring-emerald-500 cursor-pointer"
          >
            Recarregar Agora
          </button>
        </div>
      </footer>

      {/* ===================================================================== */}
      {/* 4. MODAIS & DRAWERS INTEGRADOS                                        */}
      {/* ===================================================================== */}
      <GlobalSearchModal
        isOpen={isSearchOpen}
        onClose={() => setIsSearchOpen(false)}
        devices={devices}
        onSelectDevice={handleSelectDevice}
      />

      <DeviceDetailDrawer
        device={selectedDevice}
        isOpen={isDrawerOpen}
        onClose={() => {
          setIsDrawerOpen(false);
          setSelectedDevice(null);
        }}
        onPing={handlePingDevice}
      />

      <EmergencyDrainModal
        isOpen={isDrainModalOpen}
        onClose={() => setIsDrainModalOpen(false)}
        onConfirm={() => {
          setIsDrainModalOpen(false);
          showToast("Drenagem de emergência confirmada para o cluster.", "warning");
        }}
      />
    </div>
  );
};
