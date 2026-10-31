import React, { useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Filter,
  Search,
  XCircle,
} from "lucide-react";
import type { ClientServiceItem } from "../../mocks/clientPortalMocks";

export interface SanitizedServicesGridProps {
  services: ClientServiceItem[];
}

const PAGE_SIZE = 6;

export const SanitizedServicesGrid: React.FC<SanitizedServicesGridProps> = ({ services }) => {
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | "UP" | "DEG" | "DOWN">("ALL");
  const [currentPage, setCurrentPage] = useState(1);

  // Filtragem dinâmica por termo e status
  const filteredServices = useMemo(() => {
    return services.filter((svc) => {
      const matchesSearch =
        searchTerm.trim() === "" ||
        svc.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        svc.category.toLowerCase().includes(searchTerm.toLowerCase()) ||
        svc.tags.some((tag) => tag.toLowerCase().includes(searchTerm.toLowerCase()));

      const matchesStatus =
        statusFilter === "ALL" || svc.status === statusFilter;

      return matchesSearch && matchesStatus;
    });
  }, [services, searchTerm, statusFilter]);

  // Paginação
  const totalPages = Math.max(1, Math.ceil(filteredServices.length / PAGE_SIZE));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const startIndex = (safeCurrentPage - 1) * PAGE_SIZE;
  const paginatedServices = filteredServices.slice(startIndex, startIndex + PAGE_SIZE);

  // Redefinir página ao filtrar
  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(e.target.value);
    setCurrentPage(1);
  };

  const handleStatusFilterChange = (status: "ALL" | "UP" | "DEG" | "DOWN") => {
    setStatusFilter(status);
    setCurrentPage(1);
  };

  const clearFilters = () => {
    setSearchTerm("");
    setStatusFilter("ALL");
    setCurrentPage(1);
  };

  return (
    <section
      data-testid="sanitized-services-grid"
      aria-label="Saúde dos Serviços Críticos Contratados"
      className="flex flex-col gap-5"
    >
      {/* Header com Totais */}
      <div className="flex items-center justify-between pb-3 border-b border-white/10 flex-wrap gap-3">
        <div>
          <h3 className="text-base font-bold text-white flex items-center gap-2.5 m-0">
            <span>Saúde dos Serviços Críticos Contratados</span>
            <span className="px-2.5 py-0.5 text-xs font-mono rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
              {services.filter((s) => s.status === "UP").length}/{services.length} Operacionais
            </span>
          </h3>
          <p className="text-xs text-slate-400 mt-0.5 mb-0">
            Visão consolidada para acompanhamento executivo e auditoria contratual.
          </p>
        </div>

        {/* Contador de Filtro */}
        <span className="text-xs font-mono text-slate-400">
          Exibindo {filteredServices.length} de {services.length} serviços
        </span>
      </div>

      {/* Barra de Filtros e Busca Rápida */}
      <div className="flex items-center justify-between flex-wrap gap-3 p-3 bg-[#0d1424]/60 border border-white/10 rounded-2xl">
        {/* Campo de Busca */}
        <div className="relative flex-1 min-w-[240px]">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            data-testid="services-search-input"
            value={searchTerm}
            onChange={handleSearchChange}
            placeholder="Buscar por serviço, categoria, IP ou tag..."
            className="w-full pl-10 pr-4 py-2 text-xs font-sans rounded-xl bg-[#080c14] border border-white/10 text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500/50 transition-colors"
          />
          {searchTerm && (
            <button
              type="button"
              onClick={() => {
                setSearchTerm("");
                setCurrentPage(1);
              }}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
            >
              <XCircle size={14} />
            </button>
          )}
        </div>

        {/* Pílulas de Status */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {(["ALL", "UP", "DEG", "DOWN"] as const).map((st) => (
            <button
              key={st}
              type="button"
              data-testid={`filter-status-${st.toLowerCase()}`}
              onClick={() => handleStatusFilterChange(st)}
              className={`px-3 py-1.5 rounded-xl text-xs font-mono font-medium transition-colors cursor-pointer border ${
                statusFilter === st
                  ? "bg-emerald-500/20 border-emerald-500/40 text-emerald-300 font-bold"
                  : "bg-white/5 border-white/10 text-slate-400 hover:text-white hover:bg-white/10"
              }`}
            >
              {st === "ALL"
                ? "Todos"
                : st === "UP"
                ? "Nominal (UP)"
                : st === "DEG"
                ? "Alerta (DEG)"
                : "Crítico (DOWN)"}
            </button>
          ))}
        </div>
      </div>

      {/* Grid de Serviços */}
      {paginatedServices.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {paginatedServices.map((svc) => {
            const isUp = svc.status === "UP";
            const isDeg = svc.status === "DEG";

            return (
              <article
                key={svc.id}
                data-testid={`service-card-${svc.id}`}
                className={`p-5 rounded-2xl bg-[#0d1424] border flex flex-col justify-between transition-colors shadow-sm ${
                  isDeg
                    ? "border-amber-500/30 hover:border-amber-500/50"
                    : svc.status === "DOWN"
                    ? "border-rose-500/30 hover:border-rose-500/50"
                    : "border-white/10 hover:border-white/20"
                }`}
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <span className="text-[11px] font-mono text-slate-400 block">{svc.category}</span>
                      <h4 className="text-base font-bold text-white mt-0.5 m-0">{svc.name}</h4>
                    </div>
                    <span
                      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-mono font-medium ${
                        isUp
                          ? "bg-emerald-500/10 border border-emerald-500/20 text-emerald-400"
                          : isDeg
                          ? "bg-amber-500/10 border border-amber-500/20 text-amber-400"
                          : "bg-rose-500/10 border border-rose-500/20 text-rose-400"
                      }`}
                    >
                      {isUp ? (
                        <CheckCircle2 size={12} />
                      ) : (
                        <AlertTriangle size={12} />
                      )}
                      <span>{svc.statusLabel}</span>
                    </span>
                  </div>

                  {/* Métricas Rápidas */}
                  <div className="grid grid-cols-2 gap-3 my-4">
                    <div>
                      <span className="text-[11px] font-mono text-slate-400 block">Tempo de Resposta</span>
                      <span
                        className={`text-sm font-mono font-bold tabular-nums mt-0.5 block ${
                          isDeg
                            ? "text-amber-400"
                            : svc.status === "DOWN"
                            ? "text-rose-400"
                            : "text-emerald-400"
                        }`}
                      >
                        {svc.responseTimeMs} ms {isDeg ? "(Alerta)" : svc.status === "DOWN" ? "(Falha)" : "(Normal)"}
                      </span>
                    </div>
                    <div>
                      <span className="text-[11px] font-mono text-slate-400 block">Vazão / Capacidade</span>
                      <span className="text-sm font-mono font-bold text-white tabular-nums mt-0.5 block">
                        {svc.throughputFormatted}
                      </span>
                    </div>
                  </div>

                  {/* Alerta de Degradação (se houver) */}
                  {svc.advisoryAlert && (
                    <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-300 leading-relaxed mb-3">
                      {svc.advisoryAlert}
                    </div>
                  )}

                  {/* Tags de Recursos */}
                  <div className="flex flex-wrap gap-1.5 mb-3">
                    {svc.tags.map((tag) => (
                      <span
                        key={tag}
                        className="px-2 py-0.5 rounded-lg bg-white/5 border border-white/5 text-[11px] font-mono text-slate-300"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Barra de Estabilidade 30 Dias */}
                <div className="pt-3 border-t border-white/5">
                  <div className="flex items-center justify-between text-xs font-mono text-slate-400 mb-1.5">
                    <span>Estabilidade 30 dias</span>
                    <span
                      className={`font-semibold tabular-nums ${
                        isDeg
                          ? "text-amber-400"
                          : svc.status === "DOWN"
                          ? "text-rose-400"
                          : "text-emerald-400"
                      }`}
                    >
                      {(svc.stability30DaysPct ?? 100).toFixed(1)}% Nominal
                    </span>
                  </div>
                  <div className="h-1.5 w-full bg-[#080c14] rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        isDeg
                          ? "bg-amber-400"
                          : svc.status === "DOWN"
                          ? "bg-rose-400"
                          : "bg-emerald-400"
                      }`}
                      style={{ width: `${Math.min(svc.stability30DaysPct ?? 100, 100)}%` }}
                    />
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        /* Empty State de Busca / Filtro */
        <div
          data-testid="services-filter-empty"
          className="p-12 rounded-2xl bg-[#0d1424]/40 border border-white/10 flex flex-col items-center justify-center text-center"
        >
          <Filter size={32} className="text-slate-500 mb-3" />
          <h4 className="text-base font-bold text-white m-0">Nenhum serviço encontrado</h4>
          <p className="text-xs text-slate-400 max-w-sm mt-1 mb-4">
            Não encontramos serviços ativos correspondentes aos filtros aplicados ({searchTerm || statusFilter}).
          </p>
          <button
            type="button"
            onClick={clearFilters}
            className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-xs font-mono text-white transition-colors cursor-pointer"
          >
            Limpar Filtros de Busca
          </button>
        </div>
      )}

      {/* Controles de Paginação */}
      {totalPages > 1 && (
        <div
          data-testid="services-pagination"
          className="flex items-center justify-between pt-4 border-t border-white/10 flex-wrap gap-3"
        >
          <span className="text-xs font-mono text-slate-400">
            Página {safeCurrentPage} de {totalPages} ({filteredServices.length} ativos)
          </span>

          <div className="flex items-center gap-2">
            <button
              type="button"
              data-testid="pagination-prev-btn"
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={safeCurrentPage === 1}
              className="p-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
              aria-label="Página anterior"
            >
              <ChevronLeft size={16} />
            </button>

            {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
              <button
                key={page}
                type="button"
                data-testid={`pagination-page-${page}`}
                onClick={() => setCurrentPage(page)}
                className={`w-8 h-8 rounded-xl text-xs font-mono font-medium transition-colors cursor-pointer border ${
                  safeCurrentPage === page
                    ? "bg-emerald-500/20 border-emerald-500/40 text-emerald-300 font-bold"
                    : "bg-white/5 border-white/10 text-slate-400 hover:text-white"
                }`}
              >
                {page}
              </button>
            ))}

            <button
              type="button"
              data-testid="pagination-next-btn"
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={safeCurrentPage === totalPages}
              className="p-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
              aria-label="Próxima página"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      )}
    </section>
  );
};

