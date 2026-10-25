import React, { useState } from "react";
import {
  CheckCircle2,
  Loader2,
  AlertTriangle,
  X,
  Copy,
  Check,
  ShieldCheck,
  FileArchive,
} from "lucide-react";
import {
  BackupProgressEvent,
  BACKUP_PIPELINE_STAGES,
  BackupStage,
} from "../../types/backup";
import { Button } from "../ui/Button";

interface BackupProgressModalProps {
  isOpen: boolean;
  currentEvent: BackupProgressEvent | null;
  isCompleted: boolean;
  error: string | null;
  onClose: () => void;
}

export const BackupProgressModal: React.FC<BackupProgressModalProps> = ({
  isOpen,
  currentEvent,
  isCompleted,
  error,
  onClose,
}) => {
  const [copiedHash, setCopiedHash] = useState(false);

  if (!isOpen) return null;

  const currentPercent = error
    ? currentEvent?.percent || 0
    : isCompleted
    ? 100
    : currentEvent?.percent || 5;

  const currentStage: BackupStage = error
    ? "error"
    : isCompleted
    ? "completed"
    : currentEvent?.stage || "started";

  const handleCopyHash = (hash: string) => {
    navigator.clipboard.writeText(hash);
    setCopiedHash(true);
    setTimeout(() => setCopiedHash(false), 2000);
  };

  const getStageState = (stageId: BackupStage, order: number) => {
    if (error) {
      if (stageId === currentEvent?.stage) return "error";
      // As etapas anteriores ao erro foram completadas
      const currentOrder =
        BACKUP_PIPELINE_STAGES.find((s) => s.id === currentEvent?.stage)?.order || 1;
      if (order < currentOrder) return "completed";
      return "pending";
    }

    if (isCompleted) {
      return "completed";
    }

    const currentOrder =
      BACKUP_PIPELINE_STAGES.find((s) => s.id === currentStage)?.order || 1;

    if (order < currentOrder) return "completed";
    if (order === currentOrder) return "active";
    return "pending";
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="progress-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-obsidian-950/85 backdrop-blur-md"
      data-testid="backup-progress-modal"
    >
      <div className="w-full max-w-xl bg-obsidian-900 border border-obsidian-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="p-4 border-b border-obsidian-800 bg-obsidian-950/60 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div
              className={`p-1.5 rounded-lg border ${
                error
                  ? "bg-rose-500/10 border-rose-500/30 text-rose-400"
                  : isCompleted
                  ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
                  : "bg-sky-500/10 border-sky-500/30 text-sky-400"
              }`}
            >
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h2
                id="progress-modal-title"
                className="font-mono text-sm font-bold text-white flex items-center gap-2"
              >
                <span>Pipeline de Backup em Tempo Real (SSE)</span>
                {isCompleted && (
                  <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/40">
                    CONCLUÍDO
                  </span>
                )}
                {error && (
                  <span className="text-[10px] px-2 py-0.5 rounded bg-rose-500/20 text-rose-400 border border-rose-500/40">
                    FALHOU
                  </span>
                )}
              </h2>
              <p className="text-[11px] text-slate-400 font-mono mt-0.5">
                Canal de telemetria isolado:{" "}
                <span className="text-slate-200">backup:progress</span>
              </p>
            </div>
          </div>

          {(isCompleted || !!error) && (
            <button
              type="button"
              onClick={onClose}
              className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-obsidian-800 transition-colors"
              aria-label="Fechar modal de progresso"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Barra de Progresso Geral */}
        <div className="p-5 border-b border-obsidian-800 bg-obsidian-900/50 space-y-2">
          <div className="flex justify-between items-center text-xs font-mono">
            <span className="text-slate-300 font-semibold truncate max-w-[400px]">
              {error
                ? `Erro: ${error}`
                : currentEvent?.message || "Sincronizando com o daemon..."}
            </span>
            <span
              className={`font-bold tabular-nums text-sm ${
                error
                  ? "text-rose-400"
                  : isCompleted
                  ? "text-emerald-400"
                  : "text-sky-400"
              }`}
            >
              {currentPercent}%
            </span>
          </div>

          <div
            className="w-full h-2.5 bg-obsidian-950 rounded-full overflow-hidden border border-obsidian-800"
            role="progressbar"
            aria-valuenow={currentPercent}
            aria-valuemin={0}
            aria-valuemax={100}
            data-testid="backup-progress-bar"
          >
            <div
              style={{ width: `${currentPercent}%` }}
              className={`h-full transition-all duration-300 rounded-full ${
                error
                  ? "bg-rose-500"
                  : isCompleted
                  ? "bg-emerald-500 shadow-[0_0_12px_rgba(16,185,129,0.5)]"
                  : "bg-sky-500"
              }`}
            />
          </div>
        </div>

        {/* Checklist das Etapas */}
        <div className="p-5 max-h-72 overflow-y-auto space-y-3 font-mono text-xs select-none">
          {BACKUP_PIPELINE_STAGES.map((stage) => {
            const state = getStageState(stage.id, stage.order);

            return (
              <div
                key={stage.id}
                data-testid={`stage-item-${stage.id}`}
                className={`p-2.5 rounded-xl border transition-colors flex items-center justify-between ${
                  state === "active"
                    ? "bg-sky-950/20 border-sky-500/50 text-sky-200"
                    : state === "completed"
                    ? "bg-emerald-950/15 border-emerald-500/30 text-slate-300"
                    : state === "error"
                    ? "bg-rose-950/30 border-rose-500/50 text-rose-200"
                    : "bg-obsidian-950/50 border-obsidian-800/60 text-slate-500"
                }`}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  {state === "completed" && (
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  )}
                  {state === "active" && (
                    <Loader2 className="w-4 h-4 text-sky-400 animate-spin shrink-0" />
                  )}
                  {state === "error" && (
                    <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                  )}
                  {state === "pending" && (
                    <div className="w-4 h-4 rounded-full border border-obsidian-700 bg-obsidian-850 shrink-0" />
                  )}

                  <div className="min-w-0">
                    <span
                      className={`font-semibold block truncate ${
                        state === "completed"
                          ? "text-slate-200"
                          : state === "active"
                          ? "text-sky-300 font-bold"
                          : state === "error"
                          ? "text-rose-400 font-bold"
                          : "text-slate-400"
                      }`}
                    >
                      {stage.order}. {stage.label}
                    </span>
                    <span className="text-[10px] text-slate-400 truncate block">
                      {stage.description}
                    </span>
                  </div>
                </div>

                <div className="text-right tabular-nums text-[11px] shrink-0 ml-2">
                  {state === "completed" && (
                    <span className="text-emerald-400 font-bold">100%</span>
                  )}
                  {state === "active" && (
                    <span className="text-sky-400 font-bold animate-pulse">
                      {currentPercent}%
                    </span>
                  )}
                  {state === "error" && (
                    <span className="text-rose-400 font-bold">Falha</span>
                  )}
                  {state === "pending" && (
                    <span className="text-slate-500">Pendente</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Resumo do Backup Concluído (Se Sucesso) */}
        {isCompleted && currentEvent?.filename && (
          <div className="p-4 bg-emerald-950/30 border-t border-emerald-500/30 m-4 rounded-xl space-y-2 font-mono text-xs">
            <div className="flex items-center gap-2 text-emerald-400 font-bold">
              <FileArchive className="w-4 h-4" />
              <span>Snapshot Consolidado e Replicado em Nuvem</span>
            </div>

            <div className="space-y-1 text-[11px]">
              <div className="flex justify-between">
                <span className="text-slate-400">Arquivo:</span>
                <span className="text-slate-200 font-bold">{currentEvent.filename}</span>
              </div>
              {currentEvent.size_human && (
                <div className="flex justify-between">
                  <span className="text-slate-400">Tamanho Compactado:</span>
                  <span className="text-emerald-300 font-bold">
                    {currentEvent.size_human}
                  </span>
                </div>
              )}
              {currentEvent.sha256 && (
                <div className="flex items-center justify-between gap-2 pt-1 border-t border-emerald-500/20">
                  <span className="text-slate-400 shrink-0">SHA-256:</span>
                  <div className="flex items-center gap-1.5 truncate">
                    <span className="text-slate-300 text-[10px] truncate max-w-[260px]">
                      {currentEvent.sha256}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleCopyHash(currentEvent.sha256!)}
                      title="Copiar Checksum SHA-256"
                      className="p-1 rounded bg-obsidian-900 border border-obsidian-800 text-slate-300 hover:text-white hover:border-emerald-500 transition-colors"
                    >
                      {copiedHash ? (
                        <Check className="w-3 h-3 text-emerald-400" />
                      ) : (
                        <Copy className="w-3 h-3" />
                      )}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="p-4 border-t border-obsidian-800 bg-obsidian-950 flex items-center justify-between">
          <span className="text-[11px] font-mono text-slate-400">
            {isCompleted
              ? "Pronto para restauração e contingência de DR."
              : error
              ? "O pipeline foi abortado. Verifique os logs do contêiner."
              : "Não feche esta janela durante a execução."}
          </span>

          <Button
            type="button"
            variant={error ? "destructive" : "primary"}
            onClick={onClose}
            disabled={!isCompleted && !error}
            className="text-xs font-mono font-bold"
            data-testid="progress-modal-close-btn"
          >
            {isCompleted ? "Concluir e Fechar" : error ? "Fechar" : "Aguarde..."}
          </Button>
        </div>
      </div>
    </div>
  );
};
