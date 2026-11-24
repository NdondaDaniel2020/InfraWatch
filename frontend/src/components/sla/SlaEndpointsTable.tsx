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
  targetSlaPct = 99.5,
  itemsPerPage = 5,
}) => {
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(itemsPerPage);

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

  React.useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm]);

  const totalPages = Math.max(1, Math.ceil(filteredEndpoints.length / pageSize));
  const safeCurrentPage = Math.min(currentPage, totalPages);

  const paginatedEndpoints = useMemo(() => {
    const startIndex = (safeCurrentPage - 1) * pageSize;
    return filteredEndpoints.slice(startIndex, startIndex + pageSize);
  }, [filteredEndpoints, safeCurrentPage, pageSize]);

  const startRecord = filteredEndpoints.length === 0 ? 0 : (safeCurrentPage - 1) * pageSize + 1;
  const endRecord = Math.min(safeCurrentPage * pageSize, filteredEndpoints.length);

  return (
    <section
      data-testid="sla-endpoints-table"
      aria-label="Detalhamento de SLA dos Endpoints Sanitizados"
      className="bg-obsidian-900 border border-obsidian-800 rounded-xl overflow-hidden shadow-lg flex flex-col gap-0"
    >
      {/* Cabeçalho da Tabela e Barra de Busca */}
      <div className="p-4 border-b border-obsidian-800 flex flex-col md:flex-row md:items-center justify-between gap-3 bg-obsidian-900">
        <div className="flex items-center gap-2">
          <Globe className="w-5 h-5 text-emerald-400 shrink-0" />
          <h2 className="text-sm md:text-base font-display font-bold text-white">
            Detalhamento de SLA por Endpoint Contratado
          </h2>
        </div>

        {/* Campo de Busca */}
        <div className="flex items-center gap-3">
          <div className="relative w-full sm:w-64">
            <Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            <input
              type="text"
              data-testid="sla-endpoint-search-input"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar endpoint, serviço ou DC..."
              className="bg-obsidian-950 border border-obsidian-800 rounded-lg pl-8 pr-3 py-1.5 font-mono text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-emerald-500 w-full"
            />
          </div>
          <span className="text-xs font-mono text-slate-400 whitespace-nowrap shrink-0">
            Endpoints: <strong className="text-white">{filteredEndpoints.length}</strong>
            {filteredEndpoints.length !== endpoints.length && ` de ${endpoints.length}`}
          </span>
        </div>
      </div>

      {/* Tabela de Dados */}
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse text-xs" id="sla-endpoints-table-body">
          <thead>
            <tr className="bg-obsidian-950/60 border-b border-obsidian-800 text-[10px] font-mono text-slate-400 uppercase tracking-wider">
              <th className="py-3 px-4">ENDPOINT / FQDN</th>
              <th className="py-3 px-4">SERVIÇO CONTRATADO</th>
              <th className="py-3 px-4">PROTOCOLO</th>
              <th className="py-3 px-4 text-center">STATUS ATUAL</th>
              <th className="py-3 px-4 text-center">SLA NO PERÍODO</th>
              <th className="py-3 px-4 text-center">LATÊNCIA MÉDIA</th>
              <th className="py-3 px-4">REGIÃO / DC</th>
              <th className="py-3 px-4 text-right">CONFORMIDADE</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-obsidian-800/80 font-mono">
            {paginatedEndpoints.length === 0 ? (
              <tr>
                <td colSpan={8} className="py-8 text-center text-slate-500 font-sans">
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
                    className="hover:bg-obsidian-850/50 transition-colors"
                  >
                    <td className="py-3 px-4 font-bold text-white font-mono">
                      {ep.domainName}
                    </td>
                    <td className="py-3 px-4 text-slate-300 font-sans">
                      {ep.serviceType}
                    </td>
                    <td className="py-3 px-4 text-slate-400">{ep.protocol}</td>
                    <td className="py-3 px-4 text-center">
                      <span
                        className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10.5px] font-semibold ${
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
                      className={`py-3 px-4 text-center tabular-nums font-bold ${
                        !hasSla
                          ? "text-slate-400"
                          : isCompliant
                          ? "text-emerald-400"
                          : "text-rose-400"
                      }`}
                    >
                      {hasSla ? `${ep.sla30dPct!.toFixed(2)}%` : "N/D"}
                    </td>
                    <td className="py-3 px-4 text-center tabular-nums text-slate-200">
                      {typeof ep.latencyAvgMs === "number"
                        ? `${ep.latencyAvgMs.toFixed(1)} ms`
                        : "N/D"}
                    </td>
                    <td className="py-3 px-4 text-slate-400 font-sans">
                      {ep.datacenterRegion ?? "N/D"}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <span
                        className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                          !hasSla
                            ? "bg-slate-500/10 text-slate-400 border border-slate-500/20"
                            : isCompliant
                            ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/30"
                            : "bg-rose-500/10 text-rose-400 border border-rose-500/30"
                        }`}
                      >
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${
                            !hasSla
                              ? "bg-slate-400"
                              : isCompliant
                              ? "bg-emerald-400"
                              : "bg-rose-400"
                          }`}
                        ></span>
                        <span>{!hasSla ? "N/D" : isCompliant ? "CONFORME" : "VIOLADO"}</span>
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
      <div
        data-testid="sla-endpoints-pagination"
        className="px-3 sm:px-4 py-3 bg-obsidian-950/60 border-t border-obsidian-800 flex flex-col sm:flex-row items-center justify-between gap-2.5 sm:gap-3 text-xs font-mono text-slate-400 min-w-0 max-w-full"
      >
        <span className="text-center sm:text-left text-[11px]">
          Mostrando <strong>{startRecord}</strong> a <strong>{endRecord}</strong> de{" "}
          <strong>{filteredEndpoints.length}</strong> endpoints
        </span>

        <div className="flex flex-wrap items-center justify-center sm:justify-end gap-2 sm:gap-3">
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] text-slate-500">Exibir:</span>
            <select
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setCurrentPage(1);
              }}
              className="bg-obsidian-900 border border-obsidian-800 rounded px-1.5 py-0.5 text-xs text-slate-300 focus:outline-none cursor-pointer"
            >
              <option value={5}>5 / pág</option>
              <option value={10}>10 / pág</option>
              <option value={20}>20 / pág</option>
              <option value={50}>50 / pág</option>
            </select>
          </div>

          <div className="flex items-center gap-1">
            <button
              type="button"
              data-testid="pagination-prev"
              disabled={safeCurrentPage <= 1}
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              className="inline-flex items-center gap-1 px-2 py-1 rounded bg-obsidian-900 border border-obsidian-800 text-xs text-slate-300 hover:text-white hover:bg-obsidian-850 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
              <span>Anterior</span>
            </button>

            <span className="px-1.5 text-slate-300 text-[11px]">
              Página <strong>{safeCurrentPage}</strong> de <strong>{totalPages}</strong>
            </span>

            <button
              type="button"
              data-testid="pagination-next"
              disabled={safeCurrentPage >= totalPages}
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              className="inline-flex items-center gap-1 px-2 py-1 rounded bg-obsidian-900 border border-obsidian-800 text-xs text-slate-300 hover:text-white hover:bg-obsidian-850 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
            >
              <span>Próxima</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </section>
  );
};
