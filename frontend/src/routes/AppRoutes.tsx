import React from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { ProtectedRoute } from "./ProtectedRoute";
import { AppLayout } from "../components/layout/AppLayout";
import { GlobalErrorBoundary } from "../components/common/GlobalErrorBoundary";
import { RouteLoadingFallback } from "../components/common/RouteLoadingFallback";
import { useAuth } from "../context/AuthContext";

// Lazy loading das páginas para code-splitting eficiente de rotas
const LoginPage = React.lazy(() =>
  import("../pages/auth/LoginPage").then((m) => ({ default: m.LoginPage }))
);
const MfaChallengePage = React.lazy(() =>
  import("../pages/auth/MfaChallengePage").then((m) => ({ default: m.MfaChallengePage }))
);
const GoogleCallbackPage = React.lazy(() =>
  import("../pages/auth/GoogleCallbackPage").then((m) => ({ default: m.GoogleCallbackPage }))
);
const ForgotPasswordPage = React.lazy(() =>
  import("../pages/auth/ForgotPasswordPage").then((m) => ({ default: m.ForgotPasswordPage }))
);
const ResetPasswordPage = React.lazy(() =>
  import("../pages/auth/ResetPasswordPage").then((m) => ({ default: m.ResetPasswordPage }))
);
const SecuritySettingsPage = React.lazy(() =>
  import("../pages/settings/SecuritySettingsPage").then((m) => ({ default: m.SecuritySettingsPage }))
);
const AccessDeniedPage = React.lazy(() =>
  import("../pages/error/AccessDeniedPage").then((m) => ({ default: m.AccessDeniedPage }))
);
const NotFoundPage = React.lazy(() =>
  import("../pages/error/NotFoundPage").then((m) => ({ default: m.NotFoundPage }))
);
const NocDashboardPage = React.lazy(() =>
  import("../pages/noc/NocDashboardPage").then((m) => ({ default: m.NocDashboardPage }))
);
const ClientPortalPage = React.lazy(() =>
  import("../pages/client/ClientPortalPage").then((m) => ({ default: m.ClientPortalPage }))
);
const IncidentManagement = React.lazy(() =>
  import("../pages/IncidentManagement").then((m) => ({ default: m.IncidentManagement }))
);
const DeviceListPage = React.lazy(() =>
  import("../pages/inventory/DeviceListPage").then((m) => ({ default: m.DeviceListPage }))
);
const DeviceDetailPage = React.lazy(() =>
  import("../pages/inventory/DeviceDetailPage").then((m) => ({ default: m.DeviceDetailPage }))
);
const MaintenanceWindowsPage = React.lazy(() =>
  import("../pages/sla/MaintenanceWindowsPage").then((m) => ({ default: m.MaintenanceWindowsPage }))
);
const SlaReportsPage = React.lazy(() =>
  import("../pages/sla/SlaReportsPage").then((m) => ({ default: m.SlaReportsPage }))
);
const AuditLogsPage = React.lazy(() =>
  import("../pages/audit/AuditLogsPage").then((m) => ({ default: m.AuditLogsPage }))
);
const AdminManagementPage = React.lazy(() =>
  import("../pages/admin/AdminManagementPage").then((m) => ({ default: m.AdminManagementPage }))
);
const TopologyMapPage = React.lazy(() =>
  import("../pages/topology/TopologyMapPage").then((m) => ({ default: m.TopologyMapPage }))
);
const BackupRecoveryPage = React.lazy(() =>
  import("../pages/backup/BackupRecoveryPage").then((m) => ({ default: m.BackupRecoveryPage }))
);
const SystemSettingsPage = React.lazy(() =>
  import("../pages/settings/SystemSettingsPage").then((m) => ({ default: m.SystemSettingsPage }))
);

/**
 * Componente de roteamento para a raiz "/".
 * Encaminha operadores para o cockpit NOC (/noc) e clientes para o portal (/portal).
 */
const RootRedirect: React.FC = () => {
  const { user } = useAuth();
  if (user?.role === "CLIENT_VIEWER" || user?.role === "ORG_ADMIN") {
    return <Navigate to="/portal" replace />;
  }
  return <Navigate to="/noc" replace />;
};

