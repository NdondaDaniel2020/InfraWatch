import React from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, ShieldAlert } from "lucide-react";
import { Button } from "../../components/ui/Button";
import { Card, CardContent } from "../../components/ui/Card";
import { useAuth } from "../../context/AuthContext";

export const AccessDeniedPage: React.FC = () => {
  const { user } = useAuth();

  return (
    <div
      data-testid="access-denied-page"
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
              backgroundColor: "var(--color-critical-bg)",
              color: "var(--color-critical)",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              marginBottom: "16px",
            }}
          >
            <ShieldAlert size={28} />
          </div>

          <h2 style={{ fontSize: "1.25rem", fontWeight: 700, marginBottom: "8px" }}>
            Acesso Não Autorizado (403)
          </h2>

          <p style={{ fontSize: "0.875rem", color: "var(--color-text-secondary)", marginBottom: "20px" }}>
            Seu perfil atual (<strong>{user?.role || "ANONYMOUS"}</strong>) não possui os privilégios
            necessários para acessar este recurso operacional.
          </p>

          <div style={{ display: "flex", justifyContent: "center", gap: "12px" }}>
            <Link to={user?.role === "CLIENT_VIEWER" ? "/portal" : "/noc"} style={{ textDecoration: "none" }}>
              <Button variant="secondary" leftIcon={<ArrowLeft size={16} />}>
                Voltar à Área Segura
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
