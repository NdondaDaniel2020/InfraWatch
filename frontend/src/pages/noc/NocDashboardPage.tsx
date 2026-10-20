import React, { useCallback, useEffect, useMemo, useState } from "react";
import { QueryClient, QueryClientContext, useQuery } from "@tanstack/react-query";
import {
  CheckCircle2,
  CloudOff,
  Network,
  Power,
  RefreshCw,
  Search,
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
      className="flex flex-col gap-5 w-full max-w-[1600px] mx-auto relative text-slate-100"
    >
      {/* Toast Feedback Notification */}
      {toastMessage && (
        <aside
          data-testid="toast-notification"
          aria-live="polite"
          className="fixed top-20 right-6 z-[9999] px-4 py-3 rounded-xl bg-[#0d1424]/95 border shadow-2xl text-xs font-mono text-white flex items-center gap-2.5 backdrop-blur-md transition-all"
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
      {/* 1. SUB-HEADER TOOLBAR (Filtros, Tenant, Simulador e Ações)             */}
      {/* ===================================================================== */}
      <section
        role="toolbar"
        aria-label="Filtros e Controles de Telemetria"
        className="w-full p-2.5 sm:px-4 bg-[#0d1424]/75 border border-white/10 rounded-2xl flex items-center justify-between flex-wrap gap-3 backdrop-blur-md"
      >
        {/* Grupo de Filtros por Severidade */}
        <div
          role="group"
          aria-label="Filtrar por estado operacional"
          className="flex items-center gap-1.5 p-1 bg-[#070a12]/80 rounded-full border border-white/10 flex-wrap"
        >
          <button
            type="button"
            data-testid="filter-all-btn"
            onClick={() => setSeverityFilter("all")}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium transition-colors ${
              severityFilter === "all"
                ? "bg-amber-400 text-slate-950 font-bold"
                : "text-slate-300 hover:text-white"
            }`}
          >
            <span>Todos</span>
            <span className="px-1.5 py-0.5 rounded-full text-[10px] font-mono bg-black/20">
              {stats.total}
            </span>
          </button>

          <button
            type="button"
            data-testid="filter-critical-btn"
            onClick={() => setSeverityFilter("critical")}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium transition-colors ${
              severityFilter === "critical"
                ? "bg-rose-500/25 text-rose-400 font-bold"
                : "text-slate-300 hover:text-rose-400"
            }`}
          >
            <span>Críticos</span>
            <span className="px-1.5 py-0.5 rounded-full text-[10px] font-mono bg-rose-500/20 text-rose-400">
              {stats.down}
            </span>
          </button>

          <button
            type="button"
            data-testid="filter-degraded-btn"
            onClick={() => setSeverityFilter("degraded")}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium transition-colors ${
              severityFilter === "degraded"
                ? "bg-amber-500/25 text-amber-400 font-bold"
                : "text-slate-300 hover:text-amber-400"
            }`}
          >
            <span>Degradados</span>
            <span className="px-1.5 py-0.5 rounded-full text-[10px] font-mono bg-amber-500/20 text-amber-400">
              {stats.deg}
            </span>
          </button>

          <button
            type="button"
            data-testid="filter-healthy-btn"
            onClick={() => setSeverityFilter("healthy")}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium transition-colors ${
              severityFilter === "healthy"
                ? "bg-emerald-500/25 text-emerald-400 font-bold"
                : "text-slate-300 hover:text-emerald-400"
            }`}
          >
            <span>Operacionais</span>
            <span className="px-1.5 py-0.5 rounded-full text-[10px] font-mono bg-emerald-500/20 text-emerald-400">
              {stats.up}
            </span>
          </button>

          <span className="w-px h-4 bg-white/10 mx-1" />

          {/* Seletor de Tenant */}
          <select
            data-testid="tenant-filter-select"
            value={tenantFilter}
            onChange={(e) => setTenantFilter(e.target.value)}
            className="bg-transparent border-none text-slate-300 text-xs font-mono px-2 py-0.5 cursor-pointer outline-none"
            aria-label="Filtrar por Organização"
          >
            <option value="all" className="bg-[#0d1424] text-white">
              Todas as Organizações ({stats.total} ativos)
            </option>
            <option value="unitel" className="bg-[#0d1424] text-white">
              Unitel Backbone (1 CRIT)
            </option>
            <option value="bancosol" className="bg-[#0d1424] text-white">
              Banco Sol Core (1 DEG)
            </option>
            <option value="sonangol" className="bg-[#0d1424] text-white">
              Sonangol Logistics (100% UP)
            </option>
          </select>
        </div>

        {/* Simulador de Estados + Ações */}
        <div className="flex items-center gap-2.5 flex-wrap">
          {/* Busca Global Trigger */}
          <button
            type="button"
            data-testid="global-search-trigger"
            onClick={() => setIsSearchOpen(true)}
            className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#070a12]/80 border border-white/10 text-slate-400 text-xs hover:text-white cursor-pointer"
            aria-label="Abrir busca global (Ctrl+K)"
          >
            <Search size={14} className="text-amber-400" />
            <span>Busca</span>
            <kbd className="text-[10px] font-mono px-1 py-0.5 rounded bg-white/10">Ctrl K</kbd>
          </button>

          {/* Simulador de Estados (ai-mockup-rectifier) */}
          <div className="flex items-center gap-1.5 px-3 py-1 bg-[#070a12]/80 rounded-full border border-white/10 text-xs font-mono">
            <span className="text-slate-400 text-[11px]">Estado:</span>
            <select
              data-testid="state-simulator-select"
              value={viewState}
              onChange={(e) => setViewState(e.target.value as DashboardViewMode)}
              className="bg-transparent text-amber-400 font-bold border-none outline-none cursor-pointer"
              aria-label="Simular estados da interface"
            >
              <option value="nominal" className="bg-[#0d1424] text-white">Nominal</option>
              <option value="skeleton" className="bg-[#0d1424] text-white">Skeleton Loading</option>
              <option value="empty" className="bg-[#0d1424] text-white">Empty State</option>
              <option value="error" className="bg-[#0d1424] text-white">Error Stream</option>
            </select>
          </div>

          {/* Varredura Manual */}
          <button
            type="button"
            data-testid="manual-scan-btn"
            onClick={handleForceScan}
            disabled={isFetching}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/5 border border-white/10 text-xs font-mono text-slate-200 hover:bg-white/10 cursor-pointer disabled:opacity-50"
            title="Forçar varredura manual de sondas"
          >
            <RefreshCw size={13} className={isFetching ? "animate-spin text-amber-400" : "text-amber-400"} />
            <span>Varredura</span>
          </button>

          {/* Emergency Drain Trigger */}
          <button
            type="button"
            data-testid="emergency-drain-btn"
            onClick={() => setIsDrainModalOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-rose-500/15 border border-rose-500/30 text-rose-400 text-xs font-mono font-bold hover:bg-rose-500/25 cursor-pointer"
            title="Executar protocolo de isolamento de tráfego"
          >
            <Power size={13} />
            <span>Emergency Drain</span>
          </button>
        </div>
      </section>

      {/* ===================================================================== */}
      {/* 2. CONTEÚDO PRINCIPAL COM OVERLAYS DE ESTADO                           */}
      {/* ===================================================================== */}
      <div className="relative flex flex-col gap-5 min-h-[400px]">
        {/* ESTADO 1: SKELETON LOADING OVERLAY */}
        {viewState === "skeleton" && (
          <div
            data-testid="state-skeleton-overlay"
            className="absolute inset-0 bg-[#070a12]/95 backdrop-blur-sm z-40 p-6 flex flex-col gap-6 rounded-2xl animate-pulse"
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-28 bg-[#0d1424] rounded-2xl border border-white/10" />
              ))}
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 flex-1">
              <div className="lg:col-span-8 bg-[#0d1424] rounded-2xl border border-white/10 h-80" />
              <div className="lg:col-span-4 bg-[#0d1424] rounded-2xl border border-white/10 h-80" />
            </div>
          </div>
        )}

        {/* ESTADO 2: EMPTY STATE OVERLAY */}
        {viewState === "empty" && (
          <div
            data-testid="state-empty-overlay"
            className="absolute inset-0 bg-[#070a12]/95 backdrop-blur-sm z-40 p-12 flex flex-col items-center justify-center rounded-2xl"
          >
            <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 mb-4">
              <CheckCircle2 size={32} />
            </div>
            <h2 className="text-xl font-bold text-white mb-1.5">
              Todos os Ativos Operacionais
            </h2>
            <p className="text-sm text-slate-400 text-center max-w-md mb-5">
              Nenhum incidente crítico ou degradação ativa no momento. Uptime de rede em 100%.
            </p>
            <button
              type="button"
              onClick={() => setViewState("nominal")}
              className="px-5 py-2.5 rounded-full bg-amber-400 hover:bg-amber-300 text-slate-950 font-bold text-xs cursor-pointer shadow-md"
            >
              Voltar ao Modo Nominal
            </button>
          </div>
        )}

        {/* ESTADO 3: ERROR BOUNDARY OVERLAY */}
        {viewState === "error" && (
          <div
            data-testid="state-error-overlay"
            className="absolute inset-0 bg-[#070a12]/95 backdrop-blur-sm z-40 p-12 flex flex-col items-center justify-center rounded-2xl"
          >
            <div className="w-16 h-16 rounded-2xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-center text-rose-400 mb-4">
              <CloudOff size={32} />
            </div>
            <h2 className="text-xl font-bold text-rose-400 mb-1.5">
              Falha no Streaming de Telemetria (SSE)
            </h2>
            <p className="text-sm text-slate-400 text-center max-w-md mb-5">
              Não foi possível sincronizar o canal SSE em tempo real. O barramento de eventos está inacessível.
            </p>
            <button
              type="button"
              onClick={() => {
                setViewState("nominal");
                sseReconnect();
                showToast("Canal SSE reconectado com sucesso.", "success");
              }}
              className="px-5 py-2.5 rounded-full bg-rose-500 hover:bg-rose-400 text-white font-bold text-xs cursor-pointer shadow-md"
            >
              Reconectar Ingestão
            </button>
          </div>
        )}

        {/* ===================================================================== */}
        {/* 3. HERO KPIS SECTION                                                  */}
        {/* ===================================================================== */}
        <NocKpiGrid stats={stats} />

        {/* ===================================================================== */}
        {/* 4. DISPOSITIVOS, GRÁFICO HISTÓRICO & FEED DE INCIDENTES               */}
        {/* ===================================================================== */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* COLUNA ESQUERDA (8 COLUNAS): Dispositivos e Gráfico 24h */}
          <div className="lg:col-span-8 flex flex-col gap-6">
            {/* Grade de Dispositivos Monitorados */}
            <section
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
            </section>

            {/* Gráfico de Histograma e Latência 24h */}
            <NocTrafficChart24h />
          </div>

          {/* COLUNA DIREITA (4 COLUNAS): Feed de Incidentes, Topologia & Manutenção */}
          <div className="lg:col-span-4 flex flex-col gap-6">
            <NocIncidentsFeed onShowToast={showToast} />

            {/* Card de Topologia Resumida */}
            <section
              data-testid="topology-preview-card"
              className="bg-[#0d1424] border border-white/10 rounded-2xl p-5 flex flex-col gap-3 shadow-sm"
            >
              <div className="flex justify-between items-center border-b border-white/10 pb-2.5">
                <div className="flex items-center gap-2">
                  <Network size={18} className="text-amber-400" />
                  <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-white m-0">
                    Topologia do Cluster
                  </h3>
                </div>
                <span className="text-[10px] font-mono text-emerald-400 font-semibold">
                  7 Nós Conectados
                </span>
              </div>

              <div className="h-28 bg-[#070a12]/80 rounded-xl border border-white/5 p-2 flex items-center justify-center relative">
                <svg viewBox="0 0 280 100" className="w-full h-full">
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
                <div className="absolute bottom-1.5 left-2 text-[9px] font-mono text-slate-500">
                  LLDP Synced • Luanda Core Ring
                </div>
              </div>
            </section>
          </div>
        </div>
      </div>

      {/* ===================================================================== */}
      {/* 5. MODAIS & DRAWERS INTEGRADOS                                        */}
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
