import React, { useState } from "react";
import { IncidentTimelineEvent } from "../../services/incidentsApi";

export interface IncidentTimelineProps {
  events: IncidentTimelineEvent[];
  targetDeviceName?: string;
  targetDeviceIp?: string;
  packetLoss?: string;
  failedProbesCount?: string;
  thresholdTime?: string;
  socketError?: string;
  className?: string;
}

/**
 * Linha do Tempo Visual do Incidente (Incident Timeline) e Diagnóstico de Sondas (Issue #32).
 * Fiel a telas_mockups/14_IncidentDetailDrawer.
 * Rastreia a cronologia de transições: Detecção de falhas ➔ Abertura GLPI ➔ Acknowledge ➔ Resolução.
 */
export const IncidentTimeline: React.FC<IncidentTimelineProps> = ({
  events = [],
  targetDeviceName = "SW-CORE-LUANDA-01",
  targetDeviceIp = "10.200.0.1",
  packetLoss = "100%",
  failedProbesCount = "3/3 falhas",
  thresholdTime = ">3000ms",
  socketError = "Socket errno: 113 (EHOSTUNREACH)",
  className = "",
}) => {
  const [copiedTrace, setCopiedTrace] = useState(false);

  const handleCopyTrace = () => {
    const text = `ICMP Ping to ${targetDeviceIp} (${targetDeviceName}) failed. Destination Host Unreachable. 3 consecutive probes dropped. ${socketError}`;
    navigator.clipboard?.writeText(text);
    setCopiedTrace(true);
    setTimeout(() => setCopiedTrace(false), 2000);
  };

  const getNodeColor = (type: IncidentTimelineEvent["type"]) => {
    switch (type) {
      case "probe_fail":
        return {
          bg: "bg-amber-500/15",
          border: "border-amber-500/30",
          text: "text-amber-400",
          dot: "bg-amber-400",
        };
      case "escalation":
        return {
          bg: "bg-rose-500/15",
          border: "border-rose-500/30",
          text: "text-rose-400",
          dot: "bg-rose-500",
        };
      case "glpi_opened":
        return {
          bg: "bg-sky-500/15",
          border: "border-sky-500/30",
          text: "text-sky-400",
          dot: "bg-sky-400",
        };
      case "acknowledged":
        return {
          bg: "bg-amber-500/15",
          border: "border-amber-500/30",
          text: "text-amber-400",
          dot: "bg-amber-400",
        };
      case "resolved":
        return {
          bg: "bg-emerald-500/15",
          border: "border-emerald-500/30",
          text: "text-emerald-400",
          dot: "bg-emerald-400",
        };
      default:
        return {
          bg: "bg-slate-500/15",
          border: "border-slate-500/30",
          text: "text-slate-400",
          dot: "bg-slate-400",
        };
    }
  };

  return (
    <div className={`space-y-6 ${className}`} data-testid="incident-timeline">
      {/* SEÇÃO 1: DIAGNÓSTICO DA ÚLTIMA SONDA */}
      <section aria-labelledby="heading-diagnostico" className="space-y-2.5">
        <div className="flex items-center justify-between">
          <h3
            id="heading-diagnostico"
            className="text-[11.5px] font-mono font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1.5"
          >
            <span className="material-symbols-outlined text-emerald-400 text-[16px]" aria-hidden="true">
              network_ping
            </span>
            Telemetria da Última Sonda
          </h3>
          <span className="text-[11px] font-mono text-slate-500">ICMP Ping Prober</span>
        </div>

        {/* Card de Métricas */}
        <div className="bg-obsidian-950/80 border border-obsidian-800 rounded-xl p-4 space-y-3">
          <div className="grid grid-cols-3 gap-3">
            {/* Coluna 1: Perda de Pacotes */}
            <div className="space-y-0.5">
              <span className="text-[11px] font-mono text-slate-400 block">Perda de Pacotes</span>
              <span className="text-rose-400 font-mono text-base font-bold tracking-tight block tabular-nums leading-none">
                {packetLoss}
              </span>
              <span className="text-[10.5px] text-rose-300/80 font-mono block">
                {failedProbesCount}
              </span>
            </div>

            {/* Coluna 2: Tempo Limiar */}
            <div className="space-y-0.5">
              <span className="text-[11px] font-mono text-slate-400 block">Tempo Limiar</span>
              <span className="text-amber-400 font-mono text-base font-bold tracking-tight block tabular-nums leading-none">
                {thresholdTime}
              </span>
              <span className="text-[10.5px] text-amber-300/80 font-mono block">RTT Estourado</span>
            </div>

            {/* Coluna 3: IP Alvo */}
            <div className="space-y-0.5">
              <span className="text-[11px] font-mono text-slate-400 block">IP Alvo</span>
              <span className="text-white font-mono text-base font-bold tracking-tight block tabular-nums leading-none truncate">
                {targetDeviceIp}
              </span>
              <span className="text-[10.5px] text-slate-400 font-mono block truncate">
                {targetDeviceName}
              </span>
            </div>
          </div>

          {/* Terminal Error Trace */}
          <div className="border-t border-obsidian-800/80 pt-2.5 font-mono text-[11.5px]">
            <div className="flex items-center justify-between text-slate-400 pb-1 text-[11px]">
              <span className="flex items-center gap-1.5 text-rose-400 font-medium">
                <span className="material-symbols-outlined text-[13px]" aria-hidden="true">
                  terminal
                </span>
                <span>{socketError}</span>
              </span>
              <button
                type="button"
                onClick={handleCopyTrace}
                className="hover:text-white flex items-center gap-1 transition-colors text-slate-400 text-[10.5px] cursor-pointer"
              >
                <span className="material-symbols-outlined text-[13px]" aria-hidden="true">
                  {copiedTrace ? "check" : "content_copy"}
                </span>
                <span>{copiedTrace ? "Copiado!" : "Copiar"}</span>
              </button>
            </div>
            <p className="text-slate-300 leading-relaxed text-xs">
              ICMP ping para {targetDeviceIp} falhou. 3 probes consecutivas sem resposta no nó worker de Luanda.
            </p>
          </div>
        </div>
      </section>

      {/* SEÇÃO 2: HISTÓRICO CRONOLÓGICO OPERACIONAL */}
      <section aria-labelledby="heading-timeline" className="space-y-3">
        <div className="flex items-center justify-between">
          <h3
            id="heading-timeline"
            className="text-[11.5px] font-mono font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1.5"
          >
            <span className="material-symbols-outlined text-emerald-400 text-[16px]" aria-hidden="true">
              history_toggle_off
            </span>
            Histórico Operacional (Timeline)
          </h3>
          <span className="text-[11px] font-mono text-slate-500">
            {events.length} {events.length === 1 ? "evento" : "eventos"}
          </span>
        </div>

        {/* Trilha Vertical Contínua */}
        <div className="relative pl-6 space-y-4 before:content-[''] before:absolute before:left-[11px] before:top-2 before:bottom-2 before:w-[2px] before:bg-obsidian-800">
          {events.map((evt, idx) => {
            const colors = getNodeColor(evt.type);
            return (
              <div
                key={evt.id || idx}
                data-testid={`timeline-event-${evt.id || idx}`}
                className="relative flex items-start gap-3 text-xs"
              >
                {/* Nó Circular */}
                <div
                  className={`w-5 h-5 rounded-full shrink-0 ring-4 ring-obsidian-900 ${colors.bg} ${colors.text} border ${colors.border} flex items-center justify-center mt-0.5 z-10`}
                >
                  <span className={`w-2 h-2 rounded-full ${colors.dot}`} />
                </div>

                {/* Conteúdo do Evento */}
                <div className="flex-1 leading-snug">
                  <div className="flex items-center gap-2 font-mono flex-wrap">
                    <span className={`font-bold text-[11px] ${colors.text}`}>
                      {evt.timestamp}
                    </span>
                    <span className="text-slate-600">•</span>
                    <span className="text-white font-medium">{evt.title}</span>
                    {evt.operator_name && (
                      <>
                        <span className="text-slate-600">•</span>
                        <span className="text-slate-400 text-[11px]">
                          Por: <strong className="text-slate-300">{evt.operator_name}</strong>
                        </span>
                      </>
                    )}
                  </div>
                  <p className="text-slate-400 text-[11.5px] mt-0.5 leading-relaxed">
                    {evt.description}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
};
