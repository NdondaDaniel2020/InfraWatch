import React from "react";
import { Activity } from "lucide-react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceLine,
} from "recharts";

const TRAFFIC_DATA = [
  { time: "00:00", throughput: 32.4, baseline: 30.0, latency: 12.1 },
  { time: "02:00", throughput: 28.1, baseline: 29.0, latency: 11.8 },
  { time: "04:00", throughput: 25.6, baseline: 28.0, latency: 11.5 },
  { time: "06:00", throughput: 45.2, baseline: 35.0, latency: 13.4 },
  { time: "08:00", throughput: 68.7, baseline: 55.0, latency: 16.2 },
  { time: "10:00", throughput: 82.3, baseline: 65.0, latency: 18.0 },
  { time: "12:00", throughput: 91.5, baseline: 75.0, latency: 21.4 },
  { time: "14:15", throughput: 98.2, baseline: 80.0, latency: 24.8 },
  { time: "16:00", throughput: 86.4, baseline: 78.0, latency: 19.5 },
  { time: "18:00", throughput: 74.2, baseline: 70.0, latency: 17.1 },
  { time: "20:00", throughput: 61.9, baseline: 58.0, latency: 15.3 },
  { time: "22:00", throughput: 48.0, baseline: 45.0, latency: 13.9 },
  { time: "Agora", throughput: 54.3, baseline: 42.0, latency: 14.2 },
];

interface CustomTooltipProps {
  active?: boolean;
  payload?: any[];
  label?: string;
}

const CustomTooltip: React.FC<CustomTooltipProps> = ({ active, payload, label }) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    return (
      <div className="bg-obsidian-950/95 border border-white/15 p-2.5 rounded-xl shadow-2xl backdrop-blur-md text-[11px] font-mono space-y-1">
        <p className="text-slate-400 font-bold border-b border-white/10 pb-1">
          {label} (Horário WAT)
        </p>
        <p className="text-amber-400 flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />
          <span>
            Throughput: <strong>{data.throughput} Gbps</strong>
          </span>
        </p>
        <p className="text-sky-400 flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-sky-400 shrink-0" />
          <span>
            Baseline: <strong>{data.baseline} Gbps</strong>
          </span>
        </p>
        <p className="text-emerald-400 flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
          <span>
            Latência Média: <strong>{data.latency} ms</strong>
          </span>
        </p>
      </div>
    );
  }
  return null;
};

export const NocTrafficChart24h: React.FC = () => {
  return (
    <section
      data-testid="traffic-histogram-card"
      className="bg-obsidian-900 border border-white/10 rounded-2xl p-5 sm:p-6 flex flex-col gap-4 shadow-sm"
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

      {/* Gráfico Recharts Interativo de Alta Precisão */}
      <div className="p-4 sm:p-5 bg-obsidian-950/80 rounded-xl border border-white/5">
        <div className="flex justify-between text-[11px] font-mono text-slate-400 mb-3">
          <div className="flex gap-4">
            <span className="text-amber-400 font-semibold flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-amber-400 inline-block" />
              Throughput Agregado (Gbps)
            </span>
            <span className="text-sky-400 flex items-center gap-1.5">
              <span className="w-2.5 h-0.5 bg-sky-400 inline-block" />
              Baseline Nominal
            </span>
          </div>
          <span>
            Pico: <strong className="text-amber-400 font-bold">98.2 Gbps</strong> @ 14:15 WAT
          </span>
        </div>

        <div className="w-full h-44">
          <ResponsiveContainer width="100%" height="100%" minWidth={100} minHeight={160}>
            <AreaChart
              data={TRAFFIC_DATA}
              margin={{ top: 12, right: 12, left: -20, bottom: 0 }}
            >
              <defs>
                <linearGradient id="amberTraffic" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#eab308" stopOpacity={0.35} />
                  <stop offset="95%" stopColor="#eab308" stopOpacity={0.0} />
                </linearGradient>
              </defs>
              <XAxis
                dataKey="time"
                stroke="#475569"
                fontSize={10}
                tickLine={false}
                fontFamily="monospace"
              />
              <YAxis
                stroke="#475569"
                fontSize={10}
                domain={[0, 110]}
                tickLine={false}
                fontFamily="monospace"
              />
              <Tooltip content={<CustomTooltip />} />
              <ReferenceLine
                y={100}
                stroke="#f43f5e"
                strokeDasharray="4 4"
                label={{
                  value: "100G CAPACIDADE MÁXIMA",
                  fill: "#f43f5e",
                  fontSize: 9,
                  position: "top",
                  fontFamily: "monospace",
                  fontWeight: "bold",
                }}
              />
              <Area
                type="monotone"
                dataKey="throughput"
                stroke="#eab308"
                strokeWidth={2.5}
                fillOpacity={1}
                fill="url(#amberTraffic)"
              />
              <Area
                type="monotone"
                dataKey="baseline"
                stroke="#38bdf8"
                strokeWidth={1.5}
                strokeDasharray="3 3"
                fill="none"
              />
            </AreaChart>
          </ResponsiveContainer>
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
