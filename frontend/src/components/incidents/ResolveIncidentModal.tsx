import React, { useState, useEffect } from "react";
import { AlertCircle, CheckCircle2, Info, X } from "lucide-react";
import { IncidentItem, FailureCategory } from "../../services/incidentsApi";

export interface ResolveIncidentModalProps {
  isOpen: boolean;
  incident: IncidentItem | null;
  onClose: () => void;
  onResolve: (
    incidentId: string,
    payload: {
      root_cause: string;
      corrective_action: string;
      failure_category: FailureCategory;
      is_sla_exempt: boolean;
      close_glpi: boolean;
    }
  ) => Promise<void> | void;
  isSubmitting?: boolean;
  operatorName?: string;
}

/**
 * Modal Canônico de Resolução e Causa Raiz Técnica (RCA) (Issue #32).
 * Fiel a telas_mockups/18_ResolveIncidentModal.
 * Exige obrigatoriamente preenchimento de RCA técnica antes de finalizar o incidente.
 */
export const ResolveIncidentModal: React.FC<ResolveIncidentModalProps> = ({
  isOpen,
  incident,
  onClose,
  onResolve,
  isSubmitting = false,
  operatorName = "Daniel Ndonda",
}) => {
  const [rootCause, setRootCause] = useState("");
  const [correctiveAction, setCorrectiveAction] = useState("");
  const [failureCategory, setFailureCategory] = useState<FailureCategory>("hardware");
  const [isSlaExempt, setIsSlaExempt] = useState(false);
  const [closeGlpi, setCloseGlpi] = useState(true);
  const [validationError, setValidationError] = useState<string | null>(null);

  // Inicializa valores ao abrir
  useEffect(() => {
    if (incident) {
      setRootCause(incident.root_cause || "");
      setCorrectiveAction(incident.corrective_action || "");
      setFailureCategory(incident.failure_category || "hardware");
      setIsSlaExempt(incident.is_sla_exempt || false);
      setValidationError(null);
    }
  }, [incident, isOpen]);

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

  const charCount = rootCause.trim().length;
  const isMinCharsMet = charCount >= 20;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isMinCharsMet) {
      setValidationError("A Causa Raiz Técnica (RCA) é obrigatória (mínimo de 20 caracteres).");
      return;
    }
    setValidationError(null);
    onResolve(incident.id, {
      root_cause: rootCause.trim(),
      corrective_action: correctiveAction.trim(),
      failure_category: failureCategory,
      is_sla_exempt: isSlaExempt,
      close_glpi: closeGlpi,
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/75 backdrop-blur-md flex items-center justify-center p-4 sm:p-6 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-incident-title"
      data-testid="resolve-incident-modal"
    >
      <div className="relative w-full max-w-[760px] max-h-[92vh] bg-obsidian-900 border border-white/10 rounded-2xl shadow-2xl flex flex-col overflow-hidden my-auto backdrop-blur-xl animate-in fade-in zoom-in-95 duration-150">
        {/* Header do Modal */}
        <header className="px-7 py-5 flex items-start justify-between border-b border-obsidian-800 bg-obsidian-950/60 shrink-0">
          <div className="flex items-start gap-4">
            <div className="w-11 h-11 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 shrink-0 shadow-lg shadow-emerald-950/20">
              <CheckCircle2 size={24} className="shrink-0" aria-hidden="true" />
            </div>

            <div>
              <div className="flex items-center gap-2.5">
                <h2 id="modal-incident-title" className="font-display font-bold text-lg text-white tracking-tight">
                  Resolver Incidente Técnico
                </h2>
                <span className="px-2 py-0.5 rounded-full text-xs font-mono font-bold bg-rose-500/15 text-rose-400 border border-rose-500/20">
                  #{incident.code}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                Registro formal de Causa Raiz (RCA), encerramento do chamado no GLPI e cálculo de isenção de SLA.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            aria-label="Fechar Modal"
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-obsidian-850 transition-colors shrink-0 cursor-pointer"
          >
            <X size={20} className="shrink-0" aria-hidden="true" />
          </button>
        </header>

        {/* Resumo Compacto do Incidente */}
        <section
          aria-label="Resumo do Incidente"
          className="px-7 py-3.5 bg-obsidian-950/40 border-b border-obsidian-800 grid grid-cols-2 sm:grid-cols-4 gap-4 shrink-0 text-xs font-mono"
        >
          <div>
            <span className="text-slate-500 block text-[11px]">Dispositivo Alvo</span>
            <span className="text-white font-bold block mt-0.5">{incident.target_device.name}</span>
            <span className="text-slate-400 text-[11px]">{incident.target_device.ip}</span>
          </div>

          <div>
            <span className="text-slate-500 block text-[11px]">Severidade</span>
            <span className="text-rose-400 font-bold block mt-0.5 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-rose-400" />
              {incident.priority_label}
            </span>
            <span className="text-slate-400 text-[11px]">{incident.organization_name}</span>
          </div>

          <div>
            <span className="text-slate-500 block text-[11px]">Downtime Medido</span>
            <span className="text-amber-400 font-bold block mt-0.5 tabular-nums">
              {incident.duration_str}
            </span>
            <span className="text-slate-400 text-[11px]">SLA Computado</span>
          </div>

          <div>
            <span className="text-slate-500 block text-[11px]">Chamado GLPI</span>
            {incident.glpi_ticket_id ? (
              <span className="text-sky-400 font-semibold block mt-0.5">
                Ticket #{incident.glpi_ticket_id} ↗
              </span>
            ) : (
              <span className="text-slate-400 italic block mt-0.5">Sem chamado</span>
            )}
            <span className="text-slate-400 text-[11px]">Helpdesk NOC</span>
          </div>
        </section>

        {/* Formulário de Resolução */}
        <form
          id="form-resolve-incident"
          onSubmit={handleSubmit}
          className="p-7 space-y-6 overflow-y-auto max-h-[calc(88vh-230px)] bg-obsidian-900"
        >
          {/* Alerta de Validação */}
          {validationError && (
            <div
              role="alert"
              data-testid="rca-error-alert"
              className="p-3 bg-rose-500/15 border border-rose-500/30 rounded-xl text-xs text-rose-300 flex items-center gap-2"
            >
              <AlertCircle size={16} className="text-rose-400 shrink-0" aria-hidden="true" />
              <span>{validationError}</span>
            </div>
          )}

          {/* 1. Causa Raiz Técnica (RCA) */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label
                htmlFor="rca-description"
                className="text-xs font-mono font-semibold uppercase tracking-wider text-slate-300 flex items-center gap-2"
              >
                <span>Causa Raiz Técnica (RCA) *</span>
              </label>
              <div
                data-testid="char-counter"
                className={`flex items-center gap-1 text-[11px] font-mono ${
                  isMinCharsMet ? "text-emerald-400" : "text-amber-400"
                }`}
              >
                {isMinCharsMet ? (
                  <CheckCircle2 size={14} className="shrink-0" aria-hidden="true" />
                ) : (
                  <Info size={14} className="shrink-0" aria-hidden="true" />
                )}
                <span>Min. 20 caracteres (digitados: {charCount})</span>
              </div>
            </div>

            <textarea
              id="rca-description"
              name="rcaDescription"
              required
              rows={3}
              value={rootCause}
              onChange={(e) => {
                setRootCause(e.target.value);
                if (validationError && e.target.value.trim().length >= 20) {
                  setValidationError(null);
                }
              }}
              data-testid="input-root-cause"
              placeholder="Descreva a cadeia causal técnica do incidente, evidência física/lógica e impacto observado…"
              className="w-full bg-obsidian-950 border border-obsidian-800 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 rounded-xl p-3.5 text-xs font-mono text-slate-100 placeholder-slate-500 outline-none transition-colors leading-relaxed resize-none"
            />

            <p className="text-xs text-slate-400">
              Parecer indexado na base vetorial de conhecimento e anexado ao pós-incidente.
            </p>
          </div>

          {/* 2. Categoria da Falha & Ação Corretiva */}
          <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
            <div className="md:col-span-5 space-y-1.5">
              <label
                htmlFor="failure-category"
                className="text-xs font-mono font-medium text-slate-300 block"
              >
                Categoria da Falha *
              </label>
              <select
                id="failure-category"
                name="failureCategory"
                value={failureCategory}
                onChange={(e) => setFailureCategory(e.target.value as FailureCategory)}
                data-testid="select-failure-category"
                className="w-full bg-obsidian-950 border border-obsidian-800 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 rounded-xl px-3.5 py-2.5 text-xs font-mono text-slate-100 outline-none cursor-pointer transition-colors"
              >
                <option value="hardware">Hardware / Módulo Óptico</option>
                <option value="fiber">Falha de Enlace / Fibra Óptica</option>
                <option value="power">Queda de Energia / Nobreak (UPS)</option>
                <option value="bgp">Erro de Roteamento / BGP Flap</option>
                <option value="ddos">Ataque DDoS / Saturação de Link</option>
                <option value="software">Falha de Software / Firmware Crash</option>
                <option value="other">Outros / Força Maior</option>
              </select>
            </div>

            <div className="md:col-span-7 space-y-1.5">
              <label
                htmlFor="corrective-action"
                className="text-xs font-mono font-medium text-slate-300 block"
              >
                Ação Corretiva Executada
              </label>
              <input
                id="corrective-action"
                name="correctiveAction"
                type="text"
                value={correctiveAction}
                onChange={(e) => setCorrectiveAction(e.target.value)}
                data-testid="input-corrective-action"
                placeholder="Ex: Troca a quente do módulo transceptor SFP+..."
                className="w-full bg-obsidian-950 border border-obsidian-800 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 rounded-xl px-3.5 py-2.5 text-xs font-mono text-slate-100 outline-none transition-colors"
              />
            </div>
          </div>

          {/* 3. Isenção de SLA (ADR-009) */}
          <div className="p-4 bg-obsidian-950/70 rounded-xl border border-obsidian-800">
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                id="sla-exemption"
                name="slaExemption"
                type="checkbox"
                checked={isSlaExempt}
                onChange={(e) => setIsSlaExempt(e.target.checked)}
                data-testid="checkbox-sla-exemption"
                className="mt-1 w-4 h-4 rounded bg-obsidian-900 border-obsidian-700 text-amber-500 focus:ring-0 focus:ring-offset-0 cursor-pointer accent-amber-500"
              />
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono font-bold text-slate-100">
                    Classificar como Parada Isenta de SLA (ADR-009)
                  </span>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-semibold bg-amber-500/15 text-amber-400 border border-amber-500/30">
                    Homologação Requerida
                  </span>
                </div>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Downtime registrado de{" "}
                  <span className="font-mono text-amber-400 font-semibold">
                    {incident.duration_str}
                  </span>{" "}
                  será suspenso do cálculo de penalidades após validação da governança.
                </p>
              </div>
            </label>
          </div>

          {/* 4. Integração GLPI & Broadcast */}
          <div className="p-4 bg-obsidian-950/70 rounded-xl border border-obsidian-800 flex items-center justify-between gap-4">
            <div className="space-y-0.5">
              <span className="text-xs font-mono font-bold text-slate-100 block">
                {incident.glpi_ticket_id
                  ? `Encerrar Chamado #${incident.glpi_ticket_id} no GLPI & Notificar Equipe`
                  : "Notificar Equipe via Broadcast"}
              </span>
              <span className="text-xs text-slate-400 block">
                Sincroniza status no GLPI e despacha broadcast no Telegram e WhatsApp.
              </span>
            </div>

            <label className="relative inline-flex items-center cursor-pointer shrink-0">
              <input
                type="checkbox"
                id="toggle-glpi-sync"
                checked={closeGlpi}
                onChange={(e) => setCloseGlpi(e.target.checked)}
                data-testid="toggle-glpi-sync"
                className="sr-only peer"
              />
              <div className="w-10 h-5 bg-obsidian-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-transform peer-checked:bg-emerald-500" />
            </label>
          </div>
        </form>

        {/* Footer do Modal */}
        <footer className="px-7 py-4 border-t border-obsidian-800 bg-obsidian-950/80 flex flex-col sm:flex-row items-center justify-between gap-4 shrink-0">
          <div className="flex items-center gap-3 w-full sm:w-auto">
            <div className="w-8 h-8 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center font-mono tabular-nums text-xs font-bold text-emerald-400">
              DN
            </div>
            <div>
              <div className="text-xs font-mono font-semibold text-slate-200">
                {operatorName} <span className="text-slate-500 font-normal">• NOC Lead</span>
              </div>
              <div className="text-[10px] font-mono text-slate-500">
                Homologação Luanda NOC
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 rounded-xl text-xs font-medium text-slate-400 hover:text-white hover:bg-obsidian-850 transition-colors cursor-pointer"
            >
              Cancelar
            </button>

            <button
              type="button"
              data-testid="btn-confirm-resolution"
              disabled={isSubmitting}
              onClick={handleSubmit}
              className="flex items-center gap-2 px-5 py-2 rounded-xl text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 transition-colors shadow-lg shadow-emerald-950/30 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? (
                <>
                  <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" aria-hidden="true" />
                  <span>Encerrando…</span>
                </>
              ) : (
                <>
                  <CheckCircle2 size={16} className="shrink-0" aria-hidden="true" />
                  <span>Confirmar Resolução</span>
                </>
              )}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
};
