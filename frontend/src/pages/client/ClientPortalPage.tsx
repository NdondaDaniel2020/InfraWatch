import React from "react";
import { Building2, CheckCircle2, ShieldCheck } from "lucide-react";
import { Badge } from "../../components/ui/Badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/Card";

export const ClientPortalPage: React.FC = () => {
  return (
    <div
      data-testid="client-portal-page"
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "24px",
        maxWidth: "1200px",
        width: "100%",
        margin: "0 auto",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "12px" }}>
        <div>
          <h1 style={{ fontSize: "1.5rem", fontWeight: 700, letterSpacing: "-0.02em" }}>
            Portal do Cliente Corporativo
          </h1>
          <p style={{ fontSize: "0.875rem", color: "var(--color-text-secondary)", marginTop: "2px" }}>
            Visão executiva sanitizada de disponibilidade de serviços e cumprimento de SLA contratual.
          </p>
        </div>

        <Badge variant="healthy" dot>
          SLA CUMPRIDO: 99.98%
        </Badge>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
          gap: "16px",
        }}
      >
        <Card>
          <CardHeader>
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <Building2 size={20} style={{ color: "var(--color-primary)" }} />
              <CardTitle>Disponibilidade Acumulada</CardTitle>
            </div>
            <CardDescription>Mês corrente sem violação do target de 99.9%</CardDescription>
          </CardHeader>
          <CardContent>
            <div style={{ fontSize: "2.5rem", fontWeight: 700, fontFamily: "var(--font-mono)", color: "var(--color-healthy)" }}>
              99.98%
            </div>
            <p style={{ fontSize: "0.75rem", color: "var(--color-text-secondary)", marginTop: "8px" }}>
              Janelas de manutenção programadas foram devidamente isentas do cálculo de downtime.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <ShieldCheck size={20} style={{ color: "var(--color-healthy)" }} />
              <CardTitle>Serviços Corporativos Ativos</CardTitle>
            </div>
            <CardDescription>Sistemas corporativos monitorados externamente</CardDescription>
          </CardHeader>
          <CardContent>
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span>Portal Web & API Gateway</span>
                <span style={{ color: "var(--color-healthy)", fontSize: "0.75rem", display: "flex", alignItems: "center", gap: "4px" }}>
                  <CheckCircle2 size={12} /> UP
                </span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span>Banco de Dados & Armazenamento</span>
                <span style={{ color: "var(--color-healthy)", fontSize: "0.75rem", display: "flex", alignItems: "center", gap: "4px" }}>
                  <CheckCircle2 size={12} /> UP
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
