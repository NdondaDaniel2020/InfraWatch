import React, { useCallback, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Building2,
  CloudOff,
  Headphones,
  RefreshCw,
} from "lucide-react";

import { SlaKpiCards } from "../../components/client/SlaKpiCards";
import { SanitizedServicesGrid } from "../../components/client/SanitizedServicesGrid";
import { SlaHistoryModal } from "../../components/client/SlaHistoryModal";
import { ClientSupportModal } from "../../components/client/ClientSupportModal";
import { pdfExportService } from "../../services/pdfExportService";
import { clientPortalApi } from "../../services/clientPortalApi";
import { useAuth } from "../../context/AuthContext";
import type { ClientServiceItem } from "../../types/clientPortal";

export type PortalViewState = "loading" | "nominal" | "empty" | "error";

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

  return (
    <main
      data-testid="client-portal-page"
      role="main"
      className="flex flex-col gap-6 w-full p-6 min-h-full relative text-slate-100"
    >
      {toastMessage && (
        <aside
          data-testid="toast-notification"
          aria-live="polite"
          className="fixed top-20 right-6 z-[9999] px-4 py-2.5 rounded-xl bg-[#0d1424]/95 border border-emerald-500/30 text-emerald-400 text-xs font-mono shadow-2xl flex items-center gap-2 backdrop-blur-md animate-fadeIn"
        >
          <span className="w-2 h-2 rounded-full bg-emerald-400" />
          <span>{toastMessage}</span>
        </aside>
      )}

      {/* ===================================================================== */}
      {/* 1. TOP CLIENT HEADER TOOLBAR (Escopo Sanitizado, Notificações e Ações) */}
      {/* ===================================================================== */}
      <section
        role="toolbar"
        aria-label="Barra de Ações do Portal do Cliente"
        className="w-full p-4 bg-[#0d1424]/80 border border-white/10 rounded-2xl flex items-center justify-between flex-wrap gap-4 backdrop-blur-md relative z-30"
      >
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center font-mono font-bold text-sm text-emerald-400 shadow-sm">
            {tenantInitials || "—"}
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-base sm:text-lg font-bold text-white tracking-tight m-0">
                {displayTenantName}
              </h1>
              <span
                data-testid="client-role-badge"
                className="px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-[10.5px] font-mono font-bold"
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
          </div>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          {viewState === "nominal" && (
            <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#080c14] border border-white/5 text-xs font-mono">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-slate-300">Telemetria Ativa</span>
              <span className={`font-bold ${telemetryColor}`}>{telemetryLabel}</span>
            </div>
          )}

          <button
            type="button"
            data-testid="priority-support-btn"
            onClick={() => setIsSupportModalOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-medium text-slate-200 hover:text-white transition-colors cursor-pointer"
          >
            <Headphones size={15} className="text-sky-400" />
            <span className="hidden sm:inline">Suporte 24/7</span>
          </button>
        </div>
      </section>

      {/* ===================================================================== */}
      {/* 2. CONTEÚDO PRINCIPAL COM OVERLAYS DE ESTADO                           */}
      {/* ===================================================================== */}
      <div className="relative flex flex-col gap-6 min-h-[500px]">
        {viewState === "loading" && (
          <div
            data-testid="state-skeleton-overlay"
            className="absolute inset-0 bg-[#070a12]/95 backdrop-blur-sm z-40 p-6 flex flex-col gap-6 rounded-3xl animate-pulse"
          >
            <div className="h-44 bg-[#0d1424] rounded-3xl border border-white/10" />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-40 bg-[#0d1424] rounded-2xl border border-white/10" />
              ))}
            </div>
            <div className="h-64 bg-[#0d1424] rounded-2xl border border-white/10" />
          </div>
        )}

        {viewState === "empty" && (
          <div
            data-testid="state-empty-overlay"
            className="absolute inset-0 bg-[#070a12]/95 backdrop-blur-sm z-40 p-12 flex flex-col items-center justify-center rounded-3xl"
          >
            <div className="w-16 h-16 rounded-2xl bg-sky-500/10 border border-sky-500/30 flex items-center justify-center text-sky-400 mb-4">
              <Building2 size={32} />
            </div>
            <h2 className="text-xl font-bold text-white mb-1.5">
              Nenhum Serviço Corporativo Vinculado
            </h2>
            <p className="text-sm text-slate-400 text-center max-w-md mb-5">
              Não foram encontrados enlaces ou serviços associados à sua organização no momento.
            </p>
            <button
              type="button"
              onClick={refetchAll}
              className="px-5 py-2.5 rounded-full bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs cursor-pointer shadow-md"
            >
              Atualizar Dados
            </button>
          </div>
        )}

        {viewState === "error" && (
          <div
            data-testid="state-error-overlay"
            className="absolute inset-0 bg-[#070a12]/95 backdrop-blur-sm z-40 p-12 flex flex-col items-center justify-center rounded-3xl"
          >
            <div className="w-16 h-16 rounded-2xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-center text-rose-400 mb-4">
              <CloudOff size={32} />
            </div>
            <h2 className="text-xl font-bold text-rose-400 mb-1.5">
              Falha na Sincronização de Telemetria
            </h2>
            <p className="text-sm text-slate-400 text-center max-w-md mb-5">
              Não foi possível obter os dados oficiais do backend. Nenhum dado de demonstração
              está a ser apresentado.
            </p>
            <button
              type="button"
              onClick={refetchAll}
              className="px-5 py-2.5 rounded-full bg-rose-500 hover:bg-rose-400 text-white font-bold text-xs cursor-pointer shadow-md flex items-center gap-2"
            >
              <RefreshCw size={14} />
              <span>Tentar Novamente</span>
            </button>
          </div>
        )}

        {slaSummary && (
          <SlaKpiCards
            summary={slaSummary}
            onDownloadPdf={handleDownloadPdf}
            onViewHistory={() => setIsHistoryModalOpen(true)}
            isDownloadingPdf={isDownloadingPdf}
          />
        )}

        <SanitizedServicesGrid services={services} />
      </div>

      <SlaHistoryModal
        isOpen={isHistoryModalOpen}
        onClose={() => setIsHistoryModalOpen(false)}
        organizationId={user?.organization_id}
        tenantName={displayTenantName}
        onExportPdf={handleDownloadPdf}
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
