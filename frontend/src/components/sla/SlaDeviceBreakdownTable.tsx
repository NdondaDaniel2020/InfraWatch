import React, { useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { Server, Search } from "lucide-react";
import type { SlaDeviceBreakdown } from "../../types/sla";
import { Badge } from "../ui";
import { Pagination } from "../common";

interface SlaDeviceBreakdownTableProps {
  devices: SlaDeviceBreakdown[];
  targetSlaPct: number;
}

export const SlaDeviceBreakdownTable: React.FC<SlaDeviceBreakdownTableProps> = ({
  devices,
  targetSlaPct,
}) => {
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

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

  React.useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm]);

  const totalPages = Math.max(1, Math.ceil(filteredDevices.length / pageSize));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const paginatedDevices = filteredDevices.slice(
    (safeCurrentPage - 1) * pageSize,
    safeCurrentPage * pageSize
  );

  return (
    <section
      data-testid="sla-device-breakdown-table"
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
          <div className="relative flex-1 sm:w-56">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Buscar ativo, IP ou tier..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-obsidian-950 border border-obsidian-800 rounded-lg pl-8 pr-3 py-1 text-xs text-white placeholder:text-slate-500 focus-visible:outline-none focus-visible:border-emerald-500"
            />
          </div>
          <span className="text-xs font-mono text-slate-400 whitespace-nowrap">
            Ativos: <strong className="text-white">{filteredDevices.length}</strong>
            {filteredDevices.length !== devices.length && ` de ${devices.length}`}
          </span>
        </div>
      </div>

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
            {filteredDevices.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-8 text-center text-slate-500 font-mono">
                  {devices.length === 0
                    ? "Nenhum ativo de rede com métricas de SLA registradas para o período."
                    : "Nenhum ativo corresponde à busca informada."}
                </td>
              </tr>
            ) : (
              paginatedDevices.map((device) => {
                const isCompliant = device.netUptimePct >= targetSlaPct;

                return (
                  <tr
                    key={device.deviceId}
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

      {filteredDevices.length > 0 && (
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
      )}
    </section>
  );
};
