import React, { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams, Link } from "react-router-dom";
import {
  ChevronRight,
  Monitor,
  AlertCircle,
  Wifi,
  Shield,
  History,
  RefreshCw,
  AlertTriangle,
  Cloud,
  Zap,
} from "lucide-react";
import { Button, Badge, Skeleton } from "../../components/ui";
import { DeviceHeroHeader } from "../../components/device/DeviceHeroHeader";
import { DeviceMetricsTimescaleChart } from "../../components/device/DeviceMetricsTimescaleChart";
import { DeviceInterfacesTable } from "../../components/device/DeviceInterfacesTable";
import { deviceDetailApi } from "../../services/deviceDetailApi";
import { mockOpticalInterfaces } from "../../mocks/deviceDetailMocks";
import type { TimescalePeriod, DeviceSlaMetrics, DeviceIncidentSummary } from "../../types/deviceDetail";
import { toast } from "sonner";

const EmptyState: React.FC<{ onDiscover: () => void }> = ({ onDiscover }) => (
  <div
    style={{
      backgroundColor: "var(--color-surface-elevated)",
      border: "var(--border-active)",
      borderRadius: "var(--radius-lg)",
      padding: "48px 24px",
      textAlign: "center",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      gap: "16px",
    }}
  >
    <div
      style={{
        width: "64px",
        height: "64px",
        borderRadius: "var(--radius-xl)",
        backgroundColor: "var(--color-surface-card)",
        border: "var(--border-subtle)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "var(--color-text-muted)",
      }}
    >
      <Cloud size={32} />
    </div>
    <div style={{ maxWidth: "320px" }}>
      <h3
        style={{
          fontSize: "0.875rem",
          fontWeight: 600,
          color: "var(--color-text-primary)",
          fontFamily: "var(--font-mono)",
        }}
      >
        Nenhum Registro de Telemetria Localizado
      </h3>
      <p
        style={{
          fontSize: "0.75rem",
          color: "var(--color-text-secondary)",
          marginTop: "4px",
        }}
      >
        Este ativo foi cadastrado na topologia, porém ainda não possui histórico de RTT ou leituras óticas sincronizadas no TimescaleDB.
      </p>
    </div>
    <Button onClick={onDiscover} variant="primary" size="sm" icon={<Wifi size={16} />}>
      Iniciar Descoberta SNMP
    </Button>
  </div>
);

const ErrorState: React.FC<{ onRetry: () => void; message: string }> = ({ onRetry, message }) => (
  <div
    style={{
      backgroundColor: "rgba(239, 68, 68, 0.1)",
      border: "1px solid var(--color-critical-border)",
      borderRadius: "var(--radius-lg)",
      padding: "16px",
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      gap: "16px",
    }}
  >
    <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
      <AlertCircle size={24} style={{ color: "var(--color-critical)", animation: "pulse 1.5s ease-in-out infinite" }} />
      <div>
        <div
          style={{
            fontSize: "0.75rem",
            fontWeight: 700,
            color: "var(--color-critical)",
            fontFamily: "var(--font-mono)",
          }}
        >
          TIMEOUT DE COMUNICAÇÃO SNMP v3 / AGENTE TELEMETRIA
        </div>
        <div
          style={{
            fontSize: "0.6875rem",
            color: "var(--color-critical)",
            marginTop: "2px",
            opacity: 0.8,
          }}
        >
          {message}
        </div>
      </div>
    </div>
    <Button onClick={onRetry} variant="destructive" size="sm" icon={<RefreshCw size={14} />}>
      Forçar Re-Poll
    </Button>
  </div>
);

