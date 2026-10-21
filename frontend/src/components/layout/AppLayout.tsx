import React, { useState } from "react";
import { Outlet } from "react-router-dom";
import { Header } from "./Header";
import { Sidebar } from "./Sidebar";

export interface AppLayoutProps {
  children?: React.ReactNode;
}

/**
 * Shell estrutural da aplicação (Layout Master).
 * Mantém Header e Sidebar fixos com fidelidade total ao Design System Obsidian Telemetry,
 * delegando o conteúdo das páginas filhas ao <Outlet />.
 */
export const AppLayout: React.FC<AppLayoutProps> = ({ children }) => {
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);

  const toggleMobileSidebar = () => {
    setIsMobileSidebarOpen((prev) => !prev);
  };

  const closeMobileSidebar = () => {
    setIsMobileSidebarOpen(false);
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

      {/* Header Global Fixo */}
      <Header onToggleSidebar={toggleMobileSidebar} />

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
    </div>
  );
};
