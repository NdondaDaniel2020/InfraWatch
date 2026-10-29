import React from "react";
import { CheckCircle2, AlertTriangle, Clock, ShieldCheck, Activity } from "lucide-react";
import type { SlaMetricOverview } from "../../types/sla";

interface SlaKpiCardsProps {
  overview: SlaMetricOverview;
}

export const SlaKpiCards: React.FC<SlaKpiCardsProps> = ({ overview }) => {
  const isHealthy = overview.currentUptimePct >= overview.targetSlaPct;

  return (
    <section
      data-testid="sla-kpi-cards"
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
        gap: "16px",
      }}
    >
      {/* Card 1: Disponibilidade Acumulada */}
      <div
        style={{
          backgroundColor: "var(--color-surface-card)",
          border: isHealthy
            ? "1px solid var(--color-healthy-border)"
            : "1px solid var(--color-critical-border)",
          borderRadius: "var(--radius-lg)",
          padding: "16px 20px",
          display: "flex",
          flexDirection: "column",
          gap: "8px",
          boxShadow: "var(--shadow-card)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span
            style={{
              fontSize: "0.6875rem",
              fontFamily: "var(--font-mono)",
              color: "var(--color-text-muted)",
              textTransform: "uppercase",
              fontWeight: 600,
            }}
          >
            Uptime Líquido Homologado
          </span>
          <span
            style={{
              fontSize: "0.6875rem",
              fontFamily: "var(--font-mono)",
              color: isHealthy ? "var(--color-healthy)" : "var(--color-critical)",
              backgroundColor: isHealthy
                ? "rgba(16, 185, 129, 0.1)"
                : "rgba(244, 63, 94, 0.1)",
              padding: "2px 8px",
              borderRadius: "var(--radius-sm)",
              border: isHealthy
                ? "1px solid var(--color-healthy-border)"
                : "1px solid var(--color-critical-border)",
              fontWeight: 700,
            }}
          >
            {isHealthy ? "CONFORME" : "VIOLADO"}
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "baseline", gap: "8px" }}>
          <span
            style={{
              fontSize: "2rem",
              fontWeight: 800,
              fontFamily: "var(--font-mono)",
              color: isHealthy ? "var(--color-healthy)" : "var(--color-critical)",
            }}
          >
            {(overview?.currentUptimePct ?? 100).toFixed(2)}%
          </span>
          <span style={{ fontSize: "0.75rem", color: "var(--color-text-muted)", fontFamily: "var(--font-mono)" }}>
            Meta: {(overview?.targetSlaPct ?? 99.5).toFixed(2)}%
          </span>
        </div>
        <p
          style={{
            fontSize: "0.6875rem",
            color: isHealthy ? "var(--color-healthy)" : "var(--color-critical)",
            display: "flex",
            alignItems: "center",
            gap: "4px",
            fontFamily: "var(--font-mono)",
          }}
        >
          {isHealthy ? <CheckCircle2 size={12} /> : <AlertTriangle size={12} />}
          <span>Margem: {isHealthy ? "+" : ""}{(overview?.marginPct ?? 0).toFixed(2)}%</span>
        </p>
      </div>

      {/* Card 2: MTTR */}
      <div
        style={{
          backgroundColor: "var(--color-surface-card)",
          border: "var(--border-subtle)",
          borderRadius: "var(--radius-lg)",
          padding: "16px 20px",
          display: "flex",
          flexDirection: "column",
          gap: "8px",
          boxShadow: "var(--shadow-card)",
        }}
      >
        <span
          style={{
            fontSize: "0.6875rem",
            fontFamily: "var(--font-mono)",
            color: "var(--color-text-muted)",
            textTransform: "uppercase",
            fontWeight: 600,
          }}
        >
          MTTR (Tempo Médio de Reparo)
        </span>
        <div style={{ display: "flex", alignItems: "baseline", gap: "8px" }}>
          <span
            style={{
              fontSize: "2rem",
              fontWeight: 800,
              fontFamily: "var(--font-mono)",
              color: "var(--color-text-primary)",
            }}
          >
            {overview.mttrMinutes}m
          </span>
          <span style={{ fontSize: "0.75rem", color: "var(--color-text-muted)" }}>
            tempo médio de contenção
          </span>
        </div>
        <p style={{ fontSize: "0.6875rem", color: "var(--color-primary)", display: "flex", alignItems: "center", gap: "4px" }}>
          <Clock size={12} />
          <span>Meta máxima: &lt; 30m por incidente</span>
        </p>
      </div>

      {/* Card 3: MTBF */}
      <div
        style={{
          backgroundColor: "var(--color-surface-card)",
          border: "var(--border-subtle)",
          borderRadius: "var(--radius-lg)",
          padding: "16px 20px",
          display: "flex",
          flexDirection: "column",
          gap: "8px",
          boxShadow: "var(--shadow-card)",
        }}
      >
        <span
          style={{
            fontSize: "0.6875rem",
            fontFamily: "var(--font-mono)",
            color: "var(--color-text-muted)",
            textTransform: "uppercase",
            fontWeight: 600,
          }}
        >
          MTBF (Tempo Médio Entre Falhas)
        </span>
        <div style={{ display: "flex", alignItems: "baseline", gap: "8px" }}>
          <span
            style={{
              fontSize: "2rem",
              fontWeight: 800,
              fontFamily: "var(--font-mono)",
              color: "var(--color-text-primary)",
            }}
          >
            {overview.mtbfHours}h
          </span>
          <span style={{ fontSize: "0.75rem", color: "var(--color-text-muted)" }}>
            estabilidade contínua
          </span>
        </div>
        <p style={{ fontSize: "0.6875rem", color: "var(--color-healthy)", display: "flex", alignItems: "center", gap: "4px" }}>
          <Activity size={12} />
          <span>Total de incidentes no ciclo: {overview.totalIncidents}</span>
        </p>
      </div>

      {/* Card 4: Horas Isentas por Manutenção */}
      <div
        style={{
          backgroundColor: "var(--color-surface-card)",
          border: "var(--border-subtle)",
          borderRadius: "var(--radius-lg)",
          padding: "16px 20px",
          display: "flex",
          flexDirection: "column",
          gap: "8px",
          boxShadow: "var(--shadow-card)",
        }}
      >
        <span
          style={{
            fontSize: "0.6875rem",
            fontFamily: "var(--font-mono)",
            color: "var(--color-text-muted)",
            textTransform: "uppercase",
            fontWeight: 600,
          }}
        >
          Paradas Homologadas (ADR-009)
        </span>
        <div style={{ display: "flex", alignItems: "baseline", gap: "8px" }}>
          <span
            style={{
              fontSize: "2rem",
              fontWeight: 800,
              fontFamily: "var(--font-mono)",
              color: "var(--color-primary)",
            }}
          >
            {Math.floor((overview?.exemptedDowntimeMinutes ?? 0) / 60)}h {String((overview?.exemptedDowntimeMinutes ?? 0) % 60).padStart(2, "0")}m
          </span>
          <span style={{ fontSize: "0.75rem", color: "var(--color-text-muted)" }}>
            expurgadas do SLA
          </span>
        </div>
        <p style={{ fontSize: "0.6875rem", color: "var(--color-healthy)", display: "flex", alignItems: "center", gap: "4px" }}>
          <ShieldCheck size={12} />
          <span>Indisponibilidade não isenta: {overview.unexemptedDowntimeMinutes}m</span>
        </p>
      </div>
    </section>
  );
};