export const AppRoutes: React.FC = () => {
  return (
    <GlobalErrorBoundary>
      <React.Suspense fallback={<RouteLoadingFallback />}>
        <Routes>
          {/* ================================================================= */}
          {/* 1. ROTAS PÚBLICAS                                                */}
          {/* ================================================================= */}
          <Route path="/login" element={<LoginPage />} />
          <Route path="/login/mfa-challenge" element={<MfaChallengePage />} />
          <Route path="/auth/callback" element={<GoogleCallbackPage />} />
          <Route path="/auth/callback/google" element={<GoogleCallbackPage />} />
          <Route path="/password-reset" element={<ForgotPasswordPage />} />
          <Route path="/password-reset/confirm" element={<ResetPasswordPage />} />
          <Route path="/auth/reset-password" element={<ResetPasswordPage />} />

          {/* ================================================================= */}
          {/* 2. ROTAS PROTEGIDAS DENTRO DO SHELL APPLAYOUT                     */}
          {/* ================================================================= */}
          <Route element={<ProtectedRoute />}>
            <Route element={<AppLayout />}>
              {/* Raiz redireciona conforme papel */}
              <Route path="/" element={<RootRedirect />} />

              {/* Rotas Operacionais do NOC (SUPER_ADMIN, NOC_OPERATOR) */}
              <Route
                path="/noc"
                element={
                  <ProtectedRoute allowedRoles={["SUPER_ADMIN", "NOC_OPERATOR"]}>
                    <NocDashboardPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/devices"
                element={
                  <ProtectedRoute allowedRoles={["SUPER_ADMIN", "NOC_OPERATOR", "ORG_ADMIN"]}>
                    <DeviceListPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/devices/:id"
                element={
                  <ProtectedRoute allowedRoles={["SUPER_ADMIN", "NOC_OPERATOR", "ORG_ADMIN"]}>
                    <DeviceDetailPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/devices/:id/edit"
                element={
                  <ProtectedRoute allowedRoles={["SUPER_ADMIN", "NOC_OPERATOR", "ORG_ADMIN"]}>
                    <DeviceDetailPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/incidents"
                element={
                  <ProtectedRoute allowedRoles={["SUPER_ADMIN", "NOC_OPERATOR", "ORG_ADMIN"]}>
                    <IncidentManagement />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/topology"
                element={
                  <ProtectedRoute allowedRoles={["SUPER_ADMIN", "NOC_OPERATOR"]}>
                    <TopologyMapPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/maintenance"
                element={
                  <ProtectedRoute allowedRoles={["SUPER_ADMIN", "NOC_OPERATOR", "ORG_ADMIN"]}>
                    <MaintenanceWindowsPage />
                  </ProtectedRoute>
                }
              />

              {/* Relatórios de SLA (Operadores, Gestores e Clientes) */}
              <Route
                path="/sla"
                element={
                  <ProtectedRoute
                    allowedRoles={["SUPER_ADMIN", "NOC_OPERATOR", "ORG_ADMIN", "CLIENT_VIEWER"]}
                  >
                    <SlaReportsPage />
                  </ProtectedRoute>
                }
              />

              {/* Rotas Administrativas e Auditoria */}
              <Route
                path="/audit"
                element={
                  <ProtectedRoute allowedRoles={["SUPER_ADMIN", "ORG_ADMIN"]}>
                    <AuditLogsPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin/audit"
                element={
                  <ProtectedRoute allowedRoles={["SUPER_ADMIN", "ORG_ADMIN"]}>
                    <AuditLogsPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin/management"
                element={
                  <ProtectedRoute allowedRoles={["SUPER_ADMIN", "ORG_ADMIN"]}>
                    <AdminManagementPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/dr"
                element={
                  <ProtectedRoute allowedRoles={["SUPER_ADMIN"]}>
                    <BackupRecoveryPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/settings/backup"
                element={
                  <ProtectedRoute allowedRoles={["SUPER_ADMIN"]}>
                    <BackupRecoveryPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/settings"
                element={
                  <ProtectedRoute allowedRoles={["SUPER_ADMIN"]}>
                    <SystemSettingsPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/settings/system"
                element={
                  <ProtectedRoute allowedRoles={["SUPER_ADMIN"]}>
                    <SystemSettingsPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/security"
                element={
                  <ProtectedRoute allowedRoles={["SUPER_ADMIN"]}>
                    <SecuritySettingsPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/settings/security"
                element={
                  <ProtectedRoute allowedRoles={["SUPER_ADMIN"]}>
                    <SecuritySettingsPage />
                  </ProtectedRoute>
                }
              />

              {/* Portal do Cliente (CLIENT_VIEWER, ORG_ADMIN, SUPER_ADMIN) */}
              <Route
                path="/portal"
                element={
                  <ProtectedRoute
                    allowedRoles={["CLIENT_VIEWER", "ORG_ADMIN", "SUPER_ADMIN"]}
                  >
                    <ClientPortalPage />
                  </ProtectedRoute>
                }
              />

              {/* Tratamento de Erros dentro do Shell */}
              <Route path="/403" element={<AccessDeniedPage />} />
              <Route path="*" element={<NotFoundPage />} />
            </Route>
          </Route>
        </Routes>
      </React.Suspense>
    </GlobalErrorBoundary>
  );
};
