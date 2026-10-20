import React from "react";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import type { ClientServiceItem } from "../../mocks/clientPortalMocks";

export interface SanitizedServicesGridProps {
  services: ClientServiceItem[];
}

export const SanitizedServicesGrid: React.FC<SanitizedServicesGridProps> = ({ services }) => {
  return (
    <section
      data-testid="sanitized-services-grid"
      aria-label="Saúde dos Serviços Críticos Contratados"
      className="flex flex-col gap-4"
    >
      <div className="flex items-center justify-between pb-2 border-b border-white/10 flex-wrap gap-2">
        <div>
          <h3 className="text-base font-bold text-white flex items-center gap-2.5 m-0">
            <span>Saúde dos Serviços Críticos Contratados</span>
            <span className="px-2.5 py-0.5 text-xs font-mono rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
              {services.filter((s) => s.status === "UP").length}/{services.length} Operacionais
            </span>
          </h3>
          <p className="text-xs text-slate-400 mt-0.5 mb-0">
            Visão consolidada para acompanhamento executivo e auditoria contratual.
          </p>
        </div>
      </div>

      {/* Grid 2x2 de Serviços */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {services.map((svc) => {
          const isUp = svc.status === "UP";
          const isDeg = svc.status === "DEG";

          return (
            <article
              key={svc.id}
              data-testid={`service-card-${svc.id}`}
              className={`p-5 rounded-2xl bg-[#0d1424] border flex flex-col justify-between transition-colors shadow-sm ${
                isDeg ? "border-amber-500/30 hover:border-amber-500/50" : "border-white/10 hover:border-white/20"
              }`}
            >
              <div>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <span className="text-[11px] font-mono text-slate-400 block">{svc.category}</span>
                    <h4 className="text-base font-bold text-white mt-0.5 m-0">{svc.name}</h4>
                  </div>
                  <span
                    className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-mono font-medium ${
                      isUp
                        ? "bg-emerald-500/10 border border-emerald-500/20 text-emerald-400"
                        : "bg-amber-500/10 border border-amber-500/20 text-amber-400"
                    }`}
                  >
                    {isUp ? <CheckCircle2 size={12} /> : <AlertTriangle size={12} />}
                    <span>{svc.statusLabel}</span>
                  </span>
                </div>

                {/* Métricas Rápidas */}
                <div className="grid grid-cols-2 gap-3 my-4">
                  <div>
                    <span className="text-[11px] font-mono text-slate-400 block">Tempo de Resposta</span>
                    <span
                      className={`text-sm font-mono font-bold tabular-nums mt-0.5 block ${
                        isDeg ? "text-amber-400" : "text-emerald-400"
                      }`}
                    >
                      {svc.responseTimeMs} ms {isDeg ? "(Alerta)" : "(Normal)"}
                    </span>
                  </div>
                  <div>
                    <span className="text-[11px] font-mono text-slate-400 block">Vazão / Capacidade</span>
                    <span className="text-sm font-mono font-bold text-white tabular-nums mt-0.5 block">
                      {svc.throughputFormatted}
                    </span>
                  </div>
                </div>

                {/* Alerta de Degradação (se houver) */}
                {svc.advisoryAlert && (
                  <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-300 leading-relaxed mb-3">
                    {svc.advisoryAlert}
                  </div>
                )}

                {/* Tags de Recursos */}
                <div className="flex flex-wrap gap-1.5 mb-3">
                  {svc.tags.map((tag) => (
                    <span
                      key={tag}
                      className="px-2 py-0.5 rounded-lg bg-white/5 border border-white/5 text-[11px] font-mono text-slate-300"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>

              {/* Barra de Estabilidade 30 Dias */}
              <div className="pt-3 border-t border-white/5">
                <div className="flex items-center justify-between text-xs font-mono text-slate-400 mb-1.5">
                  <span>Estabilidade 30 dias</span>
                  <span
                    className={`font-semibold tabular-nums ${
                      isDeg ? "text-amber-400" : "text-emerald-400"
                    }`}
                  >
                    {svc.stability30DaysPct.toFixed(1)}% Nominal
                  </span>
                </div>
                <div className="h-1.5 w-full bg-[#080c14] rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${
                      isDeg ? "bg-amber-400" : "bg-emerald-400"
                    }`}
                    style={{ width: `${Math.min(svc.stability30DaysPct, 100)}%` }}
                  />
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
};
