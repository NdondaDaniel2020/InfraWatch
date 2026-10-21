import type { DeviceSeverity, DeviceStatus, NormalizedStatus } from "../../types/telemetry";

export type { NormalizedStatus };

/**
 * Normaliza o status operacional e severidade de qualquer ativo de rede ou enlace.
 * Centraliza a regra de negócio em um único ponto para evitar checagens manuais dispersas.
 */
export function getNormalizedStatus(
  status?: DeviceStatus | string,
  severity?: DeviceSeverity | string
): NormalizedStatus {
  const s = (status || "").toUpperCase();
  const sev = (severity || "").toLowerCase();

  if (s === "DOWN" || sev === "critical") return "DOWN";
  if (
    s === "DEG" ||
    s === "DEGRADED" ||
    s === "DEGRADADO" ||
    sev === "degraded"
  ) {
    return "DEG";
  }
  if (
    s === "MAINT" ||
    s === "MANUTENÇÃO" ||
    s === "MANUTENCAO" ||
    sev === "maint"
  ) {
    return "MAINT";
  }
  return "UP";
}

export interface StatusTokens {
  key: NormalizedStatus;
  textColor: string;
  badgeClass: string;
  iconBgClass: string;
  cardBorder: string;
  barColor: string;
}

/**
 * Dicionário declarativo de tokens visuais orientados a estado (State-Driven Component Pattern).
 * Elimina blocos ternários aninhados em cards, listas, badges e gavetas.
 */
export const STATUS_TOKENS: Record<NormalizedStatus, StatusTokens> = {
  DOWN: {
    key: "DOWN",
    textColor: "text-rose-400",
    badgeClass: "bg-rose-500/20 text-rose-400 border-rose-500/40",
    iconBgClass: "bg-rose-500/15 border border-rose-500/30 text-rose-400",
    cardBorder: "border-rose-500/60 ring-1 ring-rose-500/30",
    barColor: "bg-rose-500",
  },
  DEG: {
    key: "DEG",
    textColor: "text-amber-400",
    badgeClass: "bg-amber-500/20 text-amber-400 border border-amber-500/40",
    iconBgClass: "bg-amber-500/15 border border-amber-500/30 text-amber-400",
    cardBorder: "border-amber-500/60",
    barColor: "bg-amber-400",
  },
  MAINT: {
    key: "MAINT",
    textColor: "text-sky-400",
    badgeClass: "bg-sky-500/20 text-sky-400 border border-sky-500/40",
    iconBgClass: "bg-sky-500/15 border border-sky-500/30 text-sky-400",
    cardBorder: "border-sky-500/60",
    barColor: "bg-sky-400",
  },
  UP: {
    key: "UP",
    textColor: "text-emerald-400",
    badgeClass: "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30",
    iconBgClass: "bg-emerald-500/15 border border-emerald-500/30 text-emerald-400",
    cardBorder: "border-[#1b2640]",
    barColor: "bg-gradient-to-r from-emerald-500 to-sky-400",
  },
};
