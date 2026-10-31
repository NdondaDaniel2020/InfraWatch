import React, { useState } from "react";
import { Grid, Search, ChevronLeft } from "lucide-react";
import type { OpticalInterfaceItem } from "../../types/deviceDetail";

interface DeviceInterfacesTableProps {
  interfaces: OpticalInterfaceItem[];
}

const getStatusConfig = (status: OpticalInterfaceItem["status"]) => {
  switch (status) {
    case "UP":
      return {
        variant: "healthy" as const,
        label: "UP",
        bg: "var(--color-healthy-bg)",
        border: "var(--color-healthy-border)",
        text: "var(--color-healthy)",
        dotColor: "var(--color-healthy)",
      };
    case "DEG":
      return {
        variant: "degraded" as const,
        label: "DEG",
        bg: "var(--color-degraded-bg)",
        border: "var(--color-degraded-border)",
        text: "var(--color-degraded)",
        dotColor: "var(--color-degraded)",
      };
    case "DOWN":
      return {
        variant: "critical" as const,
        label: "DOWN",
        bg: "var(--color-critical-bg)",
        border: "var(--color-critical-border)",
        text: "var(--color-critical)",
        dotColor: "var(--color-critical)",
      };
    case "FREE":
      return {
        variant: "neutral" as const,
        label: "LIVRE",
        bg: "var(--color-neutral-bg)",
        border: "var(--color-neutral-border)",
        text: "var(--color-neutral)",
        dotColor: "var(--color-neutral)",
      };
    default:
      return {
        variant: "neutral" as const,
        label: String(status || "UNKNOWN").toUpperCase(),
        bg: "var(--color-neutral-bg)",
        border: "var(--color-neutral-border)",
        text: "var(--color-neutral)",
        dotColor: "var(--color-neutral)",
      };
  }
};

const formatPower = (power: string) => {
  if (power === "N/A") return <span style={{ color: "var(--color-text-muted)", fontFamily: "var(--font-mono)" }}>N/A</span>;
  const num = parseFloat(power);
  if (isNaN(num)) return <span style={{ color: "var(--color-text-muted)", fontFamily: "var(--font-mono)" }}>{power}</span>;
  const color = num > -1 ? "var(--color-healthy)" : num > -10 ? "var(--color-degraded)" : "var(--color-critical)";
  return (
    <span style={{ color, fontFamily: "var(--font-mono)", fontWeight: 500 }}>
      {power}
    </span>
  );
};

const formatLoss = (loss?: number) => {
  const safeLoss = loss ?? 0;
  if (safeLoss === 0) return <span style={{ color: "var(--color-healthy)", fontFamily: "var(--font-mono)" }}>0%</span>;
  if (safeLoss < 1) return <span style={{ color: "var(--color-degraded)", fontFamily: "var(--font-mono)" }}>{safeLoss.toFixed(1)}%</span>;
  return <span style={{ color: "var(--color-critical)", fontFamily: "var(--font-mono)" }}>{safeLoss.toFixed(1)}%</span>;
};

const formatErrors = (errors: number) => {
  if (errors === 0) return <span style={{ color: "var(--color-healthy)", fontFamily: "var(--font-mono)" }}>0</span>;
  if (errors < 10) return <span style={{ color: "var(--color-degraded)", fontFamily: "var(--font-mono)" }}>{errors}</span>;
  return <span style={{ color: "var(--color-critical)", fontFamily: "var(--font-mono)", fontWeight: 600 }}>{errors}/min</span>;
};

