import React, { useState, useMemo, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import {
  Calendar,
  PlusCircle,
  Search,
  CheckCircle2,
  Clock,
  List,
  CalendarDays,
  AlertCircle,
  FileText,
} from "lucide-react";
import { Button, Skeleton } from "../../components/ui";
import { MaintenanceCard } from "../../components/sla/MaintenanceCard";
import { MaintenanceGanttTimeline } from "../../components/sla/MaintenanceGanttTimeline";
import { CreateMaintenanceModal } from "../../components/sla/CreateMaintenanceModal";
import { slaApi } from "../../services/slaApi";
import {
  mockMaintenanceKpiSummary,
} from "../../mocks/slaMocks";
import type {
  MaintenanceStatus,
  CreateMaintenanceInput,
} from "../../types/sla";
import { useAuth } from "../../context/AuthContext";
import { toast } from "sonner";

export const MaintenanceWindowsPage: React.FC = () => {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const isOperator =
    user?.role === "SUPER_ADMIN" || user?.role === "NOC_OPERATOR";
  const canSchedule =
    isOperator || user?.role === "ORG_ADMIN";

  const [viewMode, setViewMode] = useState<"cards" | "gantt">("cards");
  const [activeTab, setActiveTab] = useState<MaintenanceStatus | "ALL">("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedClient, setSelectedClient] = useState("all");
  const [isModalOpen, setIsModalOpen] = useState(false);

  const {
    data: maintenances = [],
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ["maintenanceWindows", activeTab, selectedClient],
    queryFn: () =>
      slaApi.listMaintenanceWindows({
        status: activeTab === "ALL" ? undefined : activeTab,
        client: selectedClient === "all" ? undefined : selectedClient,
      }),
  });

  const { data: kpiSummary = mockMaintenanceKpiSummary } = useQuery({
    queryKey: ["maintenanceKpis"],
    queryFn: () => slaApi.getMaintenanceKpiSummary(),
    initialData: mockMaintenanceKpiSummary,
  });

  const approveMutation = useMutation({
    mutationFn: (id: string) => slaApi.approveMaintenanceWindow(id),
    onSuccess: (updated) => {
      toast.success(
        `Isenção de SLA homologada para ${updated?.rfcNumber || "RFC"}!`
      );
      queryClient.invalidateQueries({ queryKey: ["maintenanceWindows"] });
    },
    onError: () => {
      toast.error("Falha ao homologar isenção de SLA.");
    },
  });

  const createMutation = useMutation({
    mutationFn: (input: CreateMaintenanceInput) =>
      slaApi.createMaintenanceWindow(input),
    onSuccess: (created) => {
      setIsModalOpen(false);
      toast.success(
        `Parada técnica ${created?.rfcNumber || "agendada"} com sucesso!`
      );
      queryClient.invalidateQueries({ queryKey: ["maintenanceWindows"] });
    },
    onError: () => {
      toast.error("Falha ao registrar parada técnica.");
    },
  });

  const handleApprove = useCallback(
    (id: string) => {
      approveMutation.mutate(id);
    },
    [approveMutation]
  );

  const handleCreate = useCallback(
    (input: CreateMaintenanceInput) => {
      createMutation.mutate(input);
    },
    [createMutation]
  );

  // Filtros aplicados em memória
  const filteredMaintenances = useMemo(() => {
    return maintenances.filter((m) => {
      if (activeTab !== "ALL" && m.status !== activeTab) return false;
      if (selectedClient !== "all") {
        const matchesClient = m.clientName
          .toLowerCase()
          .includes(selectedClient.toLowerCase());
        if (!matchesClient) return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesText =
          m.rfcNumber.toLowerCase().includes(q) ||
          m.title.toLowerCase().includes(q) ||
          m.targetDeviceNames.some((d) => d.toLowerCase().includes(q)) ||
          m.clientName.toLowerCase().includes(q);
        if (!matchesText) return false;
      }
      return true;
    });
  }, [maintenances, activeTab, selectedClient, searchQuery]);

  // Decisão de renderização do estado
  const currentState = isLoading
    ? "skeleton"
    : isError
    ? "error"
    : filteredMaintenances.length === 0
    ? "empty"
    : "nominal";

  return (
    <main
      role="main"
      data-testid="maintenance-windows-page"
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
              style={{ color: "var(--color-primary)", fontWeight: 700 }}
            >
              Janelas de Manutenção Programada
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
            Janelas de Manutenção Programada & Isenções de SLA
          </h1>
          <p
            style={{
              fontSize: "0.75rem",
              color: "var(--color-text-muted)",
              maxWidth: "800px",
              lineHeight: 1.5,
            }}
          >
            Gestão de paradas técnicas com supressão automática de alarmes e
            homologação de isenção contratual de SLA (ADR-009 / ADR-017) perante
            o BNA e clientes enterprise.
          </p>
        </div>

        {/* Depurador de Estado & Botão de Agendamento */}
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            gap: "10px",
          }}
        >
          <Button
            type="button"
            onClick={() => toast.info("Exportando dossiê de RFCs homologadas...")}
            variant="ghost"
            size="sm"
            icon={<FileText size={16} />}
          >
            Exportar RFCs
          </Button>

          {canSchedule && (
            <Button
              type="button"
              onClick={() => setIsModalOpen(true)}
              variant="primary"
              size="sm"
              icon={<PlusCircle size={16} />}
            >
              + Agendar Nova Parada Técnica
            </Button>
          )}
        </div>
      </section>

      {/* Overlay de Erro RFC */}
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
                FALHA NO SERVIÇO DE SINCRONIZAÇÃO DE RFCS
              </strong>
              <span style={{ color: "var(--color-text-muted)" }}>
                {error?.message ||
                  "Não foi possível consultar as mudanças programadas no GLPI/ServiceNow."}
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
            Reconectar
          </Button>
        </section>
      )}

      {/* KPI Cards de Governança */}
      <section
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
          gap: "16px",
        }}
      >
        <div
          style={{
            backgroundColor: "var(--color-surface-elevated)",
            border: "var(--border-subtle)",
            borderRadius: "var(--radius-lg)",
            padding: "16px 20px",
            display: "flex",
            flexDirection: "column",
            gap: "8px",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span
              style={{
                fontSize: "0.6875rem",
                fontFamily: "var(--font-mono)",
                color: "var(--color-text-muted)",
                textTransform: "uppercase",
                fontWeight: 600,
              }}
            >
              Janelas Ativas Agora
            </span>
            <span
              style={{
                fontSize: "0.6875rem",
                fontFamily: "var(--font-mono)",
                color: "var(--color-healthy)",
                backgroundColor: "rgba(16, 185, 129, 0.1)",
                padding: "2px 8px",
                borderRadius: "var(--radius-sm)",
                border: "1px solid var(--color-healthy-border)",
                fontWeight: 700,
              }}
            >
              NOMINAL
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "baseline", gap: "8px" }}>
            <span style={{ fontSize: "1.75rem", fontWeight: 700, fontFamily: "var(--font-mono)", color: "var(--color-text-primary)" }}>
              {kpiSummary.activeNowCount}
            </span>
            <span style={{ fontSize: "0.75rem", color: "var(--color-text-muted)" }}>
              em andamento agora
            </span>
          </div>
          <p style={{ fontSize: "0.6875rem", color: "var(--color-healthy)", display: "flex", alignItems: "center", gap: "4px" }}>
            <CheckCircle2 size={12} />
            <span>Zero paradas ativas no ciclo de telemetria</span>
          </p>
        </div>

        <div
          style={{
            backgroundColor: "var(--color-surface-elevated)",
            border: "var(--border-subtle)",
            borderRadius: "var(--radius-lg)",
            padding: "16px 20px",
            display: "flex",
            flexDirection: "column",
            gap: "8px",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span
              style={{
                fontSize: "0.6875rem",
                fontFamily: "var(--font-mono)",
                color: "var(--color-text-muted)",
                textTransform: "uppercase",
                fontWeight: 600,
              }}
            >
              Janelas Agendadas
            </span>
            <span
              style={{
                fontSize: "0.6875rem",
                fontFamily: "var(--font-mono)",
                color: "var(--color-primary)",
                backgroundColor: "rgba(56, 189, 248, 0.1)",
                padding: "2px 8px",
                borderRadius: "var(--radius-sm)",
                border: "1px solid rgba(56, 189, 248, 0.3)",
                fontWeight: 700,
              }}
            >
              PLANEADO
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "baseline", gap: "8px" }}>
            <span style={{ fontSize: "1.75rem", fontWeight: 700, fontFamily: "var(--font-mono)", color: "var(--color-primary)" }}>
              {kpiSummary.scheduledCount}
            </span>
            <span style={{ fontSize: "0.75rem", color: "var(--color-text-muted)" }}>
              paradas programadas
            </span>
          </div>
          <p style={{ fontSize: "0.6875rem", color: "var(--color-primary)", display: "flex", alignItems: "center", gap: "4px" }}>
            <Clock size={12} />
            <span>Próxima: 22 Outubro às 03:00 WAT</span>
          </p>
        </div>

        <div
          style={{
            backgroundColor: "var(--color-surface-elevated)",
            border: "var(--border-subtle)",
            borderRadius: "var(--radius-lg)",
            padding: "16px 20px",
            display: "flex",
            flexDirection: "column",
            gap: "8px",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span
              style={{
                fontSize: "0.6875rem",
                fontFamily: "var(--font-mono)",
                color: "var(--color-text-muted)",
                textTransform: "uppercase",
                fontWeight: 600,
              }}
            >
              Horas Isentas no Mês (SLA)
            </span>
            <span
              style={{
                fontSize: "0.6875rem",
                fontFamily: "var(--font-mono)",
                color: "var(--color-healthy)",
                backgroundColor: "rgba(16, 185, 129, 0.1)",
                padding: "2px 8px",
                borderRadius: "var(--radius-sm)",
                border: "1px solid var(--color-healthy-border)",
                fontWeight: 700,
              }}
            >
              HOMOLOGADO
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "baseline", gap: "8px" }}>
            <span style={{ fontSize: "1.75rem", fontWeight: 700, fontFamily: "var(--font-mono)", color: "var(--color-text-primary)" }}>
              {kpiSummary.exemptedHoursMonth.toString().padStart(2, "0")}h 00m
            </span>
            <span style={{ fontSize: "0.75rem", color: "var(--color-text-muted)" }}>
              / {kpiSummary.contractualLimitHours}h teto contratual
            </span>
          </div>
          <p style={{ fontSize: "0.6875rem", color: "var(--color-healthy)", display: "flex", alignItems: "center", gap: "4px" }}>
            <CheckCircle2 size={12} />
            <span>Impacto 0.00% no SLA contratual • ADR-009</span>
          </p>
        </div>
      </section>

      {/* Barra de Filtros, Abas & Busca */}
      <section
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "12px",
          backgroundColor: "var(--color-surface-elevated)",
          border: "var(--border-subtle)",
          borderRadius: "var(--radius-lg)",
          padding: "16px",
        }}
      >
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "12px",
            borderBottom: "var(--border-subtle)",
            paddingBottom: "12px",
          }}
        >
          {/* Abas */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
            {(
              [
                { id: "ALL", label: "Todas as Janelas", count: maintenances.length },
                {
                  id: "APPROVED",
                  label: "Agendadas",
                  count: maintenances.filter((m) => m.status === "APPROVED").length,
                },
                {
                  id: "PENDING_APPROVAL",
                  label: "Pendentes",
                  count: maintenances.filter((m) => m.status === "PENDING_APPROVAL").length,
                },
                {
                  id: "COMPLETED",
                  label: "Concluídas",
                  count: maintenances.filter((m) => m.status === "COMPLETED").length,
                },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                style={{
                  padding: "6px 12px",
                  borderRadius: "var(--radius-md)",
                  border:
                    activeTab === tab.id
                      ? "1px solid var(--color-primary)"
                      : "var(--border-subtle)",
                  backgroundColor:
                    activeTab === tab.id
                      ? "rgba(56, 189, 248, 0.15)"
                      : "transparent",
                  color:
                    activeTab === tab.id
                      ? "var(--color-primary)"
                      : "var(--color-text-secondary)",
                  fontSize: "0.75rem",
                  fontWeight: 600,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                }}
              >
                <span>{tab.label}</span>
                <span
                  style={{
                    fontSize: "0.625rem",
                    padding: "2px 6px",
                    borderRadius: "var(--radius-full)",
                    backgroundColor: "var(--color-surface-card)",
                    fontFamily: "var(--font-mono)",
                  }}
                >
                  {tab.count}
                </span>
              </button>
            ))}
          </div>

          {/* Alternador de Visualização (Cards vs Gantt) */}
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <span style={{ fontSize: "0.6875rem", fontFamily: "var(--font-mono)", color: "var(--color-text-muted)" }}>
              VISUALIZAÇÃO:
            </span>
            <button
              type="button"
              onClick={() => setViewMode("cards")}
              title="Exibir em Cartões RFC"
              style={{
                padding: "6px",
                borderRadius: "var(--radius-sm)",
                border: "var(--border-subtle)",
                backgroundColor:
                  viewMode === "cards"
                    ? "rgba(56, 189, 248, 0.2)"
                    : "transparent",
                color:
                  viewMode === "cards"
                    ? "var(--color-primary)"
                    : "var(--color-text-muted)",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
              }}
            >
              <List size={16} />
            </button>
            <button
              type="button"
              onClick={() => setViewMode("gantt")}
              title="Exibir Linha do Tempo Gantt"
              style={{
                padding: "6px",
                borderRadius: "var(--radius-sm)",
                border: "var(--border-subtle)",
                backgroundColor:
                  viewMode === "gantt"
                    ? "rgba(56, 189, 248, 0.2)"
                    : "transparent",
                color:
                  viewMode === "gantt"
                    ? "var(--color-primary)"
                    : "var(--color-text-muted)",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
              }}
            >
              <CalendarDays size={16} />
            </button>
          </div>
        </div>

        {/* Inputs de Pesquisa e Cliente */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 240px", gap: "12px" }}>
          <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
            <Search
              size={16}
              style={{
                position: "absolute",
                left: "12px",
                color: "var(--color-text-muted)",
              }}
            />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar por Ativo (ex: SW-CORE), RFC ou Responsável…"
              style={{
                width: "100%",
                padding: "8px 12px 8px 36px",
                borderRadius: "var(--radius-sm)",
                backgroundColor: "var(--color-surface-card)",
                border: "var(--border-subtle)",
                color: "var(--color-text-primary)",
                fontSize: "0.75rem",
                fontFamily: "var(--font-mono)",
                outline: "none",
              }}
            />
          </div>

          <select
            value={selectedClient}
            onChange={(e) => setSelectedClient(e.target.value)}
            style={{
              padding: "8px 12px",
              borderRadius: "var(--radius-sm)",
              backgroundColor: "var(--color-surface-card)",
              border: "var(--border-subtle)",
              color: "var(--color-text-primary)",
              fontSize: "0.75rem",
              outline: "none",
              cursor: "pointer",
            }}
          >
            <option value="all">Todas as Contratantes</option>
            <option value="Unitel">Unitel Angola</option>
            <option value="Banco Sol">Banco Sol</option>
            <option value="Sonangol">Sonangol E.P.</option>
          </select>
        </div>
      </section>

      {/* Renderização condicional por estado */}
      {currentState === "skeleton" && (
        <section
          data-testid="maint-skeleton-container"
          style={{ display: "flex", flexDirection: "column", gap: "16px" }}
        >
          <Skeleton height="140px" />
          <Skeleton height="140px" />
          <Skeleton height="140px" />
        </section>
      )}

      {currentState === "empty" && (
        <section
          data-testid="maint-empty-container"
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
              backgroundColor: "rgba(56, 189, 248, 0.1)",
              border: "1px solid rgba(56, 189, 248, 0.3)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "var(--color-primary)",
            }}
          >
            <Calendar size={28} />
          </div>
          <h3 style={{ fontSize: "1rem", fontWeight: 700, color: "var(--color-text-primary)" }}>
            Nenhuma Janela de Manutenção Programada
          </h3>
          <p style={{ fontSize: "0.75rem", color: "var(--color-text-muted)", maxWidth: "450px" }}>
            Não existem RFCs ativas ou agendadas para os filtros selecionados no período vigente.
          </p>
          <Button
            type="button"
            onClick={() => {
              setActiveTab("ALL");
              setSearchQuery("");
              setSelectedClient("all");
            }}
            variant="ghost"
            size="sm"
          >
            Restaurar Filtros Operacionais
          </Button>
        </section>
      )}

      {currentState === "nominal" && (
        <>
          {viewMode === "gantt" ? (
            <MaintenanceGanttTimeline maintenances={filteredMaintenances} />
          ) : (
            <section
              data-testid="maint-cards-container"
              style={{ display: "flex", flexDirection: "column", gap: "16px" }}
            >
              {filteredMaintenances.map((maint) => (
                <MaintenanceCard
                  key={maint.id}
                  maintenance={maint}
                  onApprove={handleApprove}
                  canApprove={isOperator}
                />
              ))}
            </section>
          )}
        </>
      )}

      {/* Modal de Agendamento */}
      <CreateMaintenanceModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSubmit={handleCreate}
        isSubmitting={createMutation.isPending}
      />
    </main>
  );
};
