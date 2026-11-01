import React, { useMemo, useState } from "react";
import { CheckCircle2, AlertTriangle, Search, ShieldCheck } from "lucide-react";
import type { SanitizedEndpoint } from "../../types/clientPortal";

export interface SanitizedEndpointsTableProps {
  endpoints: SanitizedEndpoint[];
}

export const SanitizedEndpointsTable: React.FC<SanitizedEndpointsTableProps> = ({ endpoints }) => {
  const [searchTerm, setSearchTerm] = useState("");

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

  return (
    <section
      data-testid="sanitized-endpoints-table"
      aria-label="Endpoints Sanitizados e Serviços Monitorados"
      className="p-5 sm:p-6 rounded-2xl bg-[#0d1424] border border-white/10 flex flex-col gap-4 shadow-sm"
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/10 pb-3">
        <div>
          <h3 className="text-base font-bold text-white flex items-center gap-2 m-0">
            <ShieldCheck size={18} className="text-emerald-400" />
            <span>Endpoints Contratados (Visão Sanitizada)</span>
          </h3>
        </div>

        {/* Input de Busca Rápida */}
        <div className="relative w-full sm:w-64">
          <Search size={14} className="absolute left-3 top-2.5 text-slate-400" />
          <input
            type="text"
            data-testid="endpoint-search-input"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar endpoint ou região..."
            className="w-full bg-[#080c14] border border-white/10 rounded-xl pl-8 pr-3 py-1.5 text-xs font-mono text-slate-200 placeholder-slate-500 focus:outline-none focus:border-emerald-500/50"
          />
        </div>
      </div>

      {/* Tabela Responsiva */}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="border-b border-white/10 font-mono text-slate-400 uppercase text-[10.5px]">
              <th className="py-2.5 px-3">Endpoint / Domínio</th>
              <th className="py-2.5 px-3">Tipo de Serviço</th>
              <th className="py-2.5 px-3">Protocolo</th>
              <th className="py-2.5 px-3 text-center">Status</th>
              <th className="py-2.5 px-3 text-right">SLA 30d</th>
              <th className="py-2.5 px-3 text-right">Latência Média</th>
              <th className="py-2.5 px-3">Região / DC</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5 font-mono">
            {filteredEndpoints.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-8 text-center text-slate-400 font-sans">
                  Nenhum endpoint encontrado para os termos informados.
                </td>
              </tr>
            ) : (
              filteredEndpoints.map((ep) => {
                const isUp = ep.status === "UP";
                return (
                  <tr key={ep.id} className="hover:bg-white/5 transition-colors">
                    <td className="py-3 px-3 font-bold text-white">
                      {ep.domainName}
                    </td>
                    <td className="py-3 px-3 text-slate-300 font-sans">{ep.serviceType}</td>
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
                    <td className="py-3 px-3 text-right tabular-nums font-bold text-emerald-400">
                      {typeof ep.sla30dPct === "number"
                        ? `${ep.sla30dPct.toFixed(2)}%`
                        : "N/D"}
                    </td>
                    <td className="py-3 px-3 text-right tabular-nums text-slate-200">
                      {typeof ep.latencyAvgMs === "number"
                        ? `${ep.latencyAvgMs.toFixed(1)} ms`
                        : "N/D"}
                    </td>
                    <td className="py-3 px-3 text-slate-400 font-sans">
                      {ep.datacenterRegion ?? "N/D"}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
};
