import React, { useState, useEffect } from "react";
import { Grid, Search, X } from "lucide-react";
import type { OpticalInterfaceItem } from "../../types/deviceDetail";

interface DeviceInterfacesTableProps {
  interfaces: OpticalInterfaceItem[];
}

export const DeviceInterfacesTable: React.FC<DeviceInterfacesTableProps> = ({
  interfaces,
}) => {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedPort, setSelectedPort] = useState<OpticalInterfaceItem | null>(null);

  // Seleciona a primeira porta por padrão para visualização imediata do cockpit
  useEffect(() => {
    if (interfaces.length > 0 && !selectedPort) {
      setSelectedPort(interfaces[0]);
    }
  }, [interfaces, selectedPort]);

  const activePorts = interfaces.filter((i) => i.status !== "FREE").length;
  const totalPorts = interfaces.length || 24;

  const filteredInterfaces = interfaces.filter(
    (i) =>
      (i.portName || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
      (i.description || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
      String(i.portNumber ?? "").includes(searchTerm)
  );

  const getPortStyle = (port: OpticalInterfaceItem, isSelected: boolean) => {
    const isDeg = port.status === "DEG" || (port.crcErrorsPerMin && port.crcErrorsPerMin > 0);
    const isUp = port.status === "UP";
    const isDown = port.status === "DOWN";

    let base = "h-8 rounded flex items-center justify-center text-[10px] font-mono font-bold transition-all cursor-pointer ";

    if (isDeg) {
      base += "bg-amber-500/20 border border-amber-500 text-amber-400 animate-pulse hover:scale-105 ";
    } else if (isUp) {
      base += "bg-emerald-500/20 border border-emerald-500 text-emerald-400 hover:scale-105 ";
    } else if (isDown) {
      base += "bg-rose-500/20 border border-rose-500 text-rose-400 hover:scale-105 ";
    } else {
      base += "bg-obsidian-900 border border-obsidian-800 text-slate-500 hover:text-slate-300 hover:border-obsidian-700 ";
    }

    if (isSelected) {
      base += "ring-2 ring-emerald-400 ring-offset-1 ring-offset-obsidian-950 scale-105 shadow-lg shadow-emerald-500/20 ";
    }

    return base;
  };

  const getStatusLabel = (status?: string, speed?: string) => {
    const sp = speed?.includes("25GE") || speed?.includes("SFP28") ? "25G" : speed || "25G";
    if (status === "UP") return `${sp} UP`;
    if (status === "DEG") return `${sp} DEG (CRC)`;
    if (status === "DOWN") return "DOWN";
    if (status === "FREE") return "LIVRE";
    return status || "N/D";
  };

  return (
    <section
      className="bg-obsidian-900 rounded-xl p-5 border border-obsidian-800 flex flex-col gap-4 shadow-sm"
      aria-label="Matriz de Portas Físicas"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Grid className="text-emerald-400 w-4 h-4" />
          <h3 className="text-xs font-mono font-bold text-white uppercase tracking-wider">
            Matriz de Portas Físicas (24 SFP28 25GbE)
          </h3>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500 w-3.5 h-3.5" />
            <input
              type="text"
              placeholder="Filtrar portas..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-8 pr-3 py-1 bg-obsidian-950 border border-obsidian-800 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 font-sans w-36 sm:w-44 transition-colors"
            />
          </div>
          <span className="text-xs font-mono text-emerald-400 font-bold bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/30 tabular-nums">
            {activePorts} / {totalPorts} ATIVAS
          </span>
        </div>
      </div>

      {/* Grid de 24 Portas */}
      <div className="grid grid-cols-6 sm:grid-cols-12 gap-1.5 bg-obsidian-950 p-3 rounded-xl border border-obsidian-800">
        {filteredInterfaces.map((port) => {
          const isSelected = selectedPort?.portNumber === port.portNumber;
          const isDeg = port.status === "DEG" || (port.crcErrorsPerMin && port.crcErrorsPerMin > 0);
          const portNumStr = port.portNumber < 10 ? `0${port.portNumber}` : `${port.portNumber}`;

          let tooltip = `Port ${portNumStr}: ${port.description || port.portName}`;
          if (isDeg) {
            tooltip = `Port ${portNumStr}: Alerta CRC (${port.crcErrorsPerMin} erros/min) - ${port.description}`;
          }

          return (
            <button
              key={port.portNumber}
              type="button"
              onClick={() => setSelectedPort(port)}
              className={getPortStyle(port, isSelected)}
              title={tooltip}
              aria-label={portNumStr}
            >
              {portNumStr}
            </button>
          );
        })}
      </div>

      {/* Detalhe da Porta Inspecionada */}
      {selectedPort && (
        <div
          id="device-port-inspection-card"
          className="p-3 bg-obsidian-950 rounded-xl border border-obsidian-800 flex flex-col gap-1.5 font-mono tabular-nums text-xs animate-in fade-in duration-200"
        >
          <div className="flex items-center justify-between text-slate-300">
            <span className="font-bold text-white">
              Porta {selectedPort.portNumber < 10 ? `0${selectedPort.portNumber}` : selectedPort.portNumber} Inspecionada (SFP28)
            </span>
            <div className="flex items-center gap-2">
              <span
                className={`font-bold ${
                  selectedPort.status === "UP"
                    ? "text-emerald-400"
                    : selectedPort.status === "DEG"
                    ? "text-amber-400"
                    : selectedPort.status === "DOWN"
                    ? "text-rose-400"
                    : "text-slate-400"
                }`}
              >
                {getStatusLabel(selectedPort.status, selectedPort.speed)}
              </span>
              <button
                type="button"
                onClick={() => setSelectedPort(null)}
                className="text-slate-500 hover:text-slate-300 transition-colors p-0.5"
                title="Fechar inspeção de porta"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          <p className="text-[11px] text-slate-400 font-sans">
            {selectedPort.description || selectedPort.portName || "Porta SFP28 conectada"}
          </p>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-obsidian-800/80 text-[11px] text-slate-400">
            <div>
              Potência Rx:{" "}
              <strong className="text-white">
                {selectedPort.rxPowerDbm || "-3.2 dBm"}
              </strong>
            </div>
            <div>
              Perda:{" "}
              <strong
                className={
                  (selectedPort.packetLossPct || 0) > 0 ? "text-amber-400" : "text-emerald-400"
                }
              >
                {selectedPort.packetLossPct !== undefined ? `${selectedPort.packetLossPct}%` : "0%"}
              </strong>
            </div>
            <div>
              MTU:{" "}
              <strong className="text-white">
                {selectedPort.mtu ? `${selectedPort.mtu} Jumbo` : "9216 Jumbo"}
              </strong>
            </div>
            <div>
              Duplex:{" "}
              <strong className="text-emerald-400">
                {selectedPort.duplex || "Full"}
              </strong>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};
