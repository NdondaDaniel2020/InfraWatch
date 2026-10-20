import React, { useMemo } from "react";
import type { DeviceSeverity } from "../../types/telemetry";

export interface SparklineProps {
  data: number[];
  width?: number;
  height?: number;
  severity?: DeviceSeverity;
  strokeColor?: string;
  fillColor?: string;
  strokeWidth?: number;
  ariaLabel?: string;
}

const SEVERITY_COLORS: Record<DeviceSeverity, { stroke: string; fill: string }> = {
  healthy: { stroke: "#10b981", fill: "rgba(16, 185, 129, 0.12)" },
  degraded: { stroke: "#f59e0b", fill: "rgba(245, 158, 11, 0.12)" },
  critical: { stroke: "#f43f5e", fill: "rgba(244, 63, 94, 0.15)" },
  maint: { stroke: "#38bdf8", fill: "rgba(56, 189, 248, 0.12)" },
};

export const Sparkline: React.FC<SparklineProps> = ({
  data,
  width = 160,
  height = 36,
  severity = "healthy",
  strokeColor,
  fillColor,
  strokeWidth = 1.8,
  ariaLabel = "Gráfico sparkline de latência dos últimos pings",
}) => {
  const points = useMemo(() => {
    if (!data || data.length === 0) return { pathD: "", areaD: "", lastPoint: null };

    const min = Math.min(...data);
    const max = Math.max(...data);
    const range = max === min ? 1 : max - min;
    const padding = 3;
    const chartHeight = height - padding * 2;

    const coords = data.map((val, idx) => {
      const x = padding + (idx / Math.max(1, data.length - 1)) * (width - padding * 2);
      const y = padding + chartHeight - ((val - min) / range) * chartHeight;
      return { x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10 };
    });

    const pathD = coords.reduce(
      (acc, pt, i) => (i === 0 ? `M ${pt.x},${pt.y}` : `${acc} L ${pt.x},${pt.y}`),
      ""
    );

    const first = coords[0];
    const last = coords[coords.length - 1];
    const areaD = `${pathD} L ${last.x},${height} L ${first.x},${height} Z`;

    return { pathD, areaD, lastPoint: last };
  }, [data, width, height]);

  const colors = SEVERITY_COLORS[severity] || SEVERITY_COLORS.healthy;
  const stroke = strokeColor || colors.stroke;
  const fill = fillColor || colors.fill;

  if (!data || data.length === 0) {
    return (
      <div
        style={{
          width,
          height,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: "10px",
          color: "var(--color-text-muted, #64748b)",
          fontFamily: "var(--font-mono, monospace)",
        }}
        aria-label="Sem dados de telemetria"
      >
        --
      </div>
    );
  }

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      style={{ overflow: "visible", display: "block" }}
      role="img"
      aria-label={ariaLabel}
    >
      {/* Área sombreada suave sob a curva */}
      <path d={points.areaD} fill={fill} />
      {/* Linha de tendência de latência */}
      <path
        d={points.pathD}
        fill="none"
        stroke={stroke}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Ponto final indicador do último valor */}
      {points.lastPoint && (
        <circle
          cx={points.lastPoint.x}
          cy={points.lastPoint.y}
          r={2.5}
          fill={stroke}
          stroke="#070a12"
          strokeWidth={1}
        />
      )}
    </svg>
  );
};
