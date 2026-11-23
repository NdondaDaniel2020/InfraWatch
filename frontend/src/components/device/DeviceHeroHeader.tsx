import React, { useState } from "react";
import { Link } from "react-router-dom";
import { Copy, Edit, Network, Play, Calendar, Server, Database, Box } from "lucide-react";
import { toast } from "sonner";
import type { DeviceDetail } from "../../types/deviceDetail";

interface DeviceHeroHeaderProps {
  device: DeviceDetail;
  onTriggerProbe: () => void;
  isProbing: boolean;
}

export const DeviceHeroHeader: React.FC<DeviceHeroHeaderProps> = ({
  device,
  onTriggerProbe,
  isProbing,
}) => {
  const [copied, setCopied] = useState(false);

  const handleCopyIp = async () => {
    try {
      await navigator.clipboard.writeText(device.ipAddress);
      setCopied(true);
      toast.success("IP copiado para a área de transferência");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Falha ao copiar IP");
    }
  };

  const getStatusConfig = () => {
    switch (device.healthStatus) {
      case "UP":
        return {
          textColor: "text-emerald-400",
          bgColor: "bg-emerald-500/20",
          borderColor: "border-emerald-500/40",
          dotColor: "bg-emerald-400",
          label: "OPERACIONAL / UP",
          pulse: true,
        };
      case "DOWN":
        return {
          textColor: "text-rose-400",
          bgColor: "bg-rose-500/20",
          borderColor: "border-rose-500/40",
          dotColor: "bg-rose-400",
          label: "INDISPONÍVEL / DOWN",
          pulse: true,
        };
      case "DEG":
        return {
          textColor: "text-amber-400",
          bgColor: "bg-amber-500/20",
          borderColor: "border-amber-500/40",
          dotColor: "bg-amber-400",
          label: "DEGRADADO",
          pulse: false,
        };
      case "MAINT":
        return {
          textColor: "text-sky-400",
          bgColor: "bg-sky-500/20",
          borderColor: "border-sky-500/40",
          dotColor: "bg-sky-400",
          label: "EM MANUTENÇÃO",
          pulse: false,
        };
      case "PAUSED":
        return {
          textColor: "text-slate-400",
          bgColor: "bg-obsidian-850",
          borderColor: "border-obsidian-700",
          dotColor: "bg-slate-400",
          label: "PAUSADO",
          pulse: false,
        };
      default:
        return {
          textColor: "text-emerald-400",
          bgColor: "bg-emerald-500/20",
          borderColor: "border-emerald-500/40",
          dotColor: "bg-emerald-400",
          label: String(device.healthStatus || "OPERACIONAL / UP").toUpperCase(),
          pulse: false,
        };
    }
  };

  const statusConfig = getStatusConfig();

  const renderCategoryIcon = () => {
    switch (device.category?.toUpperCase()) {
      case "SWITCH":
      case "ROUTER":
      case "NETWORK":
        return <Network className="w-5 h-5 text-emerald-400" aria-hidden="true" />;
      case "DATABASE":
        return <Database className="w-5 h-5 text-emerald-400" aria-hidden="true" />;
      case "CONTAINER":
        return <Box className="w-5 h-5 text-emerald-400" aria-hidden="true" />;
      default:
        return <Server className="w-5 h-5 text-emerald-400" aria-hidden="true" />;
    }
  };

  return (
    <section
      className="bg-obsidian-900 rounded-xl p-5 sm:p-6 border border-obsidian-800 relative overflow-hidden shadow-sm"
      aria-label="Identificação do Ativo"
    >
      <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6">
        {/* Metadados de Identidade */}
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center shrink-0">
              {renderCategoryIcon()}
            </div>
            <h1 className="text-xl font-bold font-mono text-white tracking-tight">
              {device.name}
            </h1>
            <span className="px-2.5 py-1 rounded bg-obsidian-850 text-slate-300 text-xs font-mono border border-obsidian-800">
              {device.vendor} {device.model}
            </span>
            <span
              className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full ${statusConfig.bgColor} border ${statusConfig.borderColor} ${statusConfig.textColor} text-xs font-mono font-bold`}
            >
              <span
                data-testid="badge-dot"
                className={`w-2 h-2 rounded-full ${statusConfig.dotColor} ${
                  statusConfig.pulse ? "animate-pulse" : ""
                }`}
              />
              <span>{statusConfig.label}</span>
            </span>
          </div>

          {/* Chips de Metadados */}
          <div className="flex flex-wrap items-center gap-2.5 text-xs font-mono text-slate-300 pt-1 tabular-nums">
            <div className="flex items-center gap-1.5 bg-obsidian-950 px-2.5 py-1 rounded border border-obsidian-800">
              <span className="text-slate-400 uppercase text-[11px]">IPv4:</span>
              <span className="text-emerald-400 font-semibold">{device.ipAddress}</span>
              <button
                type="button"
                onClick={handleCopyIp}
                aria-label={copied ? "IP copiado" : "Copiar endereço IP"}
                title={copied ? "Copiado!" : "Copiar endereço IP"}
                className="text-slate-400 hover:text-white transition-colors cursor-pointer ml-1 p-0.5"
              >
                <Copy className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="flex items-center gap-1.5 bg-obsidian-950 px-2.5 py-1 rounded border border-obsidian-800">
              <span className="text-slate-400 uppercase text-[11px]">MAC:</span>
              <span className="text-slate-200">{device.macAddress}</span>
            </div>

            <div className="flex items-center gap-1.5 bg-obsidian-950 px-2.5 py-1 rounded border border-obsidian-800">
              <span className="text-slate-400 uppercase text-[11px]">FIRMWARE:</span>
              <span className="text-slate-200">{device.firmwareVersion}</span>
            </div>

            <div className="flex items-center gap-1.5 bg-obsidian-950 px-2.5 py-1 rounded border border-obsidian-800">
              <span className="text-slate-400 uppercase text-[11px]">UPTIME:</span>
              <span className="text-emerald-400 font-medium">{device.uptimeDisplay}</span>
            </div>

            <div className="flex items-center gap-1.5 bg-obsidian-950 px-2.5 py-1 rounded border border-obsidian-800">
              <span className="text-slate-400 uppercase text-[11px]">LOCAL:</span>
              <span className="text-slate-200">
                {device.location} • {device.rack}
              </span>
            </div>
          </div>
        </div>

        {/* Ações Imediatas */}
        <div className="flex flex-wrap items-center gap-2.5 shrink-0 w-full lg:w-auto">
          <button
            id="btn-manual-probe"
            type="button"
            onClick={onTriggerProbe}
            disabled={isProbing}
            className="flex items-center gap-2 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-obsidian-950 font-bold text-xs rounded-lg transition-colors focus-visible:ring-2 focus-visible:ring-emerald-400 cursor-pointer shadow-sm disabled:opacity-50"
          >
            <Play className={`w-4 h-4 fill-current ${isProbing ? "animate-spin" : ""}`} />
            <span>{isProbing ? "Disparando..." : "Disparar Ping / ICMP"}</span>
          </button>

          <Link
            to={`/devices/${device.id}/edit`}
            className="flex items-center gap-1.5 px-3 py-2 bg-obsidian-850 hover:bg-obsidian-800 text-slate-200 text-xs font-semibold rounded-lg border border-obsidian-800 transition-colors"
          >
            <Edit className="w-4 h-4 text-slate-400" />
            <span>Editar Ativo</span>
          </Link>

          <Link
            to="/maintenance"
            className="flex items-center gap-1.5 px-3 py-2 bg-obsidian-850 hover:bg-obsidian-800 text-slate-200 text-xs font-semibold rounded-lg border border-obsidian-800 transition-colors"
          >
            <Calendar className="w-4 h-4 text-slate-400" />
            <span>Janela Técnica</span>
          </Link>

          <Link
            to="/topology"
            className="flex items-center gap-1.5 px-3 py-2 bg-obsidian-850 hover:bg-obsidian-800 text-slate-200 text-xs font-semibold rounded-lg border border-obsidian-800 transition-colors"
          >
            <Network className="w-4 h-4 text-emerald-400" />
            <span>Ver no Grafo</span>
          </Link>
        </div>
      </div>
    </section>
  );
};
