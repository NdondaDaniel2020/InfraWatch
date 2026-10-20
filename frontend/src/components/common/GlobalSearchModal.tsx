import React, { useEffect, useMemo, useRef, useState } from "react";
import { CornerDownLeft, Router, Search } from "lucide-react";
import type { MonitoredDevice } from "../../types/telemetry";

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
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(0, 0, 0, 0.75)",
        backdropFilter: "blur(8px)",
        WebkitBackdropFilter: "blur(8px)",
        zIndex: 110,
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        paddingTop: "10vh",
        paddingLeft: "16px",
        paddingRight: "16px",
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="global-search-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        data-testid="global-search-modal-container"
        style={{
          width: "100%",
          maxWidth: "680px",
          backgroundColor: "rgba(13, 20, 36, 0.98)",
          border: "1px solid rgba(255, 255, 255, 0.12)",
          borderRadius: "16px",
          boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.8)",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <h2 id="global-search-title" className="sr-only">
          Busca Global e Command Palette (Ctrl+K)
        </h2>

        {/* Input de Busca */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "12px",
            padding: "16px 20px",
            borderBottom: "1px solid rgba(255, 255, 255, 0.08)",
            backgroundColor: "rgba(7, 10, 18, 0.8)",
          }}
        >
          <Search size={20} style={{ color: "var(--brand-primary, #eab308)" }} />
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
            style={{
              flex: 1,
              backgroundColor: "transparent",
              border: "none",
              color: "var(--color-text-primary, #f8fafc)",
              fontSize: "14px",
              fontFamily: "var(--font-sans, sans-serif)",
              outline: "none",
            }}
          />
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar busca global"
            style={{
              display: "flex",
              alignItems: "center",
              gap: "4px",
              padding: "4px 8px",
              borderRadius: "6px",
              backgroundColor: "rgba(255, 255, 255, 0.08)",
              border: "1px solid rgba(255, 255, 255, 0.1)",
              color: "var(--color-text-muted, #94a3b8)",
              fontSize: "11px",
              fontFamily: "var(--font-mono, monospace)",
              cursor: "pointer",
            }}
          >
            ESC
          </button>
        </div>

        {/* Lista de Resultados */}
        <div
          role="listbox"
          style={{
            maxHeight: "420px",
            overflowY: "auto",
            padding: "8px 0",
          }}
        >
          <div
            style={{
              padding: "8px 20px 4px 20px",
              display: "flex",
              justifyContent: "space-between",
              fontSize: "10px",
              fontFamily: "var(--font-mono, monospace)",
              color: "var(--color-text-dim, #64748b)",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
            }}
          >
            <span>Dispositivos & Ativos de Rede</span>
            <span>{filteredDevices.length} resultados</span>
          </div>

          {filteredDevices.length === 0 ? (
            <div
              style={{
                padding: "32px 20px",
                textAlign: "center",
                color: "var(--color-text-muted, #94a3b8)",
                fontSize: "13px",
                fontFamily: "var(--font-mono, monospace)",
              }}
            >
              Nenhum ativo ou rota encontrado para &quot;{query}&quot;.
            </div>
          ) : (
            filteredDevices.map((dev, idx) => {
              const isSelected = idx === selectedIndex;
              const isDown = dev.status === "DOWN" || dev.severity === "critical";
              const isDegraded = dev.status === "DEG" || dev.severity === "degraded";

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
                  style={{
                    padding: "12px 20px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    backgroundColor: isSelected
                      ? "rgba(255, 255, 255, 0.08)"
                      : "transparent",
                    borderLeft: isSelected
                      ? "3px solid var(--brand-primary, #eab308)"
                      : "3px solid transparent",
                    cursor: "pointer",
                    transition: "background-color 100ms ease",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                    <div
                      style={{
                        width: "36px",
                        height: "36px",
                        borderRadius: "10px",
                        backgroundColor: isDown
                          ? "rgba(244, 63, 94, 0.15)"
                          : isDegraded
                          ? "rgba(245, 158, 11, 0.15)"
                          : "rgba(16, 185, 129, 0.15)",
                        border: `1px solid ${
                          isDown
                            ? "rgba(244, 63, 94, 0.3)"
                            : isDegraded
                            ? "rgba(245, 158, 11, 0.3)"
                            : "rgba(16, 185, 129, 0.3)"
                        }`,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        color: isDown ? "#f43f5e" : isDegraded ? "#f59e0b" : "#10b981",
                      }}
                    >
                      <Router size={18} />
                    </div>

                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <span
                          style={{
                            fontFamily: "var(--font-mono, monospace)",
                            fontWeight: 700,
                            fontSize: "13px",
                            color: "var(--color-text-primary, #f8fafc)",
                          }}
                        >
                          {dev.name}
                        </span>
                        <span style={{ fontSize: "11px", color: "var(--color-text-muted)" }}>
                          • {dev.tenant_name || "Cluster Principal"}
                        </span>
                      </div>

                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "8px",
                          fontSize: "11px",
                          fontFamily: "var(--font-mono, monospace)",
                          color: "var(--color-text-dim, #64748b)",
                          marginTop: "2px",
                        }}
                      >
                        <span style={{ color: "var(--color-text-secondary)" }}>{dev.ip_address}</span>
                        <span>•</span>
                        <span
                          style={{
                            color: isDown ? "#f43f5e" : isDegraded ? "#f59e0b" : "#10b981",
                            fontWeight: 600,
                          }}
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
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "4px",
                        fontSize: "11px",
                        fontFamily: "var(--font-mono)",
                        color: "var(--brand-primary, #eab308)",
                        backgroundColor: "rgba(234, 179, 8, 0.12)",
                        padding: "3px 8px",
                        borderRadius: "6px",
                        border: "1px solid rgba(234, 179, 8, 0.3)",
                      }}
                    >
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
        <div
          style={{
            padding: "10px 20px",
            borderTop: "1px solid rgba(255, 255, 255, 0.08)",
            backgroundColor: "rgba(7, 10, 18, 0.9)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            fontSize: "11px",
            fontFamily: "var(--font-mono, monospace)",
            color: "var(--color-text-dim, #64748b)",
          }}
        >
          <div style={{ display: "flex", gap: "14px" }}>
            <span>
              <kbd style={{ padding: "1px 4px", borderRadius: "3px", background: "rgba(255,255,255,0.1)" }}>↑</kbd>{" "}
              <kbd style={{ padding: "1px 4px", borderRadius: "3px", background: "rgba(255,255,255,0.1)" }}>↓</kbd> navegar
            </span>
            <span>
              <kbd style={{ padding: "1px 4px", borderRadius: "3px", background: "rgba(255,255,255,0.1)" }}>↵</kbd> selecionar
            </span>
          </div>
          <span>PostgreSQL Full-Text Search</span>
        </div>
      </div>
    </div>
  );
};
