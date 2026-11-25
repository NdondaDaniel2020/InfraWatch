import React from "react";
import { Receipt, Bot, KeyRound, Shield } from "lucide-react";
import { AuditLogEntry } from "../../types/audit";

interface AuditLogTableProps {
  logs: AuditLogEntry[];
  selectedLogId: string | null;
  onSelectLog: (log: AuditLogEntry) => void;
  isLoading?: boolean;
  totalCount: number;
  currentPage: number;
  pageSize: number;
  onPageChange: (page: number) => void;
}

export const AuditLogTable: React.FC<AuditLogTableProps> = ({
  logs,
  selectedLogId,
  onSelectLog,
  isLoading = false,
  totalCount,
  currentPage,
  pageSize,
  onPageChange,
}) => {
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

  const formatTimestamp = (isoDate: string) => {
    try {
      const d = new Date(isoDate);
      const datePart = d.toISOString().slice(0, 10);
      const timePart = d.toISOString().slice(11, 23);
      return { datePart, timePart };
    } catch {
      return { datePart: isoDate, timePart: "" };
    }
  };

  const getRoleBadge = (role: string) => {
    switch (role) {
      case "SUPER_ADMIN":
        return "px-1.5 py-0.5 rounded bg-purple-500/15 border border-purple-500/30 text-purple-300 text-[9px] font-bold";
      case "NOC_OPERATOR":
        return "px-1.5 py-0.5 rounded bg-sky-500/15 border border-sky-500/30 text-sky-300 text-[9px]";
      case "ORG_ADMIN":
        return "px-1.5 py-0.5 rounded bg-amber-500/15 border border-amber-500/30 text-amber-300 text-[9px] font-semibold";
      default:
        return "px-1.5 py-0.5 rounded bg-obsidian-800 text-slate-400 text-[9px]";
    }
  };

  const getActionBadge = (action: string) => {
    switch (action) {
      case "DEVICE_PAUSED":
        return "px-1.5 py-0.5 rounded bg-sky-500/15 border border-sky-500/30 text-sky-300 text-[9px] font-bold";
      case "INCIDENT_ACK":
      case "INCIDENT_ACKNOWLEDGED":
        return "px-1.5 py-0.5 rounded bg-amber-500/15 border border-amber-500/30 text-amber-300 text-[9px] font-semibold";
      case "GLPI_SYNC":
      case "GLPI_TICKET_SYNCED":
        return "px-1.5 py-0.5 rounded bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-[9px] font-semibold";
      case "SLA_EXEMPT_REQ":
      case "SLA_EXEMPTION_REQ":
        return "px-1.5 py-0.5 rounded bg-rose-500/15 border border-rose-500/30 text-rose-300 text-[9px] font-semibold";
      case "SESSION_MFA":
      case "SESSION_MFA_PASS":
        return "px-1.5 py-0.5 rounded bg-sky-500/15 border border-sky-500/30 text-sky-400 text-[9px] font-semibold";
      default:
        return "px-1.5 py-0.5 rounded bg-sky-500/15 border border-sky-500/30 text-sky-300 text-[9px] font-bold";
    }
  };

  const getResourceSubtitle = (log: AuditLogEntry) => {
    if (log.details?.summary) return String(log.details.summary);
    if (log.details?.title) return String(log.details.title);
    if (log.details?.reason) return String(log.details.reason);
    if (log.details?.description) return String(log.details.description);
    if (log.details?.name) return String(log.details.name);
    if (log.details?.auth_method) return String(log.details.auth_method);
    if (log.details?.engine) return `${log.details.engine} ${log.details?.version || ""}`.trim();
    return log.resource_type;
  };

  const getActorAvatar = (actorName?: string, actorRole?: string) => {
    if (actorRole === "SYSTEM" || !actorName) {
      if (actorName?.includes("auth")) {
        return (
          <div className="w-5 h-5 rounded-full bg-slate-800 text-slate-300 text-[9px] flex items-center justify-center border border-obsidian-700">
            <KeyRound size={12} />
          </div>
        );
      }
      return (
        <div className="w-5 h-5 rounded-full bg-slate-800 text-slate-300 text-[9px] flex items-center justify-center border border-obsidian-700">
          <Bot size={12} />
        </div>
      );
    }

    const initials = actorName
      ? actorName
          .split(/[\s.]+/)
          .map((p) => p[0]?.toUpperCase() || "")
          .slice(0, 2)
          .join("")
      : "";

    if (actorRole === "SUPER_ADMIN") {
      return (
        <div className="w-5 h-5 rounded-full bg-purple-500/20 text-purple-300 font-bold text-[9px] flex items-center justify-center border border-purple-500/30">
          {initials || "SA"}
        </div>
      );
    }

    if (actorRole === "ORG_ADMIN") {
      return (
        <div className="w-5 h-5 rounded-full bg-amber-500/20 text-amber-300 font-bold text-[9px] flex items-center justify-center border border-amber-500/30">
          {initials || "OA"}
        </div>
      );
    }

    return (
      <div className="w-5 h-5 rounded-full bg-sky-500/20 text-sky-300 font-bold text-[9px] flex items-center justify-center border border-sky-500/30">
        {initials || "OP"}
      </div>
    );
  };

  return (
    <div
      data-testid="audit-log-table-container"
      className="bg-obsidian-900 rounded-xl border border-obsidian-800 overflow-hidden flex flex-col"
    >
      {/* Header da Tabela */}
      <div className="px-3.5 sm:px-4 py-3 border-b border-obsidian-800 flex items-center justify-between flex-wrap gap-2 bg-obsidian-950/60 min-w-0">
        <div className="flex items-center gap-2 min-w-0">
          <Receipt size={16} className="text-emerald-400 shrink-0" />
          <span className="text-xs font-display font-bold text-white truncate">
            Registro de Transações Criptografadas
          </span>
          <span className="px-1.5 py-0.5 rounded bg-obsidian-850 text-[10px] text-slate-400 font-mono shrink-0">
            {totalCount.toLocaleString("pt-BR")} eventos
          </span>
        </div>
        <div className="flex items-center gap-1.5 text-slate-400 font-mono tabular-nums text-xs shrink-0">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          <span>Integridade 100%</span>
        </div>
      </div>

      {/* Conteúdo da Tabela */}
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse font-mono tabular-nums text-xs">
          <thead>
            <tr className="border-b border-obsidian-800 bg-obsidian-950/40 text-[10px] text-slate-400 uppercase tracking-wider">
              <th className="py-2.5 px-2.5 whitespace-nowrap">Data/Hora (WAT)</th>
              <th className="py-2.5 px-2 whitespace-nowrap">Autor</th>
              <th className="py-2.5 px-1.5 whitespace-nowrap">Papel</th>
              <th className="py-2.5 px-2 whitespace-nowrap">IP Origem</th>
              <th className="py-2.5 px-2 whitespace-nowrap">Ação</th>
              <th className="py-2.5 px-2 whitespace-nowrap">Recurso</th>
              <th className="py-2.5 px-1.5 text-center whitespace-nowrap">Estado</th>
              <th className="py-2.5 px-2.5 text-right whitespace-nowrap">Comparativo</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-obsidian-800/60">
            {isLoading ? (
              // Skeletons de Carregamento
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} className="animate-pulse">
                  <td className="py-3 px-2.5">
                    <div className="h-3 w-20 bg-obsidian-800 rounded mb-1" />
                    <div className="h-2 w-16 bg-obsidian-850 rounded" />
                  </td>
                  <td className="py-3 px-2">
                    <div className="h-3 w-20 bg-obsidian-800 rounded" />
                  </td>
                  <td className="py-3 px-1.5">
                    <div className="h-4 w-16 bg-obsidian-800 rounded" />
                  </td>
                  <td className="py-3 px-2">
                    <div className="h-3 w-16 bg-obsidian-800 rounded" />
                  </td>
                  <td className="py-3 px-2">
                    <div className="h-4 w-18 bg-obsidian-800 rounded" />
                  </td>
                  <td className="py-3 px-2">
                    <div className="h-3 w-20 bg-obsidian-800 rounded" />
                  </td>
                  <td className="py-3 px-1.5 text-center">
                    <div className="h-3 w-12 bg-obsidian-800 rounded mx-auto" />
                  </td>
                  <td className="py-3 px-2.5 text-right">
                    <div className="h-5 w-14 bg-obsidian-800 rounded ml-auto" />
                  </td>
                </tr>
              ))
            ) : logs.length === 0 ? (
              // Estado Vazio
              <tr>
                <td colSpan={8} className="py-12 text-center text-slate-500 font-sans">
                  <Shield size={32} className="mx-auto text-slate-600 mb-2" />
                  <p className="text-sm font-medium text-slate-300">
                    Nenhum registro de auditoria encontrado
                  </p>
                  <p className="text-xs text-slate-500 mt-1">
                    Tente ajustar os filtros de pesquisa ou papel RBAC.
                  </p>
                </td>
              </tr>
            ) : (
              // Linhas Nominais
              logs.map((log) => {
                const { datePart, timePart } = formatTimestamp(log.created_at);
                const isSelected = selectedLogId === log.id;
                const isSuccess = log.result === "SUCCESS";
                const resourceSubtitle = getResourceSubtitle(log);

                return (
                  <tr
                    key={log.id}
                    onClick={() => onSelectLog(log)}
                    className={`transition-colors cursor-pointer ${
                      isSelected
                        ? "bg-obsidian-850/90 border-l-2 border-emerald-400"
                        : "hover:bg-obsidian-850/50"
                    }`}
                  >
                    <td className="py-3 px-2.5 whitespace-nowrap shrink-0">
                      <div className={isSelected ? "font-semibold text-white" : "text-slate-300"}>
                        {datePart}
                      </div>
                      <div className="text-[10px] text-slate-500 tabular-nums">{timePart}</div>
                    </td>

                    <td className="py-3 px-2 max-w-[120px] 2xl:max-w-[150px]">
                      <div
                        className="flex items-center gap-1.5 min-w-0"
                        title={log.actor_name || "system.daemon"}
                      >
                        {getActorAvatar(log.actor_name, log.actor_role)}
                        <span className="text-slate-200 text-[11px] truncate">
                          {log.actor_name || "system.daemon"}
                        </span>
                      </div>
                    </td>

                    <td className="py-3 px-1.5 whitespace-nowrap shrink-0">
                      <span className={getRoleBadge(log.actor_role)}>
                        {log.actor_role}
                      </span>
                    </td>

                    <td className="py-3 px-2 whitespace-nowrap shrink-0">
                      <span
                        className="text-slate-300 text-[11px] tabular-nums block truncate max-w-[95px]"
                        title={log.ip_address || "internal"}
                      >
                        {log.ip_address || "internal"}
                      </span>
                    </td>

                    <td className="py-3 px-2 whitespace-nowrap shrink-0">
                      <span className={getActionBadge(log.action)}>
                        {log.action}
                      </span>
                    </td>

                    <td className="py-3 px-2 max-w-[130px] xl:max-w-[160px] 2xl:max-w-[200px]">
                      <div className="text-xs text-white truncate" title={log.resource_id}>
                        {log.resource_id}
                      </div>
                      <div
                        className="text-[10px] text-slate-400 truncate"
                        title={resourceSubtitle}
                      >
                        {resourceSubtitle}
                      </div>
                    </td>

                    <td className="py-3 px-1.5 text-center whitespace-nowrap shrink-0">
                      {isSuccess ? (
                        <span className="text-emerald-400 text-[11px]">✓ Válido</span>
                      ) : (
                        <span className="text-rose-400 text-[11px]">✗ Inválido</span>
                      )}
                    </td>

                    <td className="py-3 px-2.5 text-right whitespace-nowrap shrink-0">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectLog(log);
                        }}
                        className={`px-2 py-0.5 rounded text-[10px] font-bold transition-colors ${
                          isSelected
                            ? "bg-emerald-500 text-obsidian-950"
                            : "bg-obsidian-950 border border-obsidian-800 text-slate-300 hover:text-white"
                        }`}
                      >
                        [Ver Comparativo]
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Paginação */}
      <div className="px-3 sm:px-4 py-2.5 border-t border-obsidian-800 flex flex-col sm:flex-row items-center justify-between gap-2.5 bg-obsidian-950/60 text-xs font-mono text-slate-400">
        <div className="flex flex-wrap items-center justify-center sm:justify-start gap-1.5 sm:gap-2 text-[11px] text-center sm:text-left">
          <span>
            Exibindo {logs.length > 0 ? (currentPage - 1) * pageSize + 1 : 0}–
            {Math.min(currentPage * pageSize, totalCount)} de {totalCount} registros
          </span>
          <span className="text-obsidian-700 hidden sm:inline">|</span>
          <span className="text-emerald-400">
            Tamanho do Bloco: {totalCount > 500 ? `${((totalCount * 1.8) / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(totalCount * 1.8))} KB`}
          </span>
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => onPageChange(currentPage - 1)}
            disabled={currentPage <= 1 || isLoading}
            className="px-2 py-1 rounded bg-obsidian-900 border border-obsidian-800 text-slate-400 text-xs disabled:opacity-30 hover:bg-obsidian-850"
          >
            Anterior
          </button>
          <span className="px-2 py-1 font-bold text-white">{currentPage}</span>
          <button
            type="button"
            onClick={() => onPageChange(currentPage + 1)}
            disabled={currentPage >= totalPages || isLoading}
            className="px-2 py-1 rounded bg-obsidian-900 border border-obsidian-800 text-slate-300 hover:bg-obsidian-850 text-xs disabled:opacity-30"
          >
            Próximo
          </button>
        </div>
      </div>
    </div>
  );
};
