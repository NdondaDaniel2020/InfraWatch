import React from "react";
import {
  getNormalizedStatus,
  STATUS_TOKENS,
  type NormalizedStatus,
} from "../telemetry/statusConfig";

export interface StatusBadgeProps {
  status: string;
  severity?: string;
  className?: string;
  pulse?: boolean;
}

/**
 * Componente declarativo orientado a dados para exibição de badge de status de telemetria.
 * Adapta bordas, cores e pulsação a partir do estado do dado recebido.
 */
export const StatusBadge: React.FC<StatusBadgeProps> = ({
  status,
  severity,
  className = "",
  pulse,
}) => {
  const key: NormalizedStatus = getNormalizedStatus(status, severity);
  const token = STATUS_TOKENS[key];
  const shouldPulse = pulse ?? key === "DOWN";

  return (
    <span
      className={`text-[11px] font-mono font-bold px-2 py-0.5 rounded-full ${token.badgeClass} ${
        shouldPulse ? "animate-pulse" : ""
      } ${className}`}
    >
      {status}
    </span>
  );
};
