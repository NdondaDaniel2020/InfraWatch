import React, { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { LogOut, Menu, Search, Tv } from "lucide-react";
import { useAuth } from "../../context/AuthContext";

import type { StatusTickerData } from "../../types/telemetry";

export type { StatusTickerData };

export interface HeaderProps {
  onToggleSidebar?: () => void;
  onOpenSearch?: () => void;
  ticker?: StatusTickerData;
}

export const Header: React.FC<HeaderProps> = ({
  onToggleSidebar,
  onOpenSearch,
  ticker = { total: 48, up: 45, degraded: 2, down: 1, maintenance: 0 },
}) => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [utcTime, setUtcTime] = useState<string>("");

  useEffect(() => {
    const updateUtc = () => {
      const now = new Date();
      const hours = String(now.getUTCHours()).padStart(2, "0");
      const minutes = String(now.getUTCMinutes()).padStart(2, "0");
      const seconds = String(now.getUTCSeconds()).padStart(2, "0");
      setUtcTime(`${hours}:${minutes}:${seconds} UTC`);
    };

    updateUtc();
    const interval = setInterval(updateUtc, 1000);
    return () => clearInterval(interval);
  }, []);

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  const getInitials = (name?: string) => {
    if (!name) return "DN";
    const parts = name.trim().split(" ");
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  };

  const isOperator =
    user?.role === "SUPER_ADMIN" || user?.role === "NOC_OPERATOR";

  return (
    <header
      data-testid="app-header"
      className="w-full px-4 sm:px-6 h-14 flex items-center justify-between border-b border-obsidian-800/80 sticky top-0 z-50 bg-obsidian-950/95 backdrop-blur-md shrink-0"
    >
      {/* Esquerda: Marca e Identidade do NOC */}
      <div className="flex items-center gap-3">
        {onToggleSidebar && (
          <button
            type="button"
            id="btn-sidebar-toggle"
            data-testid="toggle-sidebar-button"
            onClick={onToggleSidebar}
            className="lg:hidden p-1.5 rounded-lg bg-obsidian-900 border border-obsidian-800 text-slate-400 hover:text-white transition-colors focus-visible:ring-2 focus-visible:ring-emerald-400 cursor-pointer"
            aria-label="Abrir menu de navegação lateral"
          >
            <Menu size={18} />
          </button>
        )}

        <Link
          to="/"
          className="flex items-center gap-2.5 group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 rounded-lg no-underline"
        >
          <div className="w-8 h-8 rounded-xl bg-obsidian-900 border border-obsidian-800 flex items-center justify-center p-1.5 shadow-sm group-hover:border-obsidian-700 transition-colors">
            <svg className="w-full h-full shrink-0" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <polygon points="12,3 20,7.5 12,12 4,7.5" fill="#ffffff" stroke="#111827" strokeWidth="1.8" strokeLinejoin="round" />
              <polygon points="4,7.5 12,12 12,21 4,16.5" fill="var(--brand-primary, #eab308)" stroke="#ca8a04" strokeWidth="1.8" strokeLinejoin="round" />
              <polygon points="12,12 20,7.5 20,16.5 12,21" fill="#111827" stroke="#374151" strokeWidth="1.8" strokeLinejoin="round" />
            </svg>
          </div>
          <span className="font-display font-bold text-lg tracking-tight text-white group-hover:text-amber-400 transition-colors">
            InfraWatch
          </span>
        </Link>
      </div>

      {/* Centro: Status Ticker Global em Tempo Real (Apenas Operadores do Provedor) */}
      {isOperator && (
        <div
          data-testid="status-ticker"
          className="hidden xl:flex items-center gap-3 px-3 py-1 bg-obsidian-900 rounded-lg border border-obsidian-800 text-xs font-mono tabular-nums"
        >
          <span className="text-slate-400">
            TOTAL: <strong className="text-white">{ticker.total ?? 48}</strong>
          </span>
          <span className="h-3 w-px bg-obsidian-800" />
          <span className="flex items-center gap-1.5 text-emerald-400">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" /> UP:{" "}
            {ticker.up ?? 45}
          </span>
          <span className="h-3 w-px bg-obsidian-800" />
          <span className="flex items-center gap-1.5 text-amber-400">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400" /> DEG:{" "}
            {ticker.degraded ?? 2}
          </span>
          <span className="h-3 w-px bg-obsidian-800" />
          <span className="flex items-center gap-1.5 text-rose-400 font-semibold">
            <span className="w-1.5 h-1.5 rounded-full bg-rose-400 animate-pulse" />{" "}
            DOWN: {ticker.down ?? 1}
          </span>
          <span className="h-3 w-px bg-obsidian-800" />
          <span className="flex items-center gap-1.5 text-sky-400">
            <span className="w-1.5 h-1.5 rounded-full bg-sky-400" /> MAINT:{" "}
            {ticker.maintenance ?? 0}
          </span>
        </div>
      )}

      {/* Direita: Busca Global, UTC, SSE, Modo TV e Perfil */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          data-testid="header-search-button"
          onClick={onOpenSearch}
          className="relative hidden md:flex items-center h-9 cursor-pointer text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/50 rounded-full group"
          aria-label="Abrir busca global de ativos (Ctrl + K)"
        >
          <Search
            size={16}
            className="absolute left-3 text-slate-400 group-hover:text-slate-200 transition-colors pointer-events-none"
          />
          <span className="w-56 xl:w-72 h-9 pl-9 pr-14 bg-obsidian-900 border border-obsidian-800 rounded-full text-xs font-sans text-slate-400 flex items-center whitespace-nowrap group-hover:border-obsidian-700 group-hover:text-slate-300 transition-colors shadow-inner">
            Pesquisar ativos, IPs, tags…
          </span>
          <kbd className="absolute right-2.5 px-1.5 py-0.5 rounded bg-obsidian-850 border border-obsidian-800 text-[10px] font-mono text-slate-400 pointer-events-none">
            Ctrl K
          </kbd>
        </button>

        {/* Relógio UTC (Exclusivo Operadores) */}
        {isOperator && (
          <time
            data-testid="utc-clock"
            dateTime={new Date().toISOString()}
            className="hidden sm:inline-block font-mono text-[11px] text-slate-400 px-2.5 py-1 rounded-md bg-obsidian-900 border border-obsidian-800"
            title="Relógio Oficial UTC do Barramento"
          >
            {utcTime || "--:--:-- UTC"}
          </time>
        )}

        {/* Live SSE Streaming Badge (Exclusivo Operadores) */}
        {isOperator && (
          <div
            data-testid="sse-live-badge"
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-[11px] font-mono"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span className="tracking-wide">SSE LIVE</span>
          </div>
        )}

        {/* Modo TV (Exclusivo Operadores) */}
        {isOperator && (
          <Link
            to="/tv"
            data-testid="tv-mode-link"
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-obsidian-900 hover:bg-obsidian-850 border border-obsidian-800 text-slate-300 hover:text-white text-xs font-medium transition-colors no-underline"
            title="Visualizar em Modo Wallboard TV 16:9"
            aria-label="Abrir modo TV operacional"
          >
            <Tv size={15} className="text-slate-400" />
            <span className="hidden sm:inline">Modo TV</span>
          </Link>
        )}

        {/* Perfil Operador Daniel Ndonda */}
        <div className="flex items-center gap-2.5 pl-3 border-l border-obsidian-800">
          <div
            data-testid="user-avatar"
            className="w-8 h-8 rounded-full bg-obsidian-850 border border-obsidian-700 flex items-center justify-center font-mono tabular-nums font-bold text-xs text-emerald-400"
            title={`${user?.name || "Daniel Ndonda"} (${user?.role || "NOC Lead"})`}
          >
            {user?.initials || getInitials(user?.name)}
          </div>
          <div className="hidden 2xl:flex flex-col text-left">
            <span className="text-xs font-medium text-slate-200 leading-tight">
              {user?.name || "Daniel Ndonda"}
            </span>
            <span className="text-[11px] text-slate-400 font-mono">
              {user?.role || "NOC Lead"}
            </span>
          </div>
          {user && (
            <button
              type="button"
              onClick={handleLogout}
              data-testid="logout-button"
              title="Encerrar Sessão"
              aria-label="Encerrar Sessão"
              className="text-slate-400 hover:text-rose-400 p-1 transition-colors cursor-pointer"
            >
              <LogOut size={16} />
            </button>
          )}
        </div>
      </div>
    </header>
  );
};
