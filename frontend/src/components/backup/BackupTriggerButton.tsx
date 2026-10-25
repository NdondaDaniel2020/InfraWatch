import React, { useState } from "react";
import { HardDriveDownload, AlertTriangle, Loader2, X } from "lucide-react";
import { Button } from "../ui/Button";

interface BackupTriggerButtonProps {
  isLoading: boolean;
  isRunning: boolean;
  onConfirmTrigger: (notes?: string) => Promise<void> | void;
}

export const BackupTriggerButton: React.FC<BackupTriggerButtonProps> = ({
  isLoading,
  isRunning,
  onConfirmTrigger,
}) => {
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [notes, setNotes] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleOpenConfirm = () => {
    if (isRunning || isLoading) return;
    setNotes("");
    setIsConfirmOpen(true);
  };

  const handleConfirm = async () => {
    setIsSubmitting(true);
    try {
      await onConfirmTrigger(notes.trim() || undefined);
      setIsConfirmOpen(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <Button
        type="button"
        variant="primary"
        onClick={handleOpenConfirm}
        disabled={isRunning || isLoading}
        className="font-mono text-xs font-bold gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-obsidian-950 shadow-lg shadow-emerald-950/40"
        data-testid="backup-trigger-button"
      >
        {isRunning || isLoading ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>Processando Backup...</span>
          </>
        ) : (
          <>
            <HardDriveDownload className="w-4 h-4" />
            <span>Gerar Backup Manual</span>
          </>
        )}
      </Button>

      {/* Modal de Confirmação Prévia */}
      {isConfirmOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="confirm-backup-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-obsidian-950/80 backdrop-blur-sm"
          data-testid="backup-confirm-modal"
        >
          <div className="w-full max-w-md bg-obsidian-900 border border-obsidian-800 rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Header */}
            <div className="p-4 border-b border-obsidian-800 flex items-center justify-between">
              <div className="flex items-center gap-2 text-amber-400 font-bold text-sm">
                <AlertTriangle className="w-5 h-5 shrink-0" />
                <h3 id="confirm-backup-title">Confirmação de Backup Sob Demanda</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsConfirmOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-obsidian-800 transition-colors"
                aria-label="Fechar"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Body */}
            <div className="p-4 space-y-3.5 text-xs">
              <p className="text-slate-300 leading-relaxed">
                Esta ação enviará um comando assíncrono ao contêiner de backup para iniciar o
                pipeline completo (dump TimescaleDB, snapshot Redis, cifragem AES-256 e replicação Dual-Cloud).
              </p>

              <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl text-amber-300 text-[11px] space-y-1">
                <span className="font-bold block">Aviso de I/O em Produção:</span>
                <p>
                  Embora a operação seja executada com prioridade reduzida (Blast Radius Zero),
                  pode haver breve contenção de I/O de disco durante a compressão dos dados.
                </p>
              </div>

              <div className="space-y-1.5">
                <label
                  htmlFor="backup-notes-input"
                  className="block font-mono text-[10px] text-slate-400 font-semibold uppercase"
                >
                  Motivo / Observações do Backup (Opcional):
                </label>
                <textarea
                  id="backup-notes-input"
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Ex: Pré-atualização de firmware dos roteadores de borda"
                  className="w-full bg-obsidian-950 border border-obsidian-800 rounded-xl p-2.5 text-xs text-white placeholder:text-slate-600 focus:outline-none focus:border-emerald-500/80 transition-colors font-mono"
                />
              </div>
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-obsidian-800 bg-obsidian-950 flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setIsConfirmOpen(false)}
                disabled={isSubmitting}
                className="px-3.5 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white hover:bg-obsidian-850 transition-colors"
              >
                Cancelar
              </button>
              <Button
                type="button"
                variant="primary"
                onClick={handleConfirm}
                disabled={isSubmitting}
                className="text-xs font-mono font-bold bg-emerald-600 hover:bg-emerald-500 text-obsidian-950"
                data-testid="confirm-trigger-submit-btn"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />
                    Despachando...
                  </>
                ) : (
                  "Confirmar e Iniciar"
                )}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
