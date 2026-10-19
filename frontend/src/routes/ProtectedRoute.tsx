import React from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import type { UserRole } from "../types/auth";
import { Skeleton } from "../components/ui/Skeleton";

export interface ProtectedRouteProps {
  allowedRoles?: UserRole[];
  children?: React.ReactNode;
}

/**
 * Guard de autenticação e controle de acesso baseado em papéis (RBAC).
 * Redireciona usuários não autenticados para /login preservando o destino via state.from.
 * Bloqueia acessos indevidos conforme allowedRoles.
 */
export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({
  allowedRoles,
  children,
}) => {
  const { user, isAuthenticated, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div
        data-testid="route-loading"
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "var(--color-bg-deep)",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: "12px", width: "300px" }}>
          <Skeleton height="32px" />
          <Skeleton height="16px" width="80%" />
          <Skeleton height="16px" width="60%" />
        </div>
      </div>
    );
  }

  if (!isAuthenticated || !user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (allowedRoles && allowedRoles.length > 0) {
    const hasPermission = allowedRoles.includes(user.role);
    if (!hasPermission) {
      // Clientes tentando acessar rotas do NOC são encaminhados diretamente ao portal
      if (user.role === "CLIENT_VIEWER") {
        return <Navigate to="/portal" replace />;
      }
      return <Navigate to="/403" replace />;
    }
  }

  return children ? <>{children}</> : <Outlet />;
};
