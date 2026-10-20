import React, { useEffect } from "react";
import { RefreshCw, Wrench, X } from "lucide-react";
import type { MonitoredDevice } from "../../types/telemetry";
import { Sparkline } from "./Sparkline";
import { UptimeHistory90d } from "./UptimeHistory90d";

export interface DeviceDetailDrawerProps {
  device: MonitoredDevice | null;
  isOpen: boolean;
  onClose: () => void;
  onPing?: (device: MonitoredDevice) => void;
}

export const DeviceDetailDrawer: React.FC<DeviceDetailDrawerProps> = ({
  device,
  isOpen,
  onClose,
  onPing,
}) => {
  // Fecha a gaveta com ESC
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || !device) return null;

  const isDown = device.status === "DOWN" || device.severity === "critical";
  const isDegraded = device.status === "DEG" || device.severity === "degraded";

  return (
    <div
      data-testid="device-detail-drawer-backdrop"
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(0, 0, 0, 0.75)",
        backdropFilter: "blur(6px)",
        WebkitBackdropFilter: "blur(6px)",
        zIndex: 100,
        display: "flex",
        justifyContent: "flex-end",
        animation: "fadeIn 150ms ease",
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="drawer-device-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <aside
        data-testid="device-detail-drawer-content"
        style={{
          width: "100%",
          maxWidth: "580px",
          height: "100%",
          backgroundColor: "var(--color-surface-card, #0d1424)",
          borderLeft: "1px solid rgba(255, 255, 255, 0.12)",
          boxShadow: "-16px 0 36px -8px rgba(0, 0, 0, 0.65)",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          overflowY: "auto",
        }}
      >
        {/* Header do Drawer */}
        <div
          style={{
            padding: "20px 24px",
            borderBottom: "1px solid rgba(255, 255, 255, 0.08)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            gap: "16px",
          }}
        >
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
              <span
                style={{
                  fontSize: "11px",
                  fontFamily: "var(--font-mono, monospace)",
                  fontWeight: 700,
                  color: "var(--brand-primary, #eab308)",
                  backgroundColor: "rgba(234, 179, 8, 0.12)",
                  border: "1px solid rgba(234, 179, 8, 0.3)",
                  padding: "2px 8px",
                  borderRadius: "9999px",
                }}
              >
                {device.category || "DISPOSITIVO"}
              </span>

              <span
                style={{
                  fontSize: "11px",
                  fontFamily: "var(--font-mono, monospace)",
                  fontWeight: 700,
                  color: isDown ? "#f43f5e" : isDegraded ? "#f59e0b" : "#10b981",
                  backgroundColor: isDown
                    ? "rgba(244, 63, 94, 0.15)"
                    : isDegraded
                    ? "rgba(245, 158, 11, 0.15)"
                    : "rgba(16, 185, 129, 0.15)",
                  border: `1px solid ${
                    isDown
                      ? "rgba(244, 63, 94, 0.3)"
                      : isDegraded
                      ? "rgba(245, 158, 11, 0.3)"
                      : "rgba(16, 185, 129, 0.3)"
                  }`,
                  padding: "2px 8px",
                  borderRadius: "9999px",
                }}
              >
                {device.status}
              </span>
            </div>

            <h2
              id="drawer-device-title"
              style={{
                fontSize: "1.25rem",
                fontWeight: 700,
                fontFamily: "var(--font-mono, monospace)",
                color: "var(--color-text-primary, #f8fafc)",
                margin: "8px 0 2px 0",
              }}
            >
              {device.name}
            </h2>
            <p
              style={{
                fontSize: "0.8125rem",
                color: "var(--color-text-muted, #94a3b8)",
                margin: 0,
              }}
            >
              {device.model_description || "Ativo de Rede Monitorado"} • {device.location || "DC Luanda"}
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar gaveta de detalhes"
            style={{
              padding: "6px",
              borderRadius: "8px",
              backgroundColor: "rgba(255, 255, 255, 0.05)",
              border: "1px solid rgba(255, 255, 255, 0.1)",
              color: "var(--color-text-muted, #94a3b8)",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Corpo com Informações Detalhadas */}
        <div style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: "20px", flex: 1 }}>
          {/* Métricas Principais */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(3, 1fr)",
              gap: "10px",
            }}
          >
            <div
              style={{
                padding: "12px",
                borderRadius: "12px",
                backgroundColor: "rgba(7, 10, 18, 0.8)",
                border: "1px solid rgba(255, 255, 255, 0.06)",
              }}
            >
              <div style={{ fontSize: "10px", fontFamily: "var(--font-mono)", color: "var(--color-text-dim)" }}>
                LATÊNCIA RTT
              </div>
              <div
                style={{
                  fontSize: "1.125rem",
                  fontFamily: "var(--font-mono)",
                  fontWeight: 700,
                  color: isDown ? "#f43f5e" : isDegraded ? "#f59e0b" : "#10b981",
                  marginTop: "4px",
                }}
              >
                {device.last_latency_ms !== null && device.last_latency_ms !== undefined
                  ? `${device.last_latency_ms.toFixed(1)}ms`
                  : "--"}
              </div>
            </div>

            <div
              style={{
                padding: "12px",
                borderRadius: "12px",
                backgroundColor: "rgba(7, 10, 18, 0.8)",
                border: "1px solid rgba(255, 255, 255, 0.06)",
              }}
            >
              <div style={{ fontSize: "10px", fontFamily: "var(--font-mono)", color: "var(--color-text-dim)" }}>
                PERDA PACOTES
              </div>
              <div
                style={{
                  fontSize: "1.125rem",
                  fontFamily: "var(--font-mono)",
                  fontWeight: 700,
                  color: isDown ? "#f43f5e" : "#10b981",
                  marginTop: "4px",
                }}
              >
                {isDown ? "100%" : `${device.last_packet_loss || 0}%`}
              </div>
            </div>

            <div
              style={{
                padding: "12px",
                borderRadius: "12px",
                backgroundColor: "rgba(7, 10, 18, 0.8)",
                border: "1px solid rgba(255, 255, 255, 0.06)",
              }}
            >
              <div style={{ fontSize: "10px", fontFamily: "var(--font-mono)", color: "var(--color-text-dim)" }}>
                DISPONIBILIDADE
              </div>
              <div
                style={{
                  fontSize: "1.125rem",
                  fontFamily: "var(--font-mono)",
                  fontWeight: 700,
                  color: "#10b981",
                  marginTop: "4px",
                }}
              >
                99.98%
              </div>
            </div>
          </div>

          {/* Sparkline de Tendência RTT */}
          <div
            style={{
              padding: "16px",
              borderRadius: "12px",
              backgroundColor: "rgba(7, 10, 18, 0.8)",
              border: "1px solid rgba(255, 255, 255, 0.06)",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                fontSize: "11px",
                fontFamily: "var(--font-mono)",
                color: "var(--color-text-muted)",
                marginBottom: "10px",
              }}
            >
              <span>Série Temporal de Latência (60 minutos)</span>
              <span style={{ color: "var(--brand-primary, #eab308)" }}>TimescaleDB Sincronizado</span>
            </div>
            <Sparkline
              data={device.recent_latency || [2.1, 2.3, 2.0, 2.4, 2.2, 2.1, 2.5, 2.1, 2.0, 2.2]}
              width={520}
              height={50}
              severity={device.severity}
            />
          </div>

          {/* Histórico de Disponibilidade 90 Dias */}
          <div
            style={{
              padding: "16px",
              borderRadius: "12px",
              backgroundColor: "rgba(7, 10, 18, 0.8)",
              border: "1px solid rgba(255, 255, 255, 0.06)",
            }}
          >
            <div
              style={{
                fontSize: "11px",
                fontFamily: "var(--font-mono)",
                color: "var(--color-text-muted)",
                marginBottom: "8px",
              }}
            >
              Histórico de Disponibilidade Operacional
            </div>
            <UptimeHistory90d
              days={device.availability_90d}
              barCount={30}
              overallUptime={99.98}
            />
          </div>

          {/* Ficha Técnica de Conectividade */}
          <div
            style={{
              padding: "16px",
              borderRadius: "12px",
              backgroundColor: "rgba(7, 10, 18, 0.8)",
              border: "1px solid rgba(255, 255, 255, 0.06)",
              fontSize: "12px",
              fontFamily: "var(--font-mono)",
              display: "flex",
              flexDirection: "column",
              gap: "8px",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: "var(--color-text-dim)" }}>Endereço IP:</span>
              <span style={{ color: "var(--color-text-primary)" }}>{device.ip_address}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: "var(--color-text-dim)" }}>Porta / Protocolo:</span>
              <span style={{ color: "var(--color-text-primary)" }}>{device.port || 443} / {device.protocol || "ICMP"}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: "var(--color-text-dim)" }}>Organização / Tenant:</span>
              <span style={{ color: "var(--brand-primary)" }}>{device.tenant_name || "Unitel Backbone"}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: "var(--color-text-dim)" }}>Interfaces SFP+:</span>
              <span style={{ color: "var(--color-text-primary)" }}>{device.ports_summary || "18/24 UP (LACP Trunk 1)"}</span>
            </div>
          </div>
        </div>

        {/* Rodapé com Ações Operacionais */}
        <div
          style={{
            padding: "16px 24px",
            borderTop: "1px solid rgba(255, 255, 255, 0.08)",
            backgroundColor: "rgba(7, 10, 18, 0.95)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: "12px",
          }}
        >
          <div style={{ display: "flex", gap: "8px" }}>
            {onPing && (
              <button
                type="button"
                onClick={() => onPing(device)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  padding: "8px 14px",
                  borderRadius: "8px",
                  backgroundColor: "rgba(234, 179, 8, 0.15)",
                  border: "1px solid rgba(234, 179, 8, 0.35)",
                  color: "var(--brand-primary, #eab308)",
                  fontSize: "12px",
                  fontFamily: "var(--font-mono)",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                <RefreshCw size={14} />
                Ping Teste
              </button>
            )}

            <button
              type="button"
              style={{
                display: "flex",
                alignItems: "center",
                gap: "6px",
                padding: "8px 14px",
                borderRadius: "8px",
                backgroundColor: "rgba(255, 255, 255, 0.06)",
                border: "1px solid rgba(255, 255, 255, 0.1)",
                color: "var(--color-text-secondary, #cbd5e1)",
                fontSize: "12px",
                fontFamily: "var(--font-mono)",
                cursor: "pointer",
              }}
            >
              <Wrench size={14} />
              Manutenção
            </button>
          </div>

          <button
            type="button"
            onClick={onClose}
            style={{
              padding: "8px 16px",
              borderRadius: "8px",
              backgroundColor: "rgba(255, 255, 255, 0.08)",
              border: "1px solid rgba(255, 255, 255, 0.15)",
              color: "var(--color-text-primary, #f8fafc)",
              fontSize: "12px",
              cursor: "pointer",
            }}
          >
            Fechar
          </button>
        </div>
      </aside>
    </div>
  );
};
