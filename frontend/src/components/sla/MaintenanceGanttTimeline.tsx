import React from "react";
import { Calendar, Clock } from "lucide-react";
import type { MaintenanceWindow } from "../../types/sla";

interface MaintenanceGanttTimelineProps {
  maintenances: MaintenanceWindow[];
}

export const MaintenanceGanttTimeline: React.FC<MaintenanceGanttTimelineProps> = ({
  maintenances,
}) => {
  const hours = [
    "00h", "02h", "04h", "06h", "08h", "10h",
    "12h", "14h", "16h", "18h", "20h", "22h",
  ];

  // Ativos únicos envolvidos nas manutenções
  const trackDevices = Array.from(
    new Set(maintenances.flatMap((m) => m.targetDeviceNames))
  );

  return (
    <section
      data-testid="maint-gantt-container"
      style={{
        backgroundColor: "var(--color-surface-elevated)",
        border: "var(--border-subtle)",
        borderRadius: "var(--radius-lg)",
        padding: "20px",
        display: "flex",
        flexDirection: "column",
        gap: "16px",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          borderBottom: "var(--border-subtle)",
          paddingBottom: "12px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <Calendar size={18} className="text-sky-400" />
          <h3 style={{ fontSize: "0.875rem", fontWeight: 700, color: "var(--color-text-primary)" }}>
            Linha do Tempo Gantt — 24 Horas
          </h3>
        </div>
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "0.75rem",
            color: "var(--color-text-muted)",
            display: "flex",
            alignItems: "center",
            gap: "4px",
          }}
        >
          <Clock size={12} />
          Fuso Horário: UTC / WAT (Luanda)
        </span>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "12px", fontFamily: "var(--font-mono)" }}>
        {/* Régua de Horas */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "140px repeat(12, 1fr)",
            gap: "4px",
            fontSize: "0.625rem",
            color: "var(--color-text-muted)",
            textAlign: "center",
            borderBottom: "var(--border-subtle)",
            paddingBottom: "6px",
          }}
        >
          <div style={{ textAlign: "left" }}>Ativo / Host</div>
          {hours.map((h) => (
            <div key={h}>{h}</div>
          ))}
        </div>

        {/* Trilhos por Ativo */}
        {trackDevices.length === 0 ? (
          <div style={{ padding: "16px", textAlign: "center", color: "var(--color-text-muted)", fontSize: "0.75rem" }}>
            Nenhum ativo associado a paradas técnicas no período.
          </div>
        ) : (
          trackDevices.map((device) => {
            const relatedMaints = maintenances.filter((m) =>
              m.targetDeviceNames.includes(device)
            );

            return (
              <div
                key={device}
                style={{
                  display: "grid",
                  gridTemplateColumns: "140px 1fr",
                  alignItems: "center",
                  gap: "12px",
                }}
              >
                <span
                  style={{
                    fontSize: "0.75rem",
                    fontWeight: 600,
                    color: "var(--color-text-primary)",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                  title={device}
                >
                  {device}
                </span>

                <div
                  style={{
                    height: "32px",
                    backgroundColor: "var(--color-surface-card)",
                    borderRadius: "var(--radius-sm)",
                    border: "var(--border-subtle)",
                    position: "relative",
                    overflow: "hidden",
                    display: "flex",
                    alignItems: "center",
                  }}
                >
                  {relatedMaints.map((m) => {
                    const start = new Date(m.startTimeUtc).getUTCHours();
                    const leftPct = (start / 24) * 100;
                    const widthPct = Math.max((m.durationMinutes / 1440) * 100, 10);

                    return (
                      <div
                        key={m.id}
                        style={{
                          position: "absolute",
                          left: `${leftPct}%`,
                          width: `${widthPct}%`,
                          height: "24px",
                          backgroundColor:
                            m.status === "APPROVED"
                              ? "rgba(56, 189, 248, 0.2)"
                              : m.status === "PENDING_APPROVAL"
                              ? "rgba(245, 158, 11, 0.2)"
                              : "rgba(16, 185, 129, 0.2)",
                          border: `1px solid ${
                            m.status === "APPROVED"
                              ? "var(--color-primary)"
                              : m.status === "PENDING_APPROVAL"
                              ? "var(--color-warning)"
                              : "var(--color-healthy)"
                          }`,
                          borderRadius: "var(--radius-sm)",
                          color: "var(--color-text-primary)",
                          fontSize: "0.625rem",
                          fontWeight: 700,
                          padding: "0 6px",
                          display: "flex",
                          alignItems: "center",
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}
                        title={`${m.rfcNumber}: ${m.title} (${m.durationMinutes}m)`}
                      >
                        {m.rfcNumber}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })
        )}
      </div>
    </section>
  );
};
