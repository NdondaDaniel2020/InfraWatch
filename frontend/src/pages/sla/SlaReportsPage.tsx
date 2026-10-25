import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import {
  BarChart3,
  Building2,
  Calendar,
  Lock,
  AlertCircle,
  Clock,
  Printer,
} from "lucide-react";
import { Button, Skeleton } from "../../components/ui";
import { SlaKpiCards } from "../../components/sla/SlaKpiCards";
import { SlaExportActions } from "../../components/sla/SlaExportActions";
import { SlaDeviceBreakdownTable } from "../../components/sla/SlaDeviceBreakdownTable";
import { slaApi } from "../../services/slaApi";
import {
  mockSlaOverviewBancoSol,
  mockSlaOverviewUnitel,
  mockSlaOverviewSonangol,
  mockSlaDeviceBreakdown,
} from "../../mocks/slaMocks";
import { toast } from "sonner";

export const SlaReportsPage: React.FC = () => {
  const [tenantId, setTenantId] = useState("bancosol");
  const [manualState, setManualState] = useState<
    "auto" | "nominal" | "skeleton" | "empty" | "error"
  >("auto");

  const tenantOverviews = {
    bancosol: mockSlaOverviewBancoSol,
    unitel: mockSlaOverviewUnitel,
    sonangol: mockSlaOverviewSonangol,
  };

  const currentOverview =
    tenantOverviews[tenantId as keyof typeof tenantOverviews] ||
    mockSlaOverviewBancoSol;

  const {
    data: overview = currentOverview,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ["slaOverview", tenantId],
    queryFn: () => slaApi.getSlaOverview(tenantId),
    initialData: currentOverview,
  });

  const { data: devices = mockSlaDeviceBreakdown } = useQuery({
    queryKey: ["slaDevices", tenantId],
    queryFn: () => slaApi.getSlaDeviceBreakdown(tenantId),
    initialData: mockSlaDeviceBreakdown,
  });

  const currentState =
    manualState !== "auto"
      ? manualState
      : isLoading
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
          <p
            style={{
              fontSize: "0.75rem",
              color: "var(--color-text-muted)",
              maxWidth: "800px",
              lineHeight: 1.5,
            }}
          >
            Métricas consolidadas de uptime líquido, apuração de penalidades e
            auditoria com isenção de paradas programadas homologadas conforme
            ADR-009 e normas do BNA.
          </p>
        </div>

        {/* Depurador de Estado & Ações de Exportação */}
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            gap: "10px",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "4px",
              backgroundColor: "var(--color-surface-card)",
              padding: "4px 8px",
              borderRadius: "var(--radius-md)",
              border: "var(--border-subtle)",
              fontSize: "0.6875rem",
              fontFamily: "var(--font-mono)",
            }}
          >
            <span style={{ color: "var(--color-text-muted)", fontWeight: 600 }}>
              ESTADO:
            </span>
            {(["nominal", "skeleton", "empty", "error"] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setManualState(s)}
                style={{
                  padding: "2px 8px",
                  borderRadius: "var(--radius-sm)",
                  border: "none",
                  backgroundColor:
                    currentState === s
                      ? "rgba(16, 185, 129, 0.2)"
                      : "transparent",
                  color:
                    currentState === s
                      ? "var(--color-healthy)"
                      : "var(--color-text-muted)",
                  fontWeight: currentState === s ? 700 : 500,
                  cursor: "pointer",
                  textTransform: "capitalize",
                }}
              >
                {s}
              </button>
            ))}
          </div>

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
              setManualState("auto");
              refetch();
            }}
            variant="critical"
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
          backgroundColor: "var(--color-surface-elevated)",
          border: "var(--border-subtle)",
          borderRadius: "var(--radius-lg)",
          padding: "12px 16px",
        }}
      >
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "12px" }}>
          {/* Seletor de Tenant */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              backgroundColor: "var(--color-surface-card)",
              border: "var(--border-subtle)",
              borderRadius: "var(--radius-sm)",
              padding: "6px 10px",
            }}
          >
            <Building2 size={16} className="text-emerald-400" />
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
              }}
            >
              <option value="bancosol">Banco Sol (Internet Banking & Agências)</option>
              <option value="unitel">Unitel Angola (Backbone & Core)</option>
              <option value="sonangol">Sonangol Logistics (Terminal Luanda)</option>
            </select>
          </div>

          {/* Período Vigente */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              backgroundColor: "var(--color-surface-card)",
              border: "var(--border-subtle)",
              borderRadius: "var(--radius-sm)",
              padding: "6px 10px",
              fontSize: "0.75rem",
              fontFamily: "var(--font-mono)",
              color: "var(--color-text-secondary)",
            }}
          >
            <Calendar size={14} className="text-sky-400" />
            <span>Mês Vigente: {overview.periodLabel}</span>
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
            <span>Meta Contratual: {overview.targetSlaPct.toFixed(2)}%</span>
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
            backgroundColor: "var(--color-surface-elevated)",
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
              setManualState("nominal");
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
          <SlaDeviceBreakdownTable devices={devices} targetSlaPct={overview.targetSlaPct} />
        </>
      )}
    </main>
  );
};
