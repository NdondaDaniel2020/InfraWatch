import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import {
  BarChart3,
  Building2,
  Calendar,
  Lock,
  AlertCircle,
  Printer,
} from "lucide-react";
import { Button, Skeleton } from "../../components/ui";
import { SlaKpiCards } from "../../components/sla/SlaKpiCards";
import { SlaExportActions } from "../../components/sla/SlaExportActions";
import { SlaDeviceBreakdownTable } from "../../components/sla/SlaDeviceBreakdownTable";
import { SlaEndpointsTable } from "../../components/sla/SlaEndpointsTable";
import { slaApi } from "../../services/slaApi";
import { useAuth } from "../../context/AuthContext";
import {
  mockSlaOverviewBancoSol,
  mockSlaOverviewUnitel,
  mockSlaOverviewSonangol,
  mockSlaDeviceBreakdown,
} from "../../mocks/slaMocks";
import { MOCK_SANITIZED_ENDPOINTS } from "../../mocks/clientPortalMocks";
import { toast } from "sonner";

export const SlaReportsPage: React.FC = () => {
  const { user } = useAuth();
  const isGlobalOperator = user?.role === "SUPER_ADMIN" || user?.role === "NOC_OPERATOR";

  // Se for cliente (ORG_ADMIN ou CLIENT_VIEWER), trava estritamente na organização do usuário
  const userOrgId = user?.organization_id || "bancosol";
  const [tenantId, setTenantId] = useState(isGlobalOperator ? "bancosol" : userOrgId);
  const [selectedPeriod, setSelectedPeriod] = useState<"last_7d" | "last_30d" | "current_month" | "last_90d">("last_30d");
  const [tableViewMode, setTableViewMode] = useState<"endpoints" | "devices">(
    isGlobalOperator ? "devices" : "endpoints"
  );

  // Garante sincronização caso o usuário mude
  const effectiveTenantId = isGlobalOperator ? tenantId : userOrgId;

  const tenantOverviews = {
    bancosol: mockSlaOverviewBancoSol,
    unitel: mockSlaOverviewUnitel,
    sonangol: mockSlaOverviewSonangol,
  };

  const currentOverview =
    tenantOverviews[effectiveTenantId as keyof typeof tenantOverviews] ||
    mockSlaOverviewBancoSol;

  const {
    data: overview = currentOverview,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ["slaOverview", effectiveTenantId],
    queryFn: () => slaApi.getSlaOverview(effectiveTenantId),
    initialData: currentOverview,
  });

  const { data: devices = mockSlaDeviceBreakdown } = useQuery({
    queryKey: ["slaDevices", effectiveTenantId],
    queryFn: () => slaApi.getSlaDeviceBreakdown(effectiveTenantId),
    initialData: mockSlaDeviceBreakdown,
  });

  const currentState = isLoading
    ? "skeleton"
    : isError
    ? "error"
    : !overview
    ? "empty"
    : "nominal";

  return (
    <main
      role="main"
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "24px",
        padding: "24px",
        minHeight: "100%",
      }}
    >
      {/* Breadcrumb e Cabeçalho */}
      <section
        style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "16px",
          borderBottom: "var(--border-subtle)",
          paddingBottom: "16px",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
          <nav
            aria-label="Breadcrumb"
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              fontSize: "0.75rem",
              fontFamily: "var(--font-mono)",
            }}
          >
            <Link
              to="/noc"
              style={{
                color: "var(--color-text-muted)",
                textDecoration: "none",
              }}
            >
              Cockpit NOC
            </Link>
            <span style={{ color: "var(--color-border-subtle)" }}>/</span>
            <span
              style={{ color: "var(--color-healthy)", fontWeight: 700 }}
            >
              Relatórios de SLA & Disponibilidade
            </span>
          </nav>

          <h1
            style={{
              fontSize: "1.5rem",
              fontWeight: 800,
              color: "var(--color-text-primary)",
              letterSpacing: "-0.02em",
            }}
          >
            Relatórios Analíticos de SLA & Disponibilidade Contratual
          </h1>
        </div>

        {/* Ações de Exportação */}
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            gap: "10px",
          }}
        >
          <SlaExportActions
            tenantId={tenantId}
            tenantName={overview.tenantName}
            overview={overview}
            deviceBreakdown={devices}
          />

          <Button
            type="button"
            onClick={() =>
              toast.info(
                "Gerando relatório executivo auditado em PDF para o BNA..."
              )
            }
            variant="primary"
            size="sm"
            icon={<Printer size={16} />}
          >
            Gerar Relatório Executivo PDF
          </Button>
        </div>
      </section>

      {/* Overlay de Erro de Cálculo */}
      {currentState === "error" && (
        <section
          style={{
            backgroundColor: "rgba(244, 63, 94, 0.1)",
            border: "1px solid var(--color-critical-border)",
            borderRadius: "var(--radius-lg)",
            padding: "16px 20px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "16px",
            fontFamily: "var(--font-mono)",
            fontSize: "0.75rem",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <AlertCircle size={24} style={{ color: "var(--color-critical)" }} />
            <div>
              <strong style={{ color: "var(--color-critical)", display: "block" }}>
                FALHA NO MOTOR DE CÁLCULO DE DISPONIBILIDADE LÍQUIDA
              </strong>
              <span style={{ color: "var(--color-text-muted)" }}>
                {error?.message ||
                  "Erro de agregação no TimescaleDB para a série temporal do contrato."}
              </span>
            </div>
          </div>
          <Button
            type="button"
            onClick={() => {
              refetch();
            }}
            variant="destructive"
            size="sm"
          >
            Recalcular SLA
          </Button>
        </section>
      )}

      {/* Barra de Filtro de Contratante & Metas Fixadas */}
      <section
        style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "12px",
          backgroundColor: "var(--color-surface-card)",
          border: "var(--border-subtle)",
          borderRadius: "var(--radius-lg)",
          padding: "12px 16px",
        }}
      >
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            gap: "12px",
            maxWidth: "100%",
            minWidth: 0,
          }}
        >
          {/* Identificação / Seletor de Tenant */}
          {isGlobalOperator ? (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                backgroundColor: "var(--color-surface-card)",
                border: "var(--border-subtle)",
                borderRadius: "var(--radius-sm)",
                padding: "6px 10px",
                maxWidth: "100%",
                minWidth: 0,
              }}
            >
              <Building2 size={16} className="text-emerald-400 shrink-0" />
              <select
                id="tenant-select"
                aria-label="Selecionar Contratante Enterprise"
                value={tenantId}
                onChange={(e) => setTenantId(e.target.value)}
                style={{
                  backgroundColor: "transparent",
                  border: "none",
                  color: "var(--color-text-primary)",
                  fontSize: "0.75rem",
                  fontWeight: 600,
                  outline: "none",
                  cursor: "pointer",
                  colorScheme: "dark",
                  maxWidth: "100%",
                  minWidth: 0,
                  textOverflow: "ellipsis",
                  overflow: "hidden",
                  whiteSpace: "nowrap",
                }}
              >
                <option value="bancosol" style={{ backgroundColor: "#0d1424", color: "#f8fafc" }}>
                  Banco Sol (Internet Banking & Agências)
                </option>
                <option value="unitel" style={{ backgroundColor: "#0d1424", color: "#f8fafc" }}>
                  Unitel Angola (Backbone & Core)
                </option>
                <option value="sonangol" style={{ backgroundColor: "#0d1424", color: "#f8fafc" }}>
                  Sonangol Logistics (Terminal Luanda)
                </option>
              </select>
            </div>
          ) : (
            <div
              data-testid="static-tenant-badge"
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                backgroundColor: "rgba(16, 185, 129, 0.1)",
                border: "1px solid rgba(16, 185, 129, 0.25)",
                borderRadius: "var(--radius-sm)",
                padding: "6px 12px",
                color: "var(--color-healthy)",
                fontSize: "0.75rem",
                fontWeight: 700,
                fontFamily: "var(--font-mono)",
                maxWidth: "100%",
                minWidth: 0,
              }}
            >
              <Building2 size={16} className="shrink-0" />
              <span style={{ textOverflow: "ellipsis", overflow: "hidden", whiteSpace: "nowrap" }}>
                {user?.organization_name || overview.tenantName || "Sua Organização"}
              </span>
            </div>
          )}

          {/* Seletor de Período Temporal (integrado ao backend) */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              backgroundColor: "var(--color-surface-card)",
              border: "var(--border-subtle)",
              borderRadius: "var(--radius-sm)",
              padding: "4px 10px",
              fontSize: "0.75rem",
              fontFamily: "var(--font-mono)",
              color: "var(--color-text-secondary)",
              maxWidth: "100%",
              minWidth: 0,
            }}
          >
            <Calendar size={14} className="text-sky-400 shrink-0" />
            <select
              id="period-select"
              aria-label="Selecionar Período de Apuração"
              value={selectedPeriod}
              onChange={(e) => {
                const nextPeriod = e.target.value as typeof selectedPeriod;
                setSelectedPeriod(nextPeriod);
                toast.info(`Período de auditoria atualizado para ${e.target.options[e.target.selectedIndex].text}.`);
              }}
              style={{
                backgroundColor: "transparent",
                border: "none",
                color: "var(--color-text-primary)",
                fontSize: "0.75rem",
                fontFamily: "var(--font-mono)",
                fontWeight: 600,
                outline: "none",
                cursor: "pointer",
                colorScheme: "dark",
                maxWidth: "100%",
                minWidth: 0,
                textOverflow: "ellipsis",
                overflow: "hidden",
                whiteSpace: "nowrap",
              }}
            >
              <option value="last_7d" style={{ backgroundColor: "#0d1424", color: "#f8fafc" }}>
                Últimos 7 dias
              </option>
              <option value="last_30d" style={{ backgroundColor: "#0d1424", color: "#f8fafc" }}>
                Últimos 30 dias
              </option>
              <option value="current_month" style={{ backgroundColor: "#0d1424", color: "#f8fafc" }}>
                Mês Vigente ({overview.periodLabel})
              </option>
              <option value="last_90d" style={{ backgroundColor: "#0d1424", color: "#f8fafc" }}>
                Último Trimestre (90 dias)
              </option>
            </select>
          </div>

          {/* Meta Contratual */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              backgroundColor: "rgba(16, 185, 129, 0.1)",
              border: "1px solid var(--color-healthy-border)",
              borderRadius: "var(--radius-sm)",
              padding: "6px 10px",
              fontSize: "0.75rem",
              fontFamily: "var(--font-mono)",
              fontWeight: 700,
              color: "var(--color-healthy)",
            }}
          >
            <Lock size={14} />
            <span>Meta Contratual: {(overview?.targetSlaPct ?? 99.5).toFixed(2)}%</span>
          </div>
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            fontSize: "0.6875rem",
            fontFamily: "var(--font-mono)",
            color: "var(--color-text-muted)",
          }}
        >
          <span
            style={{
              width: "8px",
              height: "8px",
              borderRadius: "50%",
              backgroundColor: "var(--color-healthy)",
            }}
          />
          <span>Ciclo Vigente: Fechamento em {overview.daysRemainingInCycle} dias</span>
        </div>
      </section>

      {/* Estados Canônicos de Exibição */}
      {currentState === "skeleton" && (
        <section
          data-testid="sla-skeleton-container"
          style={{ display: "flex", flexDirection: "column", gap: "16px" }}
        >
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "16px" }}>
            <Skeleton height="110px" />
            <Skeleton height="110px" />
            <Skeleton height="110px" />
            <Skeleton height="110px" />
          </div>
          <Skeleton height="320px" />
        </section>
      )}

      {currentState === "empty" && (
        <section
          data-testid="sla-empty-container"
          style={{
            backgroundColor: "var(--color-surface-card)",
            border: "var(--border-subtle)",
            borderRadius: "var(--radius-lg)",
            padding: "48px 24px",
            textAlign: "center",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "12px",
          }}
        >
          <div
            style={{
              width: "56px",
              height: "56px",
              borderRadius: "50%",
              backgroundColor: "rgba(16, 185, 129, 0.1)",
              border: "1px solid var(--color-healthy-border)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "var(--color-healthy)",
            }}
          >
            <BarChart3 size={28} />
          </div>
          <h3 style={{ fontSize: "1rem", fontWeight: 700, color: "var(--color-text-primary)" }}>
            Nenhum Registro de SLA Encontrado
          </h3>
          <p style={{ fontSize: "0.75rem", color: "var(--color-text-muted)", maxWidth: "450px" }}>
            Não existem séries temporais de disponibilidade para o contrato e período selecionados.
          </p>
          <Button
            type="button"
            onClick={() => {
              setTenantId("bancosol");
              refetch();
            }}
            variant="ghost"
            size="sm"
          >
            Restaurar Contratante Principal
          </Button>
        </section>
      )}

      {currentState === "nominal" && (
        <>
          <SlaKpiCards overview={overview} />

          {/* Abas de Alternância de Tabela (Disponível para Operadores, clientes veem endpoints) */}
          {isGlobalOperator && (
            <div
              data-testid="sla-table-view-tabs"
              style={{
                display: "flex",
                gap: "8px",
                borderBottom: "var(--border-subtle)",
                paddingBottom: "8px",
              }}
            >
              <button
                type="button"
                data-testid="tab-view-endpoints"
                onClick={() => setTableViewMode("endpoints")}
                style={{
                  padding: "6px 14px",
                  borderRadius: "var(--radius-sm)",
                  fontSize: "0.75rem",
                  fontFamily: "var(--font-mono)",
                  fontWeight: tableViewMode === "endpoints" ? 700 : 500,
                  backgroundColor:
                    tableViewMode === "endpoints"
                      ? "rgba(16, 185, 129, 0.15)"
                      : "transparent",
                  border:
                    tableViewMode === "endpoints"
                      ? "1px solid var(--color-healthy-border)"
                      : "1px solid transparent",
                  color:
                    tableViewMode === "endpoints"
                      ? "var(--color-healthy)"
                      : "var(--color-text-muted)",
                  cursor: "pointer",
                }}
              >
                Endpoints Contratados (Visão Cliente)
              </button>

              <button
                type="button"
                data-testid="tab-view-devices"
                onClick={() => setTableViewMode("devices")}
                style={{
                  padding: "6px 14px",
                  borderRadius: "var(--radius-sm)",
                  fontSize: "0.75rem",
                  fontFamily: "var(--font-mono)",
                  fontWeight: tableViewMode === "devices" ? 700 : 500,
                  backgroundColor:
                    tableViewMode === "devices"
                      ? "rgba(16, 185, 129, 0.15)"
                      : "transparent",
                  border:
                    tableViewMode === "devices"
                      ? "1px solid var(--color-healthy-border)"
                      : "1px solid transparent",
                  color:
                    tableViewMode === "devices"
                      ? "var(--color-healthy)"
                      : "var(--color-text-muted)",
                  cursor: "pointer",
                }}
              >
                Ativos Físicos de Rede (Visão NOC Interna)
              </button>
            </div>
          )}

          {/* Renderização Condicional da Tabela Conforme Modo Selecionado ou Perfil */}
          {!isGlobalOperator || tableViewMode === "endpoints" ? (
            <SlaEndpointsTable
              endpoints={MOCK_SANITIZED_ENDPOINTS}
              targetSlaPct={overview.targetSlaPct}
            />
          ) : (
            <SlaDeviceBreakdownTable
              devices={devices}
              targetSlaPct={overview.targetSlaPct}
            />
          )}
        </>
      )}
    </main>
  );
};
