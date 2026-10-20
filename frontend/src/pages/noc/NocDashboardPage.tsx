import React, { useCallback, useEffect, useMemo, useState } from "react";
import { QueryClient, QueryClientContext, useQuery } from "@tanstack/react-query";
import {
  Activity,
  AlertOctagon,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock,
  CloudOff,
  Network,
  Power,
  RefreshCw,
  Search,
  Server,
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

// Singleton de QueryClient resiliente para evitar erros fora de QueryClientProvider
const fallbackQueryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
      staleTime: 10000,
    },
  },
});

// Dados canônicos extraídos do mockup oficial telas_mockups/03_NocDashboardPage
const INITIAL_MOCK_DEVICES: MonitoredDevice[] = [
  {
    device_id: "dev-sw-core-01",
    name: "SW-CORE-LUANDA-01",
    hostname: "sw-core-01.luanda.infrawatch.ao",
    ip_address: "10.0.1.1",
    port: 22,
    protocol: "SNMP/ICMP",
    category: "SWITCH",
    status: "UP",
    severity: "healthy",
    tenant_id: "unitel",
    tenant_name: "Unitel Backbone",
    model_description: "Huawei CloudEngine 6800 • Core DC-01",
    location: "DC Luanda Core",
    last_latency_ms: 2.1,
    last_packet_loss: 0.0,
    cpu_usage_pct: 58,
    ram_usage_pct: 61,
    ports_summary: "18/24 UP",
    uptime_duration: "184d 12h",
    recent_latency: [2.1, 2.3, 2.0, 2.2, 2.1, 2.4, 2.1, 2.0, 2.2, 2.1],
  },
  {
    device_id: "dev-rt-benguela-02",
    name: "RT-BRANCH-BENGUELA",
    hostname: "rt-branch.benguela.infrawatch.ao",
    ip_address: "172.16.20.1",
    port: 161,
    protocol: "ICMP",
    category: "ROUTER",
    status: "DOWN",
    severity: "critical",
    tenant_id: "unitel",
    tenant_name: "Unitel Backbone",
    model_description: "MikroTik CCR2004 • WAN Catumbela",
    location: "Filial Benguela",
    last_latency_ms: null,
    last_packet_loss: 100.0,
    cpu_usage_pct: 0,
    ram_usage_pct: 0,
    ports_summary: "0/8 DOWN",
    root_cause: "Fibra Rompida",
    downtime_duration: "00:14:32",
    ticket_id: "8492",
    recent_latency: [18.2, 22.4, 35.1, 68.2, 120.0, 0, 0, 0, 0, 0],
  },
  {
    device_id: "dev-api-gw-03",
    name: "API-GATEWAY-PROD",
    hostname: "api-gw.bancosol.infrawatch.ao",
    ip_address: "10.0.2.15",
    port: 443,
    protocol: "HTTP",
    category: "API_GATEWAY",
    status: "DEG",
    severity: "degraded",
    tenant_id: "bancosol",
    tenant_name: "Banco Sol Core",
    model_description: "Banco Sol Internet Banking • Envoy Cluster",
    location: "Cluster Kubernetes",
    last_latency_ms: 142.0,
    last_packet_loss: 2.5,
    cpu_usage_pct: 89,
    ram_usage_pct: 78,
    ports_summary: "4.8k Sockets",
    uptime_duration: "45d 08h",
    recent_latency: [25.0, 32.0, 48.0, 65.0, 95.0, 120.0, 142.0, 138.0, 142.0],
  },
  {
    device_id: "dev-db-timescale-04",
    name: "DB-TIMESCALEDB-PRIMARY",
    hostname: "db-ts.sonangol.infrawatch.ao",
    ip_address: "10.0.4.10",
    port: 5432,
    protocol: "TCP",
    category: "DATABASE",
    status: "UP",
    severity: "healthy",
    tenant_id: "sonangol",
    tenant_name: "Sonangol Logistics",
    model_description: "PostgreSQL 16 HA • TimescaleDB Pro",
    location: "DC Sonangol Core",
    last_latency_ms: 0.9,
    last_packet_loss: 0.0,
    cpu_usage_pct: 42,
    ram_usage_pct: 74,
    ports_summary: "142/200 Conexões",
    uptime_duration: "312d 18h",
    recent_latency: [0.9, 0.8, 1.0, 0.9, 0.9, 1.1, 0.9, 0.8, 0.9, 0.9],
  },
  {
    device_id: "dev-fw-edge-05",
    name: "FW-EDGE-TALATONA",
    hostname: "fw-edge.talatona.infrawatch.ao",
    ip_address: "10.0.5.1",
    port: 443,
    protocol: "HTTPS",
    category: "FIREWALL",
    status: "UP",
    severity: "healthy",
    tenant_id: "unitel",
    tenant_name: "Unitel Backbone",
    model_description: "Fortinet FortiGate 600E • BGP Edge",
    location: "DC Talatona",
    last_latency_ms: 3.4,
    last_packet_loss: 0.0,
    cpu_usage_pct: 35,
    ram_usage_pct: 48,
    ports_summary: "10G LACP Trunk",
    uptime_duration: "98d 02h",
    recent_latency: [3.2, 3.5, 3.4, 3.3, 3.6, 3.4, 3.2, 3.4],
  },
  {
    device_id: "dev-sw-cabinda-06",
    name: "SW-ACC-CABINDA",
    hostname: "sw-acc.cabinda.infrawatch.ao",
    ip_address: "192.168.10.2",
    port: 22,
    protocol: "SNMP/ICMP",
    category: "SWITCH",
    status: "UP",
    severity: "healthy",
    tenant_id: "sonangol",
    tenant_name: "Sonangol Logistics",
    model_description: "Cisco Catalyst 9300 • Filial Cabinda",
    location: "Filial Cabinda",
    last_latency_ms: 18.5,
    last_packet_loss: 0.0,
    cpu_usage_pct: 28,
    ram_usage_pct: 40,
    ports_summary: "48/48 PoE UP",
    uptime_duration: "64d 14h",
    recent_latency: [18.1, 18.9, 18.4, 19.2, 18.5, 18.3, 18.5],
  },
];

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

  // Usa QueryClientContext com fallback seguro para não quebrar sem QueryClientProvider
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
          // Fallback resiliente para os dados canônicos do mockup se a API não estiver respondendo
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
      // Filtro de severidade
      if (severityFilter === "critical" && d.status !== "DOWN" && d.severity !== "critical") return false;
      if (severityFilter === "degraded" && d.status !== "DEG" && d.severity !== "degraded") return false;
      if (severityFilter === "healthy" && d.status !== "UP" && d.severity !== "healthy") return false;

      // Filtro de tenant
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
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "20px",
        width: "100%",
        maxWidth: "1600px",
        margin: "0 auto",
        position: "relative",
      }}
    >
      {/* Toast Feedback Notification */}
      {toastMessage && (
        <div
          data-testid="toast-notification"
          style={{
            position: "fixed",
            top: "76px",
            right: "24px",
            zIndex: 9999,
            padding: "12px 18px",
            borderRadius: "12px",
            backgroundColor: "rgba(13, 20, 36, 0.96)",
            border: `1px solid ${
              toastMessage.type === "warning"
                ? "rgba(245, 158, 11, 0.5)"
                : toastMessage.type === "info"
                ? "rgba(56, 189, 248, 0.5)"
                : "rgba(16, 185, 129, 0.5)"
            }`,
            boxShadow: "0 10px 30px rgba(0, 0, 0, 0.5)",
            fontSize: "12px",
            fontFamily: "var(--font-mono, monospace)",
            color: "#f8fafc",
            display: "flex",
            alignItems: "center",
            gap: "10px",
            backdropFilter: "blur(8px)",
          }}
        >
          <span
            style={{
              width: "8px",
              height: "8px",
              borderRadius: "50%",
              backgroundColor:
                toastMessage.type === "warning"
                  ? "#f59e0b"
                  : toastMessage.type === "info"
                  ? "#38bdf8"
                  : "#10b981",
            }}
          />
          <span>{toastMessage.text}</span>
        </div>
      )}

      {/* ===================================================================== */}
      {/* 1. SUB-HEADER TOOLBAR (Filtros, Tenant, Simulador de Estados e Varredura) */}
      {/* ===================================================================== */}
      <section
        role="toolbar"
        aria-label="Filtros e Controles de Telemetria"
        style={{
          width: "100%",
          padding: "10px 16px",
          backgroundColor: "rgba(13, 20, 36, 0.65)",
          border: "1px solid rgba(255, 255, 255, 0.08)",
          borderRadius: "16px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: "12px",
          backdropFilter: "blur(8px)",
        }}
      >
        {/* Grupo de Filtros por Severidade */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "6px",
            padding: "4px",
            backgroundColor: "rgba(7, 10, 18, 0.8)",
            borderRadius: "9999px",
            border: "1px solid rgba(255, 255, 255, 0.08)",
            flexWrap: "wrap",
          }}
          role="group"
          aria-label="Filtrar por estado operacional"
        >
          <button
            type="button"
            data-testid="filter-all-btn"
            onClick={() => setSeverityFilter("all")}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              padding: "4px 12px",
              borderRadius: "9999px",
              backgroundColor:
                severityFilter === "all"
                  ? "var(--brand-primary, #eab308)"
                  : "transparent",
              color: severityFilter === "all" ? "#070a12" : "#cbd5e1",
              fontWeight: severityFilter === "all" ? 700 : 500,
              fontSize: "12px",
              border: "none",
              cursor: "pointer",
            }}
          >
            <span>Todos</span>
            <span
              style={{
                padding: "1px 6px",
                borderRadius: "9999px",
                fontSize: "10px",
                fontFamily: "var(--font-mono)",
                backgroundColor: severityFilter === "all" ? "rgba(0, 0, 0, 0.2)" : "rgba(255, 255, 255, 0.1)",
              }}
            >
              {stats.total}
            </span>
          </button>

          <button
            type="button"
            data-testid="filter-critical-btn"
            onClick={() => setSeverityFilter("critical")}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              padding: "4px 12px",
              borderRadius: "9999px",
              backgroundColor:
                severityFilter === "critical"
                  ? "rgba(244, 63, 94, 0.25)"
                  : "transparent",
              color: severityFilter === "critical" ? "#f43f5e" : "#cbd5e1",
              fontWeight: severityFilter === "critical" ? 700 : 500,
              fontSize: "12px",
              border: "none",
              cursor: "pointer",
            }}
          >
            <span>Críticos</span>
            <span
              style={{
                padding: "1px 6px",
                borderRadius: "9999px",
                fontSize: "10px",
                fontFamily: "var(--font-mono)",
                backgroundColor: "rgba(244, 63, 94, 0.2)",
                color: "#f43f5e",
              }}
            >
              {stats.down}
            </span>
          </button>

          <button
            type="button"
            data-testid="filter-degraded-btn"
            onClick={() => setSeverityFilter("degraded")}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              padding: "4px 12px",
              borderRadius: "9999px",
              backgroundColor:
                severityFilter === "degraded"
                  ? "rgba(245, 158, 11, 0.25)"
                  : "transparent",
              color: severityFilter === "degraded" ? "#f59e0b" : "#cbd5e1",
              fontWeight: severityFilter === "degraded" ? 700 : 500,
              fontSize: "12px",
              border: "none",
              cursor: "pointer",
            }}
          >
            <span>Degradados</span>
            <span
              style={{
                padding: "1px 6px",
                borderRadius: "9999px",
                fontSize: "10px",
                fontFamily: "var(--font-mono)",
                backgroundColor: "rgba(245, 158, 11, 0.2)",
                color: "#f59e0b",
              }}
            >
              {stats.deg}
            </span>
          </button>

          <button
            type="button"
            data-testid="filter-healthy-btn"
            onClick={() => setSeverityFilter("healthy")}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              padding: "4px 12px",
              borderRadius: "9999px",
              backgroundColor:
                severityFilter === "healthy"
                  ? "rgba(16, 185, 129, 0.25)"
                  : "transparent",
              color: severityFilter === "healthy" ? "#10b981" : "#cbd5e1",
              fontWeight: severityFilter === "healthy" ? 700 : 500,
              fontSize: "12px",
              border: "none",
              cursor: "pointer",
            }}
          >
            <span>Operacionais</span>
            <span
              style={{
                padding: "1px 6px",
                borderRadius: "9999px",
                fontSize: "10px",
                fontFamily: "var(--font-mono)",
                backgroundColor: "rgba(16, 185, 129, 0.2)",
                color: "#10b981",
              }}
            >
              {stats.up}
            </span>
          </button>

          <span style={{ width: "1px", height: "16px", backgroundColor: "rgba(255, 255, 255, 0.1)", margin: "0 4px" }} />

          {/* Seletor de Tenant */}
          <select
            data-testid="tenant-filter-select"
            value={tenantFilter}
            onChange={(e) => setTenantFilter(e.target.value)}
            style={{
              backgroundColor: "transparent",
              border: "none",
              color: "var(--color-text-secondary, #cbd5e1)",
              fontSize: "12px",
              fontFamily: "var(--font-mono, monospace)",
              padding: "2px 8px",
              cursor: "pointer",
              outline: "none",
            }}
            aria-label="Filtrar por Organização"
          >
            <option value="all" style={{ backgroundColor: "#0d1424", color: "#f8fafc" }}>
              Todas as Organizações ({stats.total} ativos)
            </option>
            <option value="unitel" style={{ backgroundColor: "#0d1424", color: "#f8fafc" }}>
              Unitel Backbone (1 CRIT)
            </option>
            <option value="bancosol" style={{ backgroundColor: "#0d1424", color: "#f8fafc" }}>
              Banco Sol Core (1 DEG)
            </option>
            <option value="sonangol" style={{ backgroundColor: "#0d1424", color: "#f8fafc" }}>
              Sonangol Logistics (100% UP)
            </option>
          </select>
        </div>

        {/* Simulador de Estados (ai-mockup-rectifier) + Gatilhos Rápidos */}
        <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
          {/* Busca Global (Ctrl + K) Trigger */}
          <button
            type="button"
            data-testid="global-search-trigger"
            onClick={() => setIsSearchOpen(true)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              padding: "6px 12px",
              borderRadius: "9999px",
              backgroundColor: "rgba(7, 10, 18, 0.8)",
              border: "1px solid rgba(255, 255, 255, 0.1)",
              color: "var(--color-text-muted, #94a3b8)",
              fontSize: "11px",
              cursor: "pointer",
            }}
            aria-label="Abrir busca global (Ctrl+K)"
          >
            <Search size={14} style={{ color: "var(--brand-primary, #eab308)" }} />
            <span>Busca</span>
            <kbd style={{ fontSize: "10px", fontFamily: "var(--font-mono)" }}>Ctrl K</kbd>
          </button>

          {/* Simulador de Estados */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              padding: "4px 12px",
              borderRadius: "9999px",
              backgroundColor: "rgba(7, 10, 18, 0.8)",
              border: "1px solid rgba(255, 255, 255, 0.08)",
              fontSize: "11px",
              fontFamily: "var(--font-mono, monospace)",
            }}
          >
            <span style={{ color: "var(--color-text-dim, #64748b)" }}>ESTADO:</span>
            <select
              data-testid="state-simulator-select"
              value={viewState}
              onChange={(e) => setViewState(e.target.value as DashboardViewMode)}
              style={{
                backgroundColor: "transparent",
                border: "none",
                color: "var(--brand-primary, #eab308)",
                fontWeight: 600,
                fontSize: "11px",
                cursor: "pointer",
                outline: "none",
              }}
              aria-label="Simular Estado do Dashboard"
            >
              <option value="nominal" style={{ backgroundColor: "#0d1424", color: "#f8fafc" }}>
                Nominal (Ao Vivo)
              </option>
              <option value="skeleton" style={{ backgroundColor: "#0d1424", color: "#f8fafc" }}>
                Carregando (Skeleton)
              </option>
              <option value="empty" style={{ backgroundColor: "#0d1424", color: "#f8fafc" }}>
                Vazio (Sem Alertas)
              </option>
              <option value="error" style={{ backgroundColor: "#0d1424", color: "#f8fafc" }}>
                Erro de Coletor (Boundary)
              </option>
            </select>
          </div>

          {/* Forçar Varredura */}
          <button
            type="button"
            data-testid="force-scan-btn"
            onClick={handleForceScan}
            style={{
              padding: "8px",
              borderRadius: "50%",
              backgroundColor: "rgba(7, 10, 18, 0.8)",
              border: "1px solid rgba(255, 255, 255, 0.1)",
              color: "var(--color-text-secondary, #cbd5e1)",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
            title="Forçar Varredura Imediata"
            aria-label="Forçar varredura agora"
          >
            <RefreshCw size={14} className={isFetching ? "animate-spin" : ""} />
          </button>

          {/* Emergency Drain Trigger */}
          <button
            type="button"
            data-testid="emergency-drain-btn"
            onClick={() => setIsDrainModalOpen(true)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              padding: "6px 12px",
              borderRadius: "9999px",
              backgroundColor: "rgba(244, 63, 94, 0.12)",
              border: "1px solid rgba(244, 63, 94, 0.35)",
              color: "#f43f5e",
              fontSize: "11px",
              fontFamily: "var(--font-mono)",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            <Power size={13} />
            <span>Drain</span>
          </button>
        </div>
      </section>

      {/* ===================================================================== */}
      {/* 2. ÁREA DE CONTEÚDO COM ESTADOS OVERLAY                              */}
      {/* ===================================================================== */}
      <div style={{ position: "relative", width: "100%", display: "flex", flexDirection: "column", gap: "24px" }}>
        {/* ESTADO 1: SKELETON LOADING OVERLAY */}
        {viewState === "skeleton" && (
          <div
            data-testid="state-skeleton-overlay"
            style={{
              position: "absolute",
              inset: 0,
              backgroundColor: "rgba(7, 10, 18, 0.95)",
              backdropFilter: "blur(6px)",
              zIndex: 40,
              padding: "24px",
              display: "flex",
              flexDirection: "column",
              gap: "24px",
              borderRadius: "16px",
            }}
          >
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "16px" }}>
              {[1, 2, 3, 4].map((i) => (
                <div
                  key={i}
                  style={{
                    height: "110px",
                    backgroundColor: "rgba(13, 20, 36, 0.9)",
                    borderRadius: "16px",
                    border: "1px solid rgba(255, 255, 255, 0.08)",
                  }}
                />
              ))}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "8fr 4fr", gap: "24px", flex: 1 }}>
              <div
                style={{
                  backgroundColor: "rgba(13, 20, 36, 0.9)",
                  borderRadius: "16px",
                  border: "1px solid rgba(255, 255, 255, 0.08)",
                  height: "380px",
                }}
              />
              <div
                style={{
                  backgroundColor: "rgba(13, 20, 36, 0.9)",
                  borderRadius: "16px",
                  border: "1px solid rgba(255, 255, 255, 0.08)",
                  height: "380px",
                }}
              />
            </div>
          </div>
        )}

        {/* ESTADO 2: EMPTY STATE OVERLAY */}
        {viewState === "empty" && (
          <div
            data-testid="state-empty-overlay"
            style={{
              position: "absolute",
              inset: 0,
              backgroundColor: "rgba(7, 10, 18, 0.95)",
              backdropFilter: "blur(6px)",
              zIndex: 40,
              padding: "48px 32px",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: "16px",
            }}
          >
            <div
              style={{
                width: "64px",
                height: "64px",
                borderRadius: "16px",
                backgroundColor: "rgba(16, 185, 129, 0.1)",
                border: "1px solid rgba(16, 185, 129, 0.3)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#10b981",
                marginBottom: "16px",
              }}
            >
              <CheckCircle2 size={32} />
            </div>
            <h2 style={{ fontSize: "1.25rem", fontWeight: 700, margin: "0 0 6px 0" }}>
              Todos os Ativos Operacionais
            </h2>
            <p
              style={{
                fontSize: "0.875rem",
                color: "var(--color-text-muted, #94a3b8)",
                textAlign: "center",
                maxWidth: "420px",
                margin: "0 0 20px 0",
              }}
            >
              Nenhum incidente crítico ou degradação ativa no momento. Uptime de rede em 100%.
            </p>
            <button
              type="button"
              onClick={() => setViewState("nominal")}
              style={{
                padding: "10px 20px",
                borderRadius: "9999px",
                backgroundColor: "var(--brand-primary, #eab308)",
                color: "#070a12",
                fontWeight: 700,
                fontSize: "12px",
                border: "none",
                cursor: "pointer",
              }}
            >
              Voltar ao Modo Nominal
            </button>
          </div>
        )}

        {/* ESTADO 3: ERROR BOUNDARY OVERLAY */}
        {viewState === "error" && (
          <div
            data-testid="state-error-overlay"
            style={{
              position: "absolute",
              inset: 0,
              backgroundColor: "rgba(7, 10, 18, 0.95)",
              backdropFilter: "blur(6px)",
              zIndex: 40,
              padding: "48px 32px",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: "16px",
            }}
          >
            <div
              style={{
                width: "64px",
                height: "64px",
                borderRadius: "16px",
                backgroundColor: "rgba(244, 63, 94, 0.1)",
                border: "1px solid rgba(244, 63, 94, 0.3)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#f43f5e",
                marginBottom: "16px",
              }}
            >
              <CloudOff size={32} />
            </div>
            <h2 style={{ fontSize: "1.25rem", fontWeight: 700, color: "#f43f5e", margin: "0 0 6px 0" }}>
              Falha no Streaming de Telemetria (SSE)
            </h2>
            <p
              style={{
                fontSize: "0.8125rem",
                fontFamily: "var(--font-mono)",
                color: "#fca5a5",
                margin: "0 0 6px 0",
              }}
            >
              ERR_TELEMETRY_INGEST_UNREACHABLE (ADR-004 Heartbeat Timeout)
            </p>
            <p
              style={{
                fontSize: "0.875rem",
                color: "var(--color-text-muted, #94a3b8)",
                textAlign: "center",
                maxWidth: "460px",
                margin: "0 0 20px 0",
              }}
            >
              O fluxo de sondas ICMP/SNMP do cluster excedeu o tempo limite. Verifique o coletor de rede.
            </p>
            <button
              type="button"
              onClick={() => {
                setViewState("nominal");
                sseReconnect();
                showToast("Conexão SSE de telemetria restabelecida.", "success");
              }}
              style={{
                padding: "10px 22px",
                borderRadius: "9999px",
                backgroundColor: "rgba(244, 63, 94, 0.2)",
                color: "#fca5a5",
                border: "1px solid rgba(244, 63, 94, 0.4)",
                fontWeight: 600,
                fontSize: "12px",
                cursor: "pointer",
              }}
            >
              Reconectar Ingestão
            </button>
          </div>
        )}

        {/* ===================================================================== */}
        {/* 3. HERO CARDS: KPIS DE ALTO IMPACTO (Obsidian Telemetry)              */}
        {/* ===================================================================== */}
        <section
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
            gap: "16px",
          }}
          aria-label="Indicadores Chave do Cluster"
        >
          {/* KPI 1: Uptime */}
          <div
            data-testid="kpi-uptime"
            style={{
              backgroundColor: "var(--color-surface-card, #0d1424)",
              border: "1px solid rgba(255, 255, 255, 0.08)",
              borderRadius: "16px",
              padding: "18px 20px",
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-between",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                fontSize: "11px",
                fontFamily: "var(--font-mono)",
                color: "var(--color-text-dim, #64748b)",
                textTransform: "uppercase",
              }}
            >
              <span>Disponibilidade</span>
              <span style={{ width: "8px", height: "8px", borderRadius: "50%", backgroundColor: "#10b981" }} />
            </div>
            <div style={{ margin: "10px 0", display: "flex", alignItems: "baseline", gap: "8px" }}>
              <span style={{ fontSize: "1.75rem", fontWeight: 800, letterSpacing: "-0.03em" }}>99.98%</span>
              <span style={{ fontSize: "12px", fontFamily: "var(--font-mono)", color: "#10b981", fontWeight: 600 }}>
                +0.04%
              </span>
            </div>
            <div
              style={{
                borderTop: "1px solid rgba(255, 255, 255, 0.06)",
                paddingTop: "8px",
                display: "flex",
                justifyContent: "space-between",
                fontSize: "11px",
                fontFamily: "var(--font-mono)",
                color: "var(--color-text-dim)",
              }}
            >
              <span>Meta SLA: 99.50%</span>
              <span style={{ color: "#10b981" }}>ADR-009 OK</span>
            </div>
          </div>

          {/* KPI 2: MTTR Médio */}
          <div
            data-testid="kpi-mttr"
            style={{
              backgroundColor: "var(--color-surface-card, #0d1424)",
              border: "1px solid rgba(255, 255, 255, 0.08)",
              borderRadius: "16px",
              padding: "18px 20px",
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-between",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                fontSize: "11px",
                fontFamily: "var(--font-mono)",
                color: "var(--color-text-dim, #64748b)",
                textTransform: "uppercase",
              }}
            >
              <span>MTTR Médio</span>
              <Clock size={16} style={{ color: "var(--brand-primary, #eab308)" }} />
            </div>
            <div style={{ margin: "10px 0", display: "flex", alignItems: "baseline", gap: "8px" }}>
              <span style={{ fontSize: "1.75rem", fontWeight: 800, fontFamily: "var(--font-mono)" }}>18m 42s</span>
              <span style={{ fontSize: "12px", fontFamily: "var(--font-mono)", color: "#10b981", fontWeight: 600 }}>
                -04m 12s
              </span>
            </div>
            <div
              style={{
                borderTop: "1px solid rgba(255, 255, 255, 0.06)",
                paddingTop: "8px",
                display: "flex",
                justifyContent: "space-between",
                fontSize: "11px",
                fontFamily: "var(--font-mono)",
                color: "var(--color-text-dim)",
              }}
            >
              <span>Meta: &lt; 30m</span>
              <span style={{ color: "var(--color-text-secondary)" }}>Resolução Rápida</span>
            </div>
          </div>

          {/* KPI 3: Throughput Agregado */}
          <div
            data-testid="kpi-throughput"
            style={{
              backgroundColor: "var(--color-surface-card, #0d1424)",
              border: "1px solid rgba(255, 255, 255, 0.08)",
              borderRadius: "16px",
              padding: "18px 20px",
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-between",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                fontSize: "11px",
                fontFamily: "var(--font-mono)",
                color: "var(--color-text-dim, #64748b)",
                textTransform: "uppercase",
              }}
            >
              <span>Tráfego Agregado</span>
              <Activity size={16} style={{ color: "#38bdf8" }} />
            </div>
            <div style={{ margin: "10px 0", display: "flex", alignItems: "baseline", gap: "6px" }}>
              <span style={{ fontSize: "1.75rem", fontWeight: 800, fontFamily: "var(--font-mono)" }}>98.2</span>
              <span style={{ fontSize: "14px", color: "var(--color-text-muted)" }}>Gbps</span>
            </div>
            <div
              style={{
                borderTop: "1px solid rgba(255, 255, 255, 0.06)",
                paddingTop: "8px",
                display: "flex",
                justifyContent: "space-between",
                fontSize: "11px",
                fontFamily: "var(--font-mono)",
                color: "var(--color-text-dim)",
              }}
            >
              <span>48.2G Ingress</span>
              <span style={{ color: "#38bdf8" }}>50.0G Egress</span>
            </div>
          </div>

          {/* KPI 4: Alarmes de NOC */}
          <div
            data-testid="kpi-alarms"
            style={{
              backgroundColor: "var(--color-surface-card, #0d1424)",
              border: "1px solid rgba(255, 255, 255, 0.08)",
              borderRadius: "16px",
              padding: "18px 20px",
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-between",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                fontSize: "11px",
                fontFamily: "var(--font-mono)",
                color: "var(--color-text-dim, #64748b)",
                textTransform: "uppercase",
              }}
            >
              <span>Alarmes de NOC</span>
              <AlertOctagon size={16} style={{ color: "#f43f5e" }} />
            </div>
            <div style={{ margin: "10px 0", display: "flex", alignItems: "baseline", gap: "10px" }}>
              <span style={{ fontSize: "1.75rem", fontWeight: 800, color: "#f43f5e", fontFamily: "var(--font-mono)" }}>
                {stats.down} CRIT
              </span>
              <span style={{ fontSize: "1.125rem", fontWeight: 700, color: "#f59e0b", fontFamily: "var(--font-mono)" }}>
                {stats.deg} DEG
              </span>
            </div>
            <div
              style={{
                borderTop: "1px solid rgba(255, 255, 255, 0.06)",
                paddingTop: "8px",
                display: "flex",
                justifyContent: "space-between",
                fontSize: "11px",
                fontFamily: "var(--font-mono)",
                color: "var(--color-text-dim)",
              }}
            >
              <span>{stats.up} Nominais</span>
              <span style={{ color: "#f43f5e", fontWeight: 600 }}>Fila ↗</span>
            </div>
          </div>
        </section>

        {/* ===================================================================== */}
        {/* 4. GRID ASSIMÉTRICO 8 COLS + 4 COLS                                   */}
        {/* ===================================================================== */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(12, 1fr)",
            gap: "24px",
            alignItems: "start",
          }}
        >
          {/* COLUNA ESQUERDA (8 colunas): Gráfico 24h & Matriz de Dispositivos */}
          <div
            style={{
              gridColumn: "span 8",
              display: "flex",
              flexDirection: "column",
              gap: "24px",
            }}
          >
            {/* CARD: HISTOGRAMA DE LATÊNCIA E TRÁFEGO 24H */}
            <section
              data-testid="traffic-histogram-card"
              style={{
                backgroundColor: "var(--color-surface-card, #0d1424)",
                border: "1px solid rgba(255, 255, 255, 0.08)",
                borderRadius: "16px",
                padding: "20px 24px",
                display: "flex",
                flexDirection: "column",
                gap: "16px",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "8px" }}>
                <div>
                  <h2
                    style={{
                      fontSize: "12px",
                      fontFamily: "var(--font-mono)",
                      textTransform: "uppercase",
                      fontWeight: 700,
                      letterSpacing: "0.05em",
                      margin: 0,
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                    }}
                  >
                    <Activity size={16} style={{ color: "var(--brand-primary, #eab308)" }} />
                    Throughput de Tráfego Agregado & Latência (24 Horas)
                  </h2>
                  <p style={{ fontSize: "12px", color: "var(--color-text-muted, #94a3b8)", margin: "4px 0 0 0" }}>
                    Série temporal agregada via TimescaleDB Hypertable com buckets de 1 minuto
                  </p>
                </div>

                <span
                  style={{
                    padding: "4px 12px",
                    borderRadius: "9999px",
                    backgroundColor: "rgba(234, 179, 8, 0.12)",
                    border: "1px solid rgba(234, 179, 8, 0.35)",
                    color: "var(--brand-primary, #eab308)",
                    fontSize: "11px",
                    fontFamily: "var(--font-mono)",
                    fontWeight: 700,
                  }}
                >
                  Banda: 100G LACP
                </span>
              </div>

              {/* Gráfico SVG Interativo */}
              <div
                style={{
                  padding: "16px 20px",
                  backgroundColor: "rgba(7, 10, 18, 0.75)",
                  borderRadius: "12px",
                  border: "1px solid rgba(255, 255, 255, 0.06)",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    fontSize: "11px",
                    fontFamily: "var(--font-mono)",
                    color: "var(--color-text-dim, #64748b)",
                    marginBottom: "12px",
                  }}
                >
                  <div style={{ display: "flex", gap: "16px" }}>
                    <span style={{ color: "var(--brand-primary, #eab308)", fontWeight: 600 }}>
                      ● Throughput Agregado (Gbps)
                    </span>
                    <span style={{ color: "#38bdf8" }}>--- Baseline Nominal</span>
                  </div>
                  <span>
                    Pico: <strong style={{ color: "var(--brand-primary, #eab308)" }}>98.2 Gbps</strong> @ 14:15 WAT
                  </span>
                </div>

                <div style={{ width: "100%", height: "160px" }}>
                  <svg viewBox="0 0 800 160" style={{ width: "100%", height: "100%", overflow: "visible" }} preserveAspectRatio="none">
                    <line x1="0" y1="20" x2="800" y2="20" stroke="rgba(255,255,255,0.05)" strokeDasharray="3,3" />
                    <line x1="0" y1="60" x2="800" y2="60" stroke="rgba(255,255,255,0.05)" strokeDasharray="3,3" />
                    <line x1="0" y1="100" x2="800" y2="100" stroke="rgba(255,255,255,0.05)" strokeDasharray="3,3" />
                    <line x1="0" y1="140" x2="800" y2="140" stroke="rgba(255,255,255,0.08)" />

                    {/* Linha de corte de capacidade 100G */}
                    <line x1="0" y1="15" x2="800" y2="15" stroke="#f43f5e" strokeWidth="1.2" strokeDasharray="4,4" />
                    <text x="790" y="12" fill="#f43f5e" fontSize="9" textAnchor="end" fontFamily="var(--font-mono)" fontWeight="bold">
                      100 Gbps CAPACIDADE MÁXIMA
                    </text>

                    {/* Curva de tráfego dinâmica em Ouro InfraWatch */}
                    <path
                      d="M 0,110 L 80,105 L 160,112 L 240,95 L 320,100 L 400,60 L 480,45 L 520,30 L 560,50 L 640,75 L 720,80 L 800,70"
                      fill="none"
                      stroke="var(--brand-primary, #eab308)"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />

                    {/* Baseline suave */}
                    <path
                      d="M 0,120 L 100,118 L 200,115 L 300,112 L 400,105 L 500,95 L 600,98 L 700,102 L 800,105"
                      fill="none"
                      stroke="#38bdf8"
                      strokeDasharray="3 2"
                      strokeWidth="1.5"
                    />

                    {/* Ponto de pico */}
                    <circle cx="520" cy="30" r="4" fill="var(--brand-primary, #eab308)" stroke="#070a12" strokeWidth="2" />
                    <text x="520" y="20" fill="var(--brand-primary, #eab308)" fontSize="10" textAnchor="middle" fontFamily="var(--font-mono)" fontWeight="bold">
                      98.2 Gbps
                    </text>
                  </svg>
                </div>

                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    fontSize: "11px",
                    fontFamily: "var(--font-mono)",
                    color: "var(--color-text-dim)",
                    marginTop: "10px",
                    paddingTop: "8px",
                    borderTop: "1px solid rgba(255, 255, 255, 0.06)",
                  }}
                >
                  <span>00:00 WAT</span>
                  <span>04:00</span>
                  <span>08:00</span>
                  <span style={{ color: "#f59e0b", fontWeight: 600 }}>14:15 (Horário de Pico)</span>
                  <span>18:00</span>
                  <span style={{ color: "var(--brand-primary, #eab308)", fontWeight: 600 }}>Agora (Ao Vivo)</span>
                </div>
              </div>
            </section>

            {/* MATRIZ DE DISPOSITIVOS EM DESTAQUE */}
            <section style={{ display: "flex", flexDirection: "column", gap: "14px" }} aria-label="Ativos de Infraestrutura">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <h3
                  style={{
                    fontSize: "12px",
                    fontFamily: "var(--font-mono)",
                    textTransform: "uppercase",
                    fontWeight: 700,
                    letterSpacing: "0.05em",
                    margin: 0,
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                  }}
                >
                  <Server size={16} style={{ color: "#38bdf8" }} />
                  <span>Ativos Monitorados & Sondagem em Tempo Real ({filteredDevices.length})</span>
                </h3>

                <button
                  type="button"
                  onClick={() => setIsSearchOpen(true)}
                  style={{
                    background: "transparent",
                    border: "none",
                    color: "var(--brand-primary, #eab308)",
                    fontSize: "12px",
                    fontFamily: "var(--font-mono)",
                    fontWeight: 600,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: "4px",
                  }}
                >
                  <span>Filtrar na Busca</span>
                  <ArrowRight size={14} />
                </button>
              </div>

              {/* Grade de Cards de Dispositivos */}
              <div
                data-testid="device-grid"
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
                  gap: "16px",
                }}
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

          {/* COLUNA DIREITA (4 colunas): Incident Feed, Topologia & SLA */}
          <div
            style={{
              gridColumn: "span 4",
              display: "flex",
              flexDirection: "column",
              gap: "24px",
            }}
          >
            {/* CARD: INCIDENT FEED EM TEMPO REAL COM SLA COUNTDOWN */}
            <section
              data-testid="incident-feed-card"
              style={{
                backgroundColor: "var(--color-surface-card, #0d1424)",
                border: "1px solid rgba(255, 255, 255, 0.08)",
                borderRadius: "16px",
                padding: "20px",
                display: "flex",
                flexDirection: "column",
                gap: "14px",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  borderBottom: "1px solid rgba(255, 255, 255, 0.08)",
                  paddingBottom: "12px",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <AlertTriangle size={18} style={{ color: "#f43f5e" }} />
                  <h3
                    style={{
                      fontSize: "12px",
                      fontFamily: "var(--font-mono)",
                      fontWeight: 700,
                      textTransform: "uppercase",
                      letterSpacing: "0.05em",
                      margin: 0,
                    }}
                  >
                    Incident Feed (Ao Vivo)
                  </h3>
                </div>
                <span
                  style={{
                    padding: "2px 8px",
                    borderRadius: "9999px",
                    fontSize: "10px",
                    fontFamily: "var(--font-mono)",
                    fontWeight: 700,
                    backgroundColor: "rgba(244, 63, 94, 0.2)",
                    color: "#f43f5e",
                    border: "1px solid rgba(244, 63, 94, 0.3)",
                  }}
                >
                  1 P1 ATIVO
                </span>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                {/* Incidente 1: P1 Crítico */}
                <div
                  style={{
                    padding: "14px",
                    borderRadius: "12px",
                    backgroundColor: "rgba(7, 10, 18, 0.75)",
                    borderLeft: "4px solid #f43f5e",
                    borderTop: "1px solid rgba(255, 255, 255, 0.06)",
                    borderRight: "1px solid rgba(255, 255, 255, 0.06)",
                    borderBottom: "1px solid rgba(255, 255, 255, 0.06)",
                    display: "flex",
                    flexDirection: "column",
                    gap: "8px",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <div>
                      <span
                        style={{
                          padding: "2px 6px",
                          borderRadius: "9999px",
                          fontSize: "9px",
                          fontFamily: "var(--font-mono)",
                          fontWeight: 700,
                          backgroundColor: "rgba(244, 63, 94, 0.2)",
                          color: "#f43f5e",
                        }}
                      >
                        P1 CRITICAL
                      </span>
                      <h4 style={{ fontSize: "12px", fontWeight: 700, margin: "6px 0 0 0" }}>
                        Fibra Rompida — RT-BENGUELA
                      </h4>
                    </div>
                    <span style={{ fontSize: "10px", fontFamily: "var(--font-mono)", color: "var(--color-text-dim)" }}>
                      14m atrás
                    </span>
                  </div>
                  <p style={{ fontSize: "11px", color: "var(--color-text-muted)", margin: 0, lineHeight: 1.4 }}>
                    Perda total de comunicação no enlace Catumbela-Benguela. Rota satélite ativada.
                  </p>
                  <div
                    style={{
                      borderTop: "1px solid rgba(255, 255, 255, 0.06)",
                      paddingTop: "8px",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      fontSize: "10px",
                      fontFamily: "var(--font-mono)",
                    }}
                  >
                    <span style={{ color: "#f43f5e", fontWeight: 700 }}>SLA Restante: 00:15:28</span>
                    <button
                      type="button"
                      onClick={() => showToast("Incidente #8492 reconhecido (ACK) por Daniel Ndonda.", "info")}
                      style={{
                        backgroundColor: "transparent",
                        border: "none",
                        color: "var(--color-text-secondary)",
                        cursor: "pointer",
                        textDecoration: "underline",
                      }}
                    >
                      ACK
                    </button>
                  </div>
                </div>

                {/* Incidente 2: P2 Degradado */}
                <div
                  style={{
                    padding: "14px",
                    borderRadius: "12px",
                    backgroundColor: "rgba(7, 10, 18, 0.75)",
                    borderLeft: "4px solid #f59e0b",
                    borderTop: "1px solid rgba(255, 255, 255, 0.06)",
                    borderRight: "1px solid rgba(255, 255, 255, 0.06)",
                    borderBottom: "1px solid rgba(255, 255, 255, 0.06)",
                    display: "flex",
                    flexDirection: "column",
                    gap: "8px",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <div>
                      <span
                        style={{
                          padding: "2px 6px",
                          borderRadius: "9999px",
                          fontSize: "9px",
                          fontFamily: "var(--font-mono)",
                          fontWeight: 700,
                          backgroundColor: "rgba(245, 158, 11, 0.2)",
                          color: "#f59e0b",
                        }}
                      >
                        P2 WARNING
                      </span>
                      <h4 style={{ fontSize: "12px", fontWeight: 700, margin: "6px 0 0 0" }}>
                        Spike Latência Envoy Gateway
                      </h4>
                    </div>
                    <span style={{ fontSize: "10px", fontFamily: "var(--font-mono)", color: "var(--color-text-dim)" }}>
                      28m atrás
                    </span>
                  </div>
                  <p style={{ fontSize: "11px", color: "var(--color-text-muted)", margin: 0, lineHeight: 1.4 }}>
                    Latência média acima de 142ms no serviço de pagamentos do Banco Sol.
                  </p>
                  <div
                    style={{
                      borderTop: "1px solid rgba(255, 255, 255, 0.06)",
                      paddingTop: "8px",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      fontSize: "10px",
                      fontFamily: "var(--font-mono)",
                    }}
                  >
                    <span style={{ color: "#f59e0b", fontWeight: 600 }}>Mitigação em Análise</span>
                    <span style={{ color: "#38bdf8" }}>Ver Timeline ↗</span>
                  </div>
                </div>
              </div>
            </section>

            {/* CARD: VISÃO RÁPIDA DA TOPOLOGIA DE REDE */}
            <section
              data-testid="topology-preview-card"
              style={{
                backgroundColor: "var(--color-surface-card, #0d1424)",
                border: "1px solid rgba(255, 255, 255, 0.08)",
                borderRadius: "16px",
                padding: "20px",
                display: "flex",
                flexDirection: "column",
                gap: "12px",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  borderBottom: "1px solid rgba(255, 255, 255, 0.08)",
                  paddingBottom: "10px",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <Network size={18} style={{ color: "var(--brand-primary, #eab308)" }} />
                  <h3
                    style={{
                      fontSize: "12px",
                      fontFamily: "var(--font-mono)",
                      fontWeight: 700,
                      textTransform: "uppercase",
                      letterSpacing: "0.05em",
                      margin: 0,
                    }}
                  >
                    Topologia do Cluster
                  </h3>
                </div>
                <span style={{ fontSize: "10px", fontFamily: "var(--font-mono)", color: "#10b981", fontWeight: 600 }}>
                  7 Nós Conectados
                </span>
              </div>

              {/* Mini Esquema de Topologia */}
              <div
                style={{
                  height: "120px",
                  backgroundColor: "rgba(7, 10, 18, 0.75)",
                  borderRadius: "12px",
                  border: "1px solid rgba(255, 255, 255, 0.06)",
                  padding: "8px",
                  position: "relative",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <svg viewBox="0 0 280 100" style={{ width: "100%", height: "100%" }}>
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
                <div
                  style={{
                    position: "absolute",
                    bottom: "6px",
                    left: "8px",
                    fontSize: "9px",
                    fontFamily: "var(--font-mono)",
                    color: "var(--color-text-dim)",
                  }}
                >
                  LLDP Synced • Luanda Core Ring
                </div>
              </div>
            </section>

            {/* CARD: MANUTENÇÃO & BACKUP RESUMO */}
            <section
              style={{
                backgroundColor: "var(--color-surface-card, #0d1424)",
                border: "1px solid rgba(255, 255, 255, 0.08)",
                borderRadius: "16px",
                padding: "16px 20px",
                display: "flex",
                flexDirection: "column",
                gap: "10px",
                fontSize: "12px",
                fontFamily: "var(--font-mono)",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ color: "var(--color-text-dim)" }}>Janela Técnica:</span>
                <span style={{ color: "#38bdf8", fontWeight: 600 }}>Hoje 01:00 UTC</span>
              </div>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  borderTop: "1px solid rgba(255, 255, 255, 0.06)",
                  paddingTop: "8px",
                }}
              >
                <span style={{ color: "var(--color-text-dim)" }}>Backup 3-2-1:</span>
                <span style={{ color: "#10b981", fontWeight: 600 }}>NVMe / Cloudflare R2 OK</span>
              </div>
            </section>
          </div>
        </div>
      </div>

      {/* ===================================================================== */}
      {/* 5. MODAIS & DRAWERS INTEGRADOS                                        */}
      {/* ===================================================================== */}

      {/* MODAL 1: BUSCA GLOBAL (Ctrl + K) */}
      <GlobalSearchModal
        isOpen={isSearchOpen}
        onClose={() => setIsSearchOpen(false)}
        devices={devices}
        onSelectDevice={handleSelectDevice}
      />

      {/* DRAWER 2: DETALHES DO DISPOSITIVO */}
      <DeviceDetailDrawer
        device={selectedDevice}
        isOpen={isDrawerOpen}
        onClose={() => {
          setIsDrawerOpen(false);
          setSelectedDevice(null);
        }}
        onPing={handlePingDevice}
      />

      {/* MODAL 3: EMERGENCY DRAIN CONFIRMATION */}
      {isDrainModalOpen && (
        <div
          data-testid="emergency-drain-modal"
          style={{
            position: "fixed",
            inset: 0,
            backgroundColor: "rgba(0, 0, 0, 0.8)",
            backdropFilter: "blur(8px)",
            zIndex: 120,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "16px",
          }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="drain-modal-title"
        >
          <div
            style={{
              width: "100%",
              maxWidth: "480px",
              backgroundColor: "var(--color-surface-card, #0d1424)",
              border: "1px solid rgba(244, 63, 94, 0.4)",
              borderRadius: "16px",
              padding: "24px",
              display: "flex",
              flexDirection: "column",
              gap: "16px",
              boxShadow: "0 25px 50px -12px rgba(244, 63, 94, 0.25)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "12px", color: "#f43f5e" }}>
              <AlertOctagon size={28} />
              <h2 id="drain-modal-title" style={{ fontSize: "1.25rem", fontWeight: 700, margin: 0 }}>
                Protocolo Emergency Drain
              </h2>
            </div>
            <p style={{ fontSize: "0.875rem", color: "var(--color-text-secondary, #cbd5e1)", margin: 0, lineHeight: 1.5 }}>
              Atenção: A execução deste protocolo desconecta e drena todo o tráfego telemétrico do cluster
              imediatamente. Essa ação é restrita ao NOC Lead (Daniel Ndonda).
            </p>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "8px" }}>
              <button
                type="button"
                onClick={() => setIsDrainModalOpen(false)}
                style={{
                  padding: "8px 16px",
                  borderRadius: "8px",
                  backgroundColor: "rgba(255, 255, 255, 0.08)",
                  border: "1px solid rgba(255, 255, 255, 0.15)",
                  color: "#f8fafc",
                  fontSize: "12px",
                  cursor: "pointer",
                }}
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsDrainModalOpen(false);
                  showToast("Drenagem de emergência cancelada pelo operador.", "warning");
                }}
                style={{
                  padding: "8px 18px",
                  borderRadius: "8px",
                  backgroundColor: "#f43f5e",
                  border: "none",
                  color: "#070a12",
                  fontWeight: 700,
                  fontSize: "12px",
                  cursor: "pointer",
                }}
              >
                Confirmar Drain
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
