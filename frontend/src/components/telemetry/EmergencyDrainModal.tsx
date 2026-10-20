import React from "react";
import { AlertOctagon } from "lucide-react";

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
      className="fixed inset-0 bg-black/80 backdrop-blur-md z-[120] flex items-center justify-center p-4 animate-fadeIn"
      role="dialog"
      aria-modal="true"
      aria-labelledby="drain-modal-title"
    >
      <div className="w-full max-w-md bg-[#0d1424] border border-rose-500/40 rounded-2xl p-6 flex flex-col gap-4 shadow-2xl shadow-rose-950/50">
        <div className="flex items-center gap-3 text-rose-500">
          <AlertOctagon size={28} />
          <h2 id="drain-modal-title" className="text-xl font-bold text-white m-0">
            Protocolo Emergency Drain
          </h2>
        </div>
        <p className="text-sm text-slate-300 leading-relaxed m-0">
          Atenção: A execução deste protocolo desconecta e drena todo o tráfego telemétrico do cluster
          imediatamente. Essa ação é restrita ao NOC Lead (Daniel Ndonda).
        </p>
        <div className="flex justify-end gap-2.5 mt-2">
          <button
            type="button"
            data-testid="btn-cancel-drain"
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-white/10 hover:bg-white/15 border border-white/15 text-white text-xs font-semibold transition-colors focus-visible:ring-2 focus-visible:ring-white"
          >
            Cancelar
          </button>
          <button
            type="button"
            data-testid="btn-confirm-drain"
            onClick={onConfirm}
            className="px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold transition-colors shadow-lg shadow-rose-900/50 focus-visible:ring-2 focus-visible:ring-rose-400"
          >
            Confirmar Drain
          </button>
        </div>
      </div>
    </div>
  );
};
