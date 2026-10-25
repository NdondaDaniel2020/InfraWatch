import React from "react";
import { Link } from "react-router-dom";
import { CheckCircle2, AlertTriangle, ShieldCheck, Server } from "lucide-react";
import type { SlaDeviceBreakdown } from "../../types/sla";
import { Badge } from "../ui";

interface SlaDeviceBreakdownTableProps {
  devices: SlaDeviceBreakdown[];
  targetSlaPct: number;
}

export const SlaDeviceBreakdownTable: React.FC<SlaDeviceBreakdownTableProps> = ({
  devices,
  targetSlaPct,
}) => {
  return (
    <section
      data-testid="sla-device-breakdown-table"
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
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <Server size={18} className="text-emerald-400" />
          <h3 style={{ fontSize: "0.875rem", fontWeight: 700, color: "var(--color-text-primary)" }}>
            Detalhamento de Disponibilidade por Ativo de Rede
          </h3>
        </div>
        <span style={{ fontSize: "0.75rem", fontFamily: "var(--font-mono)", color: "var(--color-text-muted)" }}>
          Total de Ativos Monitorados: <strong>{devices.length}</strong>
        </span>
      </div>

      <div style={{ overflowX: "auto" }}>
        <table
          style={{
            width: "100%",
            borderCollapse: "collapse",
            fontSize: "0.75rem",
            fontFamily: "var(--font-mono)",
            textAlign: "left",
          }}
        >
          <thead>
            <tr
              style={{
                borderBottom: "var(--border-subtle)",
                color: "var(--color-text-muted)",
                fontSize: "0.6875rem",
                textTransform: "uppercase",
              }}
            >
              <th style={{ padding: "10px 12px" }}>Ativo / FQDN</th>
              <th style={{ padding: "10px 12px" }}>Endereço IPv4</th>
              <th style={{ padding: "10px 12px" }}>Tier</th>
              <th style={{ padding: "10px 12px" }}>Uptime Bruto</th>
              <th style={{ padding: "10px 12px" }}>Isenção RFC (min)</th>
              <th style={{ padding: "10px 12px" }}>Uptime Líquido</th>
              <th style={{ padding: "10px 12px", textAlign: "right" }}>Conformidade</th>
            </tr>
          </thead>
          <tbody>
            {devices.map((device) => {
              const isCompliant = device.netUptimePct >= targetSlaPct;

              return (
                <tr
                  key={device.deviceId}
                  style={{
                    borderBottom: "var(--border-subtle)",
                    transition: "background-color var(--transition-fast)",
                  }}
                >
                  <td style={{ padding: "12px", fontWeight: 600, color: "var(--color-text-primary)" }}>
                    <Link
                      to={`/devices/${device.deviceId}`}
                      style={{ color: "inherit", textDecoration: "none" }}
                      className="hover:underline"
                    >
                      {device.deviceName}
                    </Link>
                  </td>
                  <td style={{ padding: "12px", color: "var(--color-text-secondary)" }}>
                    {device.ipAddress}
                  </td>
                  <td style={{ padding: "12px" }}>
                    <span
                      style={{
                        padding: "2px 6px",
                        borderRadius: "var(--radius-sm)",
                        backgroundColor: "var(--color-surface-card)",
                        border: "var(--border-subtle)",
                        fontSize: "0.625rem",
                        fontWeight: 700,
                        color: "var(--color-primary)",
                      }}
                    >
                      {device.tier}
                    </span>
                  </td>
                  <td style={{ padding: "12px", color: "var(--color-text-muted)" }}>
                    {device.nominalUptimePct.toFixed(2)}%
                  </td>
                  <td style={{ padding: "12px", color: "var(--color-primary)" }}>
                    +{device.exemptedMaintenanceMinutes}m (ADR-009)
                  </td>
                  <td
                    style={{
                      padding: "12px",
                      fontWeight: 700,
                      color: isCompliant ? "var(--color-healthy)" : "var(--color-critical)",
                    }}
                  >
                    {device.netUptimePct.toFixed(2)}%
                  </td>
                  <td style={{ padding: "12px", textAlign: "right" }}>
                    <Badge variant={isCompliant ? "healthy" : "critical"} size="sm">
                      {isCompliant ? "CONFORME" : "VIOLAÇÃO"}
                    </Badge>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
};
