import React from "react";
import { RefreshCw, Wifi, WifiOff } from "lucide-react";
import { useTelemetry } from "../../context/TelemetryContext";
import type { SSEConnectionStatus } from "../../types/sse";

export interface LiveIndicatorProps {
  /** Sobrescreve status do SSE manualmente se usado fora do TelemetryContext */
  status?: SSEConnectionStatus;
  /** Sobrescreve número de tentativas de reconexão */
  retryCount?: number;
  /** Sobrescreve timestamp do último heartbeat */
  lastHeartbeatAt?: Date | null;
  /** Callback para reconectar manualmente */
  onReconnect?: () => void;
  /** Exibe timestamp do último heartbeat recebido (padrão: true) */
  showHeartbeat?: boolean;
  /** Classes CSS adicionais */
  className?: string;
}

interface LiveStatusVisual {
  getLabel: (retryCount?: number) => string;
  color: string;
  bgColor: string;
  borderColor: string;
  getAriaLabel: (retryCount?: number) => string;
  renderIcon: () => React.ReactNode;
}

/**
 * Mapeamento declarativo dos estados de conexão SSE (State-Driven Component Pattern).
 */
const LIVE_STATUS_CONFIGS: Record<SSEConnectionStatus, LiveStatusVisual> = {
  connected: {
    getLabel: () => "Ao Vivo",
    color: "var(--color-healthy)",
    bgColor: "rgba(16, 185, 129, 0.12)",
    borderColor: "rgba(16, 185, 129, 0.3)",
    getAriaLabel: () => "Conexão de telemetria em tempo real ativa",
    renderIcon: () => <Wifi size={14} className="pulse-indicator" />,
  },
  reconnecting: {
    getLabel: (retryCount = 0) => (retryCount > 0 ? `Reconectando... (#${retryCount})` : "Reconectando..."),
    color: "var(--color-degraded)",
    bgColor: "rgba(245, 158, 11, 0.12)",
    borderColor: "rgba(245, 158, 11, 0.3)",
    getAriaLabel: (retryCount = 0) => `Conexão instável, tentando reconectar tentativa ${retryCount}`,
    renderIcon: () => <RefreshCw size={14} className="pulse-indicator" style={{ animation: "spin 2s linear infinite" }} />,
  },
  connecting: {
    getLabel: () => "Conectando...",
    color: "var(--color-maintenance)",
    bgColor: "rgba(59, 130, 246, 0.12)",
    borderColor: "rgba(59, 130, 246, 0.3)",
    getAriaLabel: () => "Iniciando conexão de telemetria",
    renderIcon: () => <RefreshCw size={14} style={{ animation: "spin 3s linear infinite" }} />,
  },
  disconnected: {
    getLabel: () => "Desconectado",
    color: "var(--color-critical)",
    bgColor: "rgba(239, 68, 68, 0.12)",
    borderColor: "rgba(239, 68, 68, 0.3)",
    getAriaLabel: () => "Conexão de telemetria encerrada ou offline",
    renderIcon: () => <WifiOff size={14} />,
  },
};

export const LiveIndicator: React.FC<LiveIndicatorProps> = ({
  status: propStatus,
  retryCount: propRetryCount,
  lastHeartbeatAt: propLastHeartbeatAt,
  onReconnect: propOnReconnect,
  showHeartbeat = true,
  className = "",
}) => {
  // Tenta obter do contexto de telemetria se não fornecido via props
  let contextValue = null;
  try {
    contextValue = useTelemetry();
  } catch {
    // Renderizado fora do Provider
  }

  const status = propStatus ?? contextValue?.status ?? "connecting";
  const retryCount = propRetryCount ?? contextValue?.retryCount ?? 0;
  const lastHeartbeatAt = propLastHeartbeatAt ?? contextValue?.lastHeartbeatAt ?? null;
  const handleReconnect = propOnReconnect ?? contextValue?.reconnect;

  const config = LIVE_STATUS_CONFIGS[status] || LIVE_STATUS_CONFIGS.disconnected;

  const formatHeartbeatTime = (date: Date | null) => {
    if (!date) return "--:--:--";
    return date.toLocaleTimeString("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  };

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={config.getAriaLabel(retryCount)}
      className={`live-indicator-container ${className}`}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "10px",
        padding: "4px 12px 4px 10px",
        borderRadius: "var(--radius-full)",
        backgroundColor: "var(--color-surface-card)",
        border: `1px solid ${config.borderColor}`,
        boxShadow: "0 2px 8px rgba(0, 0, 0, 0.25)",
        fontSize: "0.8125rem",
        fontWeight: 600,
        fontFamily: "var(--font-mono)",
        color: config.color,
        transition: "all var(--transition-fast)",
      }}
    >
      {/* Ponto / Ícone com pulsação semântica */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: "20px",
          height: "20px",
          borderRadius: "var(--radius-full)",
          backgroundColor: config.bgColor,
          color: config.color,
        }}
      >
        {config.renderIcon()}
      </div>

      {/* Rótulo de Status */}
      <span style={{ letterSpacing: "0.02em" }}>{config.getLabel(retryCount)}</span>

      {/* Timestamp do último heartbeat */}
      {showHeartbeat && lastHeartbeatAt && status === "connected" && (
        <span
          style={{
            fontSize: "0.75rem",
            color: "var(--color-text-muted)",
            borderLeft: "1px solid rgba(255, 255, 255, 0.12)",
            paddingLeft: "8px",
            fontFamily: "var(--font-mono)",
            fontWeight: 400,
          }}
          title="Último heartbeat keep-alive recebido do servidor"
        >
          {formatHeartbeatTime(lastHeartbeatAt)}
        </span>
      )}

      {/* Botão para reconexão manual caso esteja desconectado */}
      {status === "disconnected" && handleReconnect && (
        <button
          type="button"
          onClick={handleReconnect}
          style={{
            background: "none",
            border: "none",
            color: "var(--color-primary)",
            cursor: "pointer",
            fontSize: "0.75rem",
            textDecoration: "underline",
            padding: "0 4px",
            fontFamily: "var(--font-sans)",
          }}
        >
          Reconectar
        </button>
      )}
    </div>
  );
};
