import React, { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { Card, CardContent, CardHeader } from "../../components/ui/Card";
import { AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";

export const GoogleCallbackPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { completeGoogleLogin } = useAuth();

  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    const processCallback = async () => {
      const code = searchParams.get("code");
      const state = searchParams.get("state");
      const error = searchParams.get("error");

      if (error) {
        setStatus("error");
        setErrorMessage(`Autenticação com Google cancelada ou recusada: ${error}`);
        return;
      }

      if (!code || !state) {
        setStatus("error");
        setErrorMessage("Parâmetros de retorno OAuth inválidos ou incompletos.");
        return;
      }

      const savedState = sessionStorage.getItem("google_oauth_state");
      if (savedState && savedState !== state) {
        setStatus("error");
        setErrorMessage("Falha de validação CSRF no retorno da autenticação Google.");
        return;
      }

      try {
        const user = await completeGoogleLogin(code, state);
        setStatus("success");

        const from = sessionStorage.getItem("google_oauth_from") || "/";
        sessionStorage.removeItem("google_oauth_state");
        sessionStorage.removeItem("google_oauth_from");

        setTimeout(() => {
          if (user.role === "CLIENT_VIEWER" && from === "/") {
            navigate("/portal", { replace: true });
          } else {
            navigate(from, { replace: true });
          }
        }, 800);
      } catch (err) {
        setStatus("error");
        setErrorMessage(
          err instanceof Error
            ? err.message
            : "Falha ao validar tokens do Google com o backend."
        );
      }
    };

    processCallback();
  }, [searchParams, completeGoogleLogin, navigate]);

  return (
    <main
      data-testid="google-callback-page"
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px 16px",
        backgroundColor: "var(--color-bg-deep)",
      }}
    >
      <Card
        style={{
          width: "100%",
          maxWidth: "420px",
          textAlign: "center",
          backgroundColor: "var(--color-surface-card)",
          border: "var(--border-subtle)",
          boxShadow: "0 12px 32px rgba(0, 0, 0, 0.4)",
        }}
      >
        <CardHeader style={{ padding: "28px 24px 16px 24px" }}>
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              width: "48px",
              height: "48px",
              borderRadius: "var(--radius-md)",
              backgroundColor:
                status === "error"
                  ? "var(--color-critical-bg)"
                  : "rgba(16, 185, 129, 0.1)",
              border:
                status === "error"
                  ? "1px solid var(--color-critical-border)"
                  : "1px solid var(--color-border-focus)",
              color:
                status === "error"
                  ? "var(--color-critical)"
                  : "var(--color-healthy)",
              margin: "0 auto 12px auto",
            }}
          >
            {status === "loading" && <Loader2 size={26} className="animate-spin" />}
            {status === "success" && <CheckCircle2 size={26} />}
            {status === "error" && <AlertTriangle size={26} />}
          </div>

          <h1
            style={{
              fontSize: "1.25rem",
              fontWeight: 700,
              color: "var(--color-text-primary)",
              margin: 0,
            }}
          >
            {status === "loading" && "Validando com o Google..."}
            {status === "success" && "Autenticado com Sucesso!"}
            {status === "error" && "Falha na Autenticação"}
          </h1>
        </CardHeader>

        <CardContent style={{ padding: "0 24px 28px 24px" }}>
          {status === "loading" && (
            <p style={{ color: "var(--color-text-secondary)", fontSize: "0.875rem" }}>
              Verificando credenciais e sincronizando sessão segura...
            </p>
          )}

          {status === "success" && (
            <p style={{ color: "var(--color-healthy)", fontSize: "0.875rem" }}>
              Redirecionando para o painel operacional...
            </p>
          )}

          {status === "error" && (
            <div>
              <p
                role="alert"
                style={{
                  color: "var(--color-critical)",
                  fontSize: "0.875rem",
                  marginBottom: "20px",
                }}
              >
                {errorMessage}
              </p>
              <Link
                to="/login"
                style={{
                  display: "inline-block",
                  padding: "10px 20px",
                  backgroundColor: "var(--color-surface-hover)",
                  color: "var(--color-text-primary)",
                  borderRadius: "var(--radius-sm)",
                  textDecoration: "none",
                  fontWeight: 600,
                  fontSize: "0.8125rem",
                }}
              >
                Voltar para o Login
              </Link>
            </div>
          )}
        </CardContent>
      </Card>
    </main>
  );
};
