import React, { useEffect, useState } from "react";
import { Outlet, useNavigate } from "react-router-dom";
import { Header } from "./Header";
import { Sidebar } from "./Sidebar";
import { GlobalSearchModal } from "../common/GlobalSearchModal";
import { INITIAL_MOCK_DEVICES } from "../../mocks/nocMocks";
import type { MonitoredDevice } from "../../types/telemetry";

export interface AppLayoutProps {
  children?: React.ReactNode;
}

/**
 * Shell estrutural da aplicação (Layout Master).
 * Mantém Header e Sidebar fixos com fidelidade total ao Design System Obsidian Telemetry,
 * delegando o conteúdo das páginas filhas ao <Outlet />.
 */
export const AppLayout: React.FC<AppLayoutProps> = ({ children }) => {
  const navigate = useNavigate();
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);

  // Escuta atalho global Ctrl + K / Cmd + K
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setIsSearchOpen((prev) => !prev);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const toggleMobileSidebar = () => {
    setIsMobileSidebarOpen((prev) => !prev);
  };

  const closeMobileSidebar = () => {
    setIsMobileSidebarOpen(false);
  };

  const handleSelectDevice = (device: MonitoredDevice) => {
    setIsSearchOpen(false);
    navigate(`/devices/${device.device_id}`);
  };

  return (
    <div
      data-testid="app-layout"
      className="bg-obsidian-950 text-slate-100 min-h-screen flex flex-col font-sans selection:bg-emerald-500/20 selection:text-emerald-300 w-full"
    >
      {/* Acessibilidade WCAG: Skip Link */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-50 focus:px-4 focus:py-2 focus:bg-emerald-500 focus:text-obsidian-950 focus:font-bold focus:rounded-md focus:shadow-lg"
      >
        Pular para o cockpit operacional
      </a>

      {/* Header Global Fixo com gatilho de busca */}
      <Header
        onToggleSidebar={toggleMobileSidebar}
        onOpenSearch={() => setIsSearchOpen(true)}
      />

      {/* Workspace Wrapper */}
      <div className="flex flex-1 w-full relative">
        {/* Backdrop Overlay Mobile */}
        {isMobileSidebarOpen && (
          <div
            id="sidebar-backdrop"
            onClick={closeMobileSidebar}
            className="fixed inset-0 bg-obsidian-950/80 backdrop-blur-sm z-30 lg:hidden transition-opacity cursor-pointer"
            aria-hidden="true"
          />
        )}

        {/* Sidebar de Navegação */}
        <Sidebar isOpen={isMobileSidebarOpen} onClose={closeMobileSidebar} />

        {/* Área Principal de Conteúdo */}
        <main
          id="main-content"
          data-testid="main-content"
          className="ml-0 lg:ml-60 flex-1 flex flex-col min-h-[calc(100vh-3.5rem)] bg-obsidian-950 w-full overflow-x-hidden"
        >
          {children || <Outlet />}
        </main>
      </div>

      {/* Modal de Busca Global (Ctrl + K) */}
      <GlobalSearchModal
        isOpen={isSearchOpen}
        onClose={() => setIsSearchOpen(false)}
        devices={INITIAL_MOCK_DEVICES}
        onSelectDevice={handleSelectDevice}
      />
    </div>
  );
};
