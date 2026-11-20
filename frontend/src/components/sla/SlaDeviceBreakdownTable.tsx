import React, { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Server, Search, ChevronLeft, ChevronRight } from "lucide-react";
import type { SlaDeviceBreakdown } from "../../types/sla";
import { Badge } from "../ui";

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

  const filteredDevices = useMemo(() => {
    if (!searchTerm.trim()) return devices;
    const term = searchTerm.toLowerCase();
    return devices.filter(
      (d) =>
        d.deviceName.toLowerCase().includes(term) ||
        (d.ipAddress ?? "").toLowerCase().includes(term) ||
        (d.category ?? "").toLowerCase().includes(term) ||
        (d.tier ?? "").toLowerCase().includes(term)
    );
  }, [devices, searchTerm]);

  React.useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm]);

  const totalPages = Math.max(1, Math.ceil(filteredDevices.length / itemsPerPage));
  const safeCurrentPage = Math.min(currentPage, totalPages);

  const paginatedDevices = useMemo(() => {
    const startIndex = (safeCurrentPage - 1) * itemsPerPage;
    return filteredDevices.slice(startIndex, startIndex + itemsPerPage);
  }, [filteredDevices, safeCurrentPage, itemsPerPage]);

  return (
    <section
      data-testid="sla-device-breakdown-table"
      aria-label="Detalhamento de Disponibilidade por Ativo de Rede"
      className="p-5 sm:p-6 rounded-2xl bg-[#0d1424] border border-white/10 flex flex-col gap-4 shadow-sm"
    >
      {/* Cabeçalho da Tabela e Barra de Busca */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/10 pb-3">
        <div className="flex items-center gap-2">
          <Server size={18} className="text-emerald-400" />
          <h3 className="text-sm font-bold text-white m-0">
            Detalhamento de Disponibilidade por Ativo de Rede
          </h3>
        </div>

        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
          {/* Campo de Busca */}
          <div className="relative w-full sm:w-64">
            <Search size={14} className="absolute left-3 top-2.5 text-slate-400" />
            <input
              type="text"
              data-testid="sla-device-search-input"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar ativo, IP ou categoria..."
              className="w-full bg-[#080c14] border border-white/10 rounded-xl pl-8 pr-3 py-1.5 text-xs font-mono text-slate-200 placeholder-slate-500 focus:outline-none focus:border-emerald-500/50"
            />
          </div>
          <span className="text-xs font-mono text-slate-400 shrink-0">
            Total de Ativos: <strong className="text-white">{devices.length}</strong>
          </span>
        </div>
      </div>

      {/* Tabela de Dados */}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="border-b border-white/10 font-mono text-slate-400 uppercase text-[10.5px]">
              <th className="py-2.5 px-3">Ativo / FQDN</th>
              <th className="py-2.5 px-3">Endereço IPv4</th>
              <th className="py-2.5 px-3">Tier / Categoria</th>
              <th className="py-2.5 px-3">Uptime Bruto</th>
              <th className="py-2.5 px-3">Isenção RFC (min)</th>
              <th className="py-2.5 px-3">Uptime Líquido</th>
              <th className="py-2.5 px-3 text-right">Conformidade</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5 font-mono">
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
                const isCompliant = device.netUptimePct >= targetSlaPct;

                return (
                  <tr
                    key={device.deviceId}
                    data-testid={`sla-device-row-${device.deviceId}`}
                    className="hover:bg-white/5 transition-colors"
                  >
                    <td className="py-3 px-3 font-semibold text-white">
                      <Link
                        to={`/devices/${device.deviceId}`}
                        className="text-white hover:underline"
                      >
                        {device.deviceName}
                      </Link>
                    </td>
                    <td className="py-3 px-3 text-slate-300">
                      {device.ipAddress ?? "—"}
                    </td>
                    <td className="py-3 px-3">
                      <span className="px-2 py-0.5 rounded bg-white/5 border border-white/10 text-[10.5px] font-bold text-sky-400">
                        {device.tier ?? device.category ?? "—"}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-slate-400">
                      {device.nominalUptimePct.toFixed(2)}%
                    </td>
                    <td className="py-3 px-3 text-sky-400">
                      +{device.exemptedMaintenanceMinutes}m (ADR-009)
                    </td>
                    <td
                      className={`py-3 px-3 font-bold ${
                        isCompliant ? "text-emerald-400" : "text-rose-400"
                      }`}
                    >
                      {device.netUptimePct.toFixed(2)}%
                    </td>
                    <td className="py-3 px-3 text-right">
                      <Badge variant={isCompliant ? "healthy" : "critical"} size="sm">
                        {isCompliant ? "CONFORME" : "VIOLAÇÃO"}
                      </Badge>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Paginação */}
      {filteredDevices.length > 0 && (
        <div
          data-testid="sla-devices-pagination"
          className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-3 border-t border-white/10 text-xs font-mono text-slate-400"
        >
          <span>
            Exibindo <strong>{paginatedDevices.length > 0 ? (safeCurrentPage - 1) * itemsPerPage + 1 : 0}</strong>–
            <strong>{Math.min(safeCurrentPage * itemsPerPage, filteredDevices.length)}</strong> de{" "}
            <strong>{filteredDevices.length}</strong> ativos
          </span>

          <div className="flex items-center gap-2">
            <button
              type="button"
              data-testid="sla-devices-pagination-prev"
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
              data-testid="sla-devices-pagination-next"
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
