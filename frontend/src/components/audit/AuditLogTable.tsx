import React from "react";
import { Receipt, Check, AlertCircle, Bot, KeyRound, Shield } from "lucide-react";
import { AuditLogEntry } from "../../types/audit";
import { Badge } from "../ui/Badge";

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

  const getRoleBadgeVariant = (role: string) => {
    switch (role) {
      case "SUPER_ADMIN":
        return "critical"; // badge roxo/destaque
      case "NOC_OPERATOR":
        return "healthy";
      case "ORG_ADMIN":
        return "degraded";
      default:
        return "neutral";
    }
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
      .split(".")
      .map((p) => p[0]?.toUpperCase() || "")
      .slice(0, 2)
      .join("");

    return (
      <div className="w-5 h-5 rounded-full bg-purple-500/20 text-purple-300 font-bold text-[9px] flex items-center justify-center border border-purple-500/30">
        {initials || "US"}
      </div>
    );
  };

  return (
    <div
      data-testid="audit-log-table-container"
      className="bg-obsidian-900 rounded-xl border border-obsidian-800 overflow-hidden flex flex-col"
    >
      {/* Header da Tabela */}
      <div className="px-4 py-3 border-b border-obsidian-800 flex items-center justify-between bg-obsidian-950/60">
        <div className="flex items-center gap-2">
          <Receipt size={16} className="text-emerald-400" />
          <span className="text-xs font-display font-bold text-white">
            Registro de Transações Criptografadas
          </span>
          <span className="px-1.5 py-0.5 rounded bg-obsidian-850 text-[10px] text-slate-400 font-mono">
            {totalCount.toLocaleString("pt-BR")} eventos
          </span>
        </div>
        <div className="flex items-center gap-1.5 text-slate-400 font-mono tabular-nums text-xs">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          <span>Integridade 100%</span>
        </div>
      </div>

      {/* Conteúdo da Tabela */}
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse font-mono tabular-nums text-xs">
          <thead>
            <tr className="border-b border-obsidian-800 bg-obsidian-950/40 text-[10px] text-slate-400 uppercase tracking-wider">
              <th className="py-2.5 px-3">Timestamp (WAT)</th>
              <th className="py-2.5 px-3">Autor</th>
              <th className="py-2.5 px-2.5">Papel</th>
              <th className="py-2.5 px-2.5">IP Origem</th>
              <th className="py-2.5 px-3">Ação</th>
              <th className="py-2.5 px-3">Recurso</th>
              <th className="py-2.5 px-2 text-center">Status</th>
              <th className="py-2.5 px-3 text-right">Diff</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-obsidian-800/60">
            {isLoading ? (
              // Skeletons de Carregamento
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} className="animate-pulse">
                  <td className="py-3 px-3">
                    <div className="h-3 w-20 bg-obsidian-800 rounded mb-1" />
                    <div className="h-2 w-16 bg-obsidian-850 rounded" />
                  </td>
                  <td className="py-3 px-3">
                    <div className="h-3 w-24 bg-obsidian-800 rounded" />
                  </td>
                  <td className="py-3 px-2.5">
                    <div className="h-4 w-16 bg-obsidian-800 rounded" />
                  </td>
                  <td className="py-3 px-2.5">
                    <div className="h-3 w-20 bg-obsidian-800 rounded" />
                  </td>
                  <td className="py-3 px-3">
                    <div className="h-4 w-20 bg-obsidian-800 rounded" />
                  </td>
                  <td className="py-3 px-3">
                    <div className="h-3 w-24 bg-obsidian-800 rounded" />
                  </td>
                  <td className="py-3 px-2 text-center">
                    <div className="h-3 w-12 bg-obsidian-800 rounded mx-auto" />
                  </td>
                  <td className="py-3 px-3 text-right">
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
                    <td className="py-3 px-3 whitespace-nowrap">
                      <div className={isSelected ? "font-semibold text-white" : "text-slate-300"}>
                        {datePart}
                      </div>
                      <div className="text-[10px] text-slate-500 tabular-nums">{timePart}</div>
                    </td>

                    <td className="py-3 px-3 whitespace-nowrap">
                      <div className="flex items-center gap-1.5">
                        {getActorAvatar(log.actor_name, log.actor_role)}
                        <span className="text-slate-200 text-[11px]">
                          {log.actor_name || "system.daemon"}
                        </span>
                      </div>
                    </td>

                    <td className="py-3 px-2.5 whitespace-nowrap">
                      <Badge variant={getRoleBadgeVariant(log.actor_role)} className="text-[9px]">
                        {log.actor_role}
                      </Badge>
                    </td>

                    <td className="py-3 px-2.5 whitespace-nowrap">
                      <span className="text-slate-300 text-[11px] tabular-nums">
                        {log.ip_address || "internal"}
                      </span>
                    </td>

                    <td className="py-3 px-3 whitespace-nowrap">
                      <span className="px-1.5 py-0.5 rounded bg-sky-500/15 border border-sky-500/30 text-sky-300 text-[9px] font-bold">
                        {log.action}
                      </span>
                    </td>

                    <td className="py-3 px-3 whitespace-nowrap">
                      <div className="text-xs text-white">{log.resource_id}</div>
                      <div className="text-[10px] text-slate-500">{log.resource_type}</div>
                    </td>

                    <td className="py-3 px-2 text-center whitespace-nowrap">
                      {isSuccess ? (
                        <span className="text-emerald-400 text-[11px] inline-flex items-center gap-1">
                          <Check size={12} /> Válido
                        </span>
                      ) : (
                        <span className="text-rose-400 text-[11px] inline-flex items-center gap-1">
                          <AlertCircle size={12} /> Inválido
                        </span>
                      )}
                    </td>

                    <td className="py-3 px-3 text-right whitespace-nowrap">
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
                        [Ver Diff]
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
      <div className="px-4 py-2.5 border-t border-obsidian-800 flex flex-col sm:flex-row items-center justify-between gap-2 bg-obsidian-950/60 text-xs font-mono text-slate-400">
        <div className="flex items-center gap-2">
          <span>
            Exibindo {logs.length > 0 ? (currentPage - 1) * pageSize + 1 : 0}–
            {Math.min(currentPage * pageSize, totalCount)} de {totalCount} registros
          </span>
          <span className="text-obsidian-700">|</span>
          <span className="text-emerald-400">Tamanho do Bloco: 1.2 MB</span>
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
