import React from "react";
import { Loader2 } from "lucide-react";

export interface RouteLoadingFallbackProps {
  message?: string;
}

export const RouteLoadingFallback: React.FC<RouteLoadingFallbackProps> = ({
  message = "Carregando módulo operacional...",
}) => {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={message}
      className="flex flex-col items-center justify-center min-h-[60vh] w-full px-4 text-center"
      data-testid="route-loading-fallback"
    >
      <div className="relative flex items-center justify-center">
        {/* Halo de pulso sutil NOC */}
        <div className="absolute w-12 h-12 rounded-full bg-cyan-500/10 animate-ping" />
        <div className="relative flex items-center justify-center w-10 h-10 rounded-xl bg-slate-900 border border-slate-800 shadow-lg">
          <Loader2 className="w-5 h-5 text-cyan-400 animate-spin" />
        </div>
      </div>
      <p className="mt-4 text-xs font-mono tracking-wider text-slate-400 uppercase">
        {message}
      </p>
    </div>
  );
};
