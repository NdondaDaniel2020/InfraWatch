import React from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

export interface RfcErrorBannerProps {
  title?: string;
  rfcCode?: string;
  message?: string;
  error?: Error | unknown;
  onRetry?: () => unknown;
  isRetrying?: boolean;
  className?: string;
  testId?: string;
  retryButtonTestId?: string;
}

/**
 * Banner Canônico de Erro com especificação RFC e padrão visual Obsidian Dark.
 * Utilizado para o 4º estado de interface (Nominal, Skeleton, Vazio, Erro RFC).
 */
export const RfcErrorBanner: React.FC<RfcErrorBannerProps> = ({
  title = "FALHA DE SINCRONIZAÇÃO E COMUNICAÇÃO DE DADOS",
  rfcCode = "RFC 5424 • ERR_INTEGESTION_UNREACHABLE",
  message,
  error,
  onRetry,
  isRetrying = false,
  className = "",
  testId = "rfc-error-banner",
  retryButtonTestId,
}) => {
  const displayMessage =
    message ||
    (error instanceof Error ? error.message : null) ||
    "A comunicação com os serviços remotos excedeu o tempo limite ou foi interrompida. Tentando contingência operacional…";

  return (
    <section
      data-testid={testId}
      role="alert"
      aria-live="assertive"
      className={`bg-rose-950/40 border border-rose-500/60 p-4 rounded-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 text-xs font-mono shadow-md min-w-0 max-w-full animate-in fade-in duration-200 ${className}`}
    >
      <div className="flex items-start sm:items-center gap-3 min-w-0 flex-1">
        <div className="w-9 h-9 rounded-lg bg-rose-500/20 border border-rose-500/40 flex items-center justify-center shrink-0 mt-0.5 sm:mt-0 text-rose-400">
          <AlertTriangle className="w-5 h-5 animate-pulse" aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-bold text-rose-300 text-sm tracking-tight truncate">
            {title}
          </div>
          {rfcCode && (
            <div className="text-[10.5px] text-rose-400 font-mono mt-0.5">
              Protocolo: <span className="text-rose-200 font-bold">{rfcCode}</span>
            </div>
          )}
          <div className="text-rose-400/90 text-xs leading-relaxed mt-1 break-words">
            {displayMessage}
          </div>
        </div>
      </div>

      {onRetry && (
        <button
          type="button"
          data-testid={retryButtonTestId}
          onClick={() => void onRetry()}
          disabled={isRetrying}
          className="px-3.5 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-bold transition-colors shrink-0 cursor-pointer disabled:opacity-50 flex items-center gap-1.5 self-end sm:self-auto shadow-sm"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isRetrying ? "animate-spin" : ""}`} aria-hidden="true" />
          <span>{isRetrying ? "Reconectando…" : "Reconectar Agora"}</span>
        </button>
      )}
    </section>
  );
};
