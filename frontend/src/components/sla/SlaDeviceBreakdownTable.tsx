import React from "react";
import { Link } from "react-router-dom";
import { Server } from "lucide-react";
import type { SlaDeviceBreakdown } from "../../types/sla";
import { Badge } from "../ui";

interface SlaDeviceBreakdownTableProps {
  devices: SlaDeviceBreakdown[];
  targetSlaPct: number;
}

export const SlaDeviceBreakdownTable: React.FC<SlaDeviceBreakdownTableProps> = ({
  devices,
  targetSlaPct,
}) => {
  return (
    <section
      data-testid="sla-device-breakdown-table"
      className="p-5 sm:p-6 rounded-2xl bg-[#0d1424] border border-white/10 flex flex-col gap-4 shadow-sm"
    >
      <div className="flex justify-between items-center border-b border-white/10 pb-3">
        <div className="flex items-center gap-2">
          <Server size={18} className="text-emerald-400" />
          <h3 className="text-sm font-bold text-white m-0">
            Detalhamento de Disponibilidade por Ativo de Rede
          </h3>
        </div>
        <span className="text-xs font-mono text-slate-400">
          Total de Ativos Monitorados: <strong className="text-white">{devices.length}</strong>
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="border-b border-white/10 font-mono text-slate-400 uppercase text-[10.5px]">
              <th className="py-2.5 px-3">Ativo / FQDN</th>
              <th className="py-2.5 px-3">Endereço IPv4</th>
              <th className="py-2.5 px-3">Tier</th>
              <th className="py-2.5 px-3">Uptime Bruto</th>
              <th className="py-2.5 px-3">Isenção RFC (min)</th>
              <th className="py-2.5 px-3">Uptime Líquido</th>
              <th className="py-2.5 px-3 text-right">Conformidade</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5 font-mono">
            {devices.map((device) => {
              const isCompliant = (device.netUptimePct ?? 100) >= targetSlaPct;

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
                    {device.ipAddress}
                  </td>
                  <td className="py-3 px-3">
                    <span className="px-2 py-0.5 rounded bg-white/5 border border-white/10 text-[10.5px] font-bold text-sky-400">
                      {device.tier}
                    </span>
                  </td>
                  <td className="py-3 px-3 text-slate-400">
                    {(device.nominalUptimePct ?? 100).toFixed(2)}%
                  </td>
                  <td className="py-3 px-3 text-sky-400">
                    +{device.exemptedMaintenanceMinutes ?? 0}m (ADR-009)
                  </td>
                  <td
                    className={`py-3 px-3 font-bold ${
                      isCompliant ? "text-emerald-400" : "text-rose-400"
                    }`}
                  >
                    {(device.netUptimePct ?? 100).toFixed(2)}%
                  </td>
                  <td className="py-3 px-3 text-right">
                    <Badge variant={isCompliant ? "healthy" : "critical"} size="sm">
                      {isCompliant ? "CONFORME" : "VIOLAÇÃO"}
                    </Badge>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
};
