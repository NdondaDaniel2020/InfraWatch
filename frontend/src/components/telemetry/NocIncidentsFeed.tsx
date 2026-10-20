import React from "react";
import { AlertTriangle, Clock } from "lucide-react";

export interface NocIncidentsFeedProps {
  onShowToast?: (text: string, type?: "success" | "warning" | "info") => void;
}

export const NocIncidentsFeed: React.FC<NocIncidentsFeedProps> = ({ onShowToast }) => {
  return (
    <section
      data-testid="incident-feed-card"
      className="bg-[#0d1424] border border-white/10 rounded-2xl p-5 flex flex-col gap-3.5 shadow-sm"
    >
      <div className="flex justify-between items-center border-b border-white/10 pb-3">
        <div className="flex items-center gap-2">
          <AlertTriangle size={18} className="text-rose-500" />
          <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-white m-0">
            Incident Feed (Ao Vivo)
          </h3>
        </div>
        <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-rose-500/20 text-rose-400 border border-rose-500/30">
          1 P1 ATIVO
        </span>
      </div>

      <div className="flex flex-col gap-3">
        {/* Incidente 1: P1 Crítico */}
        <div className="p-3.5 rounded-xl bg-[#070a12]/80 border-l-4 border-l-rose-500 border-y border-r border-white/5 flex flex-col gap-1.5">
          <div className="flex justify-between items-center text-[11px] font-mono">
            <span className="font-bold text-rose-400">P1 • SEV-1 CRITICAL</span>
            <span className="text-slate-400">GLPI #8492</span>
          </div>
          <div className="text-xs font-bold text-white">
            Fibra Rompida — RT-BENGUELA
          </div>
          <p className="text-[11px] text-slate-400 m-0 leading-relaxed">
            Perda total de comunicação no enlace Catumbela-Benguela. Rota satélite ativada.
          </p>
          <div className="flex justify-between items-center text-[10.5px] font-mono text-slate-400 pt-1 border-t border-white/5">
            <span className="flex items-center gap-1 text-rose-300">
              <Clock size={12} /> SLA Restante: 00:15:28
            </span>
            <button
              type="button"
              onClick={() => onShowToast?.("Incidente #8492 reconhecido (ACK) por Daniel Ndonda.", "info")}
              className="text-amber-400 hover:text-amber-300 font-semibold transition-colors"
            >
              ACK
            </button>
          </div>
        </div>

        {/* Incidente 2: P2 Degradado */}
        <div className="p-3.5 rounded-xl bg-[#070a12]/80 border-l-4 border-l-amber-500 border-y border-r border-white/5 flex flex-col gap-1.5">
          <div className="flex justify-between items-center text-[11px] font-mono">
            <span className="font-bold text-amber-400">P2 • HIGH DEGRADED</span>
            <span className="text-slate-400">GLPI #8495</span>
          </div>
          <div className="text-xs font-bold text-white">
            API-GATEWAY-PROD: P95 acima de 140ms
          </div>
          <div className="flex justify-between items-center text-[10.5px] font-mono text-slate-400 pt-1 border-t border-white/5">
            <span className="flex items-center gap-1 text-amber-300">
              <Clock size={12} /> SLA Restante: 01:22:15
            </span>
            <span className="text-slate-300 font-semibold">Equipe Core App</span>
          </div>
        </div>
      </div>
    </section>
  );
};
