import React, { useEffect, useMemo, useRef, useState } from "react";
import { CornerDownLeft, Router, Search, X } from "lucide-react";
import type { MonitoredDevice } from "../../types/telemetry";
import { getNormalizedStatus, STATUS_TOKENS } from "../telemetry/statusConfig";

export interface GlobalSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  devices: MonitoredDevice[];
  onSelectDevice?: (device: MonitoredDevice) => void;
}

export const GlobalSearchModal: React.FC<GlobalSearchModalProps> = ({
  isOpen,
  onClose,
  devices,
  onSelectDevice,
}) => {
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Foco no input ao abrir e listener para ESC
  useEffect(() => {
    if (!isOpen) {
      setQuery("");
      return;
    }

    const timer = setTimeout(() => {
      inputRef.current?.focus();
    }, 50);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, onClose]);

  // Filtra dispositivos e opções por texto digitado
  const filteredDevices = useMemo(() => {
    if (!query.trim()) return devices.slice(0, 5);
    const q = query.toLowerCase();
    return devices.filter(
      (d) =>
        d.name.toLowerCase().includes(q) ||
        d.ip_address.includes(q) ||
        (d.model_description && d.model_description.toLowerCase().includes(q)) ||
        (d.tenant_name && d.tenant_name.toLowerCase().includes(q))
    );
  }, [devices, query]);

  // Navegação por teclado (Cima/Baixo/Enter)
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (filteredDevices.length === 0) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((prev) => (prev + 1) % filteredDevices.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((prev) => (prev - 1 + filteredDevices.length) % filteredDevices.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      const dev = filteredDevices[selectedIndex];
      if (dev) {
        onSelectDevice?.(dev);
        onClose();
      }
    }
  };

  if (!isOpen) return null;

  return (
    <div
      data-testid="global-search-modal-backdrop"
      className="fixed inset-0 bg-obsidian-950/80 backdrop-blur-md z-[110] flex items-start justify-center pt-[10vh] px-4 animate-fadeIn"
      role="dialog"
      aria-modal="true"
      aria-labelledby="global-search-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        data-testid="global-search-modal-container"
        className="w-full max-w-2xl bg-obsidian-900 border border-obsidian-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col"
      >
        <h2 id="global-search-title" className="sr-only">
          Busca Global e Command Palette (Ctrl+K)
        </h2>

        {/* Input de Busca */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-obsidian-800 bg-obsidian-950/80">
          <Search size={20} className="text-emerald-400 shrink-0" aria-hidden="true" />
          <input
            ref={inputRef}
            data-testid="global-search-input"
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            onKeyDown={handleKeyDown}
            placeholder="Buscar ativos, IPs, chamados GLPI, rotas ou comandos…"
            className="flex-1 bg-transparent border-none text-slate-100 placeholder:text-slate-500 text-sm outline-none font-sans"
          />
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar busca global"
            className="flex items-center gap-1 px-2 py-1 rounded-md bg-obsidian-850 border border-obsidian-800 text-slate-400 hover:text-white text-[11px] font-mono cursor-pointer transition-colors"
          >
            <span>ESC</span>
            <X size={12} />
          </button>
        </div>

        {/* Lista de Resultados */}
        <div
          role="listbox"
          className="max-h-[420px] overflow-y-auto py-2"
        >
          <div className="px-5 py-2 flex justify-between text-[10px] font-mono text-slate-400 uppercase tracking-wider">
            <span>Dispositivos & Ativos de Rede</span>
            <span>{filteredDevices.length} resultados</span>
          </div>

          {filteredDevices.length === 0 ? (
            <div className="py-8 px-5 text-center text-slate-400 text-xs font-mono">
              Nenhum ativo ou rota encontrado para &quot;{query}&quot;.
            </div>
          ) : (
            filteredDevices.map((dev, idx) => {
              const isSelected = idx === selectedIndex;
              const statusKey = getNormalizedStatus(dev.status, dev.severity);
              const statusToken = STATUS_TOKENS[statusKey];
              const isDown = statusKey === "DOWN";

              return (
                <div
                  key={dev.device_id}
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => {
                    onSelectDevice?.(dev);
                    onClose();
                  }}
                  onMouseEnter={() => setSelectedIndex(idx)}
                  className={`px-5 py-3 flex items-center justify-between cursor-pointer transition-colors ${
                    isSelected
                      ? "bg-obsidian-850 border-l-2 border-emerald-500"
                      : "hover:bg-obsidian-850/50 border-l-2 border-transparent"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${statusToken.iconBgClass}`}
                    >
                      <Router size={18} />
                    </div>

                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-xs text-white">
                          {dev.name}
                        </span>
                        <span className="text-[11px] text-slate-400">
                          • {dev.tenant_name || "Cluster Principal"}
                        </span>
                      </div>

                      <div className="flex items-center gap-2 text-[11px] font-mono text-slate-400 mt-0.5">
                        <span className="text-slate-300">{dev.ip_address}</span>
                        <span>•</span>
                        <span
                          className={`font-semibold ${statusToken.textColor}`}
                        >
                          {dev.status} (
                          {dev.last_latency_ms !== null && dev.last_latency_ms !== undefined
                            ? `${dev.last_latency_ms.toFixed(1)}ms`
                            : isDown
                            ? "TIMEOUT"
                            : "--"}
                          )
                        </span>
                      </div>
                    </div>
                  </div>

                  {isSelected && (
                    <div className="flex items-center gap-1 text-[11px] font-mono text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/30">
                      <span>Abrir</span>
                      <CornerDownLeft size={12} />
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Rodapé com Dicas de Atalho */}
        <div className="px-5 py-2.5 border-t border-obsidian-800 bg-obsidian-950/80 flex items-center justify-between text-[11px] font-mono text-slate-400">
          <div className="flex gap-3">
            <span>
              <kbd className="px-1.5 py-0.5 rounded bg-obsidian-850 border border-obsidian-800 text-[10px]">↑</kbd>{" "}
              <kbd className="px-1.5 py-0.5 rounded bg-obsidian-850 border border-obsidian-800 text-[10px]">↓</kbd> navegar
            </span>
            <span>
              <kbd className="px-1.5 py-0.5 rounded bg-obsidian-850 border border-obsidian-800 text-[10px]">↵</kbd> selecionar
            </span>
          </div>
          <span>PostgreSQL Full-Text Search</span>
        </div>
      </div>
    </div>
  );
};
