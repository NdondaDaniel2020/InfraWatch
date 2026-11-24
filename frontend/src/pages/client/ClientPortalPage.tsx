import React, { useCallback, useState } from "react";
import { Link, useInRouterContext } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  Building2,
  CloudOff,
  Headphones,
  RefreshCw,
} from "lucide-react";

import { SlaKpiCards } from "../../components/client/SlaKpiCards";
import { SanitizedServicesGrid } from "../../components/client/SanitizedServicesGrid";
import { ClientPortalSkeleton } from "../../components/client/ClientPortalSkeleton";
import { SlaHistoryModal } from "../../components/client/SlaHistoryModal";
import { ClientSupportModal } from "../../components/client/ClientSupportModal";
import { pdfExportService } from "../../services/pdfExportService";
import { clientPortalApi } from "../../services/clientPortalApi";
import { useAuth } from "../../context/AuthContext";
import type {
  ClientServiceItem,
  SlaHistoryExportPayload,
} from "../../types/clientPortal";

export type PortalViewState = "loading" | "nominal" | "empty" | "error";

const BreadcrumbLink: React.FC<{
  to: string;
  className?: string;
  children: React.ReactNode;
}> = ({ to, className, children }) => {
  const inRouter = useInRouterContext();
  if (inRouter) {
    return (
      <Link to={to} className={className}>
        {children}
      </Link>
    );
  }
  return (
    <a href={to} className={className}>
      {children}
    </a>
  );
};