const SlaGauge: React.FC<{ percentage?: number; target?: number }> = ({ percentage = 99.98, target = 99.50 }) => {
  const safePercentage = percentage ?? 99.98;
  const safeTarget = target ?? 99.50;
  const circumference = 2 * Math.PI * 40;
  const offset = circumference - (safePercentage / 100) * circumference;
  const isHealthy = safePercentage >= safeTarget;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "16px",
        backgroundColor: "var(--color-surface-card)",
        border: "var(--border-subtle)",
        borderRadius: "var(--radius-lg)",
        padding: "16px",
      }}
    >
      <div style={{ position: "relative", width: "80px", height: "80px", flexShrink: 0 }}>
        <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
          <circle cx="50" cy="50" r="40" stroke="var(--color-border-subtle)" strokeWidth="8" fill="transparent" />
          <circle
            cx="50"
            cy="50"
            r="40"
            stroke={isHealthy ? "var(--color-healthy)" : "var(--color-critical)"}
            strokeWidth="8"
            fill="transparent"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            strokeLinecap="round"
            style={{ transition: "stroke-dashoffset 0.5s ease-out" }}
          />
        </svg>
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            fontFamily: "var(--font-mono)",
          }}
        >
          <span
            style={{
              fontSize: "1.125rem",
              fontWeight: 700,
              color: "var(--color-text-primary)",
            }}
          >
            {safePercentage.toFixed(2)}%
          </span>
          <span
            style={{
              fontSize: "0.625rem",
              color: "var(--color-text-muted)",
              textTransform: "uppercase",
            }}
          >
            30D
          </span>
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
        <span
          style={{
            color: isHealthy ? "var(--color-healthy)" : "var(--color-critical)",
            fontWeight: 600,
            fontSize: "0.75rem",
            display: "flex",
            alignItems: "center",
            gap: "4px",
          }}
        >
          {isHealthy ? <CheckCircle size={14} /> : <AlertTriangle size={14} />}
          {isHealthy ? "Conforme Contrato" : "Fora do SLA"}
        </span>
        <p style={{ fontSize: "0.6875rem", color: "var(--color-text-muted)" }}>
          Meta: <span style={{ fontFamily: "var(--font-mono)", fontWeight: 500, color: "var(--color-text-secondary)" }}>{safeTarget.toFixed(2)}%</span>
        </p>
        <span style={{ fontSize: "0.6875rem", color: isHealthy ? "var(--color-healthy)" : "var(--color-critical)", fontFamily: "var(--font-mono)" }}>
          Margem: {isHealthy ? "+" : ""}{(safePercentage - safeTarget).toFixed(2)}%
        </span>
      </div>
    </div>
  );
};

const CheckCircle = ({ size = 14 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
    <polyline points="22 4 12 14.01 9 11.01" />
  </svg>
);

const IncidentCard: React.FC<{ incident: DeviceIncidentSummary }> = ({ incident }) => {
  const statusConfig = {
    EM_ANALISE: { color: "var(--color-degraded)", bg: "var(--color-degraded-bg)", border: "var(--color-degraded-border)" },
    RESOLVIDO: { color: "var(--color-healthy)", bg: "var(--color-healthy-bg)", border: "var(--color-healthy-border)" },
    EM_ANDAMENTO: { color: "var(--color-primary)", bg: "rgba(59, 130, 246, 0.1)", border: "rgba(59, 130, 246, 0.3)" },
  }[incident.status];

  const formatDuration = (minutes: number) => {
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
  };

  return (
    <div
      style={{
        backgroundColor: "var(--color-surface-card)",
        border: "var(--border-subtle)",
        borderRadius: "var(--radius-lg)",
        padding: "12px 16px",
        display: "flex",
        flexDirection: "column",
        gap: "4px",
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
        <span style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--color-text-secondary)", fontFamily: "var(--font-mono)" }}>
          {incident.title}
        </span>
        <span
          style={{
            fontSize: "0.625rem",
            color: statusConfig.color,
            padding: "2px 6px",
            borderRadius: "var(--radius-sm)",
            backgroundColor: statusConfig.bg,
            border: `1px solid ${statusConfig.border}`,
            fontWeight: 600,
          }}
        >
          {incident.status === "EM_ANALISE" ? "Em Análise" : incident.status === "RESOLVIDO" ? "Resolvido" : "Em Andamento"}
        </span>
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          fontSize: "0.625rem",
          color: "var(--color-text-muted)",
          paddingTop: "4px",
          borderTop: "var(--border-subtle)",
          marginTop: "4px",
        }}
      >
        <span>Duração: {formatDuration(incident.durationMinutes)}</span>
        <a
          href={`/incidents/${incident.glpiTicketId}`}
          style={{ color: "var(--color-primary)", textDecoration: "none" }}
        >
          GLPI #{incident.glpiTicketId} <span aria-hidden="true">↗</span>
        </a>
      </div>
    </div>
  );
};

