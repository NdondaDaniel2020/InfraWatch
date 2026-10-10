import React, { useState } from "react";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Layers,
  Radio,
  Server,
  ShieldAlert,
  Wrench,
} from "lucide-react";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  Modal,
  Skeleton,
} from "./components/ui";

export const App: React.FC = () => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [btnLoading, setBtnLoading] = useState(false);

  const toggleLoading = () => {
    setBtnLoading(true);
    setTimeout(() => setBtnLoading(false), 1500);
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        backgroundColor: "var(--color-bg-deep)",
        padding: "32px 24px",
        display: "flex",
        flexDirection: "column",
        gap: "32px",
        maxWidth: "1400px",
        margin: "0 auto",
        width: "100%",
      }}
    >
      {/* Header do Cockpit NOC */}
      <header
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          borderBottom: "var(--border-subtle)",
          paddingBottom: "24px",
          flexWrap: "wrap",
          gap: "16px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
          <div
            style={{
              padding: "10px",
              borderRadius: "var(--radius-md)",
              backgroundColor: "rgba(59, 130, 246, 0.12)",
              border: "1px solid rgba(59, 130, 246, 0.25)",
              color: "var(--color-primary)",
              display: "flex",
            }}
          >
            <Radio size={24} className="pulse-indicator" />
          </div>
          <div>
            <h1
              style={{
                fontSize: "1.5rem",
                fontWeight: 700,
                letterSpacing: "-0.02em",
                color: "var(--color-text-primary)",
              }}
            >
              InfraWatch NOC Cockpit
            </h1>
            <p style={{ fontSize: "0.875rem", color: "var(--color-text-secondary)" }}>
              Design System <span style={{ color: "#38BDF8" }}>Obsidian Telemetry</span> —
              Monitoramento Contínuo 24/7
            </p>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <Badge variant="healthy" pulse>
            TELEMETRIA AO VIVO
          </Badge>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              fontSize: "0.8125rem",
              color: "var(--color-text-secondary)",
              fontFamily: "var(--font-mono)",
            }}
          >
            <Clock size={14} />
            <span>UTC 2026-10-10</span>
          </div>
        </div>
      </header>

      {/* Grid de Métricas Principais (SLA e Saúde de Rede) */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
          gap: "20px",
        }}
      >
        <Card elevated>
          <CardHeader>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <CardTitle>Disponibilidade Geral (SLA)</CardTitle>
              <Activity size={18} color="var(--color-healthy)" />
            </div>
            <CardDescription>Janela deslizante de 30 dias com isenção</CardDescription>
          </CardHeader>
          <CardContent>
            <div
              className="font-mono"
              style={{
                fontSize: "2.25rem",
                fontWeight: 700,
                color: "var(--color-healthy)",
                lineHeight: 1,
              }}
            >
              99.98%
            </div>
            <p style={{ fontSize: "0.75rem", color: "var(--color-text-muted)", marginTop: "8px" }}>
              Meta contratual: 99.50% (+0.48% acima da margem)
            </p>
          </CardContent>
          <CardFooter>
            <Badge variant="healthy" size="sm">
              SLA ATENDIDO
            </Badge>
          </CardFooter>
        </Card>

        <Card elevated>
          <CardHeader>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <CardTitle>Ativos em Monitoramento</CardTitle>
              <Server size={18} color="var(--color-primary)" />
            </div>
            <CardDescription>Roteadores, switches e firewalls ativos</CardDescription>
          </CardHeader>
          <CardContent>
            <div
              className="font-mono"
              style={{
                fontSize: "2.25rem",
                fontWeight: 700,
                color: "var(--color-text-primary)",
                lineHeight: 1,
              }}
            >
              248
            </div>
            <p style={{ fontSize: "0.75rem", color: "var(--color-text-muted)", marginTop: "8px" }}>
              246 UP • 1 DEGRADED • 1 EM MANUTENÇÃO
            </p>
          </CardContent>
          <CardFooter>
            <div style={{ display: "flex", gap: "6px" }}>
              <Badge variant="healthy" size="sm">
                246 UP
              </Badge>
              <Badge variant="degraded" size="sm">
                1 WARN
              </Badge>
            </div>
          </CardFooter>
        </Card>

        <Card elevated>
          <CardHeader>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <CardTitle>Incidentes Críticos Abertos</CardTitle>
              <ShieldAlert size={18} color="var(--color-critical)" />
            </div>
            <CardDescription>Ocorrências ativas sem resolução</CardDescription>
          </CardHeader>
          <CardContent>
            <div
              className="font-mono"
              style={{
                fontSize: "2.25rem",
                fontWeight: 700,
                color: "var(--color-critical)",
                lineHeight: 1,
              }}
            >
              0
            </div>
            <p style={{ fontSize: "0.75rem", color: "var(--color-text-muted)", marginTop: "8px" }}>
              Zero indisponibilidades ativas na rede no momento
            </p>
          </CardContent>
          <CardFooter>
            <Badge variant="healthy" size="sm">
              REDE ÍNTEGRA
            </Badge>
          </CardFooter>
        </Card>
      </div>

      {/* Showcase de Componentes do Design System */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "24px" }}>
        {/* Badges Semânticos */}
        <Card>
          <CardHeader>
            <CardTitle>Badges Semânticos de Telemetria</CardTitle>
            <CardDescription>Identificadores de estado da rede e inventário</CardDescription>
          </CardHeader>
          <CardContent style={{ display: "flex", flexWrap: "wrap", gap: "10px" }}>
            <Badge variant="healthy" pulse>
              HEALTHY / UP
            </Badge>
            <Badge variant="degraded" pulse>
              DEGRADED / WARNING
            </Badge>
            <Badge variant="critical" pulse>
              CRITICAL / DOWN
            </Badge>
            <Badge variant="maintenance">MANUTENÇÃO ISENTA</Badge>
            <Badge variant="neutral">OFFLINE</Badge>
          </CardContent>
        </Card>

        {/* Variantes de Botões */}
        <Card>
          <CardHeader>
            <CardTitle>Ações do Operador NOC (Buttons)</CardTitle>
            <CardDescription>Variantes de interação do Design System</CardDescription>
          </CardHeader>
          <CardContent style={{ display: "flex", flexWrap: "wrap", gap: "10px" }}>
            <Button variant="primary" leftIcon={<CheckCircle2 size={16} />}>
              Reconhecer Alerta
            </Button>
            <Button
              variant="secondary"
              leftIcon={<Wrench size={16} />}
              onClick={() => setIsModalOpen(true)}
            >
              Agendar Manutenção
            </Button>
            <Button
              variant="destructive"
              leftIcon={<AlertTriangle size={16} />}
              onClick={toggleLoading}
              isLoading={btnLoading}
            >
              Declarar Incidente
            </Button>
            <Button variant="outline">Ver Logs</Button>
            <Button variant="ghost">Exportar</Button>
          </CardContent>
        </Card>
      </div>

      {/* Skeleton de Carregamento Shimmer */}
      <Card>
        <CardHeader>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <CardTitle>Estados de Carregamento (Skeleton Shimmer)</CardTitle>
            <Layers size={18} color="var(--color-text-muted)" />
          </div>
          <CardDescription>Indicador de carregamento assíncrono em dark mode</CardDescription>
        </CardHeader>
        <CardContent style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <Skeleton circle height={36} width={36} />
            <div style={{ display: "flex", flexDirection: "column", gap: "6px", flex: 1 }}>
              <Skeleton height={16} width="40%" />
              <Skeleton height={12} width="25%" />
            </div>
          </div>
          <Skeleton height={24} width="100%" />
          <Skeleton height={24} width="85%" />
        </CardContent>
      </Card>

      {/* Modal de Agendamento */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Agendar Janela de Manutenção"
        description="Períodos aprovados não penalizam o cálculo de SLA contratual do cliente."
        footer={
          <>
            <Button variant="outline" onClick={() => setIsModalOpen(false)}>
              Cancelar
            </Button>
            <Button
              variant="primary"
              onClick={() => {
                alert("Janela cadastrada com sucesso!");
                setIsModalOpen(false);
              }}
            >
              Confirmar Agendamento
            </Button>
          </>
        }
      >
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          <div>
            <label
              style={{
                display: "block",
                fontSize: "0.8125rem",
                color: "var(--color-text-secondary)",
                marginBottom: "6px",
              }}
            >
              Descrição Técnica
            </label>
            <input
              type="text"
              defaultValue="Substituição preventiva de módulo GBIC 10Gbps"
              style={{
                width: "100%",
                padding: "8px 12px",
                backgroundColor: "var(--color-surface-card)",
                border: "var(--border-subtle)",
                borderRadius: "var(--radius-sm)",
                color: "var(--color-text-primary)",
                fontFamily: "var(--font-sans)",
                fontSize: "0.875rem",
                outline: "none",
              }}
            />
          </div>
          <Badge variant="maintenance">ISENÇÃO ATIVA CONFORME ADR-011</Badge>
        </div>
      </Modal>
    </div>
  );
};
