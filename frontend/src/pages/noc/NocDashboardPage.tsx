import React from "react";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Layers,
  Server,
  Wrench,
  Zap,
} from "lucide-react";
import { Badge } from "../../components/ui/Badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/Card";
import { useTelemetry } from "../../context/TelemetryContext";

export const NocDashboardPage: React.FC = () => {
  const { activeAlertsCount, recentEvents } = useTelemetry();

  return (
    <div
      data-testid="noc-dashboard-page"
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "24px",
        maxWidth: "1400px",
        width: "100%",
        margin: "0 auto",
      }}
    >
      {/* Título da Página */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "12px" }}>
        <div>
          <h1 style={{ fontSize: "1.5rem", fontWeight: 700, letterSpacing: "-0.02em" }}>
            Cockpit Operacional NOC
          </h1>
          <p style={{ fontSize: "0.875rem", color: "var(--color-text-secondary)", marginTop: "2px" }}>
            Visão consolidada em tempo real de sondagem, incidentes e latência do cluster.
          </p>
        </div>

        <div style={{ display: "flex", gap: "8px" }}>
          <Badge variant="healthy" dot pulse>
            TELEMETRIA ATIVA
          </Badge>
          {activeAlertsCount > 0 && (
            <Badge variant="critical" dot pulse>
              {activeAlertsCount} ALARME(S)
            </Badge>
          )}
        </div>
      </div>

      {/* Grid de Cards de Estatísticas */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
          gap: "16px",
        }}
      >
        <Card>
          <CardHeader style={{ padding: "16px 20px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: "0.75rem", color: "var(--color-text-secondary)", fontWeight: 600 }}>
                DISPOSITIVOS MONITORADOS
              </span>
              <Server size={18} style={{ color: "var(--color-primary)" }} />
            </div>
            <div style={{ fontSize: "1.75rem", fontWeight: 700, fontFamily: "var(--font-mono)", marginTop: "8px" }}>
              48 <span style={{ fontSize: "0.875rem", color: "var(--color-text-muted)" }}>/ 50 alvos</span>
            </div>
          </CardHeader>
          <CardContent style={{ padding: "0 20px 16px 20px" }}>
            <div style={{ fontSize: "0.75rem", color: "var(--color-healthy)", display: "flex", alignItems: "center", gap: "4px" }}>
              <CheckCircle2 size={14} /> 96% de cobertura de sondas
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader style={{ padding: "16px 20px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: "0.75rem", color: "var(--color-text-secondary)", fontWeight: 600 }}>
                INCIDENTES EM ABERTO
              </span>
              <AlertTriangle size={18} style={{ color: "var(--color-critical)" }} />
            </div>
            <div style={{ fontSize: "1.75rem", fontWeight: 700, fontFamily: "var(--font-mono)", marginTop: "8px", color: "var(--color-critical)" }}>
              {activeAlertsCount || 1} <span style={{ fontSize: "0.875rem", color: "var(--color-text-muted)" }}>ativo</span>
            </div>
          </CardHeader>
          <CardContent style={{ padding: "0 20px 16px 20px" }}>
            <div style={{ fontSize: "0.75rem", color: "var(--color-critical)", display: "flex", alignItems: "center", gap: "4px" }}>
              Ticket GLPI #402 gerado via Outbox
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader style={{ padding: "16px 20px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: "0.75rem", color: "var(--color-text-secondary)", fontWeight: 600 }}>
                LATÊNCIA MÉDIA P95
              </span>
              <Zap size={18} style={{ color: "var(--color-healthy)" }} />
            </div>
            <div style={{ fontSize: "1.75rem", fontWeight: 700, fontFamily: "var(--font-mono)", marginTop: "8px" }}>
              4.2 <span style={{ fontSize: "0.875rem", color: "var(--color-text-muted)" }}>ms</span>
            </div>
          </CardHeader>
          <CardContent style={{ padding: "0 20px 16px 20px" }}>
            <div style={{ fontSize: "0.75rem", color: "var(--color-healthy)", display: "flex", alignItems: "center", gap: "4px" }}>
              ICMP Ping & TCP sockets estáveis
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader style={{ padding: "16px 20px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: "0.75rem", color: "var(--color-text-secondary)", fontWeight: 600 }}>
                JANELAS DE MANUTENÇÃO
              </span>
              <Wrench size={18} style={{ color: "var(--color-maintenance)" }} />
            </div>
            <div style={{ fontSize: "1.75rem", fontWeight: 700, fontFamily: "var(--font-mono)", marginTop: "8px" }}>
              0 <span style={{ fontSize: "0.875rem", color: "var(--color-text-muted)" }}>em andamento</span>
            </div>
          </CardHeader>
          <CardContent style={{ padding: "0 20px 16px 20px" }}>
            <div style={{ fontSize: "0.75rem", color: "var(--color-text-muted)", display: "flex", alignItems: "center", gap: "4px" }}>
              Próxima: Backup Timescale às 02:00
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Feed Recente de Eventos SSE */}
      <Card>
        <CardHeader>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <Activity size={18} style={{ color: "var(--color-primary)" }} />
            <CardTitle>Últimos Eventos de Telemetria (Buffer Circular)</CardTitle>
          </div>
          <CardDescription>
            Fluxo em tempo real transmitido pelo barramento Redis via Server-Sent Events.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {recentEvents.length === 0 ? (
            <div
              style={{
                padding: "24px",
                textAlign: "center",
                color: "var(--color-text-muted)",
                fontSize: "0.875rem",
                fontFamily: "var(--font-mono)",
              }}
            >
              Aguardando chegada de mensagens de telemetria no canal...
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {recentEvents.slice(0, 5).map((evt, idx) => (
                <div
                  key={idx}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: "8px 12px",
                    borderRadius: "var(--radius-sm)",
                    backgroundColor: "var(--color-surface-elevated)",
                    border: "var(--border-subtle)",
                    fontSize: "0.8125rem",
                    fontFamily: "var(--font-mono)",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <Layers size={14} style={{ color: "var(--color-primary)" }} />
                    <span style={{ fontWeight: 600 }}>{evt.event_type || "TelemetryEvent"}</span>
                    {evt.device_id && <span style={{ color: "var(--color-text-secondary)" }}>[{evt.device_id}]</span>}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", color: "var(--color-text-muted)" }}>
                    {evt.latency_ms !== undefined && (
                      <span style={{ color: "var(--color-healthy)" }}>{evt.latency_ms}ms</span>
                    )}
                    <Clock size={12} />
                    <span>Agora</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