const MttfCard: React.FC<{ label: string; value: string; subLabel: string; color?: string }> = ({
  label,
  value,
  subLabel,
  color = "var(--color-text-primary)",
}) => (
  <div
    style={{
      backgroundColor: "var(--color-surface-card)",
      border: "var(--border-subtle)",
      borderRadius: "var(--radius-lg)",
      padding: "12px 16px",
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
      {label}
    </span>
    <div
      style={{
        fontSize: "1rem",
        fontWeight: 700,
        color,
        fontFamily: "var(--font-mono)",
        fontVariantNumeric: "tabular-nums",
        marginTop: "4px",
      }}
    >
      {value}
    </div>
    <span style={{ fontSize: "0.625rem", color: "var(--color-text-muted)" }}>{subLabel}</span>
  </div>
);

export const DeviceDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const [period, setPeriod] = useState<TimescalePeriod>("24h");
  const [isProbing, setIsProbing] = useState(false);

  const { data: device, isLoading: deviceLoading, error: deviceError, refetch: refetchDevice } = useQuery({
    queryKey: ["deviceDetail", id],
    queryFn: () => deviceDetailApi.getDeviceDetail(id!),
    enabled: !!id,
  });

  const { data: metrics, isLoading: metricsLoading, refetch: refetchMetrics } = useQuery({
    queryKey: ["deviceMetrics", id, period],
    queryFn: () => deviceDetailApi.getTimescaleMetrics(id!, period),
    enabled: !!id,
  });

  const probeMutation = useMutation({
    mutationFn: () => deviceDetailApi.triggerManualProbe(id!),
    onSuccess: (result) => {
      setIsProbing(false);
      toast.success(
        `Sonda ICMP concluída: ${result.packetsReceived}/${result.packetsSent} pacotes recebidos (RTT avg: ${result.rttMs}ms, loss: ${result.packetLossPct}%)`
      );
      queryClient.invalidateQueries({ queryKey: ["deviceMetrics", id, period] });
    },
    onError: (error: Error) => {
      setIsProbing(false);
      toast.error(error.message || "Erro ao disparar sonda ICMP");
    },
  });

  const handleTriggerProbe = useCallback(() => {
    setIsProbing(true);
    probeMutation.mutate();
  }, [probeMutation]);

  const handleRetry = useCallback(() => {
    refetchDevice();
    refetchMetrics();
  }, [refetchDevice, refetchMetrics]);

  if (deviceLoading || metricsLoading) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "24px", padding: "24px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
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
              <Zap size={24} />
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
              <Skeleton width="200px" height="24px" />
              <Skeleton width="160px" height="16px" />
            </div>
          </div>
          <Skeleton width="180px" height="40px" />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: "8px" }}>
          {[0, 1, 2, 3, 4].map((i) => (
            <Skeleton key={i} height="72px" />
          ))}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: "16px" }}>
          <Skeleton height="280px" />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(12, 1fr)", gap: "4px" }}>
          {Array.from({ length: 24 }, (_, i) => (
            <Skeleton key={i} height="36px" width="100%" />
          ))}
        </div>

        <Skeleton height="120px" />
      </div>
    );
  }

  if (deviceError) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "24px", padding: "24px" }}>
        <ErrorState onRetry={handleRetry} message={deviceError.message} />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: "8px" }}>
          {[0, 1, 2, 3, 4].map((i) => (
            <Skeleton key={i} height="72px" />
          ))}
        </div>
        <Skeleton height="280px" />
      </div>
    );
  }

  if (!device || (metrics && metrics.buckets.length === 0)) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "24px", padding: "24px" }}>
        <EmptyState onDiscover={handleTriggerProbe} />
      </div>
    );
  }

  const mockSlaMetrics: DeviceSlaMetrics = {
    availabilityPct: 99.98,
    targetAvailabilityPct: 99.5,
    marginPct: 0.48,
    mttrSeconds: 494,
    mttrTargetSeconds: 900,
    mtbfHours: 418,
    tier: "TIER-1",
  };

  const mockIncidents: DeviceIncidentSummary[] = [
    { id: "inc-1", title: "Atenuação Óptica Porta 19", status: "EM_ANALISE", durationMinutes: 28, glpiTicketId: "8493", createdAt: "2024-01-15T15:14:00Z" },
    { id: "inc-2", title: "Manutenção Firmware V200", status: "RESOLVIDO", durationMinutes: 852, glpiTicketId: "8115", createdAt: "2024-01-10T08:00:00Z" },
  ];

  return (
    <>
      <main role="main" style={{ display: "flex", flexDirection: "column", gap: "24px", padding: "24px" }}>
        <nav style={{ display: "flex", alignItems: "center", gap: "8px" }} aria-label="Breadcrumb">
          <Link to="/noc" style={{ color: "var(--color-text-muted)", fontSize: "0.75rem", fontFamily: "var(--font-mono)", textDecoration: "none" }}>
            NOC
          </Link>
          <span style={{ color: "var(--color-border-subtle)" }}>/</span>
          <Link to="/devices" style={{ color: "var(--color-text-muted)", fontSize: "0.75rem", fontFamily: "var(--font-mono)", textDecoration: "none" }}>
            Ativos de Rede
          </Link>
          <span style={{ color: "var(--color-border-subtle)" }}>/</span>
          <span style={{ color: "var(--color-healthy)", fontWeight: 700, fontSize: "0.75rem", fontFamily: "var(--font-mono)" }}>
            {device.name}
          </span>
        </nav>

        <DeviceHeroHeader device={device} onTriggerProbe={handleTriggerProbe} isProbing={isProbing} />

        <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: "24px" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: "24px" }}>
            <DeviceMetricsTimescaleChart data={metrics!} period={period} onPeriodChange={setPeriod} />

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
            aria-label="Sondas Sintéticas"
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <Monitor size={18} style={{ color: "var(--color-healthy)" }} />
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
                  Sondas Sintéticas de Monitoramento
                </h3>
              </div>
              <span style={{ fontSize: "0.75rem", color: "var(--color-text-muted)", fontFamily: "var(--font-mono)" }}>
                4 Probes Ativos
              </span>
            </div>

            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.75rem", fontFamily: "var(--font-mono)" }}>
                <thead>
                  <tr style={{ borderBottom: "var(--border-subtle)" }}>
                    <th style={{ padding: "8px 0", textAlign: "left", color: "var(--color-text-muted)", fontSize: "0.625rem", textTransform: "uppercase", fontWeight: 600 }}>Protocolo</th>
                    <th style={{ padding: "8px 0", textAlign: "left", color: "var(--color-text-muted)", fontSize: "0.625rem", textTransform: "uppercase", fontWeight: 600 }}>Alvo / Endpoint</th>
                    <th style={{ padding: "8px 0", textAlign: "left", color: "var(--color-text-muted)", fontSize: "0.625rem", textTransform: "uppercase", fontWeight: 600 }}>Intervalo</th>
                    <th style={{ padding: "8px 0", textAlign: "left", color: "var(--color-text-muted)", fontSize: "0.625rem", textTransform: "uppercase", fontWeight: 600 }}>Latência RTT</th>
                    <th style={{ padding: "8px 0", textAlign: "left", color: "var(--color-text-muted)", fontSize: "0.625rem", textTransform: "uppercase", fontWeight: 600 }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  <tr style={{ borderBottom: "var(--border-subtle)" }}>
                    <td style={{ padding: "12px 0", display: "flex", alignItems: "center", gap: "6px" }}>
                      <span style={{ width: "8px", height: "8px", borderRadius: "50%", backgroundColor: "var(--color-healthy)" }} />
                      <span style={{ fontWeight: 600, color: "var(--color-text-primary)" }}>ICMP Echo</span>
                    </td>
                    <td style={{ padding: "12px 0", color: "var(--color-text-secondary)" }}>{device.ipAddress}</td>
                    <td style={{ padding: "12px 0", fontFamily: "var(--font-mono)" }}>15s</td>
                    <td style={{ padding: "12px 0", fontFamily: "var(--font-mono)", color: "var(--color-healthy)", fontWeight: 600 }}>
                      {(metrics?.summary?.p95Ms ?? 2.1).toFixed(1)}ms
                    </td>
                    <td style={{ padding: "12px 0" }}>
                      <Badge variant="healthy" size="sm" dot={false}>NOMINAL</Badge>
                    </td>
                  </tr>
                  <tr style={{ borderBottom: "var(--border-subtle)" }}>
                    <td style={{ padding: "12px 0", display: "flex", alignItems: "center", gap: "6px" }}>
                      <span style={{ width: "8px", height: "8px", borderRadius: "50%", backgroundColor: "var(--color-healthy)" }} />
                      <span style={{ fontWeight: 600, color: "var(--color-text-primary)" }}>SNMP v3 Engine</span>
                    </td>
                    <td style={{ padding: "12px 0", color: "var(--color-text-secondary)" }}>{device.ipAddress}:161</td>
                    <td style={{ padding: "12px 0", fontFamily: "var(--font-mono)" }}>30s</td>
                    <td style={{ padding: "12px 0", fontFamily: "var(--font-mono)", color: "var(--color-healthy)", fontWeight: 600 }}>3.8ms</td>
                    <td style={{ padding: "12px 0" }}>
                      <Badge variant="healthy" size="sm" dot={false}>SINCRONIZADO</Badge>
                    </td>
                  </tr>
                  <tr style={{ borderBottom: "var(--border-subtle)" }}>
                    <td style={{ padding: "12px 0", display: "flex", alignItems: "center", gap: "6px" }}>
                      <span style={{ width: "8px", height: "8px", borderRadius: "50%", backgroundColor: "var(--color-healthy)" }} />
                      <span style={{ fontWeight: 600, color: "var(--color-text-primary)" }}>BGP Peer Session</span>
                    </td>
                    <td style={{ padding: "12px 0", color: "var(--color-text-secondary)" }}>AS37153 (RT-EDGE-01)</td>
                    <td style={{ padding: "12px 0", fontFamily: "var(--font-mono)" }}>Contínuo</td>
                    <td style={{ padding: "12px 0", fontFamily: "var(--font-mono)", color: "var(--color-healthy)", fontWeight: 600 }}>1.2ms</td>
                    <td style={{ padding: "12px 0" }}>
                      <Badge variant="healthy" size="sm" dot={false}>ESTABLISHED</Badge>
                    </td>
                  </tr>
                  <tr>
                    <td style={{ padding: "12px 0", display: "flex", alignItems: "center", gap: "6px" }}>
                      <span style={{ width: "8px", height: "8px", borderRadius: "50%", backgroundColor: "var(--color-healthy)" }} />
                      <span style={{ fontWeight: 600, color: "var(--color-text-primary)" }}>SSH / mTLS Auth</span>
                    </td>
                    <td style={{ padding: "12px 0", color: "var(--color-text-secondary)" }}>{device.ipAddress}:8443</td>
                    <td style={{ padding: "12px 0", fontFamily: "var(--font-mono)" }}>60s</td>
                    <td style={{ padding: "12px 0", fontFamily: "var(--font-mono)", color: "var(--color-healthy)", fontWeight: 600 }}>5.4ms</td>
                    <td style={{ padding: "12px 0" }}>
                      <Badge variant="healthy" size="sm" dot={false}>PROTEGIDO</Badge>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: "24px" }}>
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
            aria-label="Desempenho de SLA"
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "var(--border-subtle)", paddingBottom: "12px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <Shield size={18} style={{ color: "var(--color-healthy)" }} />
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
                  Desempenho de SLA
                </h3>
              </div>
              <Badge variant="healthy" size="sm" dot={false}>
                {mockSlaMetrics.tier}
              </Badge>
            </div>

            <SlaGauge percentage={mockSlaMetrics.availabilityPct} target={mockSlaMetrics.targetAvailabilityPct} />

            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "12px" }}>
              <MttfCard label="MTTR" value={`${Math.floor(mockSlaMetrics.mttrSeconds / 60)}m ${mockSlaMetrics.mttrSeconds % 60}s`} subLabel={`Meta: < ${Math.floor(mockSlaMetrics.mttrTargetSeconds / 60)}m`} color="var(--color-text-primary)" />
              <MttfCard label="MTBF" value={`${mockSlaMetrics.mtbfHours} horas`} subLabel="Alta Resiliência" color="var(--color-healthy)" />
            </div>
          </section>

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
            aria-label="Histórico de Chamados"
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "var(--border-subtle)", paddingBottom: "12px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <History size={18} style={{ color: "var(--color-degraded)" }} />
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
                  Histórico GLPI / NOC
                </h3>
              </div>
              <Badge variant="degraded" size="sm" dot={false}>
                {mockIncidents.length} Chamados
              </Badge>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {mockIncidents.map((incident) => (
                <IncidentCard key={incident.id} incident={incident} />
              ))}
            </div>

            <Link
              to="/incidents"
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "8px",
                padding: "10px 16px",
                backgroundColor: "var(--color-surface-card)",
                border: "var(--border-subtle)",
                borderRadius: "var(--radius-lg)",
                color: "var(--color-text-secondary)",
                fontSize: "0.75rem",
                fontWeight: 600,
                fontFamily: "var(--font-mono)",
                textDecoration: "none",
                transition: "background-color var(--transition-fast), border-color var(--transition-fast), color var(--transition-fast)",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = "var(--color-surface-hover)";
                e.currentTarget.style.borderColor = "var(--border-hover)";
                e.currentTarget.style.color = "var(--color-text-primary)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = "var(--color-surface-card)";
                e.currentTarget.style.borderColor = "var(--border-subtle)";
                e.currentTarget.style.color = "var(--color-text-secondary)";
              }}
            >
              <span>Ver Todos no Gestor de Incidentes</span>
              <ChevronRight size={14} />
            </Link>
          </section>
        </div>
      </div>

      <DeviceInterfacesTable interfaces={mockOpticalInterfaces} />
    </main>

      <footer
        style={{
          position: "fixed",
          bottom: 0,
          left: 0,
          right: 0,
          zIndex: 20,
          padding: "12px 24px",
          backgroundColor: "var(--color-surface-card)",
          borderTop: "var(--border-subtle)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "16px", color: "var(--color-text-muted)", fontSize: "0.75rem", fontFamily: "var(--font-mono)" }}>
          <span style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <span style={{ width: "8px", height: "8px", borderRadius: "50%", backgroundColor: "var(--color-healthy)" }} />
            TimescaleDB Hypertable Synced
          </span>
          <span style={{ color: "var(--color-border-subtle)" }}>|</span>
          <span>Cluster: <strong style={{ color: "var(--color-text-secondary)" }}>AO-LAD-PRD-01</strong></span>
        </div>
        <div style={{ color: "var(--color-text-muted)", fontSize: "0.75rem", fontFamily: "var(--font-mono)" }}>
          Última sondagem: <span style={{ color: "var(--color-healthy)", fontWeight: 600 }}>{new Date(device.lastCheckAt).toLocaleTimeString("pt-BR")}</span>
        </div>
      </footer>
    </>
  );
};