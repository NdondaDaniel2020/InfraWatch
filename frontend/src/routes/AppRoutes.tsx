import React from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { ProtectedRoute } from "./ProtectedRoute";
import { AppLayout } from "../components/layout/AppLayout";
import { GlobalErrorBoundary } from "../components/common/GlobalErrorBoundary";
import { LoginPage, LoginTestPage } from "../pages/auth/LoginPage";
import { DeviceFormPreviewPage } from "../pages/dev/DeviceFormPreviewPage";
import { MfaChallengePage } from "../pages/auth/MfaChallengePage";
import { GoogleCallbackPage } from "../pages/auth/GoogleCallbackPage";
import { ForgotPasswordPage } from "../pages/auth/ForgotPasswordPage";
import { ResetPasswordPage } from "../pages/auth/ResetPasswordPage";
import { SecuritySettingsPage } from "../pages/settings/SecuritySettingsPage";
import { AccessDeniedPage } from "../pages/error/AccessDeniedPage";
import { NotFoundPage } from "../pages/error/NotFoundPage";
import { NocDashboardPage } from "../pages/noc/NocDashboardPage";
import { ClientPortalPage } from "../pages/client/ClientPortalPage";
import { TvWallboardPage } from "../pages/wallboard/TvWallboardPage";
import { IncidentManagement } from "../pages/IncidentManagement";
import { DeviceListPage } from "../pages/inventory/DeviceListPage";
import { DeviceDetailPage } from "../pages/inventory/DeviceDetailPage";
import { MaintenanceWindowsPage } from "../pages/sla/MaintenanceWindowsPage";
import { SlaReportsPage } from "../pages/sla/SlaReportsPage";
import { AuditLogsPage } from "../pages/audit/AuditLogsPage";
import { AdminManagementPage } from "../pages/admin/AdminManagementPage";
import { TopologyMapPage } from "../pages/topology/TopologyMapPage";
import { BackupRecoveryPage } from "../pages/backup/BackupRecoveryPage";
import { SystemSettingsPage } from "../pages/settings/SystemSettingsPage";
import { useAuth } from "../context/AuthContext";

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
      <Routes>
        {/* ================================================================= */}
        {/* 1. ROTAS PÚBLICAS                                                */}
        {/* ================================================================= */}
        <Route path="/login" element={<LoginPage />} />
        <Route path="/login/mfa-challenge" element={<MfaChallengePage />} />
        <Route path="/login-test" element={<LoginTestPage />} />
        <Route path="/dev/login" element={<LoginTestPage />} />
        <Route path="/dev/device-form" element={<DeviceFormPreviewPage />} />
        <Route path="/auth/callback" element={<GoogleCallbackPage />} />
        <Route path="/auth/callback/google" element={<GoogleCallbackPage />} />
        <Route path="/password-reset" element={<ForgotPasswordPage />} />
        <Route path="/password-reset/confirm" element={<ResetPasswordPage />} />
        <Route path="/auth/reset-password" element={<ResetPasswordPage />} />

        {/* ================================================================= */}
        {/* 2. MODO TV WALLBOARD (Protegido, sem Moldura Lateral da Shell)    */}
        {/* ================================================================= */}
        <Route
          path="/tv"
          element={
            <ProtectedRoute allowedRoles={["SUPER_ADMIN", "NOC_OPERATOR"]}>
              <TvWallboardPage />
            </ProtectedRoute>
          }
        />

        {/* ================================================================= */}
        {/* 3. ROTAS PROTEGIDAS DENTRO DO SHELL APPLAYOUT                     */}
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
    </GlobalErrorBoundary>
  );
};
