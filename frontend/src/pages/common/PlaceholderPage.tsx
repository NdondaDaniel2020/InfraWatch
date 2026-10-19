import React from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/Card";
import { Badge } from "../../components/ui/Badge";

export interface PlaceholderPageProps {
  title: string;
  description: string;
  badgeText?: string;
  testId?: string;
}

export const PlaceholderPage: React.FC<PlaceholderPageProps> = ({
  title,
  description,
  badgeText = "MÓDULO OPERACIONAL",
  testId,
}) => {
  return (
    <div
      data-testid={testId || "placeholder-page"}
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "24px",
        maxWidth: "1400px",
        width: "100%",
        margin: "0 auto",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "12px" }}>
        <div>
          <h1 style={{ fontSize: "1.5rem", fontWeight: 700, letterSpacing: "-0.02em" }}>
            {title}
          </h1>
          <p style={{ fontSize: "0.875rem", color: "var(--color-text-secondary)", marginTop: "2px" }}>
            {description}
          </p>
        </div>

        <Badge variant="neutral" dot>
          {badgeText}
        </Badge>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Visão Operacional</CardTitle>
          <CardDescription>
            Este módulo está ativo no roteamento principal e preparado para conexão com as APIs de telemetria.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div
            style={{
              padding: "48px 24px",
              textAlign: "center",
              color: "var(--color-text-muted)",
              fontFamily: "var(--font-mono)",
              fontSize: "0.875rem",
            }}
          >
            Interface carregada sob o Shell AppLayout com permissões RBAC validadas.
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
