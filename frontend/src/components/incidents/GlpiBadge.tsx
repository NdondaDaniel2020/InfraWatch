import React from "react";
import { ArrowUpRight, CheckCircle2, PlusCircle } from "lucide-react";

export interface GlpiBadgeProps {
  /** Número identificador do ticket no GLPI (ex: 8492) */
  ticketId?: number | null;
  /** Identificador único do incidente associado */
  incidentId: string;
  /** Callback para abertura manual em 1 clique */
  onOpenTicket?: (incidentId: string) => Promise<void> | void;
  /** Indicador de carregamento durante a criação do chamado */
  isOpening?: boolean;
  /** Classes CSS adicionais */
  className?: string;
  /** Indica se o chamado já está fechado/resolvido */
  isClosed?: boolean;
}

/**
 * Componente canônico GlpiBadge (Issue #32).
 * Exibe link seguro para o Helpdesk GLPI v9.5.7 quando o chamado existe,
 * ou botão de ação rápida 1-click para abertura imediata quando ainda não criado.
 */
export const GlpiBadge: React.FC<GlpiBadgeProps> = ({
  ticketId,
  incidentId,
  onOpenTicket,
  isOpening = false,
  className = "",
  isClosed = false,
}) => {
  // Se houver ticket vinculado, exibe link seguro para o GLPI
  if (ticketId) {
    const glpiUrl = `https://glpi.infrawatch.ao/front/ticket.form.php?id=${ticketId}`;

    if (isClosed) {
      return (
        <span
          data-testid={`glpi-ticket-closed-${incidentId}`}
          className={`inline-flex items-center gap-1.5 font-mono tabular-nums text-xs text-slate-400 bg-obsidian-850 px-2.5 py-1 rounded-md border border-obsidian-800 ${className}`}
        >
          <CheckCircle2 size={14} className="text-emerald-400 shrink-0" aria-hidden="true" />
          <span>Ticket #{ticketId} • Fechado</span>
        </span>
      );
    }

    return (
      <a
        href={glpiUrl}
        target="_blank"
        rel="noopener noreferrer"
        data-testid={`glpi-ticket-link-${incidentId}`}
        aria-label={`Abrir chamado #${ticketId} no console GLPI (abre em nova aba)`}
        className={`inline-flex items-center gap-1 font-mono tabular-nums text-xs text-sky-400 hover:text-sky-300 hover:underline bg-sky-500/10 hover:bg-sky-500/15 border border-sky-500/20 px-2 py-0.5 rounded transition-colors focus-visible:ring-2 focus-visible:ring-sky-400 ${className}`}
      >
        <span>Ticket #{ticketId} • GLPI</span>
        <ArrowUpRight size={13} className="shrink-0" aria-hidden="true" />
      </a>
    );
  }

  // Se não houver chamado, exibe o botão de abertura rápida 1-click
  return (
    <button
      type="button"
      data-testid={`btn-create-glpi-${incidentId}`}
      aria-label={`Abrir chamado no GLPI para o incidente ${incidentId}`}
      disabled={isOpening}
      onClick={() => onOpenTicket?.(incidentId)}
      className={`inline-flex items-center gap-1.5 font-mono text-xs font-semibold px-2.5 py-1 rounded-md bg-sky-500/15 text-sky-400 hover:bg-sky-500/25 border border-sky-500/30 transition-colors focus-visible:ring-2 focus-visible:ring-sky-400 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer ${className}`}
    >
      {isOpening ? (
        <>
          <span className="w-3 h-3 border-2 border-sky-400 border-t-transparent rounded-full animate-spin" aria-hidden="true" />
          <span>Criando Ticket…</span>
        </>
      ) : (
        <>
          <PlusCircle size={14} className="shrink-0" aria-hidden="true" />
          <span>Abrir Chamado no GLPI</span>
        </>
      )}
    </button>
  );
};
