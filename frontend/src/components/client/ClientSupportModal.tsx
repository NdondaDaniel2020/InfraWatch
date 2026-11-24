import React, { useEffect, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Headphones,
  Send,
  X,
} from "lucide-react";
import type {
  ClientServiceItem,
  CreateSupportTicketInput,
  SupportTicketResponse,
} from "../../types/clientPortal";
import { clientPortalApi } from "../../services/clientPortalApi";

export interface ClientSupportModalProps {
  isOpen: boolean;
  onClose: () => void;
  organizationId?: string | null;
  services?: ClientServiceItem[];
  onTicketCreated?: (ticket: SupportTicketResponse) => void;
}

export const ClientSupportModal: React.FC<ClientSupportModalProps> = ({
  isOpen,
  onClose,
  organizationId,
  services = [],
  onTicketCreated,
}) => {
  const [title, setTitle] = useState("");
  const [selectedServiceId, setSelectedServiceId] = useState<string>("");
  const [severity, setSeverity] = useState<"LOW" | "MEDIUM" | "HIGH" | "CRITICAL">("MEDIUM");
  const [description, setDescription] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [createdTicket, setCreatedTicket] = useState<SupportTicketResponse | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Resetar estado quando reabrir
  useEffect(() => {
    if (isOpen) {
      setCreatedTicket(null);
      setErrorMessage(null);
      setTitle("");
      setDescription("");
      setSeverity("MEDIUM");
      setSelectedServiceId("");
    }
  }, [isOpen]);

  // Fechar no Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !description.trim()) {
      setErrorMessage("Por favor, preencha o assunto e a descrição do incidente.");
      return;
    }

    if (!organizationId) {
      setErrorMessage(
        "Organização não identificada. Não é possível abrir um chamado no GLPI."
      );
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    const input: CreateSupportTicketInput = {
      title: title.trim(),
      description: description.trim(),
      severity,
      deviceId: selectedServiceId || undefined,
    };

    try {
      const ticket = await clientPortalApi.openSupportTicket(organizationId, input);
      setCreatedTicket(ticket);
      onTicketCreated?.(ticket);
    } catch (err) {
      setCreatedTicket(null);
      setErrorMessage(
        err instanceof Error
          ? err.message
          : "Falha ao registrar o chamado no GLPI. Tente novamente."
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="client-support-title"
      data-testid="client-support-modal"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/80 backdrop-blur-md animate-fadeIn"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto bg-obsidian-900 border border-obsidian-800 rounded-xl p-6 sm:p-8 flex flex-col gap-6 shadow-2xl text-slate-100">
        {/* Cabeçalho */}
        <div className="flex items-start justify-between gap-4 pb-4 border-b border-obsidian-800">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="p-1.5 rounded-lg bg-sky-500/10 text-sky-400">
                <Headphones size={18} />
              </span>
              <span className="text-xs font-mono text-sky-400 font-semibold tracking-wide uppercase">
                Central de Suporte NOC 24/7
              </span>
            </div>
            <h2
              id="client-support-title"
              className="text-lg sm:text-xl font-bold text-white tracking-tight m-0 font-sans"
            >
              Atendimento Técnico & Abertura de Chamados
            </h2>
            <p className="text-xs font-mono text-slate-400 mt-1 mb-0">
              Canal oficial integrado diretamente à API REST do GLPI e monitoramento em tempo real.
            </p>
          </div>

          <button
            type="button"
            data-testid="close-support-modal-btn"
            onClick={onClose}
            aria-label="Fechar suporte"
            className="p-2 rounded-lg bg-obsidian-850 hover:bg-obsidian-800 text-slate-400 hover:text-white transition-colors cursor-pointer border border-obsidian-750"
          >
            <X size={18} />
          </button>
        </div>

        {/* Conteúdo Principal */}
        <div>
          {createdTicket ? (
            /* Sucesso: Ticket Aberto no GLPI */
            <div
              data-testid="ticket-created-success"
              className="p-6 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex flex-col gap-4 text-emerald-300"
            >
              <div className="flex items-center gap-3">
                <span className="p-2 rounded-xl bg-emerald-500/20 text-emerald-400">
                  <CheckCircle2 size={24} />
                </span>
                <div>
                  <h3 className="text-base font-bold text-white m-0">
                    Chamado Registrado com Sucesso!
                  </h3>
                  <span className="text-xs font-mono text-emerald-400">
                    Protocolo Oficial: <strong>{createdTicket.protocol}</strong>
                  </span>
                </div>
              </div>

              <div className="p-4 rounded-xl bg-obsidian-950 border border-obsidian-800/80 text-xs font-mono text-slate-300 flex flex-col gap-2">
                <div className="flex justify-between">
                  <span className="text-slate-500">Assunto:</span>
                  <span className="text-white font-medium">{createdTicket.title}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Severidade:</span>
                  <span className="text-amber-400 font-bold">{createdTicket.severity}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Ticket GLPI:</span>
                  <span className="text-sky-400 font-bold">
                    {createdTicket.glpiTicketId ? `#${createdTicket.glpiTicketId}` : "—"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Status Inicial:</span>
                  <span className="text-emerald-400 font-bold">{createdTicket.status}</span>
                </div>
              </div>

              <p className="text-xs text-slate-400 mb-0">
                {createdTicket.message ||
                  "Os operadores do NOC receberam a telemetria do incidente e entrarão em contato."}
              </p>

              <button
                type="button"
                data-testid="ticket-new-btn"
                onClick={() => setCreatedTicket(null)}
                className="self-start px-4 py-2 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 text-xs font-mono font-medium border border-emerald-500/40 cursor-pointer"
              >
                Abrir Novo Chamado
              </button>
            </div>
          ) : (
            /* Formulário de Abertura */
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              {errorMessage && (
                <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs font-mono flex items-center gap-2">
                  <AlertCircle size={16} />
                  <span>{errorMessage}</span>
                </div>
              )}

              <div>
                <label
                  htmlFor="ticket-title"
                  className="block text-xs font-mono text-slate-300 mb-1.5"
                >
                  Assunto do Chamado *
                </label>
                <input
                  id="ticket-title"
                  data-testid="ticket-title-input"
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Ex: Lentidão intermitente no canal Internet Banking"
                  className="w-full px-4 py-2.5 rounded-lg bg-obsidian-950 border border-obsidian-800 text-xs font-mono text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500/50 transition-colors"
                  required
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label
                    htmlFor="ticket-service"
                    className="block text-xs font-mono text-slate-300 mb-1.5"
                  >
                    Serviço ou Ativo Afetado
                  </label>
                  <select
                    id="ticket-service"
                    data-testid="ticket-service-select"
                    value={selectedServiceId}
                    onChange={(e) => setSelectedServiceId(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-lg bg-obsidian-950 border border-obsidian-800 text-xs font-mono text-white focus:outline-none focus:border-emerald-500/50 transition-colors cursor-pointer"
                  >
                    <option value="">Geral / Infraestrutura Contratada</option>
                    {services.map((svc) => (
                      <option key={svc.id} value={svc.id}>
                        {svc.name} ({svc.category})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label
                    htmlFor="ticket-severity"
                    className="block text-xs font-mono text-slate-300 mb-1.5"
                  >
                    Severidade / Impacto *
                  </label>
                  <select
                    id="ticket-severity"
                    data-testid="ticket-severity-select"
                    value={severity}
                    onChange={(e) =>
                      setSeverity(e.target.value as "LOW" | "MEDIUM" | "HIGH" | "CRITICAL")
                    }
                    className="w-full px-3 py-2.5 rounded-lg bg-obsidian-950 border border-obsidian-800 text-xs font-mono text-white focus:outline-none focus:border-emerald-500/50 transition-colors cursor-pointer"
                  >
                    <option value="CRITICAL">P1 • Crítico (Queda Total do Serviço)</option>
                    <option value="HIGH">P2 • Alto (Degradação Severa)</option>
                    <option value="MEDIUM">P3 • Médio (Instabilidade Parcial)</option>
                    <option value="LOW">P4 • Baixo (Dúvida ou Solicitação)</option>
                  </select>
                </div>
              </div>

              <div>
                <label
                  htmlFor="ticket-description"
                  className="block text-xs font-mono text-slate-300 mb-1.5"
                >
                  Descrição Detalhada do Problema *
                </label>
                <textarea
                  id="ticket-description"
                  data-testid="ticket-description-input"
                  rows={4}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Descreva o comportamento observado, horários do incidente, mensagens de erro e o impacto no negócio..."
                  className="w-full px-4 py-2.5 rounded-lg bg-obsidian-950 border border-obsidian-800 text-xs font-mono text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500/50 transition-colors resize-none"
                  required
                />
              </div>

              {/* Régua de Prazos de Resposta SLA Integrada */}
              <div data-testid="sla-ruler" className="p-3.5 rounded-xl bg-obsidian-950 border border-obsidian-800 flex flex-col gap-2">
                <span className="text-[11px] font-mono text-slate-400 block">
                  Prazos Contratuais de Resposta (SLA Máximo de Atendimento):
                </span>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs font-mono">
                  <div
                    className={`p-2 rounded-lg border transition-all ${
                      severity === "CRITICAL"
                        ? "bg-rose-500/20 border-rose-500/50 text-rose-300 ring-1 ring-rose-500/40"
                        : "bg-rose-500/5 border-rose-500/10 text-rose-300/60"
                    }`}
                  >
                    <span className="text-[10px] text-slate-400 block">P1 • Crítico</span>
                    <strong className="text-sm">≤ 15 min</strong>
                  </div>
                  <div
                    className={`p-2 rounded-lg border transition-all ${
                      severity === "HIGH"
                        ? "bg-amber-500/20 border-amber-500/50 text-amber-300 ring-1 ring-amber-500/40"
                        : "bg-amber-500/5 border-amber-500/10 text-amber-300/60"
                    }`}
                  >
                    <span className="text-[10px] text-slate-400 block">P2 • Alto</span>
                    <strong className="text-sm">≤ 1 hora</strong>
                  </div>
                  <div
                    className={`p-2 rounded-lg border transition-all ${
                      severity === "MEDIUM"
                        ? "bg-sky-500/20 border-sky-500/50 text-sky-300 ring-1 ring-sky-500/40"
                        : "bg-sky-500/5 border-sky-500/10 text-sky-300/60"
                    }`}
                  >
                    <span className="text-[10px] text-slate-400 block">P3 • Médio</span>
                    <strong className="text-sm">≤ 4 horas</strong>
                  </div>
                  <div
                    className={`p-2 rounded-lg border transition-all ${
                      severity === "LOW"
                        ? "bg-slate-500/20 border-slate-400/50 text-slate-200 ring-1 ring-slate-400/40"
                        : "bg-slate-500/5 border-slate-500/10 text-slate-400"
                    }`}
                  >
                    <span className="text-[10px] text-slate-400 block">P4 • Baixo</span>
                    <strong className="text-sm">≤ 12 horas</strong>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  data-testid="ticket-cancel-btn"
                  onClick={onClose}
                  className="px-4 py-2 rounded-lg bg-obsidian-850 hover:bg-obsidian-800 border border-obsidian-750 text-slate-300 text-xs font-mono transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  data-testid="ticket-submit-btn"
                  disabled={isSubmitting}
                  className="flex items-center gap-2 px-5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 disabled:opacity-50 text-obsidian-950 font-bold text-xs font-mono transition-colors cursor-pointer shadow-sm"
                >
                  <Send size={14} />
                  <span>{isSubmitting ? "Enviando..." : "Registrar Chamado no GLPI"}</span>
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