export const ClientPortalPage: React.FC = () => {
  const { user } = useAuth();
  const [isDownloadingPdf, setIsDownloadingPdf] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
  const [isSupportModalOpen, setIsSupportModalOpen] = useState(false);

  const summaryQuery = useQuery({
    queryKey: ["clientPortal", "slaSummary", user?.organization_id],
    queryFn: () => clientPortalApi.getSlaSummary(user?.organization_id),
    enabled: Boolean(user),
    staleTime: 30_000,
  });

  const servicesQuery = useQuery({
    queryKey: ["clientPortal", "services", user?.organization_id],
    queryFn: () => clientPortalApi.getClientServices(user?.organization_id),
    enabled: Boolean(user),
    staleTime: 30_000,
  });

  const slaSummary = summaryQuery.data;
  const services: ClientServiceItem[] = servicesQuery.data ?? [];

  const viewState: PortalViewState =
    summaryQuery.isPending || servicesQuery.isPending
      ? "loading"
      : summaryQuery.isError || servicesQuery.isError
      ? "error"
      : !slaSummary || services.length === 0
      ? "empty"
      : "nominal";

  const displayTenantName =
    user?.organization_name || slaSummary?.tenantName || "Organização";
  const tenantInitials = displayTenantName
    .split(" ")
    .filter(Boolean)
    .map((word) => word[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const downCount = services.filter((svc) => svc.status === "DOWN").length;
  const degradedCount = services.filter((svc) => svc.status === "DEG").length;
  const allServicesNominal =
    services.length > 0 && downCount === 0 && degradedCount === 0;
  const telemetryLabel = allServicesNominal
    ? "100% Nominal"
    : downCount > 0
    ? `${downCount} serviço(s) em falha`
    : `${degradedCount} serviço(s) degradado(s)`;
  const telemetryColor = allServicesNominal
    ? "text-emerald-400"
    : downCount > 0
    ? "text-rose-400"
    : "text-amber-400";

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  }, []);

  const refetchAll = useCallback(async () => {
    await Promise.all([summaryQuery.refetch(), servicesQuery.refetch()]);
  }, [summaryQuery, servicesQuery]);

  const handleDownloadPdf = async () => {
    if (!slaSummary || services.length === 0) {
      showToast("Dados insuficientes para gerar o relatório oficial de SLA.");
      return;
    }

    setIsDownloadingPdf(true);
    showToast("Consultando dados oficiais de telemetria e compilando laudo de SLA...");
    try {
      // Obtenção dos dados oficiais e compilação assíncrona do laudo com paginação dinâmica
      const reportData = await clientPortalApi.getSlaReport(user?.organization_id);
      const success = await pdfExportService.exportSlaPdf(
        slaSummary,
        services,
        reportData
      );
      if (!success) {
        throw new Error("Falha ao gerar o documento PDF.");
      }
      showToast("Download do relatório oficial de SLA concluído com assinatura digital.");
    } catch {
      showToast(
        "Não foi possível obter o relatório oficial de SLA. Nenhum documento foi gerado."
      );
    } finally {
      setIsDownloadingPdf(false);
    }
  };

  const handleExportHistoryPdf = async (payload: SlaHistoryExportPayload) => {
    showToast(
      `Compilando laudo de auditoria histórica (${payload.selectedMonths} meses)...`
    );
    try {
      const success = await pdfExportService.exportSlaHistoryPdf(payload);
      if (!success) {
        throw new Error("Falha ao gerar o documento PDF.");
      }
      showToast(
        `Download do laudo de auditoria histórica (${payload.selectedMonths} meses) concluído com sucesso.`
      );
    } catch {
      showToast(
        "Não foi possível obter o laudo de auditoria histórica de SLA. Nenhum documento foi gerado."
      );
    }
  };

  return (
    <main
      data-testid="client-portal-page"
      role="main"
      className="flex flex-col gap-6 w-full p-6 md:p-8 min-h-screen bg-obsidian-950 text-slate-100"
    >
      {/* Toast Notification para feedback operacional e testes */}
      {toastMessage && (
        <aside
          data-testid="toast-notification"
          aria-live="polite"
          className="fixed top-20 right-6 z-[9999] px-4 py-2.5 rounded-lg bg-obsidian-900 border border-emerald-500/40 text-emerald-400 text-xs font-mono shadow-2xl flex items-center gap-2 backdrop-blur-md animate-fadeIn"
        >
          <span className="w-2 h-2 rounded-full bg-emerald-400" />
          <span>{toastMessage}</span>
        </aside>
      )}

      {/* ===================================================================== */}
      {/* 1. TOP CLIENT HEADER TOOLBAR (Breadcrumb, Identidade e Ações)         */}
      {/* ===================================================================== */}
      <div className="flex flex-col gap-3">
        {/* Breadcrumb Institucional */}
        <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-xs font-mono text-slate-400">
          <BreadcrumbLink to="/portal" className="hover:text-slate-200 transition-colors">
            Portal do Cliente
          </BreadcrumbLink>
          <span>/</span>
          <span className="text-emerald-400 font-semibold">Visão Geral Executiva</span>
        </nav>

        {/* Toolbar Superior */}
        <header
          role="toolbar"
          aria-label="Barra de Ações do Portal do Cliente"
          className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-obsidian-800"
        >
          <div className="flex items-center gap-4">
            <div className="w-11 h-11 rounded-xl bg-emerald-500/10 border border-emerald-500/25 flex items-center justify-center font-mono font-bold text-base text-emerald-400 shadow-sm shrink-0">
              {tenantInitials || "—"}
            </div>
            <div>
              <div className="flex items-center gap-2.5 flex-wrap">
                <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight m-0 font-sans">
                  {displayTenantName}
                </h1>
                <span
                  data-testid="client-role-badge"
                  className="px-2.5 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/25 text-emerald-400 text-xs font-mono font-semibold"
                >
                  {user?.role === "ORG_ADMIN"
                    ? "Org Admin"
                    : user?.role === "SUPER_ADMIN"
                    ? "Super Admin (Visão Global)"
                    : user?.role === "NOC_OPERATOR"
                    ? "NOC Operator (Suporte)"
                    : "Client Viewer (Read-Only)"}
                </span>
              </div>
              <p className="text-xs font-mono text-slate-400 mt-0.5 mb-0">
                SLA Contratual, Saúde de Serviços Críticos e Auditoria Sanitizada
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            {viewState === "nominal" && (
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-obsidian-900 border border-obsidian-800 text-xs font-mono">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-slate-400">Telemetria:</span>
                <span className={`font-semibold ${telemetryColor}`}>{telemetryLabel}</span>
              </div>
            )}

            <button
              type="button"
              data-testid="priority-support-btn"
              onClick={() => setIsSupportModalOpen(true)}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-obsidian-850 hover:bg-obsidian-800 border border-obsidian-750 text-xs font-mono font-semibold text-slate-200 hover:text-white transition-colors cursor-pointer shadow-sm"
            >
              <Headphones size={15} className="text-sky-400" />
              <span>Suporte 24/7</span>
            </button>
          </div>
        </header>
      </div>

      {/* ===================================================================== */}
      {/* 2. CONTEÚDO PRINCIPAL COM OVERLAYS DE ESTADO                           */}
      {/* ===================================================================== */}
      <div className="relative flex flex-col gap-6 min-h-[500px]">
        {viewState === "loading" && <ClientPortalSkeleton />}

        {viewState === "empty" && (
          <div
            data-testid="state-empty-overlay"
            className="absolute inset-0 bg-obsidian-950/95 border border-obsidian-800 backdrop-blur-sm z-40 p-12 flex flex-col items-center justify-center rounded-xl text-center"
          >
            <div className="w-16 h-16 rounded-xl bg-sky-500/10 border border-sky-500/30 flex items-center justify-center text-sky-400 mb-4">
              <Building2 size={32} />
            </div>
            <h2 className="text-xl font-bold text-white mb-1.5 font-sans">
              Nenhum Serviço Corporativo Vinculado
            </h2>
            <p className="text-xs font-mono text-slate-400 max-w-md mb-5">
              Não foram encontrados enlaces ou serviços associados à sua organização no momento.
            </p>
            <button
              type="button"
              onClick={refetchAll}
              className="px-5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-obsidian-950 font-bold text-xs font-mono cursor-pointer shadow-md transition-colors"
            >
              Atualizar Dados
            </button>
          </div>
        )}

        {viewState === "error" && (
          <div
            data-testid="state-error-overlay"
            className="absolute inset-0 bg-obsidian-950/95 border border-rose-500/30 backdrop-blur-sm z-40 p-12 flex flex-col items-center justify-center rounded-xl text-center"
          >
            <div className="w-16 h-16 rounded-xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-center text-rose-400 mb-4">
              <CloudOff size={32} />
            </div>
            <h2 className="text-xl font-bold text-rose-400 mb-1.5 font-sans">
              Falha na Sincronização de Telemetria
            </h2>
            <p className="text-xs font-mono text-slate-400 max-w-md mb-5">
              Não foi possível obter os dados oficiais do backend. Nenhum dado de demonstração
              está a ser apresentado.
            </p>
            <button
              type="button"
              onClick={refetchAll}
              className="px-5 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs font-mono cursor-pointer shadow-md flex items-center gap-2 transition-colors"
            >
              <RefreshCw size={14} />
              <span>Tentar Novamente</span>
            </button>
          </div>
        )}

        {viewState === "nominal" && slaSummary && (
          <SlaKpiCards
            summary={slaSummary}
            onDownloadPdf={handleDownloadPdf}
            onViewHistory={() => setIsHistoryModalOpen(true)}
            isDownloadingPdf={isDownloadingPdf}
          />
        )}

        {viewState === "nominal" && (
          <SanitizedServicesGrid services={services} />
        )}
      </div>

      <SlaHistoryModal
        isOpen={isHistoryModalOpen}
        onClose={() => setIsHistoryModalOpen(false)}
        organizationId={user?.organization_id}
        tenantName={displayTenantName}
        onExportPdf={handleExportHistoryPdf}
      />

      <ClientSupportModal
        isOpen={isSupportModalOpen}
        onClose={() => setIsSupportModalOpen(false)}
        organizationId={user?.organization_id}
        services={services}
        onTicketCreated={(ticket) => {
          showToast(`Chamado ${ticket.protocol} criado com sucesso no GLPI!`);
        }}
      />
    </main>
  );
};
