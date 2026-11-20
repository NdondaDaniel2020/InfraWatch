import React, { useState, useMemo, useEffect } from "react";
import { Link } from "react-router-dom";
import { Server, Search, ChevronLeft, ChevronRight } from "lucide-react";
import type { SlaDeviceBreakdown } from "../../types/sla";

export interface SlaDeviceBreakdownTableProps {
  devices: SlaDeviceBreakdown[];
  targetSlaPct: number;
  itemsPerPage?: number;
}

export const SlaDeviceBreakdownTable: React.FC<SlaDeviceBreakdownTableProps> = ({
  devices,
  targetSlaPct,
  itemsPerPage = 5,
}) => {
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(itemsPerPage);

  useEffect(() => {
    setPageSize(itemsPerPage);
  }, [itemsPerPage]);

  const filteredDevices = useMemo(() => {
    if (!searchTerm.trim()) return devices;
    const term = searchTerm.toLowerCase();
    return devices.filter(
      (d) =>
        d.deviceName.toLowerCase().includes(term) ||
        (d.ipAddress && d.ipAddress.toLowerCase().includes(term)) ||
        (d.category && d.category.toLowerCase().includes(term)) ||
        (d.tier && d.tier.toLowerCase().includes(term))
    );
  }, [devices, searchTerm]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm]);

  const totalPages = Math.max(1, Math.ceil(filteredDevices.length / pageSize));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const paginatedDevices = useMemo(() => {
    const startIndex = (safeCurrentPage - 1) * pageSize;
    return filteredDevices.slice(startIndex, startIndex + pageSize);
  }, [filteredDevices, safeCurrentPage, pageSize]);

  const startRecord = filteredDevices.length === 0 ? 0 : (safeCurrentPage - 1) * pageSize + 1;
  const endRecord = Math.min(safeCurrentPage * pageSize, filteredDevices.length);

  return (
    <section
      data-testid="sla-device-breakdown-table"
      aria-label="Detalhamento de Disponibilidade por Ativo de Rede"
      className="bg-obsidian-900 border border-obsidian-800 rounded-xl overflow-hidden shadow-lg flex flex-col gap-0"
    >
      {/* Header do Card com Título e Campo de Busca */}
      <div className="p-4 border-b border-obsidian-800 flex flex-col md:flex-row md:items-center justify-between gap-3 bg-obsidian-900">
        <div className="flex items-center gap-2">
          <Server className="w-5 h-5 text-emerald-400 shrink-0" />
          <h2 className="text-sm md:text-base font-display font-bold text-white">
            Detalhamento de Disponibilidade por Ativo de Rede
          </h2>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative w-full sm:w-64">
            <Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            <input
              type="text"
              data-testid="sla-device-search-input"
              placeholder="Buscar ativo, IP ou categoria..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="bg-obsidian-950 border border-obsidian-800 rounded-lg pl-8 pr-3 py-1.5 font-mono text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-emerald-500 w-full"
            />
          </div>
          <span className="text-xs font-mono text-slate-400 whitespace-nowrap shrink-0">
            Ativos: <strong className="text-white">{filteredDevices.length}</strong>
            {filteredDevices.length !== devices.length && ` de ${devices.length}`}
          </span>
        </div>
      </div>

      {/* Tabela de Ativos */}
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse" id="sla-device-table">
          <thead>
            <tr className="bg-obsidian-950/60 border-b border-obsidian-800 text-[10px] font-mono text-slate-400 uppercase tracking-wider">
              <th className="py-3 px-4">ATIVO / FQDN</th>
              <th className="py-3 px-4">ENDEREÇO IPV4</th>
              <th className="py-3 px-4">TIER / CATEGORIA</th>
              <th className="py-3 px-4 text-center">UPTIME BRUTO</th>
              <th className="py-3 px-4 text-center">ISENÇÃO RFC (MIN)</th>
              <th className="py-3 px-4 text-center">UPTIME LÍQUIDO</th>
              <th className="py-3 px-4 text-right">CONFORMIDADE</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-obsidian-800/80 text-xs font-mono">
            {paginatedDevices.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-8 text-center text-slate-500 font-mono">
                  {devices.length === 0
                    ? "Nenhum ativo de rede com métricas de SLA registradas para o período."
                    : "Nenhum ativo de rede encontrado para o termo pesquisado."}
                </td>
              </tr>
            ) : (
              paginatedDevices.map((device) => {
                const isViolation = device.netUptimePct < targetSlaPct;

                return (
                  <tr
                    key={device.deviceId}
                    data-testid={`sla-device-row-${device.deviceId}`}
                    className="hover:bg-obsidian-850/50 transition-colors"
                  >
                    <td className="py-3 px-4 font-bold">
                      <Link
                        to={`/devices/${device.deviceId}`}
                        className="text-sky-400 hover:text-sky-300 hover:underline transition-colors"
                      >
                        {device.deviceName}
                      </Link>
                    </td>
                    <td className="py-3 px-4 text-slate-300">
                      {device.ipAddress ? (
                        <span>{device.ipAddress}</span>
                      ) : (
                        <span className="text-slate-500">—</span>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-obsidian-950 border border-obsidian-800 text-[10px] text-slate-300 uppercase">
                        <span className="w-1.5 h-1.5 rounded-full bg-slate-400"></span>
                        {device.tier || device.category || "Standard"}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-center text-slate-300 tabular-nums">
                      {device.nominalUptimePct.toFixed(2)}%
                    </td>
                    <td className="py-3 px-4 text-center text-sky-400 tabular-nums">
                      +{device.exemptedMaintenanceMinutes}m (ADR-009)
                    </td>
                    <td
                      className={`py-3 px-4 text-center font-bold tabular-nums ${
                        isViolation ? "text-rose-400" : "text-emerald-400"
                      }`}
                    >
                      {device.netUptimePct.toFixed(2)}%
                    </td>
                    <td className="py-3 px-4 text-right">
                      <span
                        className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                          isViolation
                            ? "bg-rose-500/10 border border-rose-500/30 text-rose-400"
                            : "bg-emerald-500/10 border border-emerald-500/30 text-emerald-400"
                        }`}
                      >
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${
                            isViolation ? "bg-rose-400" : "bg-emerald-400"
                          }`}
                        ></span>
                        {isViolation ? "VIOLAÇÃO" : "CONFORME"}
                      </span>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Rodapé com Paginação de 5 por página */}
      <div
        data-testid="sla-devices-pagination"
        className="px-4 py-3 bg-obsidian-950/60 border-t border-obsidian-800 flex flex-wrap items-center justify-between gap-3 text-xs font-mono text-slate-400"
      >
        <span>
          Mostrando <strong>{startRecord}</strong> a <strong>{endRecord}</strong> de{" "}
          <strong>{filteredDevices.length}</strong> ativos
        </span>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] text-slate-500">Exibir:</span>
            <select
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setCurrentPage(1);
              }}
              className="bg-obsidian-900 border border-obsidian-800 rounded px-1.5 py-0.5 text-xs text-slate-300 focus:outline-none"
            >
              <option value={5}>5 / pág</option>
              <option value={10}>10 / pág</option>
              <option value={20}>20 / pág</option>
              <option value={50}>50 / pág</option>
            </select>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              data-testid="sla-devices-pagination-prev"
              disabled={safeCurrentPage <= 1}
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-obsidian-900 border border-obsidian-800 text-xs text-slate-300 hover:text-white hover:bg-obsidian-850 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
              <span>Anterior</span>
            </button>

            <span data-testid="sla-devices-pagination-page" className="px-2 text-slate-300">
              Página <strong>{safeCurrentPage}</strong> de <strong>{totalPages}</strong>
            </span>

            <button
              type="button"
              data-testid="sla-devices-pagination-next"
              disabled={safeCurrentPage >= totalPages}
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-obsidian-900 border border-obsidian-800 text-xs text-slate-300 hover:text-white hover:bg-obsidian-850 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
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
