import React from "react";
import { NavLink } from "react-router-dom";
import {
  AlertTriangle,
  BarChart3,
  BookOpen,
  Building2,
  HardDrive,
  LayoutDashboard,
  Network,
  Power,
  Server,
  ShieldAlert,
  ShieldCheck,
  Terminal,
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
    allowedRoles: ["SUPER_ADMIN", "NOC_OPERATOR", "ORG_ADMIN"],
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
    label: "Manutenção",
    icon: <Wrench size={18} />,
    allowedRoles: ["SUPER_ADMIN", "NOC_OPERATOR", "ORG_ADMIN"],
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
    allowedRoles: ["SUPER_ADMIN", "ORG_ADMIN"],
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
  onEmergencyDrain?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  isOpen = false,
  onClose,
  onEmergencyDrain,
}) => {
  const { hasRole } = useAuth();

  const visibleItems = NAV_ITEMS.filter((item) => hasRole(item.allowedRoles));

  return (
    <>
      {/* Backdrop para tela mobile */}
      {isOpen && (
        <div
          data-testid="sidebar-backdrop"
          onClick={onClose}
          className="fixed inset-0 bg-obsidian-950/80 backdrop-blur-sm z-30 lg:hidden transition-opacity cursor-pointer"
          aria-hidden="true"
        />
      )}

      {/* SIDEBAR DE NAVEGAÇÃO OPERACIONAL NOC */}
      <aside
        id="sidebar"
        data-testid="app-sidebar"
        className={`fixed top-14 left-0 h-[calc(100vh-3.5rem)] w-60 flex flex-col justify-between py-4 border-r border-obsidian-800/80 z-40 bg-obsidian-950 transition-transform duration-200 ease-in-out shadow-2xl lg:shadow-none ${
          isOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        }`}
        aria-label="Menu principal do NOC"
      >
        {/* Top Group: Header Operacional + Links de Navegação */}
        <div className="flex flex-col gap-3 overflow-y-auto">
          {/* Header do Cluster NOC */}
          <div className="px-4 pb-2 border-b border-obsidian-800/60 flex items-center justify-between">
            <div>
              <div className="text-xs font-semibold text-slate-200">Painel Operacional</div>
              <div className="text-[11px] font-mono text-emerald-400 flex items-center gap-1.5 mt-0.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                CLUSTER LUANDA-01
              </div>
            </div>

            {onClose ? (
              <button
                type="button"
                onClick={onClose}
                aria-label="Fechar menu"
                data-testid="close-sidebar-button"
                className="lg:hidden text-slate-400 hover:text-white transition-colors"
              >
                <X size={16} />
              </button>
            ) : (
              <Network size={18} className="text-slate-500" aria-hidden="true" />
            )}
          </div>

          {/* Links da Aplicação */}
          <nav
            className="flex flex-col space-y-1 px-2.5"
            aria-label="Navegação Principal do NOC"
          >
            {visibleItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                onClick={onClose}
                className={({ isActive }) =>
                  `flex items-center justify-between px-3 py-2 text-xs transition-colors font-medium ${
                    isActive
                      ? "bg-obsidian-850 text-white border-l-2 border-emerald-500 font-semibold rounded-r-lg"
                      : "text-slate-300 hover:text-white hover:bg-obsidian-900 rounded-lg"
                  }`
                }
              >
                <div className="flex items-center gap-2.5">
                  <span className="flex items-center justify-center text-inherit">
                    {item.icon}
                  </span>
                  <span>{item.label}</span>
                </div>

                {item.badge && (
                  <span
                    className={`px-1.5 py-0.5 text-[10px] font-mono font-bold rounded tabular-nums ${
                      item.badgeVariant === "critical"
                        ? "bg-rose-500/20 text-rose-400 border border-rose-500/30"
                        : "bg-obsidian-800 text-slate-300 border border-obsidian-700"
                    }`}
                  >
                    {item.badge}
                  </span>
                )}
              </NavLink>
            ))}
          </nav>
        </div>

        {/* Bottom Rail: Emergency Drain & Suporte */}
        <div className="px-3 flex flex-col gap-2 pt-3 border-t border-obsidian-800/60">
          <button
            type="button"
            data-testid="sidebar-emergency-drain-btn"
            onClick={() => {
              if (onEmergencyDrain) {
                onEmergencyDrain();
              } else {
                const btn = document.querySelector('[data-testid="emergency-drain-btn"]') as HTMLButtonElement;
                if (btn) btn.click();
              }
            }}
            className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-400 hover:bg-rose-500/20 text-xs font-semibold transition-colors focus-visible:ring-2 focus-visible:ring-rose-400 cursor-pointer"
          >
            <Power size={16} aria-hidden="true" />
            <span>Emergency Drain</span>
          </button>

          <div className="flex flex-col space-y-0.5">
            <a
              href="#docs"
              onClick={(e) => e.preventDefault()}
              className="flex items-center gap-2.5 px-3 py-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-obsidian-900 text-xs transition-colors"
            >
              <BookOpen size={16} aria-hidden="true" />
              <span>Documentação</span>
            </a>
            <a
              href="#cli"
              onClick={(e) => e.preventDefault()}
              className="flex items-center gap-2.5 px-3 py-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-obsidian-900 text-xs transition-colors"
            >
              <Terminal size={16} aria-hidden="true" />
              <span>Console CLI</span>
            </a>
          </div>
        </div>
      </aside>
    </>
  );
};
