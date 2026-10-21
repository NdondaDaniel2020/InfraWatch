import React from "react";
import { CheckCircle2, CloudOff } from "lucide-react";
import type { DashboardViewMode } from "../../types/telemetry";

export type NocViewState = DashboardViewMode;

interface FeedbackStateConfig {
  testId: string;
  icon: React.ReactNode;
  iconBoxStyle: string;
  title: string;
  titleColor: string;
  codeBadge?: React.ReactNode;
  description: string;
  btnLabel: string;
  btnClass: string;
}

/**
 * Mapeamento declarativo de variantes para estados de feedback (State-Driven Component Pattern).
 * Os estados Empty e Error compartilham 100% da anatomia estrutural (backdrop, card de ícone,
 * título, descrição e botão de ação) e definem suas cores e conteúdo estritamente pelo estado recebido.
 */
const FEEDBACK_CONFIGS: Record<"empty" | "error", FeedbackStateConfig> = {
  empty: {
    testId: "state-empty-overlay",
    icon: <CheckCircle2 size={32} />,
    iconBoxStyle: "bg-emerald-500/10 border-emerald-500/30 text-emerald-400",
    title: "Todos os Ativos Operacionais",
    titleColor: "text-white",
    description: "Nenhum incidente crítico ou degradação ativa no momento. Uptime de rede em 100%.",
    btnLabel: "Voltar ao Modo Nominal",
    btnClass: "bg-obsidian-850 hover:bg-obsidian-800 border border-obsidian-800 text-slate-200",
  },
  error: {
    testId: "state-error-overlay",
    icon: <CloudOff size={32} />,
    iconBoxStyle: "bg-rose-500/10 border-rose-500/30 text-rose-400",
    title: "Falha no Streaming de Telemetria (SSE)",
    titleColor: "text-rose-400",
    codeBadge: (
      <p className="text-xs text-slate-400 max-w-md text-center mb-2 font-mono tabular-nums">
        RFC 5424 Code: <span className="text-rose-300 font-bold">ERR_TELEMETRY_INGEST_UNREACHABLE</span>
      </p>
    ),
    description: "O fluxo de sondas ICMP/SNMP do agente Luanda-01 excedeu o timeout de heartbeat (15.000ms).",
    btnLabel: "Reconectar Ingestão",
    btnClass:
      "bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/40 focus-visible:ring-2 focus-visible:ring-rose-400",
  },
};

interface FeedbackStateOverlayProps {
  variant: "empty" | "error";
  onAction: () => void;
}

const FeedbackStateOverlay: React.FC<FeedbackStateOverlayProps> = ({ variant, onAction }) => {
  const config = FEEDBACK_CONFIGS[variant];

  return (
    <div
      data-testid={config.testId}
      className="absolute inset-0 bg-obsidian-950/95 z-40 p-8 flex flex-col items-center justify-center backdrop-blur-sm pointer-events-auto"
    >
      <div
        className={`w-16 h-16 rounded-2xl border flex items-center justify-center mb-4 shadow-xl ${config.iconBoxStyle}`}
      >
        {config.icon}
      </div>

      <h2 className={`text-base font-semibold mb-1 ${config.titleColor}`}>
        {config.title}
      </h2>

      {config.codeBadge}

      <p className="text-xs text-slate-400 max-w-md text-center mb-5 font-mono tabular-nums">
        {config.description}
      </p>

      <button
        type="button"
        onClick={onAction}
        className={`px-3.5 py-2 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${config.btnClass}`}
      >
        {config.btnLabel}
      </button>
    </div>
  );
};

export const NocSkeletonOverlay: React.FC = () => {
  return (
    <div
      data-testid="state-skeleton-overlay"
      className="absolute inset-0 bg-obsidian-950/95 z-40 p-6 flex flex-col gap-6 backdrop-blur-sm pointer-events-auto"
    >
      {/* Skeleton KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="h-24 bg-obsidian-900 border border-obsidian-800 rounded-xl p-4 animate-pulse space-y-2"
          >
            <div className="w-20 h-3 bg-obsidian-850 rounded" />
            <div className="w-28 h-6 bg-obsidian-800 rounded" />
          </div>
        ))}
      </div>

      {/* Skeleton Grid 8+4 */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 flex-1">
        <div className="lg:col-span-8 bg-obsidian-900 border border-obsidian-800 rounded-xl p-6 animate-pulse space-y-4">
          <div className="w-48 h-4 bg-obsidian-850 rounded" />
          <div className="w-full h-48 bg-obsidian-850/60 rounded" />
        </div>
        <div className="lg:col-span-4 bg-obsidian-900 border border-obsidian-800 rounded-xl p-6 animate-pulse space-y-4">
          <div className="w-36 h-4 bg-obsidian-850 rounded" />
          <div className="w-full h-20 bg-obsidian-850/60 rounded" />
          <div className="w-full h-20 bg-obsidian-850/60 rounded" />
        </div>
      </div>
    </div>
  );
};

export interface NocStateOverlayProps {
  viewState: NocViewState;
  onResetNominal: () => void;
  onReconnect: () => void;
}

/**
 * Gerenciador de overlays de estado do Cockpit NOC.
 * Unifica e delega a renderização dos estados alternativos de forma limpa e declarativa.
 */
export const NocStateOverlay: React.FC<NocStateOverlayProps> = ({
  viewState,
  onResetNominal,
  onReconnect,
}) => {
  if (viewState === "nominal") return null;

  if (viewState === "skeleton") {
    return <NocSkeletonOverlay />;
  }

  if (viewState === "empty") {
    return <FeedbackStateOverlay variant="empty" onAction={onResetNominal} />;
  }

  if (viewState === "error") {
    return <FeedbackStateOverlay variant="error" onAction={onReconnect} />;
  }

  return null;
};
