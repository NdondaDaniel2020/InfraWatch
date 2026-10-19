import React from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { ProtectedRoute } from "./ProtectedRoute";
import { AppLayout } from "../components/layout/AppLayout";
import { GlobalErrorBoundary } from "../components/common/GlobalErrorBoundary";
import { LoginPage } from "../pages/auth/LoginPage";
import { AccessDeniedPage } from "../pages/error/AccessDeniedPage";
import { NotFoundPage } from "../pages/error/NotFoundPage";
import { NocDashboardPage } from "../pages/noc/NocDashboardPage";
import { ClientPortalPage } from "../pages/client/ClientPortalPage";
import { TvWallboardPage } from "../pages/wallboard/TvWallboardPage";
import { PlaceholderPage } from "../pages/common/PlaceholderPage";
import { useAuth } from "../context/AuthContext";

/**
 * Componente de roteamento para a raiz "/".
 * Encaminha operadores para o cockpit NOC (/noc) e clientes para o portal (/portal).
 */
const RootRedirect: React.FC = () => {
  const { user } = useAuth();
  if (user?.role === "CLIENT_VIEWER") {
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
        <Route
          path="/auth/callback"
          element={
            <PlaceholderPage
              title="Autenticação Social OAuth2"
              description="Validando handshake seguro e claims do usuário..."
              testId="auth-callback-page"
            />
          }
        />
        <Route
          path="/password-reset"
          element={
            <PlaceholderPage
              title="Redefinição de Senha"
              description="Fluxo de recuperação com envio de link assinado por e-mail."
              testId="password-reset-page"
            />
          }
        />

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
                <ProtectedRoute allowedRoles={["SUPER_ADMIN", "NOC_OPERATOR"]}>
                  <PlaceholderPage
                    title="Inventário de Ativos & Dispositivos"
                    description="Gestão centralizada de sondas ICMP, HTTP, TCP, Docker e Heartbeats."
                    testId="devices-page"
                  />
                </ProtectedRoute>
              }
            />
            <Route
              path="/incidents"
              element={
                <ProtectedRoute allowedRoles={["SUPER_ADMIN", "NOC_OPERATOR"]}>
                  <PlaceholderPage
                    title="Central de Incidentes & Alarmes"
                    description="Fila de incidentes em tempo real e abertura de tickets no GLPI via Outbox."
                    testId="incidents-page"
                  />
                </ProtectedRoute>
              }
            />
            <Route
              path="/topology"
              element={
                <ProtectedRoute allowedRoles={["SUPER_ADMIN", "NOC_OPERATOR"]}>
                  <PlaceholderPage
                    title="Topologia de Rede Interativa"
                    description="Visualização em grafo de nós de borda, switches de agregação e enlaces."
                    testId="topology-page"
                  />
                </ProtectedRoute>
              }
            />
            <Route
              path="/maintenance"
              element={
                <ProtectedRoute allowedRoles={["SUPER_ADMIN", "NOC_OPERATOR"]}>
                  <PlaceholderPage
                    title="Janelas de Manutenção Programada"
                    description="Isenção de alarmes e expurgo automático de cálculo de downtime no SLA."
                    testId="maintenance-page"
                  />
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
                  <PlaceholderPage
                    title="Relatórios Analíticos de SLA"
                    description="Disponibilidade acumulada, MTTR, MTBF e exportação em CSV/JSON."
                    testId="sla-page"
                  />
                </ProtectedRoute>
              }
            />

            {/* Rotas Exclusivas SUPER_ADMIN */}
            <Route
              path="/audit"
              element={
                <ProtectedRoute allowedRoles={["SUPER_ADMIN"]}>
                  <PlaceholderPage
                    title="Trilha de Auditoria Forense"
                    description="Logs de auditoria append-only e prova de integridade da cadeia SHA-256."
                    testId="audit-page"
                  />
                </ProtectedRoute>
              }
            />
            <Route
              path="/dr"
              element={
                <ProtectedRoute allowedRoles={["SUPER_ADMIN"]}>
                  <PlaceholderPage
                    title="Backup & Recuperação de Desastres (DR)"
                    description="Disparo manual assíncrono e monitoramento em tempo real via SSE."
                    testId="dr-page"
                  />
                </ProtectedRoute>
              }
            />
            <Route
              path="/security"
              element={
                <ProtectedRoute allowedRoles={["SUPER_ADMIN"]}>
                  <PlaceholderPage
                    title="Segurança, Perfis & Gestão RBAC"
                    description="Controle de usuários, sessões ativas e ativação de MFA TOTP."
                    testId="security-page"
                  />
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
