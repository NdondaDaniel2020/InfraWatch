import React from "react";
import { Link } from "react-router-dom";
import {
  Calendar,
  Clock,
  Building2,
  CheckCircle2,
  AlertTriangle,
  BellOff,
  Eye,
  RotateCcw,
} from "lucide-react";
import type { MaintenanceWindow } from "../../types/sla";
import { Badge } from "../ui";

interface MaintenanceCardProps {
  maintenance: MaintenanceWindow;
  onApprove?: (id: string) => void;
  canApprove?: boolean;
}

export const MaintenanceCard: React.FC<MaintenanceCardProps> = ({
  maintenance,
  onApprove,
  canApprove = false,
}) => {
  const startDate = new Date(maintenance.startTimeUtc);
  const dayStr = startDate.toLocaleDateString("pt-BR", { day: "2-digit" });
  const monthStr = startDate
    .toLocaleDateString("pt-BR", { month: "short" })
    .toUpperCase()
    .replace(".", "");
  const yearStr = startDate.getFullYear();

  const statusConfigs = {
    APPROVED: {
      color: "var(--color-primary)",
      edgeBg: "var(--color-primary)",
      badgeVariant: "maintenance" as const,
      label: "PROGRAMADA",
      icon: <Calendar size={18} className="text-sky-400" />,
    },
    PENDING_APPROVAL: {
      color: "var(--color-warning)",
      edgeBg: "var(--color-warning)",
      badgeVariant: "degraded" as const,
      label: "PENDENTE CAB",
      icon: <AlertTriangle size={18} className="text-amber-400" />,
    },
    IN_PROGRESS: {
      color: "var(--color-degraded)",
      edgeBg: "var(--color-degraded)",
      badgeVariant: "degraded" as const,
      label: "EM EXECUÇÃO",
      icon: <Clock size={18} className="text-amber-400" />,
    },
    COMPLETED: {
      color: "var(--color-healthy)",
      edgeBg: "var(--color-healthy)",
      badgeVariant: "healthy" as const,
      label: "CONCLUÍDA",
      icon: <CheckCircle2 size={18} className="text-emerald-400" />,
    },
    CANCELLED: {
      color: "var(--color-critical)",
      edgeBg: "var(--color-critical)",
      badgeVariant: "critical" as const,
      label: "CANCELADA",
      icon: <AlertTriangle size={18} className="text-rose-400" />,
    },
  }[maintenance.status];

  return (
    <article
      data-testid={`rfc-card-${maintenance.id}`}
      style={{
        backgroundColor: "var(--color-surface-elevated)",
        border: "var(--border-subtle)",
        borderRadius: "var(--radius-lg)",
        padding: "20px",
        display: "flex",
        flexDirection: "row",
        flexWrap: "wrap",
        gap: "20px",
        position: "relative",
        overflow: "hidden",
        boxShadow: "var(--shadow-card)",
      }}
    >
      {/* Barra de cor indicadora na lateral */}
      <div
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          bottom: 0,
          width: "4px",
          backgroundColor: statusConfigs.edgeBg,
        }}
      />

      {/* Bloco de Data (Esquerda) */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "12px",
          borderRadius: "var(--radius-md)",
          backgroundColor: "var(--color-surface-card)",
          border: "var(--border-subtle)",
          minWidth: "120px",
          textAlign: "center",
          gap: "4px",
        }}
      >
        {statusConfigs.icon}
        <div style={{ display: "flex", flexDirection: "column" }}>
          <span
            style={{
              fontSize: "1.125rem",
              fontWeight: 700,
              color: "var(--color-text-primary)",
              fontFamily: "var(--font-mono)",
              lineHeight: 1.2,
            }}
          >
            {dayStr} {monthStr}
          </span>
          <span
            style={{
              fontSize: "0.75rem",
              color: statusConfigs.color,
              fontFamily: "var(--font-mono)",
              fontWeight: 600,
            }}
          >
            {yearStr}
          </span>
        </div>
        <Badge variant={statusConfigs.badgeVariant} size="sm">
          {statusConfigs.label}
        </Badge>
      </div>

      {/* Detalhes Centrais da RFC */}
      <div style={{ flex: 1, minWidth: "260px", display: "flex", flexDirection: "column", gap: "12px" }}>
        {/* Linha de topo: RFC, horários e cliente */}
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "8px",
            borderBottom: "var(--border-subtle)",
            paddingBottom: "8px",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              flexWrap: "wrap",
              gap: "8px",
              fontSize: "0.75rem",
              fontFamily: "var(--font-mono)",
            }}
          >
            <span
              style={{
                fontWeight: 700,
                color: statusConfigs.color,
                padding: "2px 8px",
                borderRadius: "var(--radius-sm)",
                backgroundColor: "var(--color-surface-card)",
                border: "var(--border-subtle)",
              }}
            >
              {maintenance.rfcNumber}
            </span>
            <span style={{ color: "var(--color-border-subtle)" }}>•</span>
            <span style={{ color: "var(--color-text-primary)", display: "flex", alignItems: "center", gap: "4px" }}>
              <Clock size={14} className="text-sky-400" />
              {startDate.toISOString().substring(11, 16)} – {new Date(maintenance.endTimeUtc).toISOString().substring(11, 16)} UTC
            </span>
            <span style={{ color: "var(--color-border-subtle)" }}>•</span>
            <span style={{ color: "var(--color-text-muted)" }}>
              Duração: <strong style={{ color: "var(--color-text-primary)" }}>{Math.floor(maintenance.durationMinutes / 60)}h {maintenance.durationMinutes % 60}m</strong>
            </span>
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              padding: "2px 8px",
              borderRadius: "var(--radius-sm)",
              backgroundColor: "var(--color-surface-card)",
              border: "var(--border-subtle)",
              fontSize: "0.75rem",
              fontFamily: "var(--font-mono)",
              color: "var(--color-text-secondary)",
            }}
          >
            <Building2 size={14} className="text-emerald-400" />
            <span>{maintenance.clientName}</span>
          </div>
        </div>

        {/* Ativos Alvo */}
        <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: "8px" }}>
          <span
            style={{
              fontSize: "0.625rem",
              fontFamily: "var(--font-mono)",
              color: "var(--color-text-muted)",
              textTransform: "uppercase",
              fontWeight: 600,
            }}
          >
            Ativos Alvo:
          </span>
          {maintenance.targetDeviceNames.map((name, index) => {
            const devId = maintenance.targetDeviceIds[index] || "dev-1";
            return (
              <span
                key={name}
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: "0.75rem",
                  padding: "2px 8px",
                  borderRadius: "var(--radius-sm)",
                  backgroundColor: "var(--color-surface-card)",
                  border: "var(--border-subtle)",
                  color: "var(--color-text-primary)",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                }}
              >
                <span
                  style={{
                    width: "6px",
                    height: "6px",
                    borderRadius: "50%",
                    backgroundColor: "var(--color-healthy)",
                  }}
                />
                <Link
                  to={`/devices/${devId}`}
                  style={{
                    color: "inherit",
                    textDecoration: "none",
                  }}
                  className="hover:underline"
                >
                  {name}
                </Link>
              </span>
            );
          })}
        </div>

        {/* Título e Descrição */}
        <div>
          <h3 style={{ fontSize: "0.875rem", fontWeight: 700, color: "var(--color-text-primary)", marginBottom: "4px" }}>
            {maintenance.title}
          </h3>
          <p style={{ fontSize: "0.75rem", color: "var(--color-text-secondary)", lineHeight: 1.5 }}>
            {maintenance.description}
          </p>
        </div>

        {/* Status de Homologação e Isenção de SLA */}
        <div
          style={{
            padding: "10px 12px",
            borderRadius: "var(--radius-md)",
            backgroundColor: "var(--color-surface-card)",
            border: maintenance.slaExemption
              ? "1px solid var(--color-healthy-border)"
              : "1px solid var(--color-warning-border)",
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "8px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            {maintenance.slaExemption ? (
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "4px",
                  fontSize: "0.75rem",
                  fontWeight: 600,
                  fontFamily: "var(--font-mono)",
                  color: "var(--color-healthy)",
                }}
              >
                <CheckCircle2 size={16} />
                Isenção de SLA Homologada
              </span>
            ) : (
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "4px",
                  fontSize: "0.75rem",
                  fontWeight: 600,
                  fontFamily: "var(--font-mono)",
                  color: "var(--color-warning)",
                }}
              >
                <AlertTriangle size={16} />
                Aguardando Deferimento Formal
              </span>
            )}

            <span style={{ fontSize: "0.6875rem", color: "var(--color-text-muted)" }}>
              {maintenance.approvedBy
                ? `Aprovador: ${maintenance.approvedBy}`
                : "Parecer técnico pendente do NOC Lead"}
            </span>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            {maintenance.alarmSuppression && (
              <span
                style={{
                  fontSize: "0.6875rem",
                  fontFamily: "var(--font-mono)",
                  color: "var(--color-healthy)",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "4px",
                }}
              >
                <BellOff size={14} />
                Supressão de alarmes ativa
              </span>
            )}

            {canApprove && maintenance.status === "PENDING_APPROVAL" && (
              <button
                type="button"
                onClick={() => onApprove?.(maintenance.id)}
                style={{
                  padding: "4px 10px",
                  borderRadius: "var(--radius-sm)",
                  backgroundColor: "var(--color-healthy)",
                  color: "#080c14",
                  fontSize: "0.75rem",
                  fontWeight: 700,
                  fontFamily: "var(--font-mono)",
                  border: "none",
                  cursor: "pointer",
                }}
              >
                Homologar Isenção Agora
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Ações da RFC (Direita) */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          gap: "8px",
          borderLeft: "var(--border-subtle)",
          paddingLeft: "16px",
          minWidth: "130px",
        }}
      >
        <button
          type="button"
          style={{
            padding: "8px 12px",
            borderRadius: "var(--radius-md)",
            backgroundColor: "var(--color-surface-card)",
            border: "var(--border-subtle)",
            color: "var(--color-text-secondary)",
            fontSize: "0.75rem",
            fontWeight: 600,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "6px",
            cursor: "pointer",
          }}
        >
          <Eye size={14} />
          Ver Dossiê
        </button>

        {maintenance.rollbackPlan && (
          <button
            type="button"
            title={maintenance.rollbackPlan}
            style={{
              padding: "8px 12px",
              borderRadius: "var(--radius-md)",
              backgroundColor: "transparent",
              border: "var(--border-subtle)",
              color: "var(--color-text-muted)",
              fontSize: "0.75rem",
              fontFamily: "var(--font-mono)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "4px",
              cursor: "pointer",
            }}
          >
            <RotateCcw size={14} />
            Rollback Plan
          </button>
        )}
      </div>
    </article>
  );
};
