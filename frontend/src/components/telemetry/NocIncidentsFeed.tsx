import React from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, ArrowRight } from "lucide-react";

export interface NocIncidentsFeedProps {
  onShowToast?: (text: string, type?: "success" | "warning" | "info") => void;
}

export const NocIncidentsFeed: React.FC<NocIncidentsFeedProps> = ({ onShowToast }) => {
  return (
    <section
      data-testid="incident-feed-card"
      className="bg-obsidian-900 rounded-xl p-5 border border-obsidian-800 flex flex-col gap-4 shadow-sm"
      aria-label="Feed de Incidentes em Tempo Real"
    >
      <div className="flex items-center justify-between border-b border-obsidian-800 pb-3">
        <div className="flex items-center gap-2">
          <AlertTriangle size={18} className="text-rose-400" aria-hidden="true" />
          <h3 className="text-xs font-mono font-bold text-white uppercase tracking-wider m-0">
            Incident Feed (Ao Vivo)
          </h3>
        </div>
        <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-rose-500/20 text-rose-400 border border-rose-500/30 tabular-nums">
          1 P1 ATIVO
        </span>
      </div>

      <div className="space-y-3 font-mono">
        {/* Incidente 1: P1 Crítico Rompimento de Fibra */}
        <div className="p-3 rounded-lg bg-obsidian-950 border-l-2 border-rose-500 border-r border-t border-b border-obsidian-800 flex flex-col gap-2">
          <div className="flex items-start justify-between">
            <div>
              <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-rose-500/20 text-rose-400 border border-rose-500/40">
                P1 CRITICAL
              </span>
              <h4 className="text-xs font-bold text-slate-100 mt-1">
                Fibra Rompida — RT-BENGUELA
              </h4>
            </div>
            <span className="text-[10px] text-slate-400 tabular-nums">14m atrás</span>
          </div>
          <p className="text-[11px] text-slate-400 font-sans leading-relaxed m-0">
            Perda total de comunicação no enlace Catumbela-Benguela. Rota de contingência satélite em espera.
          </p>
          <div className="flex items-center justify-between pt-2 border-t border-obsidian-800/80 text-[10px]">
            <span className="text-rose-400 font-bold">SLA Restante: 00:15:28</span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => onShowToast?.("Incidente #8492 reconhecido por Daniel Ndonda.", "info")}
                className="text-slate-300 hover:text-white underline cursor-pointer"
              >
                ACK
              </button>
              <button
                type="button"
                onClick={() => onShowToast?.("Protocolo de resolução do incidente #8492 iniciado.", "success")}
                className="px-2 py-0.5 rounded bg-emerald-600 hover:bg-emerald-500 text-obsidian-950 font-bold transition-colors cursor-pointer"
              >
                Resolver
              </button>
            </div>
          </div>
        </div>

        {/* Incidente 2: P2 Degradado Latência de API */}
        <div className="p-3 rounded-lg bg-obsidian-950 border-l-2 border-amber-500 border-r border-t border-b border-obsidian-800 flex flex-col gap-2">
          <div className="flex items-start justify-between">
            <div>
              <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-500/20 text-amber-400 border border-amber-500/40">
                P2 WARNING
              </span>
              <h4 className="text-xs font-bold text-slate-100 mt-1">
                Spike Latência Envoy Gateway
              </h4>
            </div>
            <span className="text-[10px] text-slate-400 tabular-nums">28m atrás</span>
          </div>
          <p className="text-[11px] text-slate-400 font-sans leading-relaxed m-0">
            Latência média acima de 142ms no serviço de relatórios SLA do Banco Sol.
          </p>
          <div className="flex items-center justify-between pt-2 border-t border-obsidian-800/80 text-[10px]">
            <span className="text-amber-400 font-semibold">Mitigação em Análise</span>
            <Link to="/incidents" className="text-sky-400 hover:underline">
              Ver Timeline ↗
            </Link>
          </div>
        </div>
      </div>

      <Link
        to="/incidents"
        className="w-full py-2 bg-obsidian-850 hover:bg-obsidian-800 text-slate-300 hover:text-white rounded-lg text-xs font-mono font-medium border border-obsidian-800 transition-colors flex items-center justify-center gap-1.5"
      >
        <span>Abrir Gestão Completa de Incidentes</span>
        <ArrowRight size={14} aria-hidden="true" />
      </Link>
    </section>
  );
};
