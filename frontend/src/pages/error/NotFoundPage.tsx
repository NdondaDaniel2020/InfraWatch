import React from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Compass } from "lucide-react";
import { Button } from "../../components/ui/Button";
import { Card, CardContent } from "../../components/ui/Card";

export const NotFoundPage: React.FC = () => {
  return (
    <div
      data-testid="not-found-page"
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flex: 1,
        minHeight: "400px",
      }}
    >
      <Card style={{ maxWidth: "480px", width: "100%", textAlign: "center" }}>
        <CardContent style={{ padding: "36px 24px" }}>
          <div
            style={{
              width: "56px",
              height: "56px",
              borderRadius: "50%",
              backgroundColor: "rgba(59, 130, 246, 0.12)",
              color: "var(--color-primary)",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              marginBottom: "16px",
            }}
          >
            <Compass size={28} />
          </div>

          <h2 style={{ fontSize: "1.25rem", fontWeight: 700, marginBottom: "8px" }}>
            Rota Não Encontrada (404)
          </h2>

          <p style={{ fontSize: "0.875rem", color: "var(--color-text-secondary)", marginBottom: "20px" }}>
            O endereço solicitado não existe ou foi descontinuado na topologia do sistema.
          </p>

          <div style={{ display: "flex", justifyContent: "center", gap: "12px" }}>
            <Link to="/" style={{ textDecoration: "none" }}>
              <Button variant="secondary" leftIcon={<ArrowLeft size={16} />}>
                Voltar ao Início
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
