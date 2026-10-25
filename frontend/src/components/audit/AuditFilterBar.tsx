import React from "react";
import { Search, Calendar, RefreshCw } from "lucide-react";
import { AuditFilterParams } from "../../types/audit";

interface AuditFilterBarProps {
  filters: AuditFilterParams;
  onChange: (filters: AuditFilterParams) => void;
  onRefresh: () => void;
  isLiveStream: boolean;
  onToggleLiveStream: () => void;
  isLoading?: boolean;
}

export const AuditFilterBar: React.FC<AuditFilterBarProps> = ({
  filters,
  onChange,
  onRefresh,
  isLiveStream,
  onToggleLiveStream,
  isLoading = false,
}) => {
  return (
    <section
      data-testid="audit-filter-bar"
      className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3 bg-obsidian-900 p-3 rounded-xl border border-obsidian-800"
    >
      <div className="flex flex-wrap items-center gap-2.5 flex-1">
        {/* Busca Textual */}
        <div className="relative w-full lg:w-80">
          <Search
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
            aria-hidden="true"
          />
          <input
            type="text"
            aria-label="Filtrar por autor, IP, entidade"
            placeholder="Filtrar por autor, IP, entidade…"
            value={filters.search || ""}
            onChange={(e) => onChange({ ...filters, search: e.target.value, page: 1 })}
            className="w-full bg-obsidian-950 border border-obsidian-800 rounded-lg pl-9 pr-12 py-1.5 font-mono tabular-nums text-xs text-white placeholder:text-slate-500 focus-visible:outline-none focus-visible:border-emerald-500 focus-visible:ring-1 focus-visible:ring-emerald-500 transition-colors"
          />
          <kbd className="absolute right-2.5 top-1/2 -translate-y-1/2 font-mono text-[10px] px-1 py-0.5 rounded bg-obsidian-850 border border-obsidian-800 text-slate-400 pointer-events-none">
            Ctrl K
          </kbd>
        </div>

        {/* Filtro Papel RBAC */}
        <select
          aria-label="Filtrar por papel RBAC"
          value={filters.role || "ALL"}
          onChange={(e) => onChange({ ...filters, role: e.target.value, page: 1 })}
          className="bg-obsidian-950 border border-obsidian-800 rounded-lg px-2.5 py-1.5 font-mono text-xs text-slate-300 focus-visible:outline-none focus-visible:border-emerald-500 focus-visible:ring-1 focus-visible:ring-emerald-500 transition-colors"
        >
          <option value="ALL">Todos os Papéis (SUPER_ADMIN, NOC, ORG, SYSTEM)</option>
          <option value="SUPER_ADMIN">SUPER_ADMIN</option>
          <option value="NOC_OPERATOR">NOC_OPERATOR</option>
          <option value="ORG_ADMIN">ORG_ADMIN</option>
          <option value="SYSTEM">SYSTEM (WORKER / AUTH)</option>
        </select>

        {/* Filtro Ação Executada */}
        <select
          aria-label="Filtrar por ação executada"
          value={filters.action || "ALL"}
          onChange={(e) => onChange({ ...filters, action: e.target.value, page: 1 })}
          className="bg-obsidian-950 border border-obsidian-800 rounded-lg px-2.5 py-1.5 font-mono text-xs text-slate-300 focus-visible:outline-none focus-visible:border-emerald-500 focus-visible:ring-1 focus-visible:ring-emerald-500 transition-colors"
        >
          <option value="ALL">Todas as Ações (CREATE, UPDATE, DELETE, ACK, EXEMPTION)</option>
          <option value="DEVICE_PAUSED">DEVICE_PAUSED</option>
          <option value="INCIDENT_ACK">INCIDENT_ACK</option>
          <option value="GLPI_SYNC">GLPI_SYNC</option>
          <option value="SLA_EXEMPT_REQ">SLA_EXEMPT_REQ</option>
          <option value="SESSION_MFA">SESSION_MFA</option>
        </select>

        {/* Filtro Data */}
        <div className="inline-flex items-center gap-1.5 bg-obsidian-950 border border-obsidian-800 rounded-lg px-3 py-1.5 font-mono tabular-nums text-xs text-slate-300">
          <Calendar size={14} className="text-sky-400" />
          <span>Hoje (Últimas 24h)</span>
        </div>
      </div>

      {/* Live Stream Toggle & Refresh */}
      <div className="flex items-center gap-2 shrink-0">
        <button
          type="button"
          onClick={onToggleLiveStream}
          className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border font-mono text-xs font-semibold transition-colors cursor-pointer ${
            isLiveStream
              ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20"
              : "bg-obsidian-950 border-obsidian-800 text-slate-400 hover:text-white"
          }`}
          title="Alternar ingestão SSE contínua"
        >
          <span
            className={`w-2 h-2 rounded-full ${
              isLiveStream ? "bg-emerald-400 animate-pulse" : "bg-slate-600"
            }`}
          />
          <span>LIVE STREAM: {isLiveStream ? "ON" : "PAUSED"}</span>
        </button>

        <button
          type="button"
          onClick={onRefresh}
          disabled={isLoading}
          aria-label="Atualizar tabela agora"
          className="w-8 h-8 rounded-lg bg-obsidian-950 border border-obsidian-800 hover:border-obsidian-700 text-slate-400 hover:text-white flex items-center justify-center transition-colors disabled:opacity-50"
          title="Atualizar tabela agora"
        >
          <RefreshCw size={14} className={isLoading ? "animate-spin" : ""} />
        </button>
      </div>
    </section>
  );
};
