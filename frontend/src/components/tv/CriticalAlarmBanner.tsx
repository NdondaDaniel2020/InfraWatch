import React from "react";
import { AlertTriangle, Volume2, VolumeX, Play, ShieldAlert } from "lucide-react";

export interface CriticalAlarmData {
  id: string;
  hostname: string;
  ip: string;
  location?: string;
  downDuration: string;
  packetLoss: string;
  glpiTicketId?: string;
  impactedClients?: string;
}

export interface CriticalAlarmBannerProps {
  alarm: CriticalAlarmData | null;
  onAcknowledge?: () => void;
  onResumeRotation?: () => void;
  isAudioMuted?: boolean;
  onToggleMute?: () => void;
}

export const CriticalAlarmBanner: React.FC<CriticalAlarmBannerProps> = ({
  alarm,
  onAcknowledge,
  onResumeRotation,
  isAudioMuted = true,
  onToggleMute,
}) => {
  if (!alarm) return null;

  return (
    <aside
      role="alert"
      aria-live="assertive"
      aria-atomic="true"
      data-testid="critical-alarm-banner"
      className="w-full bg-rose-950/90 border-y-2 border-rose-500 shadow-[0_0_40px_rgba(244,63,94,0.45)] backdrop-blur-md px-4 py-3 flex flex-wrap items-center justify-between gap-4 z-50 shrink-0 transition-all duration-300 animate-pulse"
    >
      {/* Lado Esquerdo: Ícone Pulsante de Alerta Máximo e Identificação */}
      <div className="flex items-center gap-3.5 min-w-0">
        <div className="w-10 h-10 rounded-lg bg-rose-500/20 border border-rose-500/50 flex items-center justify-center text-rose-400 shrink-0">
          <AlertTriangle size={24} className="text-rose-400" />
        </div>

        <div className="flex flex-col">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="px-2 py-0.5 rounded text-[11px] font-mono font-extrabold bg-rose-500 text-white tracking-wider">
              SEV-1 ALARME CRÍTICO
            </span>
            <span className="text-xs font-mono font-semibold text-rose-300">
              ROTAÇÃO PAUSADA
            </span>
            <span className="text-rose-400 text-xs">•</span>
            <span className="text-xs font-mono text-slate-300">
              {alarm.location || "Cluster LUANDA-01"}
            </span>
          </div>

          <div className="flex items-center gap-2.5 mt-1">
            <span className="text-base font-bold text-white tracking-tight font-mono">
              {alarm.hostname}
            </span>
            <span className="text-xs font-mono text-rose-300 bg-rose-900/40 px-2 py-0.5 rounded border border-rose-700/50">
              {alarm.ip}
            </span>
            <span className="text-xs font-mono font-bold text-rose-200">
              DOWN ({alarm.downDuration})
            </span>
            <span className="text-xs font-mono text-rose-300">
              Perda: <strong className="text-white">{alarm.packetLoss}</strong>
            </span>
            {alarm.glpiTicketId && (
              <span className="hidden sm:inline text-xs font-mono text-slate-300">
                GLPI: <strong className="text-white">{alarm.glpiTicketId}</strong>
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Lado Direito: Ações de Intervenção Rápida */}
      <div className="flex items-center gap-2.5 shrink-0">
        {onToggleMute && (
          <button
            type="button"
            onClick={onToggleMute}
            aria-label={isAudioMuted ? "Ativar som de alarme" : "Silenciar alarme sonoro"}
            className="p-2 rounded-lg bg-rose-900/50 hover:bg-rose-900 border border-rose-700/60 text-rose-300 hover:text-white transition-colors focus-visible:ring-2 focus-visible:ring-rose-400"
          >
            {isAudioMuted ? <VolumeX size={18} /> : <Volume2 size={18} className="text-amber-400 animate-bounce" />}
          </button>
        )}

        {onResumeRotation && (
          <button
            type="button"
            onClick={onResumeRotation}
            data-testid="btn-resume-rotation"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-obsidian-900 hover:bg-obsidian-850 border border-obsidian-700 text-slate-200 hover:text-white text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:ring-emerald-400"
          >
            <Play size={14} />
            <span>Forçar Rotação</span>
          </button>
        )}

        {onAcknowledge && (
          <button
            type="button"
            onClick={onAcknowledge}
            data-testid="btn-ack-alarm"
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 border border-rose-400 text-white text-xs font-bold transition-colors shadow-lg shadow-rose-900/50 focus-visible:ring-2 focus-visible:ring-white"
          >
            <ShieldAlert size={15} />
            <span>Reconhecer Falha</span>
          </button>
        )}
      </div>
    </aside>
  );
};
