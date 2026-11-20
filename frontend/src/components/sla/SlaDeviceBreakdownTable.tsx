import React, { useState, useMemo, useEffect } from "react";
import { Link } from "react-router-dom";
import { Server, Search } from "lucide-react";
import type { SlaDeviceBreakdown } from "../../types/sla";
import { Badge } from "../ui";
import { Pagination } from "../common";

export interface SlaDeviceBreakdownTableProps {
  devices: SlaDeviceBreakdown[];
  targetSlaPct: number;
  itemsPerPage?: number;
}

export const SlaDeviceBreakdownTable: React.FC<SlaDeviceBreakdownTableProps> = ({
  devices,
  targetSlaPct,
  itemsPerPage = 10,
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

  return (
    <section
      data-testid="sla-device-breakdown-table"
      aria-label="Detalhamento de Disponibilidade por Ativo de Rede"
      className="p-5 sm:p-6 rounded-2xl bg-[#0d1424] border border-white/10 flex flex-col gap-4 shadow-sm"
    >
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 border-b border-white/10 pb-3">
        <div className="flex items-center gap-2">
          <Server size={18} className="text-emerald-400" />
          <h3 className="text-sm font-bold text-white m-0">
            Detalhamento de Disponibilidade por Ativo de Rede
          </h3>
        </div>

        <div className="flex items-center gap-3 w-full sm:w-auto">
          <div className="relative flex-1 sm:w-64">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              data-testid="sla-device-search-input"
              placeholder="Buscar ativo, IP ou categoria..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-[#080c14] border border-white/10 rounded-xl pl-8 pr-3 py-1.5 text-xs font-mono text-slate-200 placeholder-slate-500 focus:outline-none focus:border-emerald-500/50"
            />
          </div>
          <span className="text-xs font-mono text-slate-400 whitespace-nowrap shrink-0">
            Ativos: <strong className="text-white">{filteredDevices.length}</strong>
            {filteredDevices.length !== devices.length && ` de ${devices.length}`}
          </span>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="border-b border-white/10 text-slate-400 font-mono text-[11px] uppercase tracking-wider">
              <th className="py-2.5 px-3">Ativo / FQDN</th>
              <th className="py-2.5 px-3">Endereço IPv4</th>
              <th className="py-2.5 px-3">Tier / Categoria</th>
              <th className="py-2.5 px-3">Uptime Bruto</th>
              <th className="py-2.5 px-3">Isenção RFC (min)</th>
              <th className="py-2.5 px-3">Uptime Líquido</th>
              <th className="py-2.5 px-3">Conformidade</th>
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
                const isViolation = device.netUptimePct < targetSlaPct;

                return (
                  <tr
                    key={device.deviceId}
                    className="hover:bg-white/[0.02] transition-colors"
                  >
                    <td className="py-3 px-3 font-bold text-slate-200">
                      <Link
                        to={`/devices/${device.deviceId}`}
                        className="hover:underline text-sky-400"
                      >
                        {device.deviceName}
                      </Link>
                    </td>
                    <td className="py-3 px-3 text-slate-400">
                      {device.ipAddress ? (
                        <span className="text-slate-300 font-mono">{device.ipAddress}</span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="py-3 px-3">
                      <Badge variant="neutral" size="sm">
                        {device.tier || device.category || "Standard"}
                      </Badge>
                    </td>
                    <td className="py-3 px-3 text-slate-300">
                      {device.nominalUptimePct.toFixed(2)}%
                    </td>
                    <td className="py-3 px-3 text-sky-400">
                      +{device.exemptedMaintenanceMinutes}m (ADR-009)
                    </td>
                    <td
                      className={`py-3 px-3 font-bold ${
                        isViolation ? "text-rose-400" : "text-emerald-400"
                      }`}
                    >
                      {device.netUptimePct.toFixed(2)}%
                    </td>
                    <td className="py-3 px-3">
                      <Badge
                        variant={isViolation ? "critical" : "healthy"}
                        size="sm"
                      >
                        {isViolation ? "VIOLAÇÃO" : "CONFORME"}
                      </Badge>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {filteredDevices.length > 0 && (
        <div data-testid="sla-devices-pagination">
          <Pagination
            currentPage={safeCurrentPage}
            totalPages={totalPages}
            totalItems={filteredDevices.length}
            pageSize={pageSize}
            onPageChange={setCurrentPage}
            onPageSizeChange={(newSize) => {
              setPageSize(newSize);
              setCurrentPage(1);
            }}
            pageSizeOptions={[5, 10, 20, 50]}
            itemLabel="ativos"
            testIdPrefix="sla-devices-pagination"
          />
        </div>
      )}
    </section>
  );
};
