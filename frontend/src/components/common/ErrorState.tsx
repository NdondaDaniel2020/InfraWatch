import React from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "../ui/Button";

export interface ErrorStateProps {
  title?: string;
  message?: string;
  error?: Error | unknown;
  onRetry?: () => void | Promise<void>;
  isRetrying?: boolean;
  className?: string;
  variant?: "default" | "card" | "inline";
}

export const ErrorState: React.FC<ErrorStateProps> = ({
  title = "Falha na Comunicação",
  message,
  error,
  onRetry,
  isRetrying = false,
  className = "",
  variant = "default",
}) => {
  const displayMessage =
    message ||
    (error instanceof Error ? error.message : null) ||
    "Não foi possível obter os dados da API. Verifique a conexão com o servidor.";

  if (variant === "inline") {
    return (
      <div
        role="alert"
        aria-live="polite"
        className={`flex items-center gap-2 p-3 text-sm text-red-400 bg-red-950/20 border border-red-900/40 rounded-lg ${className}`}
      >
        <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
        <span className="flex-1">{displayMessage}</span>
        {onRetry && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => void onRetry()}
            disabled={isRetrying}
            className="text-xs text-red-300 hover:text-white hover:bg-red-900/30"
          >
            <RefreshCw className={`w-3 h-3 mr-1 ${isRetrying ? "animate-spin" : ""}`} />
            Tentar novamente
          </Button>
        )}
      </div>
    );
  }

  const containerClasses =
    variant === "card"
      ? "p-6 rounded-xl border border-slate-800 bg-[#0c1322] shadow-sm text-center"
      : "p-8 rounded-2xl border border-slate-800/80 bg-[#0B0F17]/90 text-center";

  return (
    <div
      role="alert"
      aria-live="polite"
      className={`flex flex-col items-center justify-center ${containerClasses} ${className}`}
    >
      <div className="w-12 h-12 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center mb-4">
        <AlertTriangle className="w-6 h-6 text-red-400" />
      </div>

      <h3 className="text-base font-semibold text-slate-100 mb-1">{title}</h3>
      <p className="text-sm text-slate-400 max-w-md mb-6">{displayMessage}</p>

      {onRetry && (
        <Button
          onClick={() => void onRetry()}
          disabled={isRetrying}
          className="bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700"
        >
          <RefreshCw className={`w-4 h-4 mr-2 ${isRetrying ? "animate-spin" : ""}`} />
          {isRetrying ? "Tentando reconectar..." : "Tentar novamente"}
        </Button>
      )}
    </div>
  );
};
