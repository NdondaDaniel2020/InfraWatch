import React from "react";
import { AlertOctagon, AlertTriangle, Power } from "lucide-react";

export interface EmergencyDrainModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

export const EmergencyDrainModal: React.FC<EmergencyDrainModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
}) => {
  if (!isOpen) return null;

  return (
    <div
      data-testid="emergency-drain-modal"
      className="fixed inset-0 bg-obsidian-950/85 backdrop-blur-md z-50 flex items-center justify-center p-4 transition-opacity animate-fadeIn"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-drain-title"
    >
      <div className="bg-obsidian-900 border-2 border-rose-500/80 rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4">
        <div className="flex items-center gap-3 text-rose-400">
          <AlertOctagon size={28} aria-hidden="true" />
          <div>
            <h2 id="modal-drain-title" className="text-lg font-bold font-mono text-white m-0">
              Protocolo Emergency Drain
            </h2>
            <div className="text-xs font-mono text-rose-400 font-semibold">Cluster Drain: Luanda-01</div>
          </div>
        </div>

        <p className="text-xs text-slate-300 leading-relaxed font-sans m-0">
          Esta ação isolará imediatamente todo o tráfego do <strong className="text-white">Cluster Luanda-01</strong>, comutando as sessões BGP de trânsito internacional para o cluster secundário de contingência.
        </p>

        <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs font-mono">
          <div className="font-bold flex items-center gap-1.5 mb-1">
            <AlertTriangle size={16} aria-hidden="true" />
            <span>Atenção: Ação Irreversível por 15 Minutos</span>
          </div>
          <div>Código de Bloqueio OSPF: RFC-6860 GRACEFUL SHUTDOWN</div>
        </div>

        <div className="flex items-center justify-end gap-3 pt-2">
          <button
            type="button"
            data-testid="btn-cancel-drain"
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-obsidian-850 hover:bg-obsidian-800 border border-obsidian-700 text-slate-300 text-xs font-semibold transition-colors focus-visible:ring-2 focus-visible:ring-slate-400 cursor-pointer"
          >
            Cancelar
          </button>
          <button
            type="button"
            data-testid="btn-confirm-drain"
            onClick={onConfirm}
            className="px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold transition-colors shadow-lg shadow-rose-950/50 focus-visible:ring-2 focus-visible:ring-rose-400 cursor-pointer flex items-center gap-2"
          >
            <Power size={16} aria-hidden="true" />
            <span>Executar Drain Imediato</span>
          </button>
        </div>
      </div>
    </div>
  );
};
