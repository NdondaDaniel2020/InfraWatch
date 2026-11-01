import React, { useEffect, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Headphones,
  LifeBuoy,
  PhoneCall,
  Send,
  ShieldAlert,
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
  const [activeTab, setActiveTab] = useState<"ticket" | "direct">("ticket");
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
      <div className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto bg-[#0d1424] border border-white/10 rounded-3xl p-6 sm:p-8 flex flex-col gap-6 shadow-2xl text-slate-100">
        {/* Cabeçalho */}
        <div className="flex items-start justify-between gap-4 pb-4 border-b border-white/10">
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
              className="text-lg sm:text-xl font-bold text-white tracking-tight m-0"
            >
              Atendimento Técnico & Abertura de Chamados
            </h2>
            <p className="text-xs text-slate-400 mt-1 mb-0">
              Canal oficial prioritário com integração GLPI e plantão de telemetria.
            </p>
          </div>

          <button
            type="button"
            data-testid="close-support-modal-btn"
            onClick={onClose}
            aria-label="Fechar suporte"
            className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white transition-colors cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* Abas de Navegação */}
        <div className="flex items-center gap-2 p-1 bg-[#080c14] border border-white/10 rounded-2xl">
          <button
            type="button"
            data-testid="support-tab-ticket"
            onClick={() => setActiveTab("ticket")}
            className={`flex-1 py-2 text-xs font-mono rounded-xl transition-colors cursor-pointer flex items-center justify-center gap-2 ${
              activeTab === "ticket"
                ? "bg-sky-500/20 text-sky-300 font-bold border border-sky-500/30"
                : "text-slate-400 hover:text-white hover:bg-white/5"
            }`}
          >
            <LifeBuoy size={14} />
            <span>Abrir Chamado (GLPI)</span>
          </button>

          <button
            type="button"
            data-testid="support-tab-direct"
            onClick={() => setActiveTab("direct")}
            className={`flex-1 py-2 text-xs font-mono rounded-xl transition-colors cursor-pointer flex items-center justify-center gap-2 ${
              activeTab === "direct"
                ? "bg-sky-500/20 text-sky-300 font-bold border border-sky-500/30"
                : "text-slate-400 hover:text-white hover:bg-white/5"
            }`}
          >
            <PhoneCall size={14} />
            <span>Canais Diretos de Emergência</span>
          </button>
        </div>

        {/* Conteúdo da Aba 1: Abertura de Chamado */}
        {activeTab === "ticket" && (
          <div>
            {createdTicket ? (
              /* Sucesso: Ticket Aberto */
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

                <div className="p-4 rounded-xl bg-[#080c14]/60 border border-white/5 text-xs font-mono text-slate-300 flex flex-col gap-2">
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
                    className="w-full px-4 py-2.5 rounded-xl bg-[#080c14] border border-white/10 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-sky-500 transition-colors"
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
                      className="w-full px-3 py-2.5 rounded-xl bg-[#080c14] border border-white/10 text-xs text-white focus:outline-none focus:border-sky-500 transition-colors cursor-pointer"
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
                      className="w-full px-3 py-2.5 rounded-xl bg-[#080c14] border border-white/10 text-xs text-white focus:outline-none focus:border-sky-500 transition-colors cursor-pointer"
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
                    className="w-full px-4 py-2.5 rounded-xl bg-[#080c14] border border-white/10 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-sky-500 transition-colors resize-none"
                    required
                  />
                </div>

                <div className="flex items-center justify-between pt-2">
                  <span className="text-[11px] font-mono text-slate-500">
                    SLA de Primeiro Atendimento P1: até 15 minutos.
                  </span>

                  <button
                    type="submit"
                    data-testid="ticket-submit-btn"
                    disabled={isSubmitting}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-sky-500 hover:bg-sky-400 disabled:opacity-50 text-slate-950 font-bold text-xs font-mono transition-colors cursor-pointer shadow-md"
                  >
                    <Send size={14} />
                    <span>{isSubmitting ? "Enviando..." : "Registrar Chamado no GLPI"}</span>
                  </button>
                </div>
              </form>
            )}
          </div>
        )}

        {/* Conteúdo da Aba 2: Canais Diretos */}
        {activeTab === "direct" && (
          <div className="flex flex-col gap-4">
            <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-start gap-3 text-amber-300">
              <ShieldAlert size={20} className="shrink-0 mt-0.5 text-amber-400" />
              <div className="text-xs font-mono leading-relaxed">
                <strong>Linha Vermelha de Emergência:</strong> Use os canais abaixo apenas para
                incidentes bloqueantes SEV-1 com indisponibilidade total de serviços críticos.
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-[#080c14] border border-white/10 text-xs font-mono text-slate-300 leading-relaxed">
              Os contatos diretos de emergência são definidos no contrato da sua organização.
              Consulte o gestor de conta ou abra um chamado P1 para acionar o plantão do NOC.
            </div>

            {/* Tabela de Prazos Contratuais de Atendimento */}
            <div className="p-4 rounded-2xl bg-[#080c14] border border-white/5">
              <span className="text-xs font-mono font-bold text-slate-300 block mb-2">
                Prazos Contratuais de Resposta (SLA Máximo):
              </span>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs font-mono">
                <div className="p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300">
                  <span className="text-[10px] text-slate-400 block">P1 • Crítico</span>
                  <strong className="text-sm">≤ 15 min</strong>
                </div>
                <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-300">
                  <span className="text-[10px] text-slate-400 block">P2 • Alto</span>
                  <strong className="text-sm">≤ 1 hora</strong>
                </div>
                <div className="p-2.5 rounded-xl bg-sky-500/10 border border-sky-500/20 text-sky-300">
                  <span className="text-[10px] text-slate-400 block">P3 • Médio</span>
                  <strong className="text-sm">≤ 4 horas</strong>
                </div>
                <div className="p-2.5 rounded-xl bg-slate-500/10 border border-slate-500/20 text-slate-300">
                  <span className="text-[10px] text-slate-400 block">P4 • Baixo</span>
                  <strong className="text-sm">≤ 12 horas</strong>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
