import React from "react";
import { AlertOctagon, Activity, Clock, ShieldAlert } from "lucide-react";
import { TV_INCIDENTS, TvIncidentItem } from "../../mocks/tvMocks";

export interface TvIncidentsPanelProps {
  incidents?: TvIncidentItem[];
}

export const TvIncidentsPanel: React.FC<TvIncidentsPanelProps> = ({
  incidents = TV_INCIDENTS,
}) => {
  return (
    <section
      data-testid="tv-panel-incidents"
      aria-label="Incidentes Ativos e Chamados GLPI em Andamento"
      className="flex-1 flex flex-col gap-4 overflow-hidden animate-fadeIn"
    >
      {/* Cabeçalho do Painel com KPIs de SLA & Incidentes */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 shrink-0">
        <div className="bg-[#0e1524] border border-rose-500/40 rounded-xl p-4">
          <div className="text-xs font-mono text-rose-400 font-bold flex items-center gap-1.5">
            <AlertOctagon size={16} /> INCIDENTES CRÍTICOS (SEV-1)
          </div>
          <div className="text-4xl font-extrabold font-mono text-rose-400 mt-2 tabular-nums">
            1
          </div>
          <div className="text-xs font-mono text-slate-400 mt-1">
            100% de perda em SW-CORE-LUANDA-01
          </div>
        </div>

        <div className="bg-[#0e1524] border border-amber-500/40 rounded-xl p-4">
          <div className="text-xs font-mono text-amber-400 font-bold flex items-center gap-1.5">
            <Activity size={16} /> DEGRADAÇÃO &amp; LATÊNCIA (SEV-2)
          </div>
          <div className="text-4xl font-extrabold font-mono text-amber-400 mt-2 tabular-nums">
            2
          </div>
          <div className="text-xs font-mono text-slate-400 mt-1">
            Banco Sol API &amp; Sonangol SD-WAN
          </div>
        </div>

        <div className="bg-[#0e1524] border border-[#1b2640] rounded-xl p-4">
          <div className="text-xs font-mono text-slate-300 font-bold flex items-center gap-1.5">
            <Clock size={16} className="text-emerald-400" /> MTTR MÉDIO DO DIA
          </div>
          <div className="text-4xl font-extrabold font-mono text-emerald-400 mt-2 tabular-nums">
            18m
          </div>
          <div className="text-xs font-mono text-slate-400 mt-1">
            Meta SLA: &lt; 60 minutos
          </div>
        </div>

        <div className="bg-[#0e1524] border border-[#1b2640] rounded-xl p-4">
          <div className="text-xs font-mono text-slate-300 font-bold flex items-center gap-1.5">
            <ShieldAlert size={16} className="text-sky-400" /> SLA MENSAL CONTRATUAL
          </div>
          <div className="text-4xl font-extrabold font-mono text-white mt-2 tabular-nums">
            99.88%
          </div>
          <div className="text-xs font-mono text-slate-400 mt-1">
            Disponibilidade Agregada BNA / RCS
          </div>
        </div>
      </div>

      {/* Lista Expandida de Incidentes e Tickets GLPI */}
      <div className="flex-1 bg-[#0e1524] border border-[#1b2640] rounded-xl p-4 overflow-hidden flex flex-col justify-between">
        <div className="flex items-center justify-between pb-3 border-b border-[#1b2640]">
          <h2 className="text-sm font-bold font-mono text-white flex items-center gap-2">
            <AlertOctagon size={18} className="text-rose-500" />
            <span>FILA DE INCIDENTES DISPATCHADOS • GLPI RCS ANGOLA</span>
          </h2>
          <span className="text-xs font-mono text-slate-400">
            Total de chamados ativos: <strong className="text-white">{incidents.length}</strong>
          </span>
        </div>

        <div className="flex-1 flex flex-col gap-3 py-3 overflow-hidden justify-around">
          {incidents.map((inc) => (
            <article
              key={inc.id}
              data-testid={`tv-incident-${inc.id}`}
              className={`p-4 rounded-xl border flex flex-col md:flex-row md:items-center justify-between gap-4 ${
                inc.severity === "CRITICAL"
                  ? "bg-rose-950/30 border-rose-500/50"
                  : "bg-[#080c14] border-[#1b2640]"
              }`}
            >
              <div className="flex items-start gap-3.5 min-w-0">
                <div
                  className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                    inc.severity === "CRITICAL"
                      ? "bg-rose-500/20 text-rose-400 border border-rose-500/40"
                      : "bg-amber-500/20 text-amber-400 border border-amber-500/40"
                  }`}
                >
                  <AlertOctagon size={20} />
                </div>

                <div className="flex flex-col">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-mono font-extrabold ${
                        inc.severity === "CRITICAL"
                          ? "bg-rose-500 text-white"
                          : "bg-amber-500 text-obsidian-950"
                      }`}
                    >
                      {inc.severity}
                    </span>
                    <span className="text-xs font-mono font-bold text-white">
                      {inc.device}
                    </span>
                    <span className="text-xs font-mono text-slate-400">
                      ({inc.ip})
                    </span>
                    <span className="text-slate-400">•</span>
                    <span className="text-xs font-medium text-emerald-400 font-mono">
                      {inc.client}
                    </span>
                  </div>

                  <p className="text-sm font-semibold text-slate-200 mt-1">
                    {inc.title}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-6 shrink-0 font-mono text-xs">
                <div className="flex flex-col text-right">
                  <span className="text-[11px] text-slate-400">SLA RESTANTE</span>
                  <strong
                    className={`text-base font-bold tabular-nums ${
                      inc.severity === "CRITICAL" ? "text-rose-400" : "text-amber-400"
                    }`}
                  >
                    {inc.slaRemaining}
                  </strong>
                </div>

                <div className="flex flex-col text-right">
                  <span className="text-[11px] text-slate-400">CHAMADO GLPI</span>
                  <strong className="text-slate-200">{inc.glpiTicket}</strong>
                </div>

                <div className="flex flex-col text-right">
                  <span className="text-[11px] text-slate-400">RESPONSÁVEL</span>
                  <strong className="text-slate-300">{inc.assignee}</strong>
                </div>

                <span className="px-3 py-1 rounded bg-[#0e1524] border border-[#1b2640] text-emerald-400 text-xs font-bold">
                  {inc.status}
                </span>
              </div>
            </article>
          ))}
        </div>

        <div className="text-[11px] font-mono text-slate-400 pt-2 border-t border-[#1b2640] flex justify-between">
          <span>Roteamento autônomo BGP ativo em todos os ASNs</span>
          <span>Tempo médio de primeira resposta L1: 42 segundos</span>
        </div>
      </div>
    </section>
  );
};
