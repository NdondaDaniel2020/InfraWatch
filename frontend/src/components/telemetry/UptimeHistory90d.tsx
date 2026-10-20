import React, { useState } from "react";
import type { DayAvailability } from "../../types/telemetry";

export interface UptimeHistory90dProps {
  days?: DayAvailability[];
  barCount?: number;
  overallUptime?: number;
  className?: string;
}

export const UptimeHistory90d: React.FC<UptimeHistory90dProps> = ({
  days,
  barCount = 30,
  overallUptime = 99.98,
}) => {
  const [hoveredDay, setHoveredDay] = useState<DayAvailability | null>(null);

  // Gera dados simulados caso não venham do backend (fallback resiliente de 30 a 90 dias)
  const items: DayAvailability[] = React.useMemo(() => {
    if (days && days.length > 0) return days.slice(-barCount);

    const generated: DayAvailability[] = [];
    const now = new Date();
    for (let i = barCount - 1; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const isDowntime = i === 12; // 1 dia com incidente
      const isDegraded = i === 4; // 1 dia degradado
      generated.push({
        date: d.toISOString().split("T")[0],
        uptime_pct: isDowntime ? 92.4 : isDegraded ? 98.7 : 100,
        has_incident: isDowntime,
      });
    }
    return generated;
  }, [days, barCount]);

  const getBarColor = (uptime: number, hasIncident?: boolean): string => {
    if (hasIncident || uptime < 95) return "#f43f5e"; // rose-500
    if (uptime < 99.5) return "#f59e0b"; // amber-500
    return "#10b981"; // emerald-500
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "4px",
        width: "100%",
      }}
      aria-label={`Histórico de disponibilidade de ${barCount} dias`}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          fontSize: "10px",
          fontFamily: "var(--font-mono, monospace)",
          color: "var(--color-text-muted, #94a3b8)",
        }}
      >
        <span>{barCount}d atrás</span>
        <span
          style={{
            color: hoveredDay
              ? getBarColor(hoveredDay.uptime_pct, hoveredDay.has_incident)
              : "var(--color-healthy, #10b981)",
            fontWeight: 600,
          }}
        >
          {hoveredDay
            ? `${hoveredDay.date}: ${hoveredDay.uptime_pct.toFixed(1)}%`
            : `${overallUptime.toFixed(2)}% Uptime`}
        </span>
        <span>Hoje</span>
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "flex-end",
          gap: "2px",
          height: "16px",
          width: "100%",
        }}
        role="group"
        aria-label="Barras de disponibilidade diária"
      >
        {items.map((item, idx) => {
          const color = getBarColor(item.uptime_pct, item.has_incident);
          const isHovered = hoveredDay?.date === item.date;

          return (
            <div
              key={item.date || idx}
              tabIndex={0}
              role="img"
              aria-label={`Dia ${item.date}: ${item.uptime_pct}% uptime`}
              onMouseEnter={() => setHoveredDay(item)}
              onMouseLeave={() => setHoveredDay(null)}
              onFocus={() => setHoveredDay(item)}
              onBlur={() => setHoveredDay(null)}
              style={{
                flex: 1,
                height: item.uptime_pct < 95 ? "60%" : "100%",
                backgroundColor: color,
                borderRadius: "2px",
                opacity: isHovered ? 1 : 0.85,
                transform: isHovered ? "scaleY(1.2)" : "scaleY(1)",
                transition: "opacity 150ms ease, transform 150ms ease",
                cursor: "pointer",
                outline: "none",
              }}
            />
          );
        })}
      </div>
    </div>
  );
};
