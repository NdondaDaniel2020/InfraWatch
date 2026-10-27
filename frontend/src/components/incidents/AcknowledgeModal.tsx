import React, { useEffect } from "react";
import { CheckCircle2, Headphones, X } from "lucide-react";
import { IncidentItem } from "../../services/incidentsApi";

export interface AcknowledgeModalProps {
  isOpen: boolean;
  incident: IncidentItem | null;
  onClose: () => void;
  onConfirm: (incidentId: string) => Promise<void> | void;
  isSubmitting?: boolean;
  operatorName?: string;
  operatorRole?: string;
}

/**
 * Modal de Confirmação de Reconhecimento (Acknowledge) do Incidente (Issue #32).
 * Assume a ocorrência pelo operador logado, silencia alarmes em tempo real
 * e atualiza o estado operacional para toda a equipe do NOC.
 */
export const AcknowledgeModal: React.FC<AcknowledgeModalProps> = ({
  isOpen,
  incident,
  onClose,
  onConfirm,
  isSubmitting = false,
  operatorName = "Daniel Ndonda",
  operatorRole = "NOC Lead",
}) => {
  // Fecha com tecla Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen && !isSubmitting) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, isSubmitting, onClose]);

  if (!isOpen || !incident) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="ack-modal-title"
      data-testid="acknowledge-modal"
    >
      <div className="relative w-full max-w-lg bg-obsidian-900 border border-obsidian-800 rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <header className="px-6 py-4 border-b border-obsidian-800 bg-obsidian-950/60 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/25 flex items-center justify-center text-amber-400">
              <Headphones size={22} className="shrink-0" aria-hidden="true" />
            </div>
            <div>
              <h2 id="ack-modal-title" className="font-display font-bold text-base text-white">
                Reconhecer Incidente
              </h2>
              <span className="text-xs font-mono text-amber-400">
                {incident.code} • Atendimento Técnico
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            aria-label="Fechar diálogo de confirmação"
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-obsidian-850 transition-colors cursor-pointer"
          >
            <X size={20} className="shrink-0" aria-hidden="true" />
          </button>
        </header>

        {/* Corpo do Diálogo */}
        <div className="p-6 space-y-4">
          <p className="text-xs text-slate-300 leading-relaxed">
            Você está prestes a assumir a gestão técnica deste incidente. O alarme sonoro e visual
            será <strong className="text-amber-400 font-semibold">silenciado</strong> para todos os operadores do NOC, e seu usuário será registrado na trilha de auditoria.
          </p>

          {/* Card de Dados do Ativo */}
          <div className="bg-obsidian-950/80 border border-obsidian-800 rounded-xl p-4 space-y-2 text-xs font-mono">
            <div className="flex items-center justify-between">
              <span className="text-slate-400">Ativo Afetado:</span>
              <span className="font-bold text-white">{incident.target_device.name}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-400">IP de Gerência:</span>
              <span className="text-emerald-400">{incident.target_device.ip}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-400">Cliente / Organização:</span>
              <span className="text-slate-200">{incident.organization_name}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-400">Downtime Decorrido:</span>
              <span className="text-rose-400 font-bold tabular-nums">{incident.duration_str}</span>
            </div>
          </div>

          {/* Operador Designado */}
          <div className="flex items-center gap-3 p-3 bg-obsidian-850/50 rounded-xl border border-obsidian-800">
            <div className="w-8 h-8 rounded-full bg-emerald-500/10 border border-emerald-500/25 flex items-center justify-center font-mono text-xs font-bold text-emerald-400">
              DN
            </div>
            <div className="text-xs">
              <div className="font-semibold text-slate-100">{operatorName}</div>
              <div className="text-slate-400 font-mono text-[11px]">{operatorRole} • Luanda NOC</div>
            </div>
          </div>
        </div>

        {/* Footer com Ações */}
        <footer className="px-6 py-3.5 border-t border-obsidian-800 bg-obsidian-950/80 flex items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="px-4 py-2 rounded-lg text-xs font-medium text-slate-400 hover:text-white hover:bg-obsidian-850 transition-colors cursor-pointer"
          >
            Cancelar
          </button>
          <button
            type="button"
            data-testid="btn-confirm-ack"
            disabled={isSubmitting}
            onClick={() => onConfirm(incident.id)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold text-slate-950 bg-amber-500 hover:bg-amber-400 active:bg-amber-600 transition-colors shadow-lg shadow-amber-950/30 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSubmitting ? (
              <>
                <span className="w-3.5 h-3.5 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" aria-hidden="true" />
                <span>Reconhecendo…</span>
              </>
            ) : (
              <>
                <CheckCircle2 size={16} className="shrink-0" aria-hidden="true" />
                <span>Confirmar Reconhecimento</span>
              </>
            )}
          </button>
        </footer>
      </div>
    </div>
  );
};
