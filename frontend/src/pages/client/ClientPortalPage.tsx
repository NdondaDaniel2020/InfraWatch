import React, { useCallback, useState } from "react";
import {
  Building2,
  CloudOff,
  Headphones,
  RefreshCw,
} from "lucide-react";

import {
  MOCK_CLIENT_SERVICES,
  MOCK_CLIENT_SLA_SUMMARY,
  type ClientServiceItem,
  type ClientSlaSummary,
} from "../../mocks/clientPortalMocks";
import { SlaKpiCards } from "../../components/client/SlaKpiCards";
import { SanitizedServicesGrid } from "../../components/client/SanitizedServicesGrid";
import { pdfExportService } from "../../services/pdfExportService";
import { useAuth } from "../../context/AuthContext";

export type PortalViewState = "nominal" | "skeleton" | "empty" | "error";

export interface ClientPortalPageProps {
  initialViewState?: PortalViewState;
}

export const ClientPortalPage: React.FC<ClientPortalPageProps> = ({
  initialViewState = "nominal",
}) => {
  const { user } = useAuth();
  const [viewState, setViewState] = useState<PortalViewState>(initialViewState);
  const [slaSummary] = useState<ClientSlaSummary>(() => ({
    ...MOCK_CLIENT_SLA_SUMMARY,
    tenantName: user?.organization_name || MOCK_CLIENT_SLA_SUMMARY.tenantName,
  }));
  const [services] = useState<ClientServiceItem[]>(MOCK_CLIENT_SERVICES);
  const [isDownloadingPdf, setIsDownloadingPdf] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const displayTenantName = user?.organization_name || slaSummary.tenantName;
  const tenantInitials = displayTenantName
    .split(" ")
    .map((word) => word[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  // Exibe toast temporário
  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  }, []);

  // Download do Relatório de SLA em PDF
  const handleDownloadPdf = async () => {
    setIsDownloadingPdf(true);
    showToast("Compilando dados de SLA e gerando PDF...");
    const success = await pdfExportService.exportSlaPdf(slaSummary, services);
    setIsDownloadingPdf(false);
    if (success) {
      showToast("Download do relatório oficial de SLA concluído.");
    }
  };

  return (
    <main
      data-testid="client-portal-page"
      role="main"
      className="flex flex-col gap-6 w-full p-6 min-h-full relative text-slate-100"
    >
      {/* Toast Feedback */}
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
        {/* Identificação do Cliente & Escopo */}
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center font-mono font-bold text-sm text-emerald-400 shadow-sm">
            {tenantInitials}
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

        {/* Central de Notificações, Simulador de Estados & Ações */}
        <div className="flex items-center gap-3 flex-wrap">
          {/* Status Geral em Tempo Real */}
          <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#080c14] border border-white/5 text-xs font-mono">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-slate-300">Telemetria Ativa</span>
            <span className="text-white font-bold">100% Nominal</span>
          </div>

          {/* Botão Suporte Prioritário 24/7 */}
          <button
            type="button"
            data-testid="priority-support-btn"
            onClick={() => showToast("Canal prioritário com o NOC aberto via WhatsApp / GLPI.")}
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
        {/* ESTADO 1: SKELETON LOADING OVERLAY */}
        {viewState === "skeleton" && (
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

        {/* ESTADO 2: EMPTY STATE OVERLAY */}
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
              onClick={() => setViewState("nominal")}
              className="px-5 py-2.5 rounded-full bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs cursor-pointer shadow-md"
            >
              Voltar ao Modo Nominal
            </button>
          </div>
        )}

        {/* ESTADO 3: ERROR BOUNDARY OVERLAY */}
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
              Não foi possível estabelecer contato com a infraestrutura de telemetria do cluster.
            </p>
            <button
              type="button"
              onClick={() => {
                setViewState("nominal");
                showToast("Conexão com os serviços de telemetria restabelecida.");
              }}
              className="px-5 py-2.5 rounded-full bg-rose-500 hover:bg-rose-400 text-white font-bold text-xs cursor-pointer shadow-md flex items-center gap-2"
            >
              <RefreshCw size={14} />
              <span>Reconectar Telemetria</span>
            </button>
          </div>
        )}

        {/* BANNER EXECUTIVO DE SLA & KPIs */}
        <SlaKpiCards
          summary={slaSummary}
          onDownloadPdf={handleDownloadPdf}
          onViewHistory={() => showToast("Histórico de SLA dos últimos 12 meses carregado.")}
          isDownloadingPdf={isDownloadingPdf}
        />

        {/* GRID DE SERVIÇOS CRÍTICOS CONTRATADOS */}
        <SanitizedServicesGrid services={services} />
      </div>
      
    </main>
  );
};
