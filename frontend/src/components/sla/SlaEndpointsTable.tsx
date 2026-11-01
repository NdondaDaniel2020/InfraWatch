import React, { useMemo, useState } from "react";
import { CheckCircle2, AlertTriangle, Search, ChevronLeft, ChevronRight, Globe } from "lucide-react";
import type { SanitizedEndpoint } from "../../types/clientPortal";

export interface SlaEndpointsTableProps {
  endpoints: SanitizedEndpoint[];
  targetSlaPct?: number;
  itemsPerPage?: number;
}

export const SlaEndpointsTable: React.FC<SlaEndpointsTableProps> = ({
  endpoints,
  targetSlaPct = 99.50,
  itemsPerPage = 5,
}) => {
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);

  const filteredEndpoints = useMemo(() => {
    if (!searchTerm.trim()) return endpoints;
    const term = searchTerm.toLowerCase();
    return endpoints.filter(
      (ep) =>
        ep.domainName.toLowerCase().includes(term) ||
        ep.serviceType.toLowerCase().includes(term) ||
        (ep.datacenterRegion ?? "").toLowerCase().includes(term)
    );
  }, [endpoints, searchTerm]);

  // Reset page when search term changes
  React.useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm]);

  const totalPages = Math.max(1, Math.ceil(filteredEndpoints.length / itemsPerPage));
  const safeCurrentPage = Math.min(currentPage, totalPages);

  const paginatedEndpoints = useMemo(() => {
    const startIndex = (safeCurrentPage - 1) * itemsPerPage;
    return filteredEndpoints.slice(startIndex, startIndex + itemsPerPage);
  }, [filteredEndpoints, safeCurrentPage, itemsPerPage]);

  return (
    <section
      data-testid="sla-endpoints-table"
      aria-label="Detalhamento de SLA dos Endpoints Sanitizados"
      className="p-5 sm:p-6 rounded-2xl bg-[#0d1424] border border-white/10 flex flex-col gap-4 shadow-sm"
    >
      {/* Cabeçalho da Tabela e Barra de Busca */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/10 pb-3">
        <div className="flex items-center gap-2">
          <Globe size={18} className="text-emerald-400" />
          <h3 className="text-sm font-bold text-white m-0">
            Detalhamento de SLA por Endpoint Contratado
          </h3>
        </div>

        {/* Campo de Busca */}
        <div className="relative w-full sm:w-64">
          <Search size={14} className="absolute left-3 top-2.5 text-slate-400" />
          <input
            type="text"
            data-testid="sla-endpoint-search-input"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar endpoint, serviço ou DC..."
            className="w-full bg-[#080c14] border border-white/10 rounded-xl pl-8 pr-3 py-1.5 text-xs font-mono text-slate-200 placeholder-slate-500 focus:outline-none focus:border-emerald-500/50"
          />
        </div>
      </div>

      {/* Tabela de Dados */}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="border-b border-white/10 font-mono text-slate-400 uppercase text-[10.5px]">
              <th className="py-2.5 px-3">Endpoint / FQDN</th>
              <th className="py-2.5 px-3">Serviço Contratado</th>
              <th className="py-2.5 px-3">Protocolo</th>
              <th className="py-2.5 px-3 text-center">Status Atual</th>
              <th className="py-2.5 px-3 text-right">SLA no Período</th>
              <th className="py-2.5 px-3 text-right">Latência Média</th>
              <th className="py-2.5 px-3">Região / DC</th>
              <th className="py-2.5 px-3 text-right">Conformidade</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5 font-mono">
            {paginatedEndpoints.length === 0 ? (
              <tr>
                <td
                  colSpan={8}
                  className="py-8 text-center text-slate-400 font-sans"
                >
                  Nenhum endpoint encontrado para o termo pesquisado.
                </td>
              </tr>
            ) : (
              paginatedEndpoints.map((ep) => {
                const hasSla = typeof ep.sla30dPct === "number";
                const isCompliant = hasSla && ep.sla30dPct! >= targetSlaPct;
                const isUp = ep.status === "UP";

                return (
                  <tr
                    key={ep.id}
                    data-testid={`sla-endpoint-row-${ep.id}`}
                    className="hover:bg-white/5 transition-colors"
                  >
                    <td className="py-3 px-3 font-bold text-white">
                      {ep.domainName}
                    </td>
                    <td className="py-3 px-3 text-slate-300 font-sans">
                      {ep.serviceType}
                    </td>
                    <td className="py-3 px-3 text-slate-400">{ep.protocol}</td>
                    <td className="py-3 px-3 text-center">
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10.5px] font-semibold ${
                          isUp
                            ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                            : "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                        }`}
                      >
                        {isUp ? <CheckCircle2 size={11} /> : <AlertTriangle size={11} />}
                        <span>{ep.status}</span>
                      </span>
                    </td>
                    <td
                      className={`py-3 px-3 text-right tabular-nums font-bold ${
                        !hasSla
                          ? "text-slate-400"
                          : isCompliant
                          ? "text-emerald-400"
                          : "text-rose-400"
                      }`}
                    >
                      {hasSla ? `${ep.sla30dPct!.toFixed(2)}%` : "N/D"}
                    </td>
                    <td className="py-3 px-3 text-right tabular-nums text-slate-200">
                      {typeof ep.latencyAvgMs === "number"
                        ? `${ep.latencyAvgMs.toFixed(1)} ms`
                        : "N/D"}
                    </td>
                    <td className="py-3 px-3 text-slate-400 font-sans">
                      {ep.datacenterRegion ?? "N/D"}
                    </td>
                    <td className="py-3 px-3 text-right">
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10.5px] font-bold ${
                          !hasSla
                            ? "bg-slate-500/10 text-slate-400 border border-slate-500/20"
                            : isCompliant
                            ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                            : "bg-rose-500/10 text-rose-400 border border-rose-500/20"
                        }`}
                      >
                        {!hasSla ? "N/D" : isCompliant ? "CONFORME" : "VIOLADO"}
                      </span>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Paginação */}
      {totalPages > 1 && (
        <div
          data-testid="sla-endpoints-pagination"
          className="flex justify-between items-center pt-3 border-t border-white/10 text-xs font-mono text-slate-400"
        >
          <span>
            Mostrando <strong>{paginatedEndpoints.length}</strong> de <strong>{filteredEndpoints.length}</strong> endpoints
          </span>

          <div className="flex items-center gap-2">
            <button
              type="button"
              data-testid="pagination-prev"
              disabled={safeCurrentPage <= 1}
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#080c14] border border-white/10 text-xs text-slate-200 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-white/10 transition-colors"
            >
              <ChevronLeft size={14} />
              <span>Anterior</span>
            </button>

            <span>
              Página <strong>{safeCurrentPage}</strong> de <strong>{totalPages}</strong>
            </span>

            <button
              type="button"
              data-testid="pagination-next"
              disabled={safeCurrentPage >= totalPages}
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#080c14] border border-white/10 text-xs text-slate-200 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-white/10 transition-colors"
            >
              <span>Próxima</span>
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      )}
    </section>
  );
};
