import React from "react";
import { Network } from "lucide-react";
import { TV_BACKBONES, TvBackboneLink } from "../../mocks/tvMocks";

export interface TvBackbonesPanelProps {
  backbones?: TvBackboneLink[];
}

export const TvBackbonesPanel: React.FC<TvBackbonesPanelProps> = ({
  backbones = TV_BACKBONES,
}) => {
  return (
    <section
      data-testid="tv-panel-backbones"
      aria-label="Matriz de Latência e Enlaces de Fibra/Rádio"
      className="flex-1 flex flex-col gap-4 overflow-hidden animate-fadeIn"
    >
      {/* Topo do Painel de Enlaces */}
      <div className="bg-[#0e1524] border border-[#1b2640] rounded-xl p-4 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-sky-500/10 border border-sky-500/30 flex items-center justify-center text-sky-400">
            <Network size={22} />
          </div>
          <div>
            <h2 className="text-base font-bold font-mono text-white">
              MATRIZ METROPOLITANA &amp; INTERCONEXÕES TRANSCONTINENTAIS
            </h2>
            <p className="text-xs font-mono text-slate-400">
              6 Enlaces Principais • DWDM, Submarino, SD-WAN e PNI Peering
            </p>
          </div>
        </div>

        <div className="flex items-center gap-4 text-xs font-mono">
          <span className="flex items-center gap-1.5 text-emerald-400">
            <span className="w-2 h-2 rounded-full bg-emerald-400" /> 4 Nominais
          </span>
          <span className="flex items-center gap-1.5 text-amber-400">
            <span className="w-2 h-2 rounded-full bg-amber-400" /> 1 Degradado
          </span>
          <span className="flex items-center gap-1.5 text-rose-400 font-bold">
            <span className="w-2 h-2 rounded-full bg-rose-400 animate-pulse" /> 1 Fora do Ar
          </span>
        </div>
      </div>

      {/* Grid de Cards dos Enlaces de Rede */}
      <div className="flex-1 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 overflow-hidden">
        {backbones.map((link) => {
          const isDown = link.status === "DOWN";
          const isDeg = link.status === "DEGRADED";

          const borderColor = isDown
            ? "border-rose-500/60 ring-1 ring-rose-500/30"
            : isDeg
            ? "border-amber-500/60"
            : "border-[#1b2640]";

          const statusColor = isDown
            ? "text-rose-400"
            : isDeg
            ? "text-amber-400"
            : "text-emerald-400";

          return (
            <article
              key={link.id}
              data-testid={`tv-link-${link.id}`}
              className={`bg-[#0e1524] rounded-xl p-4 border flex flex-col justify-between shadow-sm ${borderColor}`}
            >
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-mono text-slate-400">{link.type}</span>
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold border ${
                      isDown
                        ? "bg-rose-500/20 text-rose-400 border-rose-500/30"
                        : isDeg
                        ? "bg-amber-500/20 text-amber-400 border-amber-500/30"
                        : "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                    }`}
                  >
                    {link.status}
                  </span>
                </div>

                <h3 className="text-base font-bold font-mono text-white mt-1.5">
                  {link.name}
                </h3>
              </div>

              {/* Métricas do Enlace */}
              <div className="my-3 bg-[#080c14] rounded-lg p-3 border border-[#1b2640]/60">
                <div className="flex justify-between items-center text-xs font-mono">
                  <span className="text-slate-400">LATÊNCIA RTT:</span>
                  <strong className={`text-base ${statusColor}`}>{link.rtt}</strong>
                </div>

                <div className="flex justify-between items-center text-xs font-mono mt-1">
                  <span className="text-slate-400">PACKET LOSS:</span>
                  <strong className={`text-sm ${statusColor}`}>
                    {link.packetLoss}
                  </strong>
                </div>

                {/* Barra de Utilização de Capacidade */}
                <div className="mt-2.5">
                  <div className="flex justify-between text-[11px] font-mono text-slate-400 mb-1">
                    <span>Carga: {link.utilization}</span>
                    <span className="text-white font-bold">
                      {link.utilizationPercent}% de {link.capacity}
                    </span>
                  </div>
                  <div className="w-full h-2 bg-[#1b2640] rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${
                        isDown
                          ? "bg-rose-500"
                          : isDeg
                          ? "bg-amber-400"
                          : "bg-gradient-to-r from-emerald-500 to-sky-400"
                      }`}
                      style={{ width: `${link.utilizationPercent}%` }}
                    />
                  </div>
                </div>
              </div>

              <div className="text-[10.5px] font-mono text-slate-400 flex justify-between">
                <span>Probes ICMP + BGP Sync</span>
                <span className={statusColor}>Carrier Grade</span>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
};