export const DeviceInterfacesTable: React.FC<DeviceInterfacesTableProps> = ({
  interfaces,
}) => {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedPort, setSelectedPort] = useState<OpticalInterfaceItem | null>(null);

  const activePorts = interfaces.filter((i) => i.status !== "FREE").length;
  const totalPorts = interfaces.length;

  const filteredInterfaces = interfaces.filter(
    (i) =>
      (i.portName || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
      (i.description || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
      String(i.portNumber ?? "").includes(searchTerm)
  );

  const handlePortClick = (port: OpticalInterfaceItem) => {
    setSelectedPort(port);
  };

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
      aria-label="Matriz de Portas Físicas"
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <Grid size={18} style={{ color: "var(--color-healthy)" }} />
          <h3
            style={{
              fontSize: "0.75rem",
              fontWeight: 700,
              color: "var(--color-text-primary)",
              fontFamily: "var(--font-mono)",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
            }}
          >
            Matriz de Portas Físicas (24 SFP28 25GbE)
          </h3>
        </div>
        <span
          style={{
            fontSize: "0.75rem",
            fontWeight: 700,
            color: "var(--color-healthy)",
            fontFamily: "var(--font-mono)",
            fontVariantNumeric: "tabular-nums",
            padding: "2px 8px",
            borderRadius: "var(--radius-sm)",
            backgroundColor: "var(--color-healthy-bg)",
            border: "1px solid var(--color-healthy-border)",
          }}
        >
          {`${activePorts} / ${totalPorts} ATIVAS`}
        </span>
      </div>

      <div
        style={{
          display: "flex",
          gap: "8px",
          marginBottom: "8px",
        }}
      >
        <div
          style={{
            position: "relative",
            flex: 1,
            maxWidth: "280px",
          }}
        >
          <Search
            style={{
              position: "absolute",
              left: "10px",
              top: "50%",
              transform: "translateY(-50%)",
              color: "var(--color-text-muted)",
              fontSize: "16px",
            }}
          />
          <input
            type="text"
            placeholder="Filtrar portas..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{
              width: "100%",
              padding: "8px 12px 8px 36px",
              backgroundColor: "var(--color-surface-card)",
              border: "var(--border-subtle)",
              borderRadius: "var(--radius-sm)",
              color: "var(--color-text-primary)",
              fontFamily: "var(--font-sans)",
              fontSize: "0.75rem",
              outline: "none",
              transition: "border-color var(--transition-fast)",
            }}
            onFocus={(e) => (e.currentTarget.style.borderColor = "var(--color-border-focus)")}
            onBlur={(e) => (e.currentTarget.style.borderColor = "var(--color-border-subtle)")}
          />
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(12, 1fr)",
          gap: "4px",
          backgroundColor: "var(--color-surface-card)",
          padding: "12px",
          borderRadius: "var(--radius-lg)",
          border: "var(--border-subtle)",
        }}
      >
        {filteredInterfaces.map((port) => {
          const statusConfig = getStatusConfig(port.status);
          const isSelected = selectedPort?.portNumber === port.portNumber;
          return (
            <button
              key={port.portNumber}
              onClick={() => handlePortClick(port)}
              style={{
                height: "36px",
                borderRadius: "var(--radius-sm)",
                backgroundColor: isSelected
                  ? statusConfig.bg
                  : statusConfig.bg,
                border: isSelected
                  ? `2px solid ${statusConfig.dotColor}`
                  : `1px solid ${statusConfig.border}`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "0.625rem",
                fontWeight: 700,
                fontFamily: "var(--font-mono)",
                fontVariantNumeric: "tabular-nums",
                color: statusConfig.text,
                cursor: "pointer",
                transition:
                  "transform var(--transition-fast), box-shadow var(--transition-fast), border-color var(--transition-fast)",
                boxShadow: isSelected
                  ? `0 0 8px ${statusConfig.dotColor}`
                  : port.status === "DEG"
                  ? `0 0 8px ${statusConfig.dotColor}`
                  : "none",
              }}
              title={port.status === "DEG" ? `${port.description} (CRC: ${port.crcErrorsPerMin}/min)` : port.description}
            >
              {port.portNumber < 10 ? `0${port.portNumber}` : port.portNumber}
            </button>
          );
        })}
      </div>

      {selectedPort && (
        <div
          style={{
            backgroundColor: "var(--color-surface-card)",
            border: "var(--border-subtle)",
            borderRadius: "var(--radius-lg)",
            padding: "12px 16px",
            display: "flex",
            flexDirection: "column",
            gap: "8px",
            animation: "fade-in 0.2s ease-out",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span
                style={{
                  fontSize: "0.75rem",
                  fontWeight: 700,
                  color: "var(--color-text-primary)",
                  fontFamily: "var(--font-mono)",
                }}
              >
                Porta {selectedPort.portNumber < 10 ? `0${selectedPort.portNumber}` : selectedPort.portNumber} Inspecionada (SFP28)
              </span>
              <span
                style={{
                  fontSize: "0.75rem",
                  fontWeight: 700,
                  color: getStatusConfig(selectedPort.status).text,
                  fontFamily: "var(--font-mono)",
                  padding: "2px 8px",
                  borderRadius: "var(--radius-sm)",
                  backgroundColor: getStatusConfig(selectedPort.status).bg,
                  border: `1px solid ${getStatusConfig(selectedPort.status).border}`,
                }}
              >
                {selectedPort.status}
              </span>
            </div>
            <button
              onClick={() => setSelectedPort(null)}
              style={{
                background: "transparent",
                border: "none",
                color: "var(--color-text-muted)",
                cursor: "pointer",
                padding: "4px",
              }}
            >
              <ChevronLeft size={16} />
            </button>
          </div>

          <p
            style={{
              fontSize: "0.6875rem",
              color: "var(--color-text-muted)",
              fontFamily: "var(--font-sans)",
            }}
          >
            {selectedPort.description}
          </p>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))",
              gap: "8px",
              paddingTop: "8px",
              borderTop: "var(--border-subtle)",
            }}
          >
            <div>
              <span style={{ fontSize: "0.625rem", color: "var(--color-text-muted)", textTransform: "uppercase", fontFamily: "var(--font-mono)" }}>
                Potência Rx
              </span>
              <div style={{ fontSize: "0.75rem", fontFamily: "var(--font-mono)", fontWeight: 500 }}>
                {formatPower(selectedPort.rxPowerDbm)}
              </div>
            </div>
            <div>
              <span style={{ fontSize: "0.625rem", color: "var(--color-text-muted)", textTransform: "uppercase", fontFamily: "var(--font-mono)" }}>
                Perda
              </span>
              <div style={{ fontSize: "0.75rem", fontFamily: "var(--font-mono)", fontWeight: 500 }}>
                {formatLoss(selectedPort.packetLossPct)}
              </div>
            </div>
            <div>
              <span style={{ fontSize: "0.625rem", color: "var(--color-text-muted)", textTransform: "uppercase", fontFamily: "var(--font-mono)" }}>
                Erros CRC
              </span>
              <div style={{ fontSize: "0.75rem", fontFamily: "var(--font-mono)", fontWeight: 500 }}>
                {formatErrors(selectedPort.crcErrorsPerMin)}
              </div>
            </div>
            <div>
              <span style={{ fontSize: "0.625rem", color: "var(--color-text-muted)", textTransform: "uppercase", fontFamily: "var(--font-mono)" }}>
                MTU
              </span>
              <div style={{ fontSize: "0.75rem", fontFamily: "var(--font-mono)", fontWeight: 500, color: "var(--color-text-secondary)" }}>
                {selectedPort.mtu} Jumbo
              </div>
            </div>
            <div>
              <span style={{ fontSize: "0.625rem", color: "var(--color-text-muted)", textTransform: "uppercase", fontFamily: "var(--font-mono)" }}>
                Duplex
              </span>
              <div style={{ fontSize: "0.75rem", fontFamily: "var(--font-mono)", fontWeight: 500, color: "var(--color-healthy)" }}>
                {selectedPort.duplex}
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};