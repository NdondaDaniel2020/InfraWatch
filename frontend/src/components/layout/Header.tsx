import React, { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { LogOut, Menu, Radio, Search, Tv } from "lucide-react";
import { LiveIndicator } from "../common/LiveIndicator";
import { useAuth } from "../../context/AuthContext";

export interface StatusTickerData {
  total?: number;
  up?: number;
  degraded?: number;
  down?: number;
  maintenance?: number;
}

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
    if (!name) return "IW";
    const parts = name.trim().split(" ");
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  };

  return (
    <header
      data-testid="app-header"
      style={{
        width: "100%",
        height: "56px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0 20px",
        backgroundColor: "rgba(9, 13, 22, 0.96)",
        borderBottom: "var(--border-subtle)",
        position: "sticky",
        top: 0,
        zIndex: 50,
        backdropFilter: "blur(8px)",
      }}
    >
      {/* Esquerda: Identidade e Botão Mobile */}
      <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
        {onToggleSidebar && (
          <button
            type="button"
            onClick={onToggleSidebar}
            aria-label="Alternar menu lateral"
            data-testid="toggle-sidebar-button"
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "var(--color-surface-card)",
              border: "var(--border-subtle)",
              borderRadius: "var(--radius-sm)",
              color: "var(--color-text-secondary)",
              padding: "6px",
              cursor: "pointer",
            }}
          >
            <Menu size={18} />
          </button>
        )}

        <Link
          to="/"
          style={{
            display: "flex",
            alignItems: "center",
            gap: "10px",
            textDecoration: "none",
            color: "inherit",
          }}
        >
          <div
            style={{
              width: "32px",
              height: "32px",
              borderRadius: "var(--radius-sm)",
              backgroundColor: "rgba(16, 185, 129, 0.12)",
              border: "1px solid rgba(16, 185, 129, 0.3)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "var(--color-healthy)",
            }}
          >
            <Radio size={18} className="pulse-indicator" />
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <span style={{ fontWeight: 700, fontSize: "0.9375rem", letterSpacing: "-0.01em" }}>
                InfraWatch
              </span>
              <span
                style={{
                  fontSize: "0.625rem",
                  fontFamily: "var(--font-mono)",
                  fontWeight: 700,
                  padding: "1px 5px",
                  borderRadius: "var(--radius-xs)",
                  backgroundColor: "rgba(16, 185, 129, 0.15)",
                  color: "var(--color-healthy)",
                  border: "1px solid rgba(16, 185, 129, 0.3)",
                }}
              >
                NOC
              </span>
            </div>
            <span
              style={{
                fontSize: "0.6875rem",
                color: "var(--color-text-muted)",
                fontFamily: "var(--font-mono)",
                lineHeight: 1,
              }}
            >
              Telemetria & Observabilidade
            </span>
          </div>
        </Link>
      </div>

      {/* Centro: Status Ticker Executivo */}
      <div
        data-testid="status-ticker"
        style={{
          display: "flex",
          alignItems: "center",
          gap: "12px",
          backgroundColor: "var(--color-surface-card)",
          border: "var(--border-subtle)",
          padding: "4px 14px",
          borderRadius: "var(--radius-full)",
          fontSize: "0.75rem",
          fontFamily: "var(--font-mono)",
          letterSpacing: "0.02em",
        }}
      >
        <span style={{ color: "var(--color-text-secondary)" }}>
          TOTAL: <strong style={{ color: "var(--color-text-primary)" }}>{ticker.total ?? 0}</strong>
        </span>
        <span style={{ width: "1px", height: "12px", backgroundColor: "var(--color-border-subtle)" }} />
        <span style={{ color: "var(--color-healthy)", display: "flex", alignItems: "center", gap: "4px" }}>
          <span style={{ width: "6px", height: "6px", borderRadius: "50%", backgroundColor: "var(--color-healthy)" }} />
          UP: {ticker.up ?? 0}
        </span>
        <span style={{ width: "1px", height: "12px", backgroundColor: "var(--color-border-subtle)" }} />
        <span style={{ color: "var(--color-degraded)", display: "flex", alignItems: "center", gap: "4px" }}>
          <span style={{ width: "6px", height: "6px", borderRadius: "50%", backgroundColor: "var(--color-degraded)" }} />
          DEG: {ticker.degraded ?? 0}
        </span>
        <span style={{ width: "1px", height: "12px", backgroundColor: "var(--color-border-subtle)" }} />
        <span style={{ color: "var(--color-critical)", display: "flex", alignItems: "center", gap: "4px", fontWeight: 700 }}>
          <span style={{ width: "6px", height: "6px", borderRadius: "50%", backgroundColor: "var(--color-critical)" }} className="pulse-indicator" />
          DOWN: {ticker.down ?? 0}
        </span>
        <span style={{ width: "1px", height: "12px", backgroundColor: "var(--color-border-subtle)" }} />
        <span style={{ color: "var(--color-maintenance)", display: "flex", alignItems: "center", gap: "4px" }}>
          <span style={{ width: "6px", height: "6px", borderRadius: "50%", backgroundColor: "var(--color-maintenance)" }} />
          MAINT: {ticker.maintenance ?? 0}
        </span>
      </div>

      {/* Direita: Relógio UTC, Busca, Live SSE, Modo TV e Perfil */}
      <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
        {/* Relógio UTC Semântico */}
        <time
          data-testid="utc-clock"
          dateTime={new Date().toISOString()}
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "0.75rem",
            color: "var(--color-text-secondary)",
            padding: "4px 8px",
            backgroundColor: "rgba(0, 0, 0, 0.3)",
            border: "var(--border-subtle)",
            borderRadius: "var(--radius-sm)",
          }}
          title="Relógio Oficial UTC do Barramento"
        >
          {utcTime || "--:--:-- UTC"}
        </time>

        {/* Botão de Busca Rápida (Ctrl+K) */}
        <button
          type="button"
          onClick={onOpenSearch}
          aria-label="Abrir busca global de ativos (Ctrl + K)"
          data-testid="header-search-button"
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            background: "var(--color-surface-card)",
            border: "var(--border-subtle)",
            borderRadius: "var(--radius-full)",
            padding: "4px 12px",
            color: "var(--color-text-muted)",
            fontSize: "0.75rem",
            cursor: "pointer",
            transition: "border-color var(--transition-fast)",
          }}
        >
          <Search size={14} />
          <span style={{ display: "inline-block" }}>Buscar ativos…</span>
          <kbd
            style={{
              padding: "1px 5px",
              fontSize: "0.625rem",
              fontFamily: "var(--font-mono)",
              backgroundColor: "rgba(255, 255, 255, 0.08)",
              borderRadius: "var(--radius-xs)",
              color: "var(--color-text-secondary)",
            }}
          >
            Ctrl K
          </kbd>
        </button>

        {/* Live SSE Streaming Badge */}
        <LiveIndicator />

        {/* Modo TV */}
        <Link
          to="/tv"
          style={{
            display: "flex",
            alignItems: "center",
            gap: "6px",
            backgroundColor: "var(--color-surface-card)",
            border: "var(--border-subtle)",
            borderRadius: "var(--radius-md)",
            padding: "6px 10px",
            color: "var(--color-text-secondary)",
            fontSize: "0.75rem",
            textDecoration: "none",
            fontWeight: 500,
          }}
          title="Visualizar em Modo Wallboard TV 16:9"
          data-testid="tv-mode-link"
        >
          <Tv size={14} />
          <span>Modo TV</span>
        </Link>

        {/* Perfil do Usuário e Logout */}
        {user && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              paddingLeft: "8px",
              borderLeft: "var(--border-subtle)",
            }}
          >
            <div
              style={{
                width: "28px",
                height: "28px",
                borderRadius: "50%",
                backgroundColor: "var(--color-surface-elevated)",
                border: "1px solid var(--color-healthy-border)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontFamily: "var(--font-mono)",
                fontWeight: 700,
                fontSize: "0.75rem",
                color: "var(--color-healthy)",
              }}
              title={`${user.name} (${user.role})`}
              data-testid="user-avatar"
            >
              {user.initials || getInitials(user.name)}
            </div>

            <div style={{ display: "flex", flexDirection: "column" }}>
              <span
                style={{
                  fontSize: "0.75rem",
                  fontWeight: 600,
                  color: "var(--color-text-primary)",
                  lineHeight: 1.1,
                }}
              >
                {user.name}
              </span>
              <span
                style={{
                  fontSize: "0.625rem",
                  color: "var(--color-text-muted)",
                  fontFamily: "var(--font-mono)",
                }}
              >
                {user.role}
              </span>
            </div>

            <button
              type="button"
              onClick={handleLogout}
              title="Encerrar Sessão"
              aria-label="Encerrar Sessão"
              data-testid="logout-button"
              style={{
                background: "transparent",
                border: "none",
                color: "var(--color-text-muted)",
                cursor: "pointer",
                padding: "4px",
                display: "flex",
                alignItems: "center",
              }}
            >
              <LogOut size={16} />
            </button>
          </div>
        )}
      </div>
    </header>
  );
};
