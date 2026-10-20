import React from "react";
import { Activity } from "lucide-react";

export const NocTrafficChart24h: React.FC = () => {
  return (
    <section
      data-testid="traffic-histogram-card"
      className="bg-[#0d1424] border border-white/10 rounded-2xl p-5 sm:p-6 flex flex-col gap-4 shadow-sm"
    >
      <div className="flex justify-between items-center flex-wrap gap-2">
        <div>
          <h2 className="text-xs font-mono uppercase font-bold tracking-wider m-0 flex items-center gap-2 text-white">
            <Activity size={16} className="text-amber-400" />
            Throughput de Tráfego Agregado &amp; Latência (24 Horas)
          </h2>
          <p className="text-xs text-slate-400 mt-1 mb-0">
            Série temporal agregada via TimescaleDB Hypertable com buckets de 1 minuto
          </p>
        </div>

        <span className="px-3 py-1 rounded-full bg-amber-400/10 border border-amber-400/30 text-amber-400 text-[11px] font-mono font-bold">
          Banda: 100G LACP
        </span>
      </div>

      {/* Gráfico SVG Interativo */}
      <div className="p-4 sm:p-5 bg-[#070a12]/80 rounded-xl border border-white/5">
        <div className="flex justify-between text-[11px] font-mono text-slate-400 mb-3">
          <div className="flex gap-4">
            <span className="text-amber-400 font-semibold">
              ● Throughput Agregado (Gbps)
            </span>
            <span className="text-sky-400">--- Baseline Nominal</span>
          </div>
          <span>
            Pico: <strong className="text-amber-400 font-bold">98.2 Gbps</strong> @ 14:15 WAT
          </span>
        </div>

        <div className="w-full h-40">
          <svg
            viewBox="0 0 800 160"
            className="w-full h-full overflow-visible"
            preserveAspectRatio="none"
          >
            <line x1="0" y1="20" x2="800" y2="20" stroke="rgba(255,255,255,0.05)" strokeDasharray="3,3" />
            <line x1="0" y1="60" x2="800" y2="60" stroke="rgba(255,255,255,0.05)" strokeDasharray="3,3" />
            <line x1="0" y1="100" x2="800" y2="100" stroke="rgba(255,255,255,0.05)" strokeDasharray="3,3" />
            <line x1="0" y1="140" x2="800" y2="140" stroke="rgba(255,255,255,0.08)" />

            {/* Linha de corte de capacidade 100G */}
            <line x1="0" y1="15" x2="800" y2="15" stroke="#f43f5e" strokeWidth="1.2" strokeDasharray="4,4" />
            <text x="790" y="12" fill="#f43f5e" fontSize="9" textAnchor="end" fontFamily="monospace" fontWeight="bold">
              100 Gbps CAPACIDADE MÁXIMA
            </text>

            {/* Curva de tráfego dinâmica em Ouro InfraWatch */}
            <path
              d="M 0,110 L 80,105 L 160,112 L 240,95 L 320,100 L 400,60 L 480,45 L 520,30 L 560,50 L 640,75 L 720,80 L 800,70"
              fill="none"
              stroke="#eab308"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />

            {/* Baseline suave */}
            <path
              d="M 0,120 L 100,118 L 200,115 L 300,112 L 400,105 L 500,95 L 600,98 L 700,102 L 800,105"
              fill="none"
              stroke="#38bdf8"
              strokeDasharray="3 2"
              strokeWidth="1.5"
            />

            {/* Ponto de pico */}
            <circle cx="520" cy="30" r="4" fill="#eab308" stroke="#070a12" strokeWidth="2" />
            <text x="520" y="20" fill="#eab308" fontSize="10" textAnchor="middle" fontFamily="monospace" fontWeight="bold">
              98.2 Gbps
            </text>
          </svg>
        </div>

        <div className="flex justify-between text-[11px] font-mono text-slate-500 mt-2.5 pt-2 border-t border-white/5">
          <span>00:00 WAT</span>
          <span>04:00</span>
          <span>08:00</span>
          <span className="text-amber-400 font-semibold">14:15 (Horário de Pico)</span>
          <span>18:00</span>
          <span className="text-amber-400 font-semibold">Agora (Ao Vivo)</span>
        </div>
      </div>
    </section>
  );
};
