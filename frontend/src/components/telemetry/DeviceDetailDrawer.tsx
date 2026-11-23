import React, { useEffect, useMemo } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ExternalLink, RefreshCw, Wrench, X } from "lucide-react";
import type { MonitoredDevice } from "../../types/telemetry";
import { apiClient } from "../../services/apiClient";
import { deviceDetailApi } from "../../services/deviceDetailApi";
import { Sparkline } from "./Sparkline";
import { UptimeHistory90d } from "./UptimeHistory90d";
import { getNormalizedStatus, STATUS_TOKENS } from "./statusConfig";
import { StatusBadge } from "../common/StatusBadge";

export interface DeviceDetailDrawerProps {
  device: MonitoredDevice | null;
  isOpen: boolean;
  onClose: () => void;
  onPing?: (device: MonitoredDevice) => void;
  isPinging?: boolean;
  onMaintenance?: (device: MonitoredDevice) => void;
  isMaintenanceLoading?: boolean;
}

export const DeviceDetailDrawer: React.FC<DeviceDetailDrawerProps> = ({
  device,
  isOpen,
  onClose,
  onPing,
  isPinging = false,
  onMaintenance,
  isMaintenanceLoading = false,
}) => {
  // Fecha a gaveta com ESC
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  // Consulta SLA contratual e disponibilidade diária real do ativo
  const { data: deviceSla } = useQuery({
    queryKey: ["device-sla-drawer", device?.device_id],
    queryFn: async () => {
      try {
        if (!device?.device_id || device.device_id.startsWith("dev-mock")) return null;
        return await apiClient.get<any>(`/api/v1/sla/devices/${device.device_id}`);
      } catch {
        return null;
      }
    },
    enabled: Boolean(isOpen && device?.device_id),
    staleTime: 60000,
  });

  // Consulta série temporal real agregada de telemetria (TimescaleDB)
  const { data: timescaleMetrics } = useQuery({
    queryKey: ["device-timescale-metrics-drawer", device?.device_id],
    queryFn: async () => {
      try {
        if (!device?.device_id || device.device_id.startsWith("dev-mock")) return null;
        return await deviceDetailApi.getTimescaleMetrics(device.device_id, "24h");
      } catch {
        return null;
      }
    },
    enabled: Boolean(isOpen && device?.device_id),
    staleTime: 30000,
  });

  // Consulta interfaces ópticas e ethernet cadastradas no ativo
  const { data: deviceInterfaces } = useQuery({
    queryKey: ["device-interfaces-drawer", device?.device_id],
    queryFn: async () => {
      try {
        if (!device?.device_id || device.device_id.startsWith("dev-mock")) return null;
        return await deviceDetailApi.getDeviceInterfaces(device.device_id);
      } catch {
        return null;
      }
    },
    enabled: Boolean(isOpen && device?.device_id),
    staleTime: 60000,
  });

  // Disponibilidade calculada a partir de dados reais
  const availabilityDisplay = useMemo(() => {
    if (device?.availability_90d && device.availability_90d.length > 0) {
      const avg =
        device.availability_90d.reduce((acc, curr) => acc + curr.uptime_pct, 0) /
        device.availability_90d.length;
      return `${avg.toFixed(2)}%`;
    }
    if (deviceSla && typeof deviceSla.availability_pct === "number") {
      return `${Number(deviceSla.availability_pct).toFixed(2)}%`;
    }
    if (device?.status === "UP") return "100.00%";
    if (device?.status === "DOWN") return "0.00%";
    return "--";
  }, [device, deviceSla]);

  // Série temporal para renderização do Sparkline (TimescaleDB / SSE)
  const latencyPoints = useMemo(() => {
    if (timescaleMetrics?.buckets && timescaleMetrics.buckets.length > 0) {
      return timescaleMetrics.buckets.map((b) => Number(b.rttP95Ms) || 0);
    }
    if (device?.recent_latency && device.recent_latency.length > 0) {
      return device.recent_latency;
    }
    if (device?.last_latency_ms != null && device.last_latency_ms > 0) {
      return [device.last_latency_ms];
    }
    return [];
  }, [timescaleMetrics, device]);

  // Resumo dinâmico de portas / interfaces
  const interfacesSummary = useMemo(() => {
    if (device?.ports_summary) return device.ports_summary;
    if (deviceInterfaces && Array.isArray(deviceInterfaces) && deviceInterfaces.length > 0) {
      const upCount = deviceInterfaces.filter(
        (i) => i.status === "UP"
      ).length;
      const speedLabel = deviceInterfaces[0]?.speed || "Eth";
      return `${upCount}/${deviceInterfaces.length} UP (${speedLabel})`;
    }
    if (device?.category === "SWITCH" || device?.category === "ROUTER") {
      return "Portas LACP Conectadas";
    }
    return "1x GbE Ethernet";
  }, [device, deviceInterfaces]);

  if (!isOpen || !device) return null;

  const statusKey = getNormalizedStatus(device.status, device.severity);
  const statusToken = STATUS_TOKENS[statusKey];
  const isDown = statusKey === "DOWN";
  const isMaint = statusKey === "MAINT" || device.status === "MAINT";

  return (
    <div
      data-testid="device-detail-drawer-backdrop"
      className="fixed inset-0 bg-obsidian-950/80 backdrop-blur-sm z-[100] flex justify-end animate-fadeIn"
      role="dialog"
      aria-modal="true"
      aria-labelledby="drawer-device-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <aside
        data-testid="device-detail-drawer-content"
        className="w-full max-w-xl h-full bg-obsidian-900 border-l border-obsidian-800 shadow-2xl flex flex-col justify-between overflow-y-auto"
      >
        {/* Header do Drawer */}
        <div className="p-5 border-b border-obsidian-800 flex justify-between items-start gap-4">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[11px] font-mono font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 px-2 py-0.5 rounded-full">
                {device.category || "DISPOSITIVO"}
              </span>

              <StatusBadge status={device.status} severity={device.severity} />
            </div>

            <h2 id="drawer-device-title" className="text-lg font-bold font-mono text-white mt-2 mb-0.5">
              <Link
                to={`/devices/${device.device_id}`}
                className="hover:text-emerald-400 hover:underline transition-colors"
                title="Abrir página de detalhes do ativo"
              >
                {device.name}
              </Link>
            </h2>
            <p className="text-xs text-slate-400 m-0">
              {device.model_description || `${device.category} (${device.protocol})`} • {device.location || device.tenant_name || "Cluster Central"}
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar gaveta de detalhes"
            className="p-1.5 rounded-lg bg-obsidian-850 hover:bg-obsidian-800 border border-obsidian-700 text-slate-400 hover:text-white transition-colors cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* Corpo com Informações Detalhadas */}
        <div className="p-5 flex flex-col gap-5 flex-1">
          {/* Métricas Principais */}
          <div className="grid grid-cols-3 gap-3">
            <div className="p-3 rounded-xl bg-obsidian-950 border border-obsidian-800/80">
              <div className="text-[10px] font-mono text-slate-400">LATÊNCIA RTT</div>
              <div
                className={`text-lg font-mono font-bold mt-1 ${isDown ? "text-rose-400" : statusToken.textColor}`}
              >
                {isDown
                  ? "--"
                  : device.last_latency_ms != null && !isNaN(Number(device.last_latency_ms))
                    ? `${Number(device.last_latency_ms).toFixed(1)}ms`
                    : "--"}
              </div>
            </div>

            <div className="p-3 rounded-xl bg-obsidian-950 border border-obsidian-800/80">
              <div className="text-[10px] font-mono text-slate-400">PERDA PACOTES</div>
              <div
                className={`text-lg font-mono font-bold mt-1 ${
                  isDown ? "text-rose-400" : "text-emerald-400"
                }`}
              >
                {isDown ? "100%" : `${device.last_packet_loss ?? 0}%`}
              </div>
            </div>

            <div className="p-3 rounded-xl bg-obsidian-950 border border-obsidian-800/80">
              <div className="text-[10px] font-mono text-slate-400">DISPONIBILIDADE</div>
              <div className="text-lg font-mono font-bold mt-1 text-emerald-400">
                {availabilityDisplay}
              </div>
            </div>
          </div>

          {/* Sparkline de Tendência RTT */}
          <div className="p-4 rounded-xl bg-obsidian-950 border border-obsidian-800/80">
            <div className="flex justify-between items-center text-xs font-mono text-slate-400 mb-2.5">
              <span>Série Temporal de Latência (60 minutos)</span>
              <span className="text-emerald-400 font-semibold">TimescaleDB Sincronizado</span>
            </div>
            {latencyPoints.length > 0 ? (
              <Sparkline
                data={latencyPoints}
                width={520}
                height={50}
                severity={device.severity}
              />
            ) : (
              <div className="text-center py-4 text-xs font-mono text-slate-500">
                Aguardando coleta contínua de telemetria...
              </div>
            )}
          </div>

          {/* Histórico de Disponibilidade 90 Dias */}
          <div className="p-4 rounded-xl bg-obsidian-950 border border-obsidian-800/80">
            <div className="text-xs font-mono text-slate-400 mb-2">
              Histórico de Disponibilidade Operacional
            </div>
            <UptimeHistory90d
              days={device.availability_90d}
              barCount={30}
              overallUptime={
                device.availability_90d && device.availability_90d.length > 0
                  ? Number((device.availability_90d.reduce((acc, curr) => acc + curr.uptime_pct, 0) / device.availability_90d.length).toFixed(2))
                  : undefined
              }
            />
          </div>

          {/* Ficha Técnica de Conectividade */}
          <div className="p-4 rounded-xl bg-obsidian-950 border border-obsidian-800/80 text-xs font-mono flex flex-col gap-2">
            <div className="flex justify-between">
              <span className="text-slate-400">Endereço IP:</span>
              <span className="text-white font-semibold">{device.ip_address}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Porta / Protocolo:</span>
              <span className="text-white font-semibold">
                {device.port != null ? device.port : "--"} / {device.protocol || "ICMP"}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Organização / Tenant:</span>
              <span className="text-emerald-400 font-semibold">
                {device.tenant_name || "--"}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Interfaces SFP+:</span>
              <span className="text-sky-400 font-semibold">
                {interfacesSummary}
              </span>
            </div>
          </div>
        </div>

        {/* Rodapé com Ações Operacionais */}
        <div className="p-5 border-t border-obsidian-800 bg-obsidian-950/90 flex justify-between items-center gap-3">
          <div className="flex gap-2">
            {onPing && (
              <button
                type="button"
                disabled={isPinging}
                onClick={() => onPing(device)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 text-xs font-mono font-semibold transition-colors cursor-pointer disabled:opacity-50"
              >
                <RefreshCw size={14} className={isPinging ? "animate-spin" : ""} />
                <span>{isPinging ? "Sondando..." : "Ping Teste"}</span>
              </button>
            )}

            <Link
              to={`/devices/${device.device_id}`}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-sky-500/10 hover:bg-sky-500/20 border border-sky-500/30 text-sky-400 text-xs font-mono font-semibold transition-colors"
              title="Acessar telemetria 360° e sondas do ativo"
            >
              <ExternalLink size={14} />
              <span>Visão 360°</span>
            </Link>

            {onMaintenance && (
              <button
                type="button"
                disabled={isMaintenanceLoading}
                onClick={() => onMaintenance(device)}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg border text-xs font-mono font-medium transition-colors cursor-pointer ${
                  isMaint
                    ? "bg-amber-500/20 text-amber-300 border-amber-500/50 hover:bg-amber-500/30"
                    : "bg-obsidian-850 hover:bg-obsidian-800 border-obsidian-700 text-slate-300 hover:text-white"
                } disabled:opacity-50`}
              >
                <Wrench size={14} className={isMaint ? "text-amber-400" : ""} />
                <span>
                  {isMaintenanceLoading
                    ? "Processando..."
                    : isMaint
                      ? "Sair da Manutenção"
                      : "Manutenção"}
                </span>
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-obsidian-850 hover:bg-obsidian-800 border border-obsidian-700 text-slate-200 text-xs font-semibold transition-colors cursor-pointer"
          >
            Fechar
          </button>
        </div>
      </aside>
    </div>
  );
};
