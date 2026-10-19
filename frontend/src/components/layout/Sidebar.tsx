import React from "react";
import { NavLink } from "react-router-dom";
import {
  AlertTriangle,
  BarChart3,
  Building2,
  HardDrive,
  LayoutDashboard,
  Network,
  Server,
  ShieldAlert,
  ShieldCheck,
  Wrench,
  X,
} from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import type { UserRole } from "../../types/auth";

export interface NavItemConfig {
  to: string;
  label: string;
  icon: React.ReactNode;
  allowedRoles: UserRole[];
  badge?: string;
  badgeVariant?: "critical" | "healthy" | "neutral";
}

export const NAV_ITEMS: NavItemConfig[] = [
  {
    to: "/noc",
    label: "Cockpit NOC",
    icon: <LayoutDashboard size={18} />,
    allowedRoles: ["SUPER_ADMIN", "NOC_OPERATOR"],
  },
  {
    to: "/devices",
    label: "Inventário de Ativos",
    icon: <Server size={18} />,
    allowedRoles: ["SUPER_ADMIN", "NOC_OPERATOR"],
  },
  {
    to: "/incidents",
    label: "Incidentes",
    icon: <AlertTriangle size={18} />,
    allowedRoles: ["SUPER_ADMIN", "NOC_OPERATOR"],
    badge: "1 CRIT",
    badgeVariant: "critical",
  },
  {
    to: "/topology",
    label: "Topologia de Rede",
    icon: <Network size={18} />,
    allowedRoles: ["SUPER_ADMIN", "NOC_OPERATOR"],
  },
  {
    to: "/maintenance",
    label: "Janelas de Manutenção",
    icon: <Wrench size={18} />,
    allowedRoles: ["SUPER_ADMIN", "NOC_OPERATOR"],
  },
  {
    to: "/sla",
    label: "Relatórios SLA",
    icon: <BarChart3 size={18} />,
    allowedRoles: ["SUPER_ADMIN", "NOC_OPERATOR", "ORG_ADMIN", "CLIENT_VIEWER"],
  },
  {
    to: "/audit",
    label: "Trilha de Auditoria",
    icon: <ShieldCheck size={18} />,
    allowedRoles: ["SUPER_ADMIN"],
  },
  {
    to: "/dr",
    label: "Backup & DR",
    icon: <HardDrive size={18} />,
    allowedRoles: ["SUPER_ADMIN"],
  },
  {
    to: "/security",
    label: "Segurança & RBAC",
    icon: <ShieldAlert size={18} />,
    allowedRoles: ["SUPER_ADMIN"],
  },
  {
    to: "/portal",
    label: "Portal do Cliente",
    icon: <Building2 size={18} />,
    allowedRoles: ["CLIENT_VIEWER", "ORG_ADMIN", "SUPER_ADMIN"],
  },
];

export interface SidebarProps {
  isOpen?: boolean;
  onClose?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ isOpen = false, onClose }) => {
  const { hasRole } = useAuth();

  const visibleItems = NAV_ITEMS.filter((item) => hasRole(item.allowedRoles));

  return (
    <>
      {/* Backdrop para tela mobile */}
      {isOpen && (
        <div
          data-testid="sidebar-backdrop"
          onClick={onClose}
          style={{
            position: "fixed",
            inset: 0,
            backgroundColor: "rgba(9, 13, 22, 0.75)",
            backdropFilter: "blur(4px)",
            zIndex: 40,
          }}
        />
      )}

      <aside
        data-testid="app-sidebar"
        style={{
          width: "240px",
          height: "calc(100vh - 56px)",
          backgroundColor: "var(--color-bg-deep)",
          borderRight: "var(--border-subtle)",
          position: "fixed",
          top: "56px",
          left: 0,
          zIndex: 45,
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "16px 12px",
          transition: "transform var(--transition-normal)",
          transform: isOpen ? "translateX(0)" : undefined,
        }}
        className={`sidebar-nav ${isOpen ? "open" : ""}`}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: "16px", overflowY: "auto" }}>
          {/* Header do Cluster NOC */}
          <div
            style={{
              padding: "0 8px 12px 8px",
              borderBottom: "var(--border-subtle)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <div>
              <div style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--color-text-secondary)" }}>
                Painel Operacional
              </div>
              <div
                style={{
                  fontSize: "0.6875rem",
                  fontFamily: "var(--font-mono)",
                  color: "var(--color-healthy)",
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  marginTop: "2px",
                }}
              >
                <span style={{ width: "6px", height: "6px", borderRadius: "50%", backgroundColor: "var(--color-healthy)" }} />
                CLUSTER LUANDA-01
              </div>
            </div>

            {onClose && (
              <button
                type="button"
                onClick={onClose}
                aria-label="Fechar menu"
                data-testid="close-sidebar-button"
                style={{
                  background: "transparent",
                  border: "none",
                  color: "var(--color-text-muted)",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                }}
              >
                <X size={16} />
              </button>
            )}
          </div>

          {/* Lista de Rotas Filtradas */}
          <nav
            style={{ display: "flex", flexDirection: "column", gap: "4px" }}
            aria-label="Navegação Principal do Sistema"
          >
            {visibleItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                onClick={onClose}
                style={({ isActive }) => ({
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "8px 12px",
                  borderRadius: "var(--radius-md)",
                  textDecoration: "none",
                  fontSize: "0.8125rem",
                  fontWeight: isActive ? 600 : 500,
                  fontFamily: "var(--font-sans)",
                  color: isActive ? "var(--color-text-primary)" : "var(--color-text-secondary)",
                  backgroundColor: isActive ? "var(--color-surface-hover)" : "transparent",
                  borderLeft: isActive ? "3px solid var(--color-healthy)" : "3px solid transparent",
                  transition: "background-color var(--transition-fast), color var(--transition-fast), border-left-color var(--transition-fast)",
                })}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                  <span style={{ display: "flex", color: "inherit" }}>{item.icon}</span>
                  <span>{item.label}</span>
                </div>

                {item.badge && (
                  <span
                    style={{
                      fontSize: "0.625rem",
                      fontFamily: "var(--font-mono)",
                      fontWeight: 700,
                      padding: "1px 6px",
                      borderRadius: "var(--radius-xs)",
                      backgroundColor:
                        item.badgeVariant === "critical"
                          ? "var(--color-critical-bg)"
                          : "rgba(255, 255, 255, 0.08)",
                      color:
                        item.badgeVariant === "critical"
                          ? "var(--color-critical)"
                          : "var(--color-text-secondary)",
                      border:
                        item.badgeVariant === "critical"
                          ? "1px solid var(--color-critical-border)"
                          : "var(--border-subtle)",
                    }}
                  >
                    {item.badge}
                  </span>
                )}
              </NavLink>
            ))}
          </nav>
        </div>

        {/* Rodapé da Sidebar */}
        <footer
          style={{
            padding: "12px 8px 4px 8px",
            borderTop: "var(--border-subtle)",
            fontSize: "0.6875rem",
            color: "var(--color-text-muted)",
            fontFamily: "var(--font-mono)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <span>v0.1.0-prod</span>
          <span style={{ color: "var(--color-healthy)" }}>ONLINE</span>
        </footer>
      </aside>
    </>
  );
};
