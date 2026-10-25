import React, { useState } from "react";
import { Link } from "react-router-dom";
import {
  X,
  Router,
  Network,
  Database,
  Server,
  Layers,
  Activity,
  Eye,
  BellOff,
  AlertTriangle,
  RadioTower,
} from "lucide-react";
import { toast } from "sonner";
import { TopologyDeviceData } from "../../types/topology";
import { Button } from "../ui/Button";

interface TopologyInspectorDrawerProps {
  device: TopologyDeviceData | null;
  isOpen: boolean;
  onClose: () => void;
  onRunPingTrace: (deviceId: string) => void;
  onIsolateNode: (deviceId: string) => void;
}

export const TopologyInspectorDrawer: React.FC<TopologyInspectorDrawerProps> = ({
  device,
  isOpen,
  onClose,
  onRunPingTrace,
  onIsolateNode,
}) => {
  const [selectedPortId, setSelectedPortId] = useState<number>(1);
  const [alertsPaused, setAlertsPaused] = useState(false);

  if (!isOpen || !device) return null;

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case "router":
        return <Router size={20} className="text-emerald-400" />;
      case "switch":
        return <Network size={20} className="text-sky-400" />;
      case "database":
        return <Database size={20} className="text-emerald-400" />;
      case "workload":
        if (device.label.includes("API")) {
          return <Layers size={20} className="text-amber-400" />;
        }
        return <Database size={20} className="text-emerald-400" />;
      default:
        return <Server size={20} className="text-slate-300" />;
    }
  };

  const selectedPort = device.ports?.find((p) => p.id === selectedPortId) || {
    id: 1,
    status: "UP" as const,
    speed: "25G UP",
    label: "Porta 01: 25G UP",
    opticPower: "Rx: -3.2 dBm | Tx: -2.8 dBm (Ótimo)",
  };

  const handleToggleAlerts = () => {
    setAlertsPaused(!alertsPaused);
    if (!alertsPaused) {
      toast.warning(`Alertas silenciados temporariamente para o nó ${device.label}.`);
    } else {
      toast.success(`Monitoramento de alertas reativado para o nó ${device.label}.`);
    }
  };

  return (
    <aside
      data-testid="topology-inspector-drawer"
      aria-label="Painel de Inspeção do Dispositivo"
      className="w-96 bg-obsidian-950 border-l border-obsidian-800 flex flex-col justify-between shrink-0 z-40 overflow-y-auto transition-[transform,width] duration-200 select-none"
    >
      {/* 1. Cabeçalho do Drawer */}
      <div className="p-3.5 border-b border-obsidian-800 bg-obsidian-900 flex items-center justify-between sticky top-0 backdrop-blur z-10">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center shrink-0">
            {getCategoryIcon(device.category)}
          </div>
          <div className="min-w-0">
            <h2 className="font-mono tabular-nums text-xs font-bold text-white truncate">
              {device.label}
            </h2>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span
                className={`w-2 h-2 rounded-full ${
                  device.status === "CRITICAL_DOWN"
                    ? "bg-rose-400 animate-ping"
                    : device.status === "DEGRADED"
                    ? "bg-amber-400 animate-pulse"
                    : "bg-emerald-400 animate-pulse"
                }`}
              />
              <span
                className={`font-mono text-[10px] font-bold ${
                  device.status === "CRITICAL_DOWN"
                    ? "text-rose-400"
                    : device.status === "DEGRADED"
                    ? "text-amber-400"
                    : "text-emerald-400"
                }`}
              >
                STATUS: {device.statusText || device.status}
              </span>
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={onClose}
          aria-label="Fechar painel de inspeção"
          className="p-1 rounded text-slate-400 hover:text-white hover:bg-obsidian-800 transition-colors"
        >
          <X size={18} />
        </button>
      </div>

      {/* 2. Corpo do Drawer */}
      <div className="p-4 space-y-4 flex-1">
        {/* Alerta de Nó Crítico */}
        {device.status === "CRITICAL_DOWN" && (
          <div className="p-3 rounded-xl bg-rose-950/40 border border-rose-500/40 flex flex-col gap-2">
            <div className="flex items-center gap-2 text-rose-400 font-bold text-xs font-mono">
              <AlertTriangle size={16} /> ENLACE PRINCIPAL ROMPIDO
            </div>
            <p className="text-[11px] text-rose-200">
              Perda total de tráfego detectada pela sonda telemétrica. Acione a equipe de campo ou
              isole o nó da rota de roteamento.
            </p>
            <Button
              type="button"
              variant="destructive"
              onClick={() => onIsolateNode(device.id)}
              className="h-7 text-xs font-mono"
            >
              ISOLAR DA ROTA OSPF/BGP
            </Button>
          </div>
        )}

        {/* Especificações de Hardware */}
        <section className="bg-obsidian-900 border border-obsidian-800 rounded-xl p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="font-mono text-[10px] uppercase text-slate-400 font-semibold">
              ESPECIFICAÇÕES DO HARDWARE
            </span>
            <span className="font-mono text-[10px] text-sky-400 font-semibold">
              SN: {device.serialNumber || "N/D"}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2 font-mono tabular-nums text-xs">
            <div>
              <span className="text-slate-400 block text-[10px]">MODELO</span>
              <span className="text-slate-200 font-semibold truncate block">{device.model}</span>
            </div>
            <div>
              <span className="text-slate-400 block text-[10px]">FIRMWARE / SO</span>
              <span className="text-slate-200 truncate block">{device.firmware || "Linux Core"}</span>
            </div>
            <div>
              <span className="text-slate-400 block text-[10px]">TEMPERATURA</span>
              <span className="text-emerald-400 font-bold block">
                {device.temperature || "38.5°C"}
              </span>
            </div>
            <div>
              <span className="text-slate-400 block text-[10px]">UPTIME</span>
              <span className="text-slate-200 block">{device.uptime || "184d 12h 45m"}</span>
            </div>
          </div>
        </section>

        {/* Matriz de Portas Físicas (24 SFP+) */}
        {device.ports && device.ports.length > 0 && (
          <section className="bg-obsidian-900 border border-obsidian-800 rounded-xl p-3">
            <div className="flex items-center justify-between mb-2">
              <span className="font-mono text-[10px] uppercase text-slate-400 font-semibold">
                {device.portsTitle || "MATRIZ DE PORTAS (24 SFP+)"}
              </span>
              <span className="font-mono text-[10px] text-emerald-400 font-bold">
                {device.portsActiveCount || 18}/{device.portsTotalCount || 24} ATIVAS
              </span>
            </div>

            {/* Grid 12x2 de Portas */}
            <div className="grid grid-cols-12 gap-1 bg-obsidian-950 p-2 rounded-lg border border-obsidian-800">
              {device.ports.map((port) => {
                const isSelected = selectedPortId === port.id;
                const isUp = port.status === "UP";
                const isDeg = port.status === "DEG";

                return (
                  <button
                    key={port.id}
                    type="button"
                    onClick={() => setSelectedPortId(port.id)}
                    aria-label={`Porta ${port.id}`}
                    title={port.label}
                    className={`h-6 rounded flex items-center justify-center text-[8px] font-mono font-bold transition-all cursor-pointer ${
                      isSelected ? "ring-2 ring-white" : ""
                    } ${
                      isUp
                        ? "bg-emerald-500/20 border border-emerald-500 text-emerald-400"
                        : isDeg
                        ? "bg-amber-500/20 border border-amber-500 text-amber-400 animate-pulse"
                        : "bg-obsidian-900 border border-obsidian-800 text-slate-600"
                    }`}
                  >
                    {port.id}
                  </button>
                );
              })}
            </div>

            {/* Detalhe da Porta Inspecionada */}
            <div className="mt-2.5 p-2 rounded bg-obsidian-950 border border-obsidian-800 text-[10px] font-mono tabular-nums text-slate-300">
              <div className="flex justify-between text-slate-400">
                <span>Porta {selectedPort.id.toString().padStart(2, "0")} Selecionada:</span>
                <span
                  className={`font-bold ${
                    selectedPort.status === "UP"
                      ? "text-emerald-400"
                      : selectedPort.status === "DEG"
                      ? "text-amber-400"
                      : "text-slate-500"
                  }`}
                >
                  {selectedPort.speed}
                </span>
              </div>
              <div className="text-slate-400 text-[9px] mt-0.5">
                Potência Óptica: {selectedPort.opticPower || "Rx: -3.2 dBm | Tx: -2.8 dBm"}
              </div>
            </div>
          </section>
        )}

        {/* Fluxo de Banda em Tempo Real */}
        <section className="bg-obsidian-900 border border-obsidian-800 rounded-xl p-3">
          <div className="flex items-center justify-between mb-1.5">
            <span className="font-mono text-[10px] uppercase text-slate-400 font-semibold">
              FLUXO DE BANDA (TEMPO REAL)
            </span>
            <span className="font-mono text-[10px] text-emerald-400 font-semibold">
              INGRESS / EGRESS
            </span>
          </div>

          <div className="flex items-baseline gap-4 mb-2">
            <div>
              <span className="text-[10px] font-mono text-slate-400 block">INGRESS</span>
              <span className="font-mono tabular-nums text-base text-emerald-400 font-bold">
                {device.ingressGbps || "6.4 Gbps"}
              </span>
            </div>
            <div>
              <span className="text-[10px] font-mono text-slate-400 block">EGRESS</span>
              <span className="font-mono tabular-nums text-base text-sky-400 font-bold">
                {device.egressGbps || "7.8 Gbps"}
              </span>
            </div>
          </div>

          {/* Sparkline Visual */}
          <div className="h-10 w-full bg-obsidian-950 rounded flex items-end gap-1 p-1 overflow-hidden border border-obsidian-800">
            {Array.from({ length: 24 }).map((_, i) => (
              <div
                key={i}
                style={{ height: `${20 + ((i * 7) % 75)}%` }}
                className="flex-1 bg-emerald-500/40 rounded-t"
              />
            ))}
          </div>
        </section>

        {/* Vizinhos Conectados LLDP */}
        {device.lldpNeighbors && device.lldpNeighbors.length > 0 && (
          <section className="bg-obsidian-900 border border-obsidian-800 rounded-xl p-3">
            <span className="font-mono text-[10px] uppercase text-slate-400 font-semibold block mb-2">
              VIZINHOS CONECTADOS (LLDP)
            </span>
            <div className="space-y-1.5 font-mono tabular-nums text-xs">
              {device.lldpNeighbors.map((nbr, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between p-2 rounded bg-obsidian-950 border border-obsidian-800"
                >
                  <span className="font-bold text-white">{nbr.name}</span>
                  <span className="text-emerald-400 text-[11px]">{nbr.port}</span>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>

      {/* 3. Rodapé de Ações Rápidas */}
      <footer className="p-3.5 border-t border-obsidian-800 bg-obsidian-900 space-y-2 sticky bottom-0">
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => onRunPingTrace(device.id)}
            className="px-2.5 py-1.5 rounded-lg bg-obsidian-850 hover:bg-obsidian-800 border border-obsidian-800 text-slate-200 font-mono text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors"
          >
            <Activity size={14} className="text-emerald-400" />
            <span>Ping / Trace</span>
          </button>

          <Link
            to={`/devices/${device.id}`}
            className="px-2.5 py-1.5 rounded-lg bg-obsidian-850 hover:bg-obsidian-800 border border-obsidian-800 text-slate-200 font-mono text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors"
          >
            <Eye size={14} className="text-sky-400" />
            <span>Visão 360°</span>
          </Link>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={handleToggleAlerts}
            className={`px-2.5 py-1.5 rounded-lg border font-mono text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors ${
              alertsPaused
                ? "bg-amber-500/20 border-amber-500 text-amber-300"
                : "bg-obsidian-850 hover:bg-obsidian-800 border-obsidian-800 text-amber-400"
            }`}
          >
            <BellOff size={14} />
            <span>{alertsPaused ? "Alertas Silenciados" : "Pausar Alertas"}</span>
          </button>

          <Link
            to="/incidents"
            className="px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-obsidian-950 font-mono text-xs font-bold flex items-center justify-center gap-1.5 transition-colors"
          >
            <RadioTower size={14} />
            <span>Incidentes</span>
          </Link>
        </div>
      </footer>
    </aside>
  );
};
