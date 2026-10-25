import React, { useState } from "react";
import { Copy, Edit, GitBranch, Play } from "lucide-react";
import { Button } from "../ui/Button";
import { Badge } from "../ui/Badge";
import { toast } from "sonner";
import type { DeviceDetail } from "../../types/deviceDetail";

interface DeviceHeroHeaderProps {
  device: DeviceDetail;
  onTriggerProbe: () => void;
  isProbing: boolean;
}

export const DeviceHeroHeader: React.FC<DeviceHeroHeaderProps> = ({
  device,
  onTriggerProbe,
  isProbing,
}) => {
  const [copied, setCopied] = useState(false);

  const handleCopyIp = async () => {
    await navigator.clipboard.writeText(device.ipAddress);
    setCopied(true);
    toast.success("IP copiado para a área de transferência");
    setTimeout(() => setCopied(false), 2000);
  };

  const getStatusConfig = () => {
    switch (device.healthStatus) {
      case "UP":
        return { variant: "healthy" as const, label: "OPERACIONAL / UP", pulse: true };
      case "DOWN":
        return { variant: "critical" as const, label: "INDISPONÍVEL / DOWN", pulse: true };
      case "DEG":
        return { variant: "degraded" as const, label: "DEGRADADO", pulse: false };
      case "MAINT":
        return { variant: "maintenance" as const, label: "EM MANUTENÇÃO", pulse: false };
      case "PAUSED":
        return { variant: "neutral" as const, label: "PAUSADO", pulse: false };
    }
  };

  const statusConfig = getStatusConfig();

  return (
    <section
      style={{
        backgroundColor: "var(--color-surface-elevated)",
        border: "var(--border-active)",
        borderRadius: "var(--radius-lg)",
        padding: "20px 24px",
        boxShadow: "var(--shadow-card)",
      }}
      aria-label="Identificação do Ativo"
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "20px",
        }}
      >
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "16px",
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "12px" }}>
              <div
                style={{
                  width: "40px",
                  height: "40px",
                  borderRadius: "var(--radius-md)",
                  backgroundColor: "var(--color-healthy-bg)",
                  border: "1px solid var(--color-healthy-border)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "var(--color-healthy)",
                }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: "24px" }}>hub</span>
              </div>
              <h1
                style={{
                  fontSize: "1.25rem",
                  fontWeight: 700,
                  color: "var(--color-text-primary)",
                  fontFamily: "var(--font-mono)",
                  letterSpacing: "-0.02em",
                }}
              >
                {device.name}
              </h1>
              <span
                style={{
                  padding: "4px 10px",
                  borderRadius: "var(--radius-sm)",
                  backgroundColor: "var(--color-surface-card)",
                  color: "var(--color-text-secondary)",
                  fontSize: "0.75rem",
                  fontFamily: "var(--font-mono)",
                  border: "var(--border-subtle)",
                }}
              >
                {`${device.vendor} ${device.model}`}
              </span>
              <Badge variant={statusConfig.variant} size="sm" pulse={statusConfig.pulse}>
                {statusConfig.label}
              </Badge>
            </div>

            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                alignItems: "center",
                gap: "8px",
                paddingTop: "4px",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  padding: "6px 10px",
                  borderRadius: "var(--radius-sm)",
                  backgroundColor: "var(--color-surface-card)",
                  border: "var(--border-subtle)",
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
                  IPv4:
                </span>
                <span
                  style={{
                    fontSize: "0.75rem",
                    fontWeight: 600,
                    color: "var(--color-healthy)",
                    fontFamily: "var(--font-mono)",
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {device.ipAddress}
                </span>
                <button
                  onClick={handleCopyIp}
                  aria-label={copied ? "IP copiado" : "Copiar endereço IP"}
                  title={copied ? "Copiado!" : "Copiar endereço IP"}
                  style={{
                    background: "transparent",
                    border: "none",
                    color: copied ? "var(--color-healthy)" : "var(--color-text-muted)",
                    cursor: "pointer",
                    padding: "4px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    transition: "color var(--transition-fast)",
                  }}
                >
                  <Copy size={14} />
                </button>
              </div>

              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  padding: "6px 10px",
                  borderRadius: "var(--radius-sm)",
                  backgroundColor: "var(--color-surface-card)",
                  border: "var(--border-subtle)",
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
                  MAC:
                </span>
                <span
                  style={{
                    fontSize: "0.75rem",
                    color: "var(--color-text-secondary)",
                    fontFamily: "var(--font-mono)",
                  }}
                >
                  {device.macAddress}
                </span>
              </div>

              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  padding: "6px 10px",
                  borderRadius: "var(--radius-sm)",
                  backgroundColor: "var(--color-surface-card)",
                  border: "var(--border-subtle)",
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
                  Firmware:
                </span>
                <span
                  style={{
                    fontSize: "0.75rem",
                    color: "var(--color-text-secondary)",
                    fontFamily: "var(--font-mono)",
                  }}
                >
                  {device.firmwareVersion}
                </span>
              </div>

              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  padding: "6px 10px",
                  borderRadius: "var(--radius-sm)",
                  backgroundColor: "var(--color-surface-card)",
                  border: "var(--border-subtle)",
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
                  Uptime:
                </span>
                <span
                  style={{
                    fontSize: "0.75rem",
                    fontWeight: 500,
                    color: "var(--color-healthy)",
                    fontFamily: "var(--font-mono)",
                  }}
                >
                  {device.uptimeDisplay}
                </span>
              </div>

              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  padding: "6px 10px",
                  borderRadius: "var(--radius-sm)",
                  backgroundColor: "var(--color-surface-card)",
                  border: "var(--border-subtle)",
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
                  Local:
                </span>
                <span
                  style={{
                    fontSize: "0.75rem",
                    color: "var(--color-text-secondary)",
                    fontFamily: "var(--font-mono)",
                  }}
                >
                  {device.location} • {device.rack}
                </span>
              </div>
            </div>
          </div>

          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              alignItems: "center",
              gap: "8px",
            }}
          >
            <Button
              onClick={onTriggerProbe}
              isLoading={isProbing}
              disabled={isProbing}
              variant="primary"
              size="sm"
              icon={<Play size={16} />}
              style={{ gap: "8px" }}
            >
              Disparar Ping / ICMP
            </Button>

            <a
              href={`/devices/${device.id}/edit`}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                padding: "8px 12px",
                backgroundColor: "var(--color-surface-card)",
                border: "var(--border-subtle)",
                borderRadius: "var(--radius-md)",
                color: "var(--color-text-secondary)",
                fontSize: "0.75rem",
                fontWeight: 600,
                fontFamily: "var(--font-sans)",
                textDecoration: "none",
                transition: "background-color var(--transition-fast), border-color var(--transition-fast)",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = "var(--color-surface-hover)";
                e.currentTarget.style.borderColor = "var(--border-hover)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = "var(--color-surface-card)";
                e.currentTarget.style.borderColor = "var(--border-subtle)";
              }}
            >
              <Edit size={14} style={{ color: "var(--color-text-muted)" }} />
              <span>Editar Ativo</span>
            </a>

            <a
              href="/maintenance"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                padding: "8px 12px",
                backgroundColor: "var(--color-surface-card)",
                border: "var(--border-subtle)",
                borderRadius: "var(--radius-md)",
                color: "var(--color-text-secondary)",
                fontSize: "0.75rem",
                fontWeight: 600,
                fontFamily: "var(--font-sans)",
                textDecoration: "none",
                transition: "background-color var(--transition-fast), border-color var(--transition-fast)",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = "var(--color-surface-hover)";
                e.currentTarget.style.borderColor = "var(--border-hover)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = "var(--color-surface-card)";
                e.currentTarget.style.borderColor = "var(--border-subtle)";
              }}
            >
              <GitBranch size={14} style={{ color: "var(--color-text-muted)" }} />
              <span>Janela Técnica</span>
            </a>

            <a
              href="/topology"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                padding: "8px 12px",
                backgroundColor: "var(--color-surface-card)",
                border: "var(--border-subtle)",
                borderRadius: "var(--radius-md)",
                color: "var(--color-text-secondary)",
                fontSize: "0.75rem",
                fontWeight: 600,
                fontFamily: "var(--font-sans)",
                textDecoration: "none",
                transition: "background-color var(--transition-fast), border-color var(--transition-fast)",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = "var(--color-surface-hover)";
                e.currentTarget.style.borderColor = "var(--border-hover)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = "var(--color-surface-card)";
                e.currentTarget.style.borderColor = "var(--border-subtle)";
              }}
            >
              <GitBranch size={14} style={{ color: "var(--color-healthy)" }} />
              <span>Ver no Grafo</span>
            </a>
          </div>
        </div>
      </div>
    </section>
  );
};