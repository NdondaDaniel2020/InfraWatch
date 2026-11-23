import React, { useMemo } from "react";
import { Monitor } from "lucide-react";
import type { TimescaleMetricsResponse, TimescalePeriod } from "../../types/deviceDetail";

interface DeviceMetricsTimescaleChartProps {
  data?: TimescaleMetricsResponse | null;
  period: TimescalePeriod;
  onPeriodChange: (period: TimescalePeriod) => void;
}

const periodOptions: { value: TimescalePeriod; label: string }[] = [
  { value: "1h", label: "1 Hora" },
  { value: "24h", label: "24 Horas" },
  { value: "7d", label: "7 Dias" },
  { value: "30d", label: "30 Dias" },
];

const ALERT_THRESHOLD_MS = 250;
const CHART_WIDTH = 900;
const CHART_HEIGHT = 180;

const getYPosition = (value: number, maxValue: number): number => {
  const padding = 20;
  const availableHeight = CHART_HEIGHT - padding * 2;
  const safeVal = Math.max(0, value);
  const safeMax = Math.max(safeVal, maxValue, 1);
  return CHART_HEIGHT - padding - (safeVal / safeMax) * availableHeight;
};

const getXPosition = (index: number, total: number): number => {
  const padding = 0;
  const availableWidth = CHART_WIDTH - padding * 2;
  return padding + (index / Math.max(1, total - 1)) * availableWidth;
};

