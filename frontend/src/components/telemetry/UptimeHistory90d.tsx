import React, { useState } from "react";
import type { DayAvailability } from "../../types/telemetry";

export interface UptimeHistory90dProps {
  days?: DayAvailability[];
  barCount?: number;
  overallUptime?: number;
  className?: string;
}

const getBarColor = (uptime?: number, hasIncident?: boolean): string => {
  if (uptime == null) return "var(--color-obsidian-800, #334155)";
  if (hasIncident || uptime < 95) return "var(--color-critical, #f43f5e)";
  if (uptime < 99.5) return "var(--color-degraded, #f59e0b)";
  return "var(--color-healthy, #10b981)";
};

export const UptimeHistory90d: React.FC<UptimeHistory90dProps> = ({
  days,
  barCount = 30,
  overallUptime,
}) => {
  const [hoveredDay, setHoveredDay] = useState<DayAvailability | null>(null);

  const items: DayAvailability[] = React.useMemo(() => {
    if (days && days.length > 0) return days.slice(-barCount);
    return [];
  }, [days, barCount]);

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
              : overallUptime != null
              ? "var(--color-healthy, #10b981)"
              : "var(--color-text-muted, #94a3b8)",
            fontWeight: 600,
          }}
        >
          {hoveredDay
            ? `${hoveredDay.date}: ${(hoveredDay.uptime_pct ?? 100).toFixed(1)}%`
            : overallUptime != null
            ? `${overallUptime.toFixed(2)}% Uptime`
            : "--"}
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
        {items.length > 0 ? (
          items.map((item, idx) => {
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
          })
        ) : (
          <div
            style={{
              width: "100%",
              height: "100%",
              backgroundColor: "rgba(255, 255, 255, 0.05)",
              borderRadius: "2px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "9px",
              color: "#64748b",
            }}
          >
            Sem histórico consolidado
          </div>
        )}
      </div>
    </div>
  );
};
