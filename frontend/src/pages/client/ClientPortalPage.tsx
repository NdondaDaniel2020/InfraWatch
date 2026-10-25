import React, { useCallback, useState } from "react";
import {
  Building2,
  CloudOff,
  Headphones,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";

import {
  MOCK_CLIENT_NOTIFICATIONS,
  MOCK_CLIENT_SERVICES,
  MOCK_CLIENT_SLA_SUMMARY,
  MOCK_SANITIZED_ENDPOINTS,
  type ClientNotification,
  type ClientServiceItem,
  type ClientSlaSummary,
  type SanitizedEndpoint,
} from "../../mocks/clientPortalMocks";
import { SlaKpiCards } from "../../components/client/SlaKpiCards";
import { SanitizedServicesGrid } from "../../components/client/SanitizedServicesGrid";
import { SanitizedEndpointsTable } from "../../components/client/SanitizedEndpointsTable";
import { NotificationCenter } from "../../components/notifications/NotificationCenter";
import { notificationsApi } from "../../services/notificationsApi";
import { pdfExportService } from "../../services/pdfExportService";

export type PortalViewState = "nominal" | "skeleton" | "empty" | "error";

export const ClientPortalPage: React.FC = () => {
  const [viewState, setViewState] = useState<PortalViewState>("nominal");
  const [slaSummary] = useState<ClientSlaSummary>(MOCK_CLIENT_SLA_SUMMARY);
  const [services] = useState<ClientServiceItem[]>(MOCK_CLIENT_SERVICES);
  const [endpoints] = useState<SanitizedEndpoint[]>(MOCK_SANITIZED_ENDPOINTS);
  const [notifications, setNotifications] = useState<ClientNotification[]>(MOCK_CLIENT_NOTIFICATIONS);
  const [unreadCount, setUnreadCount] = useState<number>(() =>
    MOCK_CLIENT_NOTIFICATIONS.filter((n) => !n.isRead).length
  );
  const [isDownloadingPdf, setIsDownloadingPdf] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Exibe toast temporário
  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  }, []);

  // Marcar todas as notificações como lidas
  const handleMarkAllRead = async () => {
    await notificationsApi.markAllAsRead();
    setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
    setUnreadCount(0);
    showToast("Todas as notificações foram marcadas como lidas.");
  };

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
    <div
      data-testid="client-portal-page"
      className="flex flex-col gap-6 w-full max-w-[1500px] mx-auto relative text-slate-100"
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
            BS
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-base sm:text-lg font-bold text-white tracking-tight m-0">
                {slaSummary.tenantName}
              </h1>
              <span
                data-testid="client-role-badge"
                className="px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-[10.5px] font-mono font-bold"
              >
                Client Viewer (Read-Only)
              </span>
            </div>
            <p className="text-xs text-slate-400 m-0 mt-0.5">
              Portal Executivo de Disponibilidade &amp; Conformidade de SLA (ADR-009)
            </p>
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

          {/* Central de Notificações In-App */}
          <NotificationCenter
            notifications={notifications}
            unreadCount={unreadCount}
            onMarkAllAsRead={handleMarkAllRead}
          />

          {/* Simulador de Estados (ai-mockup-rectifier) */}
          <div className="flex items-center gap-1.5 px-3 py-1 bg-[#080c14] rounded-full border border-white/10 text-xs font-mono">
            <span className="text-slate-400 text-[11px]">Estado:</span>
            <select
              data-testid="portal-state-select"
              value={viewState}
              onChange={(e) => setViewState(e.target.value as PortalViewState)}
              className="bg-transparent text-emerald-400 font-bold border-none outline-none cursor-pointer"
              aria-label="Simular estados da interface"
            >
              <option value="nominal" className="bg-[#0d1424] text-white">Nominal</option>
              <option value="skeleton" className="bg-[#0d1424] text-white">Skeleton Loading</option>
              <option value="empty" className="bg-[#0d1424] text-white">Empty State</option>
              <option value="error" className="bg-[#0d1424] text-white">Error Stream</option>
            </select>
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

        {/* TABELA DE ENDPOINTS SANITIZADOS */}
        <SanitizedEndpointsTable endpoints={endpoints} />
      </div>

      {/* ===================================================================== */}
      {/* 3. RODAPÉ INSTITUCIONAL & CONFORMIDADE                                 */}
      {/* ===================================================================== */}
      <footer className="w-full pt-4 pb-8 border-t border-white/5 flex flex-col sm:flex-row items-center justify-between text-xs font-mono text-slate-500 gap-2">
        <div className="flex items-center gap-2">
          <ShieldCheck size={14} className="text-emerald-500" />
          <span>Conformidade Regulatória BNA &amp; ISO 27001 • Sanitização Ativa (ADR-009)</span>
        </div>
        <span>InfraWatch Observability • RCS Angola</span>
      </footer>
    </div>
  );
};