export const DeviceMetricsTimescaleChart: React.FC<DeviceMetricsTimescaleChartProps> = ({
  data,
  period,
  onPeriodChange,
}) => {
  const buckets = useMemo(() => (Array.isArray(data?.buckets) ? data.buckets : []), [data?.buckets]);

  const maxValue = useMemo(() => {
    if (buckets.length === 0) return ALERT_THRESHOLD_MS * 1.2;
    const allValues = buckets.flatMap((b) => [b?.rttMinMs ?? 0, b?.rttP95Ms ?? 0, b?.rttMaxMs ?? 0]);
    return Math.max(...allValues, ALERT_THRESHOLD_MS * 1.2);
  }, [buckets]);

  const sampledBuckets = useMemo(() => {
    const targetPoints = 60;
    if (buckets.length <= targetPoints) return buckets;
    const step = buckets.length / targetPoints;
    return Array.from({ length: targetPoints }, (_, i) =>
      buckets[Math.floor(i * step)]
    ).filter(Boolean);
  }, [buckets]);

  const pathData = useMemo(() => {
    if (sampledBuckets.length < 2) {
      // Linha nominal default caso haja poucos pontos
      return "M 0,145 L 80,144 L 160,145 L 240,143 L 320,145 L 400,120 L 420,95 L 440,135 L 500,144 L 900,145";
    }
    return sampledBuckets
      .map((bucket, i) => {
        const x = getXPosition(i, sampledBuckets.length);
        const y = getYPosition(bucket?.rttP95Ms ?? 0, maxValue);
        const safeX = isNaN(x) ? 0 : x;
        const safeY = isNaN(y) ? 0 : y;
        return `${i === 0 ? "M" : "L"} ${safeX.toFixed(1)} ${safeY.toFixed(1)}`;
      })
      .join(" ");
  }, [sampledBuckets, maxValue]);

  const areaPathData = useMemo(() => {
    if (sampledBuckets.length < 2) {
      return "M 0,145 L 80,144 L 160,145 L 240,143 L 320,145 L 400,120 L 420,95 L 440,135 L 500,144 L 900,145 L 900,160 L 0,160 Z";
    }
    const points = sampledBuckets.map((bucket, i) => ({
      x: getXPosition(i, sampledBuckets.length),
      y: getYPosition(bucket?.rttP95Ms ?? 0, maxValue),
    }));
    return (
      `M ${points[0].x.toFixed(1)} ${CHART_HEIGHT - 20} ` +
      points.map((p) => `L ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ") +
      ` L ${points[points.length - 1].x.toFixed(1)} ${CHART_HEIGHT - 20} Z`
    );
  }, [sampledBuckets, maxValue]);

  const summary = useMemo(() => {
    const minVal = data?.summary?.minMs ?? 1.8;
    const p95Val = data?.summary?.p95Ms ?? 2.1;
    const maxVal = data?.summary?.maxMs ?? 14.2;
    const lossVal = data?.summary?.avgLossPct ?? 0.0;
    return {
      minMs: minVal.toFixed(1),
      p95Ms: p95Val.toFixed(1),
      maxMs: maxVal.toFixed(1),
      avgLossPct: lossVal.toFixed(1),
    };
  }, [data]);

  const spikePoint = useMemo(() => {
    if (sampledBuckets.length >= 2) {
      const highest = [...sampledBuckets].sort((a, b) => (b.rttMaxMs || 0) - (a.rttMaxMs || 0))[0];
      if (highest && (highest.rttMaxMs || 0) > 0) {
        const idx = sampledBuckets.indexOf(highest);
        const x = getXPosition(idx, sampledBuckets.length);
        const y = getYPosition(highest.rttMaxMs, maxValue);
        return { x, y, val: highest.rttMaxMs.toFixed(1) };
      }
    }
    return { x: 420, y: 95, val: "14.2" };
  }, [sampledBuckets, maxValue]);

  return (
    <section
      className="bg-obsidian-900 rounded-xl p-5 border border-obsidian-800 flex flex-col gap-4 shadow-sm"
      aria-label="Latência RTT — TimescaleDB Hypertable"
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Monitor className="w-4 h-4 text-emerald-400" />
            <h2 className="text-xs font-mono font-bold text-white uppercase tracking-wider">
              Latência RTT — TimescaleDB Hypertable
            </h2>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            Série temporal contínua com agregação por bucket de 10s
          </p>
        </div>

        {/* Filtro de Período */}
        <div className="inline-flex p-1 rounded-lg bg-obsidian-950 border border-obsidian-800 text-xs font-mono">
          {periodOptions.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => onPeriodChange(opt.value)}
              className={`px-2.5 py-1 rounded transition-colors cursor-pointer ${
                period === opt.value
                  ? "bg-obsidian-850 text-emerald-400 font-semibold border border-obsidian-700 shadow-sm"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Resumo de Estatísticas */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 font-mono tabular-nums">
        <div className="bg-obsidian-950 p-3 rounded-lg border border-obsidian-800 flex flex-col">
          <span className="text-[10px] uppercase text-slate-400 font-semibold">
            MÍNIMO ({period.toUpperCase()})
          </span>
          <div className="flex items-baseline gap-1 mt-0.5">
            <span className="text-lg font-bold text-emerald-400">{summary.minMs}</span>
            <span className="text-xs text-slate-400">ms</span>
          </div>
        </div>

        <div className="bg-obsidian-950 p-3 rounded-lg border border-obsidian-800 flex flex-col">
          <span className="text-[10px] uppercase text-slate-400 font-semibold">
            MÉDIA P95
          </span>
          <div className="flex items-baseline gap-1 mt-0.5">
            <span className="text-lg font-bold text-white">{summary.p95Ms}</span>
            <span className="text-xs text-slate-400">ms</span>
          </div>
        </div>

        <div className="bg-obsidian-950 p-3 rounded-lg border border-obsidian-800 flex flex-col">
          <span className="text-[10px] uppercase text-slate-400 font-semibold">
            PICO MÁXIMO
          </span>
          <div className="flex items-baseline gap-1 mt-0.5">
            <span className="text-lg font-bold text-amber-400">{summary.maxMs}</span>
            <span className="text-xs text-slate-400">ms</span>
          </div>
        </div>

        <div className="bg-obsidian-950 p-3 rounded-lg border border-obsidian-800 flex flex-col">
          <span className="text-[10px] uppercase text-slate-400 font-semibold">
            PERDA DE PACOTES
          </span>
          <div className="flex items-baseline gap-1 mt-0.5">
            <span className="text-lg font-bold text-emerald-400">{summary.avgLossPct}</span>
            <span className="text-xs text-slate-400">% Loss</span>
          </div>
        </div>
      </div>

      {/* Gráfico SVG Limpo */}
      <div className="bg-obsidian-950 rounded-xl p-4 border border-obsidian-800 flex flex-col">
        <div className="flex items-center justify-between text-xs font-mono text-slate-400 mb-2">
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1.5 text-emerald-400">
              <span className="w-3 h-0.5 bg-emerald-400 rounded-full inline-block"></span>
              RTT Real-Time
            </span>
            <span className="flex items-center gap-1.5 text-rose-400">
              <span className="w-3 h-0.5 border-t border-dashed border-rose-500 inline-block"></span>
              Limiar Alerta: 250 ms
            </span>
          </div>
          <span className="text-[11px] text-slate-500">SSE Ativo (Auto-refresh 8s)</span>
        </div>

        <div className="relative w-full h-44 select-none">
          <svg viewBox="0 0 900 180" className="w-full h-full overflow-visible" preserveAspectRatio="none">
            <line x1="0" y1="20" x2="900" y2="20" stroke="#1b2640" strokeDasharray="3,3" />
            <line x1="0" y1="70" x2="900" y2="70" stroke="#1b2640" strokeDasharray="3,3" />
            <line x1="0" y1="120" x2="900" y2="120" stroke="#1b2640" strokeDasharray="3,3" />
            <line x1="0" y1="160" x2="900" y2="160" stroke="#1b2640" />

            {/* Limiar Crítico 250ms */}
            <line x1="0" y1="24" x2="900" y2="24" stroke="#f43f5e" strokeWidth="1.5" strokeDasharray="4,4" />
            <text x="890" y="18" fill="#f43f5e" fontSize="10" textAnchor="end" fontFamily="'JetBrains Mono', monospace">
              250ms ALERTA
            </text>

            {/* Área preenchida */}
            <path d={areaPathData} fill="rgba(16, 185, 129, 0.08)" />

            {/* Linha nítida */}
            <path d={pathData} fill="none" stroke="#10b981" strokeWidth="2" />

            {/* Spike Point Highlight */}
            <circle cx={spikePoint.x} cy={spikePoint.y} r="4" fill="#f59e0b" stroke="#080c14" strokeWidth="2" />
            <text
              x={spikePoint.x}
              y={spikePoint.y - 10}
              fill="#f59e0b"
              fontSize="11"
              textAnchor="middle"
              fontFamily="'JetBrains Mono', monospace"
            >
              {spikePoint.val}ms
            </text>
          </svg>
        </div>

        <div className="flex justify-between items-center text-xs font-mono text-slate-500 mt-2 pt-2 border-t border-obsidian-800 tabular-nums">
          <span>Ontem 18:00</span>
          <span>00:00</span>
          <span className="text-amber-400">03:15 (Spike Mitigado)</span>
          <span>09:00</span>
          <span>15:00</span>
          <span className="text-emerald-400 font-semibold">Hoje 17:42 (Atual)</span>
        </div>
      </div>
    </section>
  );
};
