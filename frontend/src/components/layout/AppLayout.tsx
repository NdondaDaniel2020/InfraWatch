import React, { useState } from "react";
import { Outlet } from "react-router-dom";
import { Header } from "./Header";
import { Sidebar } from "./Sidebar";

export interface AppLayoutProps {
  children?: React.ReactNode;
}

/**
 * Shell estrutural da aplicação (Layout Master).
 * Mantém Header e Sidebar fixos sem remontar na troca de rotas,
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
      style={{
        minHeight: "100vh",
        backgroundColor: "var(--color-bg-deep)",
        display: "flex",
        flexDirection: "column",
        width: "100%",
      }}
    >
      {/* Header Global Fixo */}
      <Header onToggleSidebar={toggleMobileSidebar} />

      {/* Corpo com Sidebar e Área de Conteúdo */}
      <div style={{ display: "flex", flex: 1, width: "100%", position: "relative" }}>
        {/* Sidebar de Navegação */}
        <Sidebar isOpen={isMobileSidebarOpen} onClose={closeMobileSidebar} />

        {/* Área Principal de Conteúdo */}
        <main
          id="main-content"
          data-testid="main-content"
          style={{
            flex: 1,
            marginLeft: "240px",
            minHeight: "calc(100vh - 56px)",
            padding: "24px",
            display: "flex",
            flexDirection: "column",
            overflowX: "hidden",
            width: "calc(100% - 240px)",
          }}
          className="app-main-content"
        >
          {children || <Outlet />}
        </main>
      </div>
    </div>
  );
};
