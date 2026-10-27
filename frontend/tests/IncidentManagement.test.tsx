import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { BrowserRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { IncidentManagement } from "../src/pages/IncidentManagement";
import { GlpiBadge } from "../src/components/incidents/GlpiBadge";
import { AcknowledgeModal } from "../src/components/incidents/AcknowledgeModal";
import { ResolveIncidentModal } from "../src/components/incidents/ResolveIncidentModal";
import { IncidentTimeline } from "../src/components/incidents/IncidentTimeline";
import { incidentsApi, IncidentItem } from "../src/services/incidentsApi";

const renderWithProviders = (ui: React.ReactElement) => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>{ui}</BrowserRouter>
    </QueryClientProvider>
  );
};

describe("Painel de Incidentes, Status GLPI e Ações Rápidas (Issue #32)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    incidentsApi.resetState();
  });

  /* ------------------------------------------------------------------------- */
  /* 1. Componente GlpiBadge (Link Seguro & Abertura 1-Click)                 */
  /* ------------------------------------------------------------------------- */
  describe("1. Componente GlpiBadge", () => {
    it("deve renderizar link seguro para chamado existente com target _blank e rel noopener", () => {
      render(
        <GlpiBadge
          ticketId={8492}
          incidentId="inc-8492"
        />
      );

      const link = screen.getByTestId("glpi-ticket-link-inc-8492");
      expect(link).toBeInTheDocument();
      expect(link).toHaveTextContent("Ticket #8492 • GLPI");
      expect(link).toHaveAttribute("href", "https://glpi.infrawatch.ao/front/ticket.form.php?id=8492");
      expect(link).toHaveAttribute("target", "_blank");
      expect(link).toHaveAttribute("rel", "noopener noreferrer");
    });

    it("deve renderizar badge estático quando o ticket estiver fechado", () => {
      render(
        <GlpiBadge
          ticketId={8470}
          incidentId="inc-8470"
          isClosed={true}
        />
      );

      const badge = screen.getByTestId("glpi-ticket-closed-inc-8470");
      expect(badge).toBeInTheDocument();
      expect(badge).toHaveTextContent("Ticket #8470 • Fechado");
    });

    it("deve renderizar botão de abertura manual 1-click quando não houver ticket vinculado", () => {
      const handleOpen = vi.fn();
      render(
        <GlpiBadge
          ticketId={null}
          incidentId="inc-8499"
          onOpenTicket={handleOpen}
        />
      );

      const btn = screen.getByTestId("btn-create-glpi-inc-8499");
      expect(btn).toBeInTheDocument();
      expect(btn).toHaveTextContent("Abrir Chamado no GLPI");

      fireEvent.click(btn);
      expect(handleOpen).toHaveBeenCalledWith("inc-8499");
    });

    it("deve exibir estado de carregamento durante a criação do chamado no GLPI", () => {
      render(
        <GlpiBadge
          ticketId={null}
          incidentId="inc-8499"
          isOpening={true}
        />
      );

      expect(screen.getByText("Criando Ticket…")).toBeInTheDocument();
      expect(screen.getByTestId("btn-create-glpi-inc-8499")).toBeDisabled();
    });
  });

  /* ------------------------------------------------------------------------- */
  /* 2. Modal de Reconhecimento (AcknowledgeModal)                             */
  /* ------------------------------------------------------------------------- */
  describe("2. Componente AcknowledgeModal", () => {
    const mockIncident: IncidentItem = {
      id: "inc-8492",
      code: "INC-8492",
      title: "SW-CORE-LUANDA-01 está Inalcançável (DOWN)",
      target_device: {
        name: "SW-CORE-LUANDA-01",
        ip: "10.200.0.1",
        model: "Cisco Catalyst 9500",
      },
      organization_name: "Unitel Angola",
      severity: "critical",
      status: "TRIGGERED",
      started_at: "16:42:01 WAT",
      duration_str: "00h 08m 12s",
      sla_remaining_str: "SLA Restante: 06m 48s",
      glpi_ticket_id: 8492,
      priority_label: "P1 CRÍTICO (DOWN)",
      assigned_operator: null,
      timeline: [],
    };

    it("deve renderizar dados do dispositivo e operador responsável", () => {
      render(
        <AcknowledgeModal
          isOpen={true}
          incident={mockIncident}
          onClose={vi.fn()}
          onConfirm={vi.fn()}
          operatorName="Daniel Ndonda"
          operatorRole="NOC Lead"
        />
      );

      expect(screen.getByTestId("acknowledge-modal")).toBeInTheDocument();
      expect(screen.getByText("SW-CORE-LUANDA-01")).toBeInTheDocument();
      expect(screen.getByText("10.200.0.1")).toBeInTheDocument();
      expect(screen.getByText("Daniel Ndonda")).toBeInTheDocument();
      expect(screen.getByText(/NOC Lead/i)).toBeInTheDocument();
    });

    it("deve disparar onConfirm com o id do incidente ao clicar no botão de confirmação", () => {
      const handleConfirm = vi.fn();
      render(
        <AcknowledgeModal
          isOpen={true}
          incident={mockIncident}
          onClose={vi.fn()}
          onConfirm={handleConfirm}
        />
      );

      const confirmBtn = screen.getByTestId("btn-confirm-ack");
      fireEvent.click(confirmBtn);

      expect(handleConfirm).toHaveBeenCalledWith("inc-8492");
    });
  });

  /* ------------------------------------------------------------------------- */
  /* 3. Modal de Resolução e Causa Raiz Técnica (ResolveIncidentModal)         */
  /* ------------------------------------------------------------------------- */
  describe("3. Componente ResolveIncidentModal", () => {
    const mockIncident: IncidentItem = {
      id: "inc-8488",
      code: "INC-8488",
      title: "API-GATEWAY-PROD: Latência P95 > 140ms",
      target_device: {
        name: "API-GATEWAY-PROD",
        ip: "10.100.4.12",
        model: "K8s Ingress Controller",
      },
      organization_name: "Banco Sol",
      severity: "degraded",
      status: "ACKNOWLEDGED",
      started_at: "15:10:22 WAT",
      duration_str: "01h 39m 48s",
      sla_remaining_str: "SLA: 02h 20m restante",
      glpi_ticket_id: 8488,
      priority_label: "P2 ALTO (DEGRADADO)",
      assigned_operator: {
        id: "usr-dn",
        name: "Daniel Ndonda",
        initials: "DN",
      },
      timeline: [],
    };

    it("deve rejeitar submissão com causa raiz vazia ou menor que 20 caracteres", () => {
      const handleResolve = vi.fn();
      render(
        <ResolveIncidentModal
          isOpen={true}
          incident={mockIncident}
          onClose={vi.fn()}
          onResolve={handleResolve}
        />
      );

      const rcaInput = screen.getByTestId("input-root-cause");
      fireEvent.change(rcaInput, { target: { value: "Curto" } });

      const submitBtn = screen.getByTestId("btn-confirm-resolution");
      fireEvent.click(submitBtn);

      // Não deve chamar onResolve
      expect(handleResolve).not.toHaveBeenCalled();

      // Deve exibir mensagem de erro de validação
      expect(screen.getByTestId("rca-error-alert")).toBeInTheDocument();
      expect(screen.getByText(/mínimo de 20 caracteres/i)).toBeInTheDocument();
    });

    it("deve permitir submissão com causa raiz válida preenchida", () => {
      const handleResolve = vi.fn();
      render(
        <ResolveIncidentModal
          isOpen={true}
          incident={mockIncident}
          onClose={vi.fn()}
          onResolve={handleResolve}
        />
      );

      const rcaInput = screen.getByTestId("input-root-cause");
      fireEvent.change(rcaInput, {
        target: {
          value: "Falha de saturação de conexões no pod Ingress; escala horizontal ativada.",
        },
      });

      // Marca isenção de SLA
      const slaCheckbox = screen.getByTestId("checkbox-sla-exemption");
      fireEvent.click(slaCheckbox);

      const submitBtn = screen.getByTestId("btn-confirm-resolution");
      fireEvent.click(submitBtn);

      expect(handleResolve).toHaveBeenCalledWith("inc-8488", {
        root_cause: "Falha de saturação de conexões no pod Ingress; escala horizontal ativada.",
        corrective_action: "",
        failure_category: "hardware",
        is_sla_exempt: true,
        close_glpi: true,
      });
    });
  });

  /* ------------------------------------------------------------------------- */
  /* 4. Linha do Tempo Visual e Telemetria (IncidentTimeline)                  */
  /* ------------------------------------------------------------------------- */
  describe("4. Componente IncidentTimeline", () => {
    it("deve renderizar diagnóstico de sondas e eventos cronológicos", () => {
      const mockEvents = [
        {
          id: "evt-1",
          timestamp: "16:42:01 UTC",
          type: "probe_fail" as const,
          title: "Primeira Falha de Ping",
          description: "Sonda detectou timeout.",
        },
        {
          id: "evt-2",
          timestamp: "16:43:01 UTC",
          type: "escalation" as const,
          title: "Escalação para SEV-1",
          description: "3 falhas confirmadas.",
        },
      ];

      render(
        <IncidentTimeline
          events={mockEvents}
          targetDeviceName="SW-CORE-LUANDA-01"
          targetDeviceIp="10.200.0.1"
          packetLoss="100%"
        />
      );

      expect(screen.getByTestId("incident-timeline")).toBeInTheDocument();
      expect(screen.getByText("SW-CORE-LUANDA-01")).toBeInTheDocument();
      expect(screen.getByText("10.200.0.1")).toBeInTheDocument();
      expect(screen.getByText("Primeira Falha de Ping")).toBeInTheDocument();
      expect(screen.getByText("Escalação para SEV-1")).toBeInTheDocument();
    });
  });

  /* ------------------------------------------------------------------------- */
  /* 5. Página IncidentManagement: Renderização e Filtros                     */
  /* ------------------------------------------------------------------------- */
  describe("5. Página IncidentManagement: Renderização e Filtros", () => {
    it("deve renderizar o título, KPIs e tabela nominal com 5 incidentes canônicos", async () => {
      renderWithProviders(<IncidentManagement />);

      await waitFor(() => {
        expect(screen.getByTestId("incidents-page")).toBeInTheDocument();
      });

      expect(screen.getByText("Gestão Operacional de Incidentes")).toBeInTheDocument();
      expect(screen.getByTestId("kpi-cards")).toBeInTheDocument();
      expect(screen.getByTestId("incidents-table")).toBeInTheDocument();

      // Verifica incidentes conhecidos
      expect(screen.getByText("INC-8492")).toBeInTheDocument();
      expect(screen.getByText("INC-8488")).toBeInTheDocument();
      expect(screen.getByText("INC-8499")).toBeInTheDocument();
      expect(screen.getByText("INC-8470")).toBeInTheDocument();
      expect(screen.getByText("INC-8465")).toBeInTheDocument();
    });

    it("deve filtrar por severidade ao clicar nas pills", async () => {
      renderWithProviders(<IncidentManagement />);

      await waitFor(() => {
        expect(screen.getByText("INC-8492")).toBeInTheDocument();
      });

      // Clica em 'Críticos'
      const critBtn = screen.getByTestId("filter-severity-critical");
      fireEvent.click(critBtn);

      expect(screen.getByText("INC-8492")).toBeInTheDocument();
      expect(screen.queryByText("INC-8488")).not.toBeInTheDocument();
      expect(screen.queryByText("INC-8470")).not.toBeInTheDocument();

      // Clica em 'Degradados'
      const degBtn = screen.getByTestId("filter-severity-degraded");
      fireEvent.click(degBtn);

      expect(screen.getByText("INC-8488")).toBeInTheDocument();
      expect(screen.getByText("INC-8499")).toBeInTheDocument();
      expect(screen.queryByText("INC-8492")).not.toBeInTheDocument();

      // Clica em 'Resolvidos'
      const resBtn = screen.getByTestId("filter-severity-resolved");
      fireEvent.click(resBtn);

      expect(screen.getByText("INC-8470")).toBeInTheDocument();
      expect(screen.getByText("INC-8465")).toBeInTheDocument();
      expect(screen.queryByText("INC-8492")).not.toBeInTheDocument();

      // Restaura 'Todos'
      const allBtn = screen.getByTestId("filter-severity-all");
      fireEvent.click(allBtn);

      expect(screen.getByText("INC-8492")).toBeInTheDocument();
      expect(screen.getByText("INC-8488")).toBeInTheDocument();
    });

    it("deve filtrar por termo de busca no input monospaçado", async () => {
      renderWithProviders(<IncidentManagement />);

      await waitFor(() => {
        expect(screen.getByText("INC-8492")).toBeInTheDocument();
      });

      const searchInput = screen.getByTestId("filter-search-input");
      fireEvent.change(searchInput, { target: { value: "Banco Sol" } });

      expect(screen.getByText("INC-8488")).toBeInTheDocument();
      expect(screen.queryByText("INC-8492")).not.toBeInTheDocument();
      expect(screen.queryByText("INC-8470")).not.toBeInTheDocument();
    });

    it("deve selecionar e desmarcar todos os checkboxes da tabela", async () => {
      renderWithProviders(<IncidentManagement />);

      await waitFor(() => {
        expect(screen.getByTestId("select-all-checkbox")).toBeInTheDocument();
      });

      const selectAll = screen.getByTestId("select-all-checkbox") as HTMLInputElement;
      expect(selectAll.checked).toBe(false);

      // Seleciona todos
      fireEvent.click(selectAll);
      expect(selectAll.checked).toBe(true);

      const check1 = screen.getByTestId("checkbox-incident-inc-8492") as HTMLInputElement;
      expect(check1.checked).toBe(true);

      // Desmarca todos
      fireEvent.click(selectAll);
      expect(selectAll.checked).toBe(false);
      expect(check1.checked).toBe(false);
    });
  });

  /* ------------------------------------------------------------------------- */
  /* 6. Fluxos Operacionais: Acknowledge, Abertura GLPI e Resolução RCA       */
  /* ------------------------------------------------------------------------- */
  describe("6. Fluxos Operacionais Completos", () => {
    it("deve permitir reconhecer (Ack) um incidente não atendido", async () => {
      renderWithProviders(<IncidentManagement />);

      await waitFor(() => {
        expect(screen.getByTestId("btn-ack-inc-8492")).toBeInTheDocument();
      });

      // Clica em 'Reconhecer (Ack)' no INC-8492
      fireEvent.click(screen.getByTestId("btn-ack-inc-8492"));

      // Modal de confirmação é exibido
      expect(screen.getByTestId("acknowledge-modal")).toBeInTheDocument();

      // Confirma no modal
      fireEvent.click(screen.getByTestId("btn-confirm-ack"));

      // Modal fecha e o botão agora se torna 'Resolver'
      await waitFor(() => {
        expect(screen.queryByTestId("acknowledge-modal")).not.toBeInTheDocument();
        expect(screen.getByTestId("btn-resolve-inc-8492")).toBeInTheDocument();
      });
    });

    it("deve criar chamado no GLPI em 1 clique para incidente sem ticket", async () => {
      renderWithProviders(<IncidentManagement />);

      await waitFor(() => {
        expect(screen.getByTestId("btn-create-glpi-inc-8499")).toBeInTheDocument();
      });

      // Clica em 'Abrir Chamado no GLPI'
      fireEvent.click(screen.getByTestId("btn-create-glpi-inc-8499"));

      // Aguarda criação do chamado e exibição do link seguro
      await waitFor(() => {
        expect(screen.getByTestId("glpi-ticket-link-inc-8499")).toBeInTheDocument();
      });
    });

    it("deve abrir o modal de resolução e encerrar o incidente com Causa Raiz", async () => {
      renderWithProviders(<IncidentManagement />);

      await waitFor(() => {
        expect(screen.getByTestId("btn-resolve-inc-8488")).toBeInTheDocument();
      });

      // Clica em 'Resolver' no INC-8488
      fireEvent.click(screen.getByTestId("btn-resolve-inc-8488"));

      expect(screen.getByTestId("resolve-incident-modal")).toBeInTheDocument();

      // Digita causa raiz técnica com mais de 20 caracteres
      const rcaInput = screen.getByTestId("input-root-cause");
      fireEvent.change(rcaInput, {
        target: {
          value: "Reciclagem do pool de conexões do K8s Ingress e limpeza de buffer TCP.",
        },
      });

      // Confirma resolução
      fireEvent.click(screen.getByTestId("btn-confirm-resolution"));

      // Modal fecha e o botão passa a ser 'Relatório Forense'
      await waitFor(() => {
        expect(screen.queryByTestId("resolve-incident-modal")).not.toBeInTheDocument();
        expect(screen.getByTestId("btn-forensic-inc-8488")).toBeInTheDocument();
      });
    });

    it("deve abrir a gaveta lateral (slide-over drawer) com histórico operacional", async () => {
      renderWithProviders(<IncidentManagement />);

      await waitFor(() => {
        expect(screen.getByTestId("btn-open-drawer-inc-8492")).toBeInTheDocument();
      });

      // Abre drawer
      fireEvent.click(screen.getByTestId("btn-open-drawer-inc-8492"));

      expect(screen.getByTestId("incident-drawer-container")).toBeInTheDocument();
      expect(screen.getByTestId("incident-timeline")).toBeInTheDocument();

      // Fecha drawer
      fireEvent.click(screen.getByTestId("btn-close-drawer"));
      expect(screen.queryByTestId("incident-drawer-container")).not.toBeInTheDocument();
    });
  });

  /* ------------------------------------------------------------------------- */
  /* 7. Quatro Estados Canônicos de Interface                                  */
  /* ------------------------------------------------------------------------- */
  describe("7. Quatro Estados Canônicos de Interface", () => {
    it("deve renderizar estado Skeleton quando solicitado", async () => {
      renderWithProviders(<IncidentManagement initialViewState="skeleton" />);

      expect(screen.getByTestId("skeleton-state-container")).toBeInTheDocument();
    });

    it("deve renderizar estado Vazio e permitir restauração", async () => {
      renderWithProviders(<IncidentManagement initialViewState="empty" />);

      expect(screen.getByTestId("empty-state-container")).toBeInTheDocument();
      expect(screen.getByText("Nenhum Incidente Ativo no Momento")).toBeInTheDocument();

      // Clica em 'Recarregar Dados Reais'
      fireEvent.click(screen.getByTestId("btn-empty-reset"));
      await waitFor(() => {
        expect(screen.queryByTestId("empty-state-container")).not.toBeInTheDocument();
        expect(screen.getByTestId("incidents-table")).toBeInTheDocument();
      });
    });

    it("deve renderizar estado de Erro SSE e permitir reconexão", async () => {
      renderWithProviders(<IncidentManagement initialViewState="error" />);

      expect(screen.getByTestId("state-overlay-error")).toBeInTheDocument();
      expect(screen.getByText(/FALHA DE SINCRONIZAÇÃO SSE/i)).toBeInTheDocument();

      // Clica em 'Reconectar Agora'
      fireEvent.click(screen.getByTestId("btn-reconnect-sse"));
      expect(screen.queryByTestId("state-overlay-error")).not.toBeInTheDocument();
    });
  });
});
