import React from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Tv } from "lucide-react";
import { Badge } from "../../components/ui/Badge";
import { LiveIndicator } from "../../components/common/LiveIndicator";

export const TvWallboardPage: React.FC = () => {
  return (
    <div
      data-testid="tv-wallboard-page"
      style={{
        minHeight: "100vh",
        backgroundColor: "#05070d",
        color: "#ffffff",
        padding: "32px",
        display: "flex",
        flexDirection: "column",
        gap: "32px",
        fontFamily: "var(--font-sans)",
      }}
    >
      {/* Topo do Wallboard */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
          <Link
            to="/noc"
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              padding: "8px 12px",
              backgroundColor: "rgba(255, 255, 255, 0.08)",
              borderRadius: "var(--radius-md)",
              color: "#ffffff",
              textDecoration: "none",
              fontSize: "0.875rem",
            }}
          >
            <ArrowLeft size={16} />
            <span>Sair do Modo TV</span>
          </Link>

          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <Tv size={24} style={{ color: "var(--color-primary)" }} />
            <h1 style={{ fontSize: "1.75rem", fontWeight: 800, margin: 0 }}>
              NOC WALLBOARD 16:9 — INFRAWATCH
            </h1>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
          <LiveIndicator />
          <Badge variant="healthy" dot pulse>
            TELEMETRIA ULTRA-WIDE
          </Badge>
        </div>
      </div>

      {/* Grade de Destaque para Painéis de Parede */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: "24px",
          flex: 1,
        }}
      >
        <div
          style={{
            backgroundColor: "#0b101d",
            border: "1px solid rgba(16, 185, 129, 0.3)",
            borderRadius: "var(--radius-lg)",
            padding: "24px",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
          }}
        >
          <div>
            <div style={{ fontSize: "1rem", color: "var(--color-text-secondary)", fontWeight: 600 }}>
              DISPOSITIVOS UP
            </div>
            <div style={{ fontSize: "4.5rem", fontWeight: 800, fontFamily: "var(--font-mono)", color: "var(--color-healthy)", marginTop: "12px" }}>
              45
            </div>
          </div>
          <div style={{ fontSize: "0.875rem", color: "var(--color-text-muted)" }}>
            ICMP Ping e HTTP Probes ativos sem jitter
          </div>
        </div>

        <div
          style={{
            backgroundColor: "#0b101d",
            border: "1px solid rgba(239, 68, 68, 0.3)",
            borderRadius: "var(--radius-lg)",
            padding: "24px",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
          }}
        >
          <div>
            <div style={{ fontSize: "1rem", color: "var(--color-text-secondary)", fontWeight: 600 }}>
              DISPOSITIVOS DOWN
            </div>
            <div style={{ fontSize: "4.5rem", fontWeight: 800, fontFamily: "var(--font-mono)", color: "var(--color-critical)", marginTop: "12px" }} className="pulse-indicator">
              1
            </div>
          </div>
          <div style={{ fontSize: "0.875rem", color: "var(--color-critical)" }}>
            SW-AGG-02 (Switch Core Luanda Sul)
          </div>
        </div>

        <div
          style={{
            backgroundColor: "#0b101d",
            border: "1px solid rgba(59, 130, 246, 0.3)",
            borderRadius: "var(--radius-lg)",
            padding: "24px",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
          }}
        >
          <div>
            <div style={{ fontSize: "1rem", color: "var(--color-text-secondary)", fontWeight: 600 }}>
              LATÊNCIA MÉDIA P95
            </div>
            <div style={{ fontSize: "4.5rem", fontWeight: 800, fontFamily: "var(--font-mono)", color: "var(--color-primary)", marginTop: "12px" }}>
              4.2ms
            </div>
          </div>
          <div style={{ fontSize: "0.875rem", color: "var(--color-text-muted)" }}>
            Threshold de alarme definido em 50ms
          </div>
        </div>
      </div>
    </div>
  );
};
