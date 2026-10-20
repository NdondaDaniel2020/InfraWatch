import React from "react";
import { Radio, Activity, Layers } from "lucide-react";
import { TV_DEVICES, TvDeviceItem } from "../../mocks/tvMocks";

export interface TvOverviewPanelProps {
  devices?: TvDeviceItem[];
}

export const TvOverviewPanel: React.FC<TvOverviewPanelProps> = ({
  devices = TV_DEVICES,
}) => {
  return (
    <section
      data-testid="tv-panel-overview"
      aria-label="Visão Geral e Saúde dos Clientes Corporativos"
      className="flex-1 flex flex-col gap-4 overflow-hidden animate-fadeIn"
    >
      {/* Topo: 3 Cards Métricos Superiores (Donut, Espectrograma e Throughput) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 shrink-0">
        {/* Card 1: Trânsito & Backbones Gbps (Donut Hachurado) */}
        <article className="bg-[#0e1524] border border-[#1b2640] rounded-xl p-3.5 flex items-center justify-between gap-4">
          <div className="flex flex-col">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-300">
              <Radio size={16} className="text-purple-400" />
              <span>Trânsito &amp; Backbones (Gbps)</span>
            </div>
            <div className="text-2xl font-extrabold font-mono text-white mt-1 tabular-nums">
              100.3 <span className="text-xs text-slate-400 font-normal">Gbps Total</span>
            </div>
            <div className="text-[11px] font-mono text-emerald-400 mt-0.5">
              ● Luanda-Talatona 53% • WACS 24% • BNA 23%
            </div>
          </div>

          <div className="w-16 h-16 shrink-0 relative">
            <svg viewBox="0 0 36 36" className="w-full h-full transform -rotate-90">
              <circle
                cx="18"
                cy="18"
                r="15.9155"
                fill="none"
                stroke="#2a395e"
                strokeWidth="3.5"
              />
              <circle
                cx="18"
                cy="18"
                r="15.9155"
                fill="none"
                stroke="#c084fc"
                strokeWidth="3.5"
                strokeDasharray="53, 100"
              />
              <circle
                cx="18"
                cy="18"
                r="15.9155"
                fill="none"
                stroke="#ec4899"
                strokeWidth="3.5"
                strokeDasharray="24, 100"
                strokeDashoffset="-53"
              />
            </svg>
          </div>
        </article>

        {/* Card 2: Espectro Óptico & RTT Jitter */}
        <article className="bg-[#0e1524] border border-[#1b2640] rounded-xl p-3.5 flex items-center justify-between gap-4">
          <div className="flex flex-col">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-300">
              <Activity size={16} className="text-pink-400" />
              <span>Espectro Óptico &amp; RTT Jitter</span>
            </div>
            <div className="text-2xl font-extrabold font-mono text-emerald-400 mt-1 tabular-nums">
              61% <span className="text-xs text-slate-400 font-normal">Nominal (&lt; 18ms)</span>
            </div>
            <div className="text-[11px] font-mono text-rose-400 mt-0.5">
              ▲ 28% Spikes &amp; Loss (&gt; 45ms) • 11% Jitter
            </div>
          </div>

          <div className="w-24 h-10 flex items-center">
            <svg viewBox="0 0 100 24" className="w-full h-full text-pink-400">
              <path
                d="M0,12 L15,12 L20,4 L25,20 L30,8 L35,16 L40,12 L55,12 L60,2 L65,22 L70,12 L100,12"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              />
            </svg>
          </div>
        </article>

        {/* Card 3: Throughput & Carga 24h */}
        <article className="bg-[#0e1524] border border-[#1b2640] rounded-xl p-3.5 flex items-center justify-between gap-4">
          <div className="flex flex-col">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-300">
              <Layers size={16} className="text-emerald-400" />
              <span>Throughput &amp; Carga (24h)</span>
            </div>
            <div className="text-2xl font-extrabold font-mono text-white mt-1 tabular-nums">
              99.98% <span className="text-xs text-emerald-400 font-normal">SLA Diário</span>
            </div>
            <div className="text-[11px] font-mono text-slate-400 mt-0.5">
              Pico: 1.2M req/s • Zero Buffer Bloat
            </div>
          </div>

          <div className="flex items-end gap-1.5 h-10">
            <span className="w-2 bg-[#2a395e] h-4 rounded-t" />
            <span className="w-2 bg-emerald-500 h-7 rounded-t" />
            <span className="w-2 bg-[#2a395e] h-5 rounded-t" />
            <span className="w-2 bg-emerald-400 h-9 rounded-t" />
            <span className="w-2 bg-emerald-500 h-10 rounded-t" />
          </div>
        </article>
      </div>

      {/* Grid 4x3 de 12 Dispositivos de Alta Legibilidade */}
      <div className="flex-1 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3.5 overflow-hidden">
        {devices.map((dev) => {
          const isDown = dev.status === "DOWN";
          const isDeg = dev.status === "DEGRADADO";
          const isMaint = dev.status === "MANUTENÇÃO";

          const badgeBg = isDown
            ? "bg-rose-500/20 text-rose-400 border-rose-500/40"
            : isDeg
            ? "bg-amber-500/20 text-amber-400 border-amber-500/40"
            : isMaint
            ? "bg-sky-500/20 text-sky-400 border-sky-500/40"
            : "bg-emerald-500/10 text-emerald-400 border-emerald-500/30";

          const heroColor = isDown
            ? "text-rose-400"
            : isDeg
            ? "text-amber-400"
            : isMaint
            ? "text-sky-400"
            : "text-emerald-400";

          return (
            <article
              key={dev.id}
              data-testid={`tv-device-card-${dev.hostname}`}
              className={`bg-[#0e1524] rounded-xl p-3 border flex flex-col justify-between transition-colors shadow-sm ${
                isDown
                  ? "border-rose-500/60 ring-1 ring-rose-500/30"
                  : "border-[#1b2640]"
              }`}
            >
              {/* Top Row: Tags + Status */}
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 text-[11px] text-slate-400 font-mono truncate">
                  <span className="text-slate-300 font-semibold">{dev.category}</span>
                  <span>•</span>
                  <span className="truncate">{dev.protocol}</span>
                </div>
                <span
                  className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold border shrink-0 ${badgeBg}`}
                >
                  {dev.status}
                </span>
              </div>

              {/* Hostname */}
              <h3 className="text-sm font-bold font-mono text-white tracking-tight mt-1 truncate">
                {dev.hostname}
              </h3>

              {/* Hero Metric */}
              <div className="my-1.5 bg-[#080c14] rounded-lg p-2 border border-[#1b2640]/60">
                <div className="flex items-center justify-between text-[10px] font-mono text-slate-400">
                  <span className="truncate">{dev.metricLabel}</span>
                  <span className={heroColor}>{dev.metricBadge}</span>
                </div>
                <div className="flex items-baseline justify-between mt-1">
                  <span className={`text-2xl font-extrabold font-mono tabular-nums ${heroColor}`}>
                    {dev.rtt}{" "}
                    <span className="text-xs font-normal text-slate-400">
                      {dev.rttUnit}
                    </span>
                  </span>
                  <span className="text-[11px] font-mono text-slate-400">
                    {dev.heroSub}
                  </span>
                </div>
              </div>

              {/* Bottom Metadata */}
              <div className="flex items-center justify-between text-[10.5px] font-mono text-slate-400 pt-1 border-t border-[#1b2640]/50">
                <span className="truncate">{dev.bottomLeft}</span>
                <span className={`shrink-0 ${heroColor}`}>{dev.bottomRight}</span>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
};
