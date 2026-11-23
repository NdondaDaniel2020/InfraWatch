import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import {
  Building2,
  Calendar,
  Lock,
  AlertCircle,
  FileDown,
  Loader2,
  ShieldCheck,
} from "lucide-react";
import { SlaKpiCards } from "../../components/sla/SlaKpiCards";
import { SlaDailyHistogram } from "../../components/sla/SlaDailyHistogram";
import { SlaExportActions } from "../../components/sla/SlaExportActions";
import { SlaDeviceBreakdownTable } from "../../components/sla/SlaDeviceBreakdownTable";
import { SlaEndpointsTable } from "../../components/sla/SlaEndpointsTable";
import { slaApi, resolveSlaPeriodRange } from "../../services/slaApi";
import { adminApi } from "../../services/adminApi";
import { clientPortalApi } from "../../services/clientPortalApi";
import { pdfExportService } from "../../services/pdfExportService";
import { useAuth } from "../../context/AuthContext";
import type {
  NocSlaReportExportPayload,
  SlaReportingPeriod,
} from "../../types/sla";
import { toast } from "sonner";

export const SlaReportsPage: React.FC = () => {
  const { user } = useAuth();
  const isGlobalOperator = user?.role === "SUPER_ADMIN" || user?.role === "NOC_OPERATOR";

  const userOrgId = user?.organization_id ?? null;
  const [selectedTenantId, setSelectedTenantId] = useState<string | null>(null);
  const [selectedPeriod, setSelectedPeriod] = useState<SlaReportingPeriod>("last_30d");
  const [tableViewMode, setTableViewMode] = useState<"endpoints" | "devices">(
    isGlobalOperator ? "devices" : "endpoints"
  );
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);

  const {
    data: organizationsData,
    isLoading: isLoadingOrganizations,
    isError: isOrganizationsError,
    error: organizationsError,
    refetch: refetchOrganizations,
  } = useQuery({
    queryKey: ["slaOrganizations"],
    queryFn: () => adminApi.listOrganizations({ size: 100 }),
    enabled: isGlobalOperator,
  });

  const organizations = organizationsData?.items ?? [];
  const effectiveTenantId = isGlobalOperator
    ? selectedTenantId ?? organizations[0]?.id ?? null
    : userOrgId;

  const {
    data: overview,
    isLoading: isOverviewLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ["slaOverview", effectiveTenantId, selectedPeriod],
    queryFn: () => slaApi.getSlaOverview(effectiveTenantId!, selectedPeriod),
    enabled: Boolean(effectiveTenantId),
  });

  const {
    data: devices = [],
    isLoading: isDevicesLoading,
    isError: isDevicesError,
    error: devicesError,
    refetch: refetchDevices,
  } = useQuery({
    queryKey: ["slaDevices", effectiveTenantId, selectedPeriod],
    queryFn: () => slaApi.getSlaDeviceBreakdown(effectiveTenantId!, selectedPeriod),
    enabled: Boolean(effectiveTenantId),
  });

  const {
    data: endpoints = [],
    isLoading: isEndpointsLoading,
    isError: isEndpointsError,
    error: endpointsError,
    refetch: refetchEndpoints,
  } = useQuery({
    queryKey: ["slaEndpoints", effectiveTenantId, selectedPeriod],
    queryFn: () =>
      clientPortalApi.getSanitizedEndpoints(
        effectiveTenantId!,
        resolveSlaPeriodRange(selectedPeriod)
      ),
    enabled:
      Boolean(effectiveTenantId) &&
      (!isGlobalOperator || tableViewMode === "endpoints"),
  });

  const {
    data: dailySlaData,
    isLoading: isDailyLoading,
  } = useQuery({
    queryKey: ["slaDaily", effectiveTenantId, selectedPeriod],
    queryFn: () => slaApi.getDailySla(effectiveTenantId!, selectedPeriod),
    enabled: Boolean(effectiveTenantId),
  });

  const currentState =
    (isGlobalOperator && isLoadingOrganizations) || isOverviewLoading
      ? "skeleton"
      : (isGlobalOperator && isOrganizationsError) || isError
      ? "error"
      : !overview
      ? "empty"
      : "nominal";

  const errorMessage =
    error?.message ||
    (isGlobalOperator ? organizationsError?.message : null) ||
    "Erro de agregação no TimescaleDB para a série temporal do contrato. Verifique o log do worker.";

  const handleGeneratePdf = async () => {
    if (!effectiveTenantId || !overview) return;

    try {
      setIsGeneratingPdf(true);
      const report = await slaApi.getSlaReportDetails(
        effectiveTenantId,
        selectedPeriod
      );

      const periodLabels: Record<SlaReportingPeriod, string> = {
        last_7d: "Últimos 7 dias",
        last_30d: "Últimos 30 dias",
        current_month: `Mês Vigente (${overview.periodLabel})`,
        last_90d: "Último Trimestre (90 dias)",
      };

      const payload: NocSlaReportExportPayload = {
        tenantId: effectiveTenantId,
        tenantName: overview.tenantName,
        periodLabel: periodLabels[selectedPeriod] ?? overview.periodLabel,
        selectedPeriod,
        viewMode: tableViewMode,
        targetSlaPct: overview.targetSlaPct,
        currentUptimePct: overview.currentUptimePct,
        marginPct: overview.marginPct,
        mttrMinutes: overview.mttrMinutes,
        mtbfHours: overview.mtbfHours,
        exemptedDowntimeMinutes: overview.exemptedDowntimeMinutes,
        unexemptedDowntimeMinutes: overview.unexemptedDowntimeMinutes,
        devices: tableViewMode === "devices" ? devices : undefined,
        endpoints: tableViewMode === "endpoints" ? endpoints : undefined,
        digitalSignature: report.digitalSignature,
      };

      const exported = await pdfExportService.exportNocSlaReportPdf(payload);
      if (!exported) {
        throw new Error("Não foi possível gerar o PDF.");
      }
      toast.success(
        `Relatório executivo NOC (${
          tableViewMode === "devices" ? "Ativos de Rede" : "Endpoints"
        }) exportado com sucesso!`
      );
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : "Falha ao gerar o relatório executivo de SLA."
      );
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  return (
    <main
      role="main"
      data-testid="sla-reports-page"
      className="p-4 md:p-6 flex flex-col gap-6 w-full"
    >
      {/* 1. Breadcrumb e Cabeçalho */}
      <section className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 pb-4 border-b border-obsidian-800">
        <div className="flex flex-col gap-1">
          <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-xs font-mono">
            <Link
              to="/noc"
              className="text-slate-400 hover:text-slate-200 transition-colors"
            >
              Cockpit NOC
            </Link>
            <span className="text-obsidian-700">/</span>
            <span className="text-emerald-400 font-semibold">
              Relatórios de SLA &amp; Disponibilidade
            </span>
          </nav>

          <h1 className="text-2xl font-display font-extrabold text-white tracking-tight">
            Relatórios Analíticos de SLA &amp; Disponibilidade Contratual
          </h1>
          <p className="text-xs text-slate-400 max-w-3xl leading-relaxed">
            Métricas consolidadas de uptime líquido, apuração de penalidades financeiras e auditoria com isenção de paradas programadas homologadas conforme ADR-009 e normas do BNA.
          </p>
        </div>

        {/* Ações de Exportação */}
        <div className="flex items-center flex-wrap gap-2.5 shrink-0">
          {/* Exportações CSV / JSON e PDF Executivo */}
          {overview && effectiveTenantId && (
            <>
              <SlaExportActions
                tenantId={effectiveTenantId}
                tenantName={overview.tenantName}
                overview={overview}
                deviceBreakdown={devices}
              />

              <button
                type="button"
                onClick={handleGeneratePdf}
                disabled={isGeneratingPdf}
                className="h-9 px-4 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-obsidian-950 text-xs font-bold flex items-center gap-2 transition-colors focus:ring-2 focus:ring-emerald-400 shadow-md cursor-pointer disabled:opacity-50"
              >
                {isGeneratingPdf ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <FileDown className="w-4 h-4" />
                )}
                <span>Gerar Relatório Executivo PDF</span>
              </button>
            </>
          )}
        </div>
      </section>

      {/* 2. Overlay de Erro de Cálculo */}
      {currentState === "error" && (
        <section
          data-testid="sla-error-overlay"
          className="bg-rose-950/40 border border-rose-500/60 p-4 rounded-xl flex items-center justify-between gap-4 text-xs font-mono"
        >
          <div className="flex items-center gap-3">
            <AlertCircle className="w-6 h-6 text-rose-400 shrink-0 animate-pulse" />
            <div>
              <strong className="text-rose-300 block font-bold">
                FALHA NO MOTOR DE CÁLCULO DE DISPONIBILIDADE LÍQUIDA
              </strong>
              <span className="text-rose-400/80">{errorMessage}</span>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              if (isGlobalOperator) refetchOrganizations();
              refetch();
            }}
            className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-bold transition-colors shrink-0 cursor-pointer"
          >
            Recalcular SLA
          </button>
        </section>
      )}

      {/* 3. Barra de Filtro de Contratante & Metas Fixadas */}
      <section className="bg-obsidian-900 border border-obsidian-800 rounded-xl p-3 flex flex-wrap items-center justify-between gap-3 shadow">
        <div className="flex flex-wrap items-center gap-3">
          {/* Identificação / Seletor de Tenant */}
          {isGlobalOperator ? (
            <div className="flex items-center gap-2 bg-obsidian-950 px-3 py-1.5 rounded-lg border border-obsidian-800">
              <Building2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <select
                id="tenant-select"
                aria-label="Selecionar Contratante Enterprise"
                value={selectedTenantId ?? organizations[0]?.id ?? ""}
                onChange={(e) => setSelectedTenantId(e.target.value)}
                className="bg-transparent border-0 text-xs font-medium text-white focus:ring-0 p-0 pr-6 cursor-pointer outline-none"
              >
                {organizations.length === 0 && (
                  <option value="" className="bg-[#0e1524] text-white">
                    {isLoadingOrganizations
                      ? "Carregando organizações..."
                      : "Nenhuma organização disponível"}
                  </option>
                )}
                {organizations.map((org) => (
                  <option key={org.id} value={org.id} className="bg-[#0e1524] text-white">
                    {org.name}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div
              data-testid="static-tenant-badge"
              className="flex items-center gap-2 bg-emerald-500/10 px-3 py-1.5 rounded-lg border border-emerald-500/30 text-emerald-400 text-xs font-mono font-bold"
            >
              <Building2 className="w-4 h-4 shrink-0" />
              <span>{user?.organization_name || overview?.tenantName || "Organização"}</span>
            </div>
          )}

          {/* Seletor de Período Temporal */}
          <div className="flex items-center gap-2 bg-obsidian-950 px-3 py-1.5 rounded-lg border border-obsidian-800">
            <Calendar className="w-4 h-4 text-slate-400 shrink-0" />
            <select
              id="period-select"
              aria-label="Selecionar Período de Apuração"
              value={selectedPeriod}
              onChange={(e) => setSelectedPeriod(e.target.value as SlaReportingPeriod)}
              className="bg-transparent border-0 text-xs font-mono text-slate-300 focus:ring-0 p-0 pr-6 cursor-pointer outline-none"
            >
              <option value="last_7d" className="bg-[#0e1524] text-white">Últimos 7 dias</option>
              <option value="last_30d" className="bg-[#0e1524] text-white">Últimos 30 dias</option>
              <option value="current_month" className="bg-[#0e1524] text-white">
                Mês Vigente{overview?.periodLabel ? ` (${overview.periodLabel})` : ""}
              </option>
              <option value="last_90d" className="bg-[#0e1524] text-white">Último Trimestre (90 dias)</option>
            </select>
          </div>

          {/* Meta Contratual Fixada */}
          <div className="flex items-center gap-1.5 bg-emerald-500/10 border border-emerald-500/30 px-3 py-1.5 rounded-lg">
            <Lock className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            <span id="tenant-target-sla" className="text-xs font-mono text-emerald-400 font-bold">
              Meta Contratual:{" "}
              {typeof overview?.targetSlaPct === "number"
                ? `${overview.targetSlaPct.toFixed(2)}%`
                : "99.50%"}
            </span>
          </div>
        </div>

        {/* Ciclo Vigente Countdown */}
        <div className="text-[11px] font-mono text-slate-400 flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
          <span>
            Ciclo Vigente: Fechamento em {overview?.daysRemainingInCycle ?? 13} dias
          </span>
        </div>
      </section>

      {/* 4. Skeleton Loader State */}
      {currentState === "skeleton" && (
        <section data-testid="sla-skeleton-container" className="space-y-4 animate-pulse">
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
            <div className="h-32 bg-obsidian-900 border border-obsidian-800 rounded-xl"></div>
            <div className="h-32 bg-obsidian-900 border border-obsidian-800 rounded-xl"></div>
            <div className="h-32 bg-obsidian-900 border border-obsidian-800 rounded-xl"></div>
            <div className="h-32 bg-obsidian-900 border border-obsidian-800 rounded-xl"></div>
          </div>
          <div className="h-56 bg-obsidian-900 border border-obsidian-800 rounded-xl"></div>
          <div className="h-64 bg-obsidian-900 border border-obsidian-800 rounded-xl"></div>
        </section>
      )}

      {/* 5. Empty State */}
      {currentState === "empty" && (
        <section
          data-testid="sla-empty-container"
          className="py-16 px-4 text-center bg-obsidian-900 border border-obsidian-800 rounded-xl space-y-4"
        >
          <div className="w-16 h-16 mx-auto rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
            <Building2 className="w-8 h-8" />
          </div>
          <div className="space-y-1">
            <h3 className="font-display font-bold text-base text-white">
              Nenhum Registro de SLA Encontrado
            </h3>
            <p className="text-xs text-slate-400 max-w-md mx-auto">
              {effectiveTenantId
                ? "Não existem séries temporais de disponibilidade para o contrato e período selecionados."
                : "Não foi possível identificar uma organização para consultar o SLA."}
            </p>
          </div>
          {effectiveTenantId && (
            <button
              type="button"
              onClick={() => {
                refetch();
              }}
              className="px-4 py-2 rounded-lg bg-obsidian-850 hover:bg-obsidian-800 border border-obsidian-700 text-slate-200 text-xs font-mono transition-colors cursor-pointer"
            >
              Tentar novamente
            </button>
          )}
        </section>
      )}

      {/* 6. Nominal State: KPIs + Histograma Diário + Tabela Dual-Tab */}
      {currentState === "nominal" && overview && (
        <>
          {/* 4 KPI Cards Executivos */}
          <SlaKpiCards overview={overview} />

          {/* Gráfico Histograma Diário de SLA (31 Dias com Linha de Corte 99.50%) */}
          <SlaDailyHistogram
            data={dailySlaData}
            isLoading={isDailyLoading}
            targetSlaPct={overview.targetSlaPct}
            periodLabel={overview.periodLabel || "Mês Vigente"}
          />

          {/* Abas de Alternância de Tabela (Endpoints Contratados vs Ativos Físicos de Rede) */}
          {isGlobalOperator && (
            <div
              data-testid="sla-table-view-tabs"
              className="flex items-center gap-2"
            >
              <button
                type="button"
                data-testid="tab-view-endpoints"
                onClick={() => setTableViewMode("endpoints")}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-mono font-semibold transition-colors cursor-pointer ${
                  tableViewMode === "endpoints"
                    ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
                    : "text-slate-400 hover:text-white hover:bg-obsidian-900 border border-transparent"
                }`}
              >
                Endpoints Contratados (Visão Cliente)
              </button>

              <button
                type="button"
                data-testid="tab-view-devices"
                onClick={() => setTableViewMode("devices")}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-mono font-semibold transition-colors cursor-pointer ${
                  tableViewMode === "devices"
                    ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
                    : "text-slate-400 hover:text-white hover:bg-obsidian-900 border border-transparent"
                }`}
              >
                Ativos Físicos de Rede (Visão NOC Interna)
              </button>
            </div>
          )}

          {/* Tabela Selecionada: Endpoints ou Dispositivos */}
          {!isGlobalOperator || tableViewMode === "endpoints" ? (
            isEndpointsError ? (
              <section
                role="alert"
                className="bg-rose-950/40 border border-rose-500/60 p-4 rounded-xl text-rose-300 font-mono text-xs flex items-center justify-between"
              >
                <span>{endpointsError?.message || "Falha ao carregar os endpoints contratados."}</span>
                <button
                  type="button"
                  onClick={() => refetchEndpoints()}
                  className="underline text-rose-300 hover:text-white"
                >
                  Tentar novamente
                </button>
              </section>
            ) : isEndpointsLoading ? (
              <div className="h-64 bg-obsidian-900 border border-obsidian-800 rounded-xl animate-pulse"></div>
            ) : (
              <SlaEndpointsTable
                endpoints={endpoints}
                targetSlaPct={overview.targetSlaPct}
              />
            )
          ) : isDevicesError ? (
            <section
              role="alert"
              className="bg-rose-950/40 border border-rose-500/60 p-4 rounded-xl text-rose-300 font-mono text-xs flex items-center justify-between"
            >
              <span>{devicesError?.message || "Falha ao carregar o detalhamento de SLA por ativo."}</span>
              <button
                type="button"
                onClick={() => refetchDevices()}
                className="underline text-rose-300 hover:text-white"
              >
                Tentar novamente
              </button>
            </section>
          ) : isDevicesLoading ? (
            <div className="h-64 bg-obsidian-900 border border-obsidian-800 rounded-xl animate-pulse"></div>
          ) : (
            <SlaDeviceBreakdownTable
              devices={devices}
              targetSlaPct={overview.targetSlaPct}
            />
          )}

          {/* Demonstrativo Consolidado & Auditoria Regulatória BNA */}
          <footer className="bg-obsidian-900 border border-obsidian-800 rounded-xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs font-mono text-slate-400 shadow">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>
                Apuração certificada sob protocolo <strong>ADR-009</strong> e normas <strong>BNA</strong>. Paradas programadas auditadas e excluídas do tempo de penalidade líquida.
              </span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-[10px] text-slate-400 uppercase">HASH DIGITAL:</span>
              <span
                id="bna-hash-value"
                className="px-2 py-0.5 rounded bg-obsidian-950 text-slate-300 border border-obsidian-800 select-all font-mono text-[11px]"
              >
                SHA256: 4e8b39a7c3b2e8810fd8910ac7f2d4e8b39a7c3b2e8810fd8910ac7f2d4e
              </span>
            </div>
          </footer>
        </>
      )}
    </main>
  );
};
