import React from "react";
import {
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  X,
  RefreshCw,
  Activity,
  Layers,
  Radio,
  Clock,
  Server,
} from "lucide-react";
import type { ManualProbeResult } from "../../types/deviceDetail";

interface DeviceDiagnosticCardProps {
  result: ManualProbeResult;
  onDismiss: () => void;
  onReProbe: () => void;
  isProbing: boolean;
}

export const DeviceDiagnosticCard: React.FC<DeviceDiagnosticCardProps> = ({
  result,
  onDismiss,
  onReProbe,
  isProbing,
}) => {
  const isDegraded = result.success && result.packetLossPct > 0;
  const isDown = !result.success || result.packetLossPct === 100;

  const getTheme = () => {
    if (isDown) {
      return {
        bg: "bg-rose-950/20",
        border: "border-rose-500/30",
        text: "text-rose-200",
        badgeBg: "bg-rose-500/20 text-rose-400 border-rose-500/30",
        icon: <AlertCircle className="w-5 h-5 text-rose-400 shrink-0" />,
        statusLabel: "INACESSÍVEL / DOWN",
        statusColor: "text-rose-400",
      };
    }
    if (isDegraded) {
      return {
        bg: "bg-amber-950/20",
        border: "border-amber-500/30",
        text: "text-amber-200",
        badgeBg: "bg-amber-500/20 text-amber-400 border-amber-500/30",
        icon: <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0" />,
        statusLabel: "DEGRADADO / PERDA PARCIAL",
        statusColor: "text-amber-400",
      };
    }
    return {
      bg: "bg-emerald-950/20",
      border: "border-emerald-500/30",
      text: "text-emerald-200",
      badgeBg: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
      icon: <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />,
      statusLabel: "OPERACIONAL / UP",
      statusColor: "text-emerald-400",
    };
  };

  const theme = getTheme();

  return (
    <section
      data-testid="device-diagnostic-card"
      aria-label="Painel de Diagnóstico de Conectividade"
      className={`rounded-xl border p-4.5 sm:p-5 flex flex-col gap-4 font-mono transition-all shadow-lg ${theme.bg} ${theme.border} ${theme.text}`}
    >
      {/* HEADER DO CARD DE DIAGNÓSTICO */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-obsidian-800/80 pb-3">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-obsidian-950 border border-obsidian-800 shadow-inner">
            {theme.icon}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-white tracking-wide">
                Diagnóstico de Conectividade In-Process
              </h3>
              <span className={`text-[11px] px-2 py-0.5 rounded-full font-semibold border ${theme.badgeBg}`}>
                {theme.statusLabel}
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5 flex items-center gap-2">
              <span>Protocolo: <strong className="text-slate-300">{result.protocol || "ICMP"}</strong></span>
              {result.targetIp && (
                <>
                  <span className="text-slate-600">•</span>
                  <span>Alvo: <code className="text-cyan-300 font-bold">{result.targetIp}</code></span>
                </>
              )}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {result.rttMs > 0 && (
            <span className="text-xs px-2.5 py-1 bg-obsidian-950 rounded border border-obsidian-800 font-bold text-emerald-400 shadow-sm">
              RTT {result.rttMs.toFixed(1)} ms
            </span>
          )}
          <button
            type="button"
            onClick={onReProbe}
            disabled={isProbing}
            className="flex items-center gap-1.5 px-2.5 py-1 bg-obsidian-900 hover:bg-obsidian-850 active:bg-obsidian-800 text-slate-200 text-xs rounded border border-obsidian-800 transition-colors cursor-pointer disabled:opacity-50"
            title="Executar novo teste de conectividade"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isProbing ? "animate-spin" : ""}`} />
            <span>Re-testar</span>
          </button>
          <button
            type="button"
            onClick={onDismiss}
            aria-label="Fechar diagnóstico"
            className="p-1 rounded hover:bg-obsidian-800/80 text-slate-400 hover:text-white transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* METRICAS DA SONDA */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
        <div className="bg-obsidian-950/80 p-2.5 rounded-lg border border-obsidian-800 flex flex-col gap-0.5">
          <span className="text-[10px] text-slate-400 uppercase tracking-wider flex items-center gap-1">
            <Radio className="w-3 h-3 text-sky-400" />
            Latência RTT
          </span>
          <span className="text-sm font-bold text-white">
            {result.rttMs > 0 ? `${result.rttMs.toFixed(2)} ms` : "—"}
          </span>
        </div>

        <div className="bg-obsidian-950/80 p-2.5 rounded-lg border border-obsidian-800 flex flex-col gap-0.5">
          <span className="text-[10px] text-slate-400 uppercase tracking-wider flex items-center gap-1">
            <Activity className="w-3 h-3 text-amber-400" />
            Perda de Pacotes
          </span>
          <span className={`text-sm font-bold ${result.packetLossPct === 0 ? "text-emerald-400" : "text-rose-400"}`}>
            {result.packetLossPct.toFixed(1)}%
          </span>
        </div>

        <div className="bg-obsidian-950/80 p-2.5 rounded-lg border border-obsidian-800 flex flex-col gap-0.5">
          <span className="text-[10px] text-slate-400 uppercase tracking-wider flex items-center gap-1">
            <Layers className="w-3 h-3 text-cyan-400" />
            Pacotes (RX/TX)
          </span>
          <span className="text-sm font-bold text-white">
            {result.packetsReceived} / {result.packetsSent}
          </span>
        </div>

        <div className="bg-obsidian-950/80 p-2.5 rounded-lg border border-obsidian-800 flex flex-col gap-0.5">
          <span className="text-[10px] text-slate-400 uppercase tracking-wider flex items-center gap-1">
            <Clock className="w-3 h-3 text-slate-400" />
            Executado em
          </span>
          <span className="text-sm font-bold text-slate-300">
            {new Date(result.timestamp).toLocaleTimeString("pt-BR")}
          </span>
        </div>
      </div>

      {/* MENSAGEM TÉCNICA DE DIAGNÓSTICO */}
      {result.message && (
        <div className="p-3 bg-obsidian-950/90 rounded-lg border border-obsidian-800 text-xs flex items-center justify-between gap-3">
          <span className="text-slate-300 leading-relaxed">{result.message}</span>
        </div>
      )}

      {/* INTEGRAÇÃO ZABBIX SERVER (SE APLICÁVEL) */}
      {result.zabbixStatus && (
        <div className="p-3 bg-obsidian-950 rounded-lg border border-obsidian-800 flex flex-col gap-2 text-xs">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Server className="w-4 h-4 text-rose-400" />
              <span className="font-bold text-white">Zabbix Server (SNMP / Agent Telemetry & JSON-RPC)</span>
            </div>
            <span
              className={`px-2 py-0.5 rounded text-[10px] font-semibold border ${
                result.zabbixStatus.status === "UP"
                  ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30"
                  : "bg-rose-500/20 text-rose-400 border-rose-500/30"
              }`}
            >
              HOSTID #{result.zabbixStatus.hostId} • {result.zabbixStatus.status}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-4 text-slate-400 text-[11px] pt-1 border-t border-obsidian-800/60">
            <span>
              SNMP Status:{" "}
              <strong className={result.zabbixStatus.snmpAvailable ? "text-emerald-400" : "text-slate-500"}>
                {result.zabbixStatus.snmpAvailable ? "DISPONÍVEL" : "NÃO CONFIGURADO"}
              </strong>
            </span>
            <span>
              Agent Status:{" "}
              <strong className={result.zabbixStatus.agentAvailable ? "text-emerald-400" : "text-slate-500"}>
                {result.zabbixStatus.agentAvailable ? "DISPONÍVEL" : "NÃO CONFIGURADO"}
              </strong>
            </span>
            {result.zabbixStatus.message && (
              <span className="text-slate-300 italic">{result.zabbixStatus.message}</span>
            )}
          </div>
        </div>
      )}
    </section>
  );
};
