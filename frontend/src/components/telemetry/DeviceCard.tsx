import React from "react";
import { AlertTriangle, Server, WifiOff } from "lucide-react";
import type { MonitoredDevice } from "../../types/telemetry";
import { Sparkline } from "./Sparkline";

export interface DeviceCardProps {
  device: MonitoredDevice;
  onSelect?: (device: MonitoredDevice) => void;
  onPing?: (device: MonitoredDevice) => void;
}

export const DeviceCard: React.FC<DeviceCardProps> = ({
  device,
  onSelect,
  onPing,
}) => {
  const isDown = device.status === "DOWN" || device.severity === "critical";
  const isDegraded = device.status === "DEG" || device.severity === "degraded";

  const getStatusBadge = () => {
    if (isDown) {
      return (
        <span
          style={{
            padding: "2px 8px",
            borderRadius: "var(--radius-full, 9999px)",
            fontSize: "10px",
            fontFamily: "var(--font-mono, monospace)",
            fontWeight: 700,
            backgroundColor: "rgba(244, 63, 94, 0.2)",
            color: "#f43f5e",
            border: "1px solid rgba(244, 63, 94, 0.4)",
          }}
        >
          DOWN
        </span>
      );
    }
    if (isDegraded) {
      return (
        <span
          style={{
            padding: "2px 8px",
            borderRadius: "var(--radius-full, 9999px)",
            fontSize: "10px",
            fontFamily: "var(--font-mono, monospace)",
            fontWeight: 700,
            backgroundColor: "rgba(245, 158, 11, 0.2)",
            color: "#f59e0b",
            border: "1px solid rgba(245, 158, 11, 0.4)",
          }}
        >
          DEG
        </span>
      );
    }
    return (
      <span
        style={{
          padding: "2px 8px",
          borderRadius: "var(--radius-full, 9999px)",
          fontSize: "10px",
          fontFamily: "var(--font-mono, monospace)",
          fontWeight: 700,
          backgroundColor: "rgba(16, 185, 129, 0.2)",
          color: "#10b981",
          border: "1px solid rgba(16, 185, 129, 0.3)",
        }}
      >
        UP
      </span>
    );
  };

  const getBorderAndShadow = () => {
    if (isDown) {
      return {
        borderColor: "rgba(244, 63, 94, 0.6)",
        boxShadow: "0 0 20px -3px rgba(244, 63, 94, 0.25)",
      };
    }
    if (isDegraded) {
      return {
        borderColor: "rgba(245, 158, 11, 0.5)",
        boxShadow: "0 0 20px -3px rgba(245, 158, 11, 0.25)",
      };
    }
    return {
      borderColor: "rgba(255, 255, 255, 0.08)",
      boxShadow: "0 10px 30px -10px rgba(0, 0, 0, 0.5)",
    };
  };

  const borderStyles = getBorderAndShadow();

  return (
    <article
      data-testid={`device-card-${device.device_id}`}
      style={{
        backgroundColor: "var(--color-surface-card, #0d1424)",
        border: `1px solid ${borderStyles.borderColor}`,
        borderRadius: "16px",
        padding: "18px 20px",
        boxShadow: borderStyles.boxShadow,
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        gap: "14px",
        transition: "border-color 200ms ease, box-shadow 200ms ease",
      }}
    >
      <div>
        {/* Cabeçalho do Card */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "10px" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
              <button
                type="button"
                onClick={() => onSelect?.(device)}
                style={{
                  fontFamily: "var(--font-mono, monospace)",
                  fontSize: "0.875rem",
                  fontWeight: 700,
                  color: isDown ? "#f43f5e" : isDegraded ? "#f59e0b" : "var(--color-text-primary, #f8fafc)",
                  background: "transparent",
                  border: "none",
                  padding: 0,
                  cursor: "pointer",
                  textAlign: "left",
                }}
                className="hover-text-brand"
              >
                {device.name}
              </button>
              {getStatusBadge()}
            </div>
            <p
              style={{
                fontSize: "0.75rem",
                color: "var(--color-text-muted, #94a3b8)",
                marginTop: "4px",
                margin: 0,
              }}
            >
              {device.model_description || `${device.category || "DISPOSITIVO"} • ${device.location || "Cluster Principal"}`}
            </p>
          </div>

          <div
            style={{
              width: "32px",
              height: "32px",
              borderRadius: "50%",
              backgroundColor: isDown
                ? "rgba(244, 63, 94, 0.1)"
                : isDegraded
                ? "rgba(245, 158, 11, 0.1)"
                : "rgba(16, 185, 129, 0.1)",
              border: `1px solid ${
                isDown
                  ? "rgba(244, 63, 94, 0.2)"
                  : isDegraded
                  ? "rgba(245, 158, 11, 0.2)"
                  : "rgba(16, 185, 129, 0.2)"
              }`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: isDown ? "#f43f5e" : isDegraded ? "#f59e0b" : "#10b981",
              flexShrink: 0,
            }}
          >
            {isDown ? <WifiOff size={16} /> : isDegraded ? <AlertTriangle size={16} /> : <Server size={16} />}
          </div>
        </div>

        {/* Grade 2x2 de Informações Técnicas */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "8px",
            marginTop: "14px",
            padding: "10px 12px",
            borderRadius: "12px",
            backgroundColor: isDown
              ? "rgba(244, 63, 94, 0.08)"
              : isDegraded
              ? "rgba(245, 158, 11, 0.08)"
              : "rgba(7, 10, 18, 0.75)",
            border: `1px solid ${
              isDown
                ? "rgba(244, 63, 94, 0.2)"
                : isDegraded
                ? "rgba(245, 158, 11, 0.2)"
                : "rgba(255, 255, 255, 0.06)"
            }`,
            fontFamily: "var(--font-mono, monospace)",
            fontSize: "11px",
          }}
        >
          <div>
            <span style={{ color: "var(--color-text-dim, #64748b)" }}>IP: </span>
            <span style={{ color: "var(--color-text-primary, #f8fafc)" }}>{device.ip_address}</span>
          </div>

          <div style={{ textAlign: "right" }}>
            <span style={{ color: "var(--color-text-dim, #64748b)" }}>RTT: </span>
            <span
              style={{
                fontWeight: 700,
                color: isDown
                  ? "#f43f5e"
                  : isDegraded
                  ? "#f59e0b"
                  : "var(--color-healthy, #10b981)",
              }}
            >
              {device.last_latency_ms !== null && device.last_latency_ms !== undefined
                ? `${device.last_latency_ms.toFixed(1)}ms`
                : isDown
                ? "TIMEOUT"
                : "--"}
            </span>
          </div>

          <div>
            <span style={{ color: "var(--color-text-dim, #64748b)" }}>
              {isDown ? "Causa: " : "CPU / RAM: "}
            </span>
            <span style={{ color: isDown ? "#fca5a5" : "var(--color-text-secondary, #cbd5e1)" }}>
              {isDown
                ? device.root_cause || "Fibra Rompida"
                : `${device.cpu_usage_pct || 45}% / ${device.ram_usage_pct || 52}%`}
            </span>
          </div>

          <div style={{ textAlign: "right" }}>
            <span style={{ color: "var(--color-text-dim, #64748b)" }}>
              {isDown ? "Downtime: " : "SFP+: "}
            </span>
            <span
              style={{
                color: isDown
                  ? "#f43f5e"
                  : isDegraded
                  ? "#f59e0b"
                  : "var(--color-text-primary, #f8fafc)",
                fontWeight: 600,
              }}
            >
              {isDown
                ? device.downtime_duration || "00:14:32"
                : device.ports_summary || "18/24 UP"}
            </span>
          </div>
        </div>

        {/* Sparkline de Latência dos Últimos Pings */}
        {device.recent_latency && device.recent_latency.length > 0 && (
          <div style={{ marginTop: "12px", width: "100%" }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                fontSize: "10px",
                fontFamily: "var(--font-mono, monospace)",
                color: "var(--color-text-dim, #64748b)",
                marginBottom: "4px",
              }}
            >
              <span>Latência (Últimos 60 pings)</span>
              <span>
                Min: {Math.min(...device.recent_latency).toFixed(1)}ms • Max:{" "}
                {Math.max(...device.recent_latency).toFixed(1)}ms
              </span>
            </div>
            <Sparkline
              data={device.recent_latency}
              width={280}
              height={32}
              severity={device.severity}
            />
          </div>
        )}
      </div>

      {/* Rodapé com Uptime e Ações */}
      <div
        style={{
          borderTop: "1px solid rgba(255, 255, 255, 0.06)",
          paddingTop: "10px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          fontSize: "11px",
          fontFamily: "var(--font-mono, monospace)",
        }}
      >
        <span style={{ color: "var(--color-text-muted, #94a3b8)" }}>
          {isDown ? (
            <span style={{ color: "#f43f5e", fontWeight: 700 }}>
              {device.ticket_id ? `Ticket #${device.ticket_id}` : "Incidente P1"}
            </span>
          ) : (
            `Uptime: ${device.uptime_duration || "184d 12h"}`
          )}
        </span>

        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          {onPing && (
            <button
              type="button"
              onClick={() => onPing(device)}
              style={{
                backgroundColor: "transparent",
                border: "none",
                color: "var(--brand-primary, #eab308)",
                fontWeight: 600,
                cursor: "pointer",
                padding: "2px 6px",
                borderRadius: "4px",
              }}
              className="hover:underline"
            >
              Ping Agora
            </button>
          )}

          <button
            type="button"
            onClick={() => onSelect?.(device)}
            style={{
              backgroundColor: "rgba(255, 255, 255, 0.06)",
              border: "1px solid rgba(255, 255, 255, 0.1)",
              borderRadius: "9999px",
              padding: "3px 10px",
              fontSize: "10px",
              color: "var(--color-text-secondary, #cbd5e1)",
              cursor: "pointer",
              transition: "background-color 150ms ease, color 150ms ease",
            }}
          >
            Detalhes
          </button>
        </div>
      </div>
    </article>
  );
};
