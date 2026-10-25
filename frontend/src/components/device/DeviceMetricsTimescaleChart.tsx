import React, { useMemo } from "react";
import { Monitor } from "lucide-react";
import type { TimescaleMetricsResponse, TimescalePeriod } from "../../types/deviceDetail";

interface DeviceMetricsTimescaleChartProps {
  data: TimescaleMetricsResponse;
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
  return CHART_HEIGHT - padding - (value / maxValue) * availableHeight;
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
  const maxValue = useMemo(() => {
    const allValues = data.buckets.flatMap((b) => [b.rttMinMs, b.rttP95Ms, b.rttMaxMs]);
    return Math.max(...allValues, ALERT_THRESHOLD_MS * 1.2);
  }, [data.buckets]);

  const sampledBuckets = useMemo(() => {
    const targetPoints = 60;
    if (data.buckets.length <= targetPoints) return data.buckets;
    const step = data.buckets.length / targetPoints;
    return Array.from({ length: targetPoints }, (_, i) =>
      data.buckets[Math.floor(i * step)]
    );
  }, [data.buckets]);

  const pathData = useMemo(() => {
    if (sampledBuckets.length < 2) return "";
    return sampledBuckets
      .map((bucket, i) => {
        const x = getXPosition(i, sampledBuckets.length);
        const y = getYPosition(bucket.rttP95Ms, maxValue);
        return `${i === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
      })
      .join(" ");
  }, [sampledBuckets, maxValue]);

  const areaPathData = useMemo(() => {
    if (sampledBuckets.length < 2) return "";
    const points = sampledBuckets.map((bucket, i) => ({
      x: getXPosition(i, sampledBuckets.length),
      y: getYPosition(bucket.rttP95Ms, maxValue),
    }));
    return (
      `M ${points[0].x} ${CHART_HEIGHT - 20} ` +
      points.map((p) => `L ${p.x} ${p.y}`).join(" ") +
      ` L ${points[points.length - 1].x} ${CHART_HEIGHT - 20} Z`
    );
  }, [sampledBuckets, maxValue]);

  const spikePoints = useMemo(() => {
    return sampledBuckets
      .map((bucket, i) => ({
        ...bucket,
        x: getXPosition(i, sampledBuckets.length),
        y: getYPosition(bucket.rttMaxMs, maxValue),
      }))
      .filter((p) => p.rttMaxMs > ALERT_THRESHOLD_MS);
  }, [sampledBuckets, maxValue]);

  const timeLabels = useMemo(() => {
    const labels = [
      { index: 0, label: sampledBuckets[0] ? new Date(sampledBuckets[0].timestamp).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : "" },
      { index: Math.floor(sampledBuckets.length * 0.25), label: "" },
      { index: Math.floor(sampledBuckets.length * 0.5), label: "" },
      { index: Math.floor(sampledBuckets.length * 0.75), label: "" },
      { index: sampledBuckets.length - 1, label: sampledBuckets[sampledBuckets.length - 1] ? new Date(sampledBuckets[sampledBuckets.length - 1].timestamp).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : "" },
    ];
    return labels.filter((l) => l.index >= 0 && l.index < sampledBuckets.length);
  }, [sampledBuckets]);

  return (
    <section
      style={{
        backgroundColor: "var(--color-surface-elevated)",
        border: "var(--border-active)",
        borderRadius: "var(--radius-lg)",
        padding: "20px",
        boxShadow: "var(--shadow-card)",
        display: "flex",
        flexDirection: "column",
        gap: "16px",
      }}
      aria-label="Latência RTT — TimescaleDB Hypertable"
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "12px",
        }}
      >
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: "12px" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <Monitor size={18} style={{ color: "var(--color-healthy)" }} />
              <h2
                style={{
                  fontSize: "0.75rem",
                  fontWeight: 700,
                  color: "var(--color-text-primary)",
                  fontFamily: "var(--font-mono)",
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                }}
              >
                Latência RTT — TimescaleDB Hypertable
              </h2>
            </div>
            <p
              style={{
                fontSize: "0.75rem",
                color: "var(--color-text-secondary)",
                marginTop: "2px",
              }}
            >
              Série temporal contínua com agregação por bucket de 10s
            </p>
          </div>

          <div
            style={{
              display: "inline-flex",
              padding: "4px",
              borderRadius: "var(--radius-md)",
              backgroundColor: "var(--color-surface-card)",
              border: "var(--border-subtle)",
            }}
          >
            {periodOptions.map((p) => (
              <button
                key={p.value}
                onClick={() => onPeriodChange(p.value)}
                style={{
                  padding: "6px 12px",
                  borderRadius: "var(--radius-sm)",
                  backgroundColor:
                    period === p.value
                      ? "var(--color-surface-hover)"
                      : "transparent",
                  border:
                    period === p.value
                      ? "1px solid var(--border-hover)"
                      : "none",
                  color:
                    period === p.value
                      ? "var(--color-healthy)"
                      : "var(--color-text-muted)",
                  fontSize: "0.75rem",
                  fontWeight:
                    period === p.value ? 700 : 500,
                  fontFamily: "var(--font-mono)",
                  cursor: "pointer",
                  transition:
                    "background-color var(--transition-fast), border-color var(--transition-fast), color var(--transition-fast)",
                }}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))",
            gap: "12px",
          }}
        >
          <div
            style={{
              backgroundColor: "var(--color-surface-card)",
              border: "var(--border-subtle)",
              borderRadius: "var(--radius-md)",
              padding: "12px",
              display: "flex",
              flexDirection: "column",
            }}
          >
            <span
              style={{
                fontSize: "0.625rem",
                fontWeight: 600,
                color: "var(--color-text-muted)",
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                fontFamily: "var(--font-mono)",
              }}
            >
              MÍNIMO (24H)
            </span>
            <div
              style={{
                display: "flex",
                alignItems: "baseline",
                gap: "4px",
                marginTop: "4px",
              }}
            >
              <span
                style={{
                  fontSize: "1.125rem",
                  fontWeight: 700,
                  color: "var(--color-healthy)",
                  fontFamily: "var(--font-mono)",
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {data.summary.minMs.toFixed(1)}
              </span>
              <span
                style={{
                  fontSize: "0.75rem",
                  color: "var(--color-text-muted)",
                }}
              >
                ms
              </span>
            </div>
          </div>

          <div
            style={{
              backgroundColor: "var(--color-surface-card)",
              border: "var(--border-subtle)",
              borderRadius: "var(--radius-md)",
              padding: "12px",
              display: "flex",
              flexDirection: "column",
            }}
          >
            <span
              style={{
                fontSize: "0.625rem",
                fontWeight: 600,
                color: "var(--color-text-muted)",
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                fontFamily: "var(--font-mono)",
              }}
            >
              MÉDIA P95
            </span>
            <div
              style={{
                display: "flex",
                alignItems: "baseline",
                gap: "4px",
                marginTop: "4px",
              }}
            >
              <span
                style={{
                  fontSize: "1.125rem",
                  fontWeight: 700,
                  color: "var(--color-text-primary)",
                  fontFamily: "var(--font-mono)",
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {data.summary.p95Ms.toFixed(1)}
              </span>
              <span
                style={{
                  fontSize: "0.75rem",
                  color: "var(--color-text-muted)",
                }}
              >
                ms
              </span>
            </div>
          </div>

          <div
            style={{
              backgroundColor: "var(--color-surface-card)",
              border: "var(--border-subtle)",
              borderRadius: "var(--radius-md)",
              padding: "12px",
              display: "flex",
              flexDirection: "column",
            }}
          >
            <span
              style={{
                fontSize: "0.625rem",
                fontWeight: 600,
                color: "var(--color-text-muted)",
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                fontFamily: "var(--font-mono)",
              }}
            >
              PICO MÁXIMO
            </span>
            <div
              style={{
                display: "flex",
                alignItems: "baseline",
                gap: "4px",
                marginTop: "4px",
              }}
            >
              <span
                style={{
                  fontSize: "1.125rem",
                  fontWeight: 700,
                  color: "var(--color-degraded)",
                  fontFamily: "var(--font-mono)",
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {data.summary.maxMs.toFixed(1)}
              </span>
              <span
                style={{
                  fontSize: "0.75rem",
                  color: "var(--color-text-muted)",
                }}
              >
                ms
              </span>
            </div>
          </div>

          <div
            style={{
              backgroundColor: "var(--color-surface-card)",
              border: "var(--border-subtle)",
              borderRadius: "var(--radius-md)",
              padding: "12px",
              display: "flex",
              flexDirection: "column",
            }}
          >
            <span
              style={{
                fontSize: "0.625rem",
                fontWeight: 600,
                color: "var(--color-text-muted)",
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                fontFamily: "var(--font-mono)",
              }}
            >
              PERDA DE PACOTES
            </span>
            <div
              style={{
                display: "flex",
                alignItems: "baseline",
                gap: "4px",
                marginTop: "4px",
              }}
            >
              <span
                style={{
                  fontSize: "1.125rem",
                  fontWeight: 700,
                  color: "var(--color-healthy)",
                  fontFamily: "var(--font-mono)",
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {data.summary.avgLossPct.toFixed(1)}
              </span>
              <span
                style={{
                  fontSize: "0.75rem",
                  color: "var(--color-text-muted)",
                }}
              >
                %
              </span>
            </div>
          </div>
        </div>

        <div
          style={{
            backgroundColor: "var(--color-surface-card)",
            border: "var(--border-subtle)",
            borderRadius: "var(--radius-lg)",
            padding: "16px",
            display: "flex",
            flexDirection: "column",
            gap: "12px",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
              <span
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  fontSize: "0.75rem",
                  fontFamily: "var(--font-mono)",
                  color: "var(--color-healthy)",
                }}
              >
                <span
                  style={{
                    width: "12px",
                    height: "2px",
                    backgroundColor: "var(--color-healthy)",
                    borderRadius: "1px",
                  }}
                />
                RTT Real-Time
              </span>
              <span
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  fontSize: "0.75rem",
                  fontFamily: "var(--font-mono)",
                  color: "var(--color-critical)",
                }}
              >
                <span
                  style={{
                    width: "12px",
                    height: "1px",
                    borderTop: "2px dashed var(--color-critical)",
                  }}
                />
                Limiar Alerta: {ALERT_THRESHOLD_MS} ms
              </span>
            </div>
            <span
              style={{
                fontSize: "0.75rem",
                fontFamily: "var(--font-mono)",
                color: "var(--color-healthy)",
              }}
            >
              SSE Ativo (Auto-refresh 8s)
            </span>
          </div>

          <div style={{ position: "relative", width: "100%", height: "220px" }}>
            <svg
              viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
              preserveAspectRatio="none"
              style={{ width: "100%", height: "100%", overflow: "visible" }}
            >
              <defs>
                <linearGradient id="rttGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--color-healthy)" stopOpacity="0.15" />
                  <stop offset="100%" stopColor="var(--color-healthy)" stopOpacity="0" />
                </linearGradient>
              </defs>

              <line
                x1="0"
                y1={CHART_HEIGHT - 20}
                x2={CHART_WIDTH}
                y2={CHART_HEIGHT - 20}
                stroke="var(--color-border-subtle)"
                strokeWidth="1"
              />
              <line
                x1="0"
                y1={getYPosition(maxValue * 0.66, maxValue)}
                x2={CHART_WIDTH}
                y2={getYPosition(maxValue * 0.66, maxValue)}
                stroke="var(--color-border-subtle)"
                strokeWidth="1"
                strokeDasharray="4,4"
              />
              <line
                x1="0"
                y1={getYPosition(maxValue * 0.33, maxValue)}
                x2={CHART_WIDTH}
                y2={getYPosition(maxValue * 0.33, maxValue)}
                stroke="var(--color-border-subtle)"
                strokeWidth="1"
                strokeDasharray="4,4"
              />

              <line
                x1="0"
                y1={getYPosition(ALERT_THRESHOLD_MS, maxValue)}
                x2={CHART_WIDTH}
                y2={getYPosition(ALERT_THRESHOLD_MS, maxValue)}
                stroke="var(--color-critical)"
                strokeWidth="1.5"
                strokeDasharray="6,6"
              />
              <text
                x={CHART_WIDTH - 10}
                y={getYPosition(ALERT_THRESHOLD_MS, maxValue) - 6}
                fill="var(--color-critical)"
                fontSize="10"
                fontFamily="'JetBrains Mono', monospace"
                textAnchor="end"
                fontWeight="600"
              >
                {ALERT_THRESHOLD_MS}ms ALERTA
              </text>

              <path
                d={areaPathData}
                fill="url(#rttGradient)"
              />

              <path
                d={pathData}
                fill="none"
                stroke="var(--color-healthy)"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />

              {spikePoints.map((spike, i) => (
                <g key={i}>
                  <circle
                    cx={spike.x}
                    cy={spike.y}
                    r="4"
                    fill="var(--color-degraded)"
                    stroke="var(--color-bg-deep)"
                    strokeWidth="2"
                  />
                  <text
                    x={spike.x}
                    y={spike.y - 10}
                    fill="var(--color-degraded)"
                    fontSize="11"
                    fontFamily="'JetBrains Mono', monospace"
                    textAnchor="middle"
                    fontWeight="600"
                  >
                    {spike.rttMaxMs.toFixed(1)}ms
                  </text>
                </g>
              ))}
            </svg>
          </div>

          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              paddingTop: "8px",
              borderTop: "var(--border-subtle)",
            }}
          >
            {timeLabels.map((label, i) => (
              <span
                key={i}
                style={{
                  fontSize: "0.625rem",
                  fontFamily: "var(--font-mono)",
                  color: i === timeLabels.length - 1 ? "var(--color-healthy)" : "var(--color-text-muted)",
                  fontWeight: i === timeLabels.length - 1 ? 700 : 400,
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {label.label || (i === timeLabels.length - 1 ? "Agora" : "")}
              </span>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};