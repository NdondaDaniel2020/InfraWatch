import React, { useState } from "react";
import { Link } from "react-router-dom";
import { authApi } from "../../services/authApi";
import { Button } from "../../components/ui/Button";
import { Card, CardContent, CardFooter, CardHeader } from "../../components/ui/Card";
import { AlertTriangle, ArrowLeft, CheckCircle2, KeyRound, Mail } from "lucide-react";

export const ForgotPasswordPage: React.FC = () => {
  const [email, setEmail] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    if (!email.trim()) {
      setErrorMessage("Por favor, digite seu endereço de e-mail.");
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await authApi.requestPasswordReset(email.trim());
      setSuccessMessage(res.message);
    } catch (err) {
      setErrorMessage(
        err instanceof Error
          ? err.message
          : "Não foi possível processar a solicitação. Tente novamente."
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main
      data-testid="forgot-password-page"
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
          backgroundColor: "var(--color-surface-card)",
          border: "var(--border-subtle)",
          boxShadow: "0 12px 32px rgba(0, 0, 0, 0.4)",
        }}
      >
        <CardHeader
          style={{
            textAlign: "center",
            padding: "28px 24px 16px 24px",
            borderBottom: "var(--border-subtle)",
          }}
        >
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              width: "48px",
              height: "48px",
              borderRadius: "var(--radius-md)",
              backgroundColor: "rgba(16, 185, 129, 0.1)",
              border: "1px solid var(--color-border-focus)",
              color: "var(--color-healthy)",
              margin: "0 auto 12px auto",
            }}
          >
            <KeyRound size={26} />
          </div>
          <h1
            style={{
              fontSize: "1.25rem",
              fontWeight: 700,
              color: "var(--color-text-primary)",
              letterSpacing: "-0.02em",
              margin: 0,
            }}
          >
            Recuperação de Senha
          </h1>
          <p
            style={{
              fontSize: "0.8125rem",
              color: "var(--color-text-secondary)",
              margin: "6px 0 0 0",
            }}
          >
            Enviaremos instruções seguras para redefinição de acesso
          </p>
        </CardHeader>

        <CardContent style={{ padding: "24px" }}>
          {successMessage && (
            <div
              role="status"
              data-testid="forgot-password-success-alert"
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: "10px",
                padding: "12px",
                borderRadius: "var(--radius-sm)",
                backgroundColor: "rgba(16, 185, 129, 0.1)",
                border: "1px solid var(--color-border-focus)",
                color: "var(--color-healthy)",
                fontSize: "0.8125rem",
                marginBottom: "16px",
              }}
            >
              <CheckCircle2 size={18} style={{ flexShrink: 0, marginTop: "2px" }} />
              <span>{successMessage}</span>
            </div>
          )}

          {errorMessage && (
            <div
              role="alert"
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: "10px",
                padding: "12px",
                borderRadius: "var(--radius-sm)",
                backgroundColor: "var(--color-critical-bg)",
                border: "1px solid var(--color-critical-border)",
                color: "var(--color-critical)",
                fontSize: "0.8125rem",
                marginBottom: "16px",
              }}
            >
              <AlertTriangle size={18} style={{ flexShrink: 0, marginTop: "2px" }} />
              <span>{errorMessage}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} noValidate>
            <div style={{ marginBottom: "20px" }}>
              <label
                htmlFor="reset-email"
                style={{
                  display: "block",
                  fontSize: "0.8125rem",
                  fontWeight: 600,
                  color: "var(--color-text-primary)",
                  marginBottom: "6px",
                }}
              >
                E-mail Cadastrado
              </label>
              <div
                style={{
                  position: "relative",
                  display: "flex",
                  alignItems: "center",
                }}
              >
                <Mail
                  size={16}
                  style={{
                    position: "absolute",
                    left: "12px",
                    color: "var(--color-text-muted)",
                    pointerEvents: "none",
                  }}
                />
                <input
                  id="reset-email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  placeholder="operador@infrawatch.io"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "10px 12px 10px 38px",
                    borderRadius: "var(--radius-sm)",
                    border: "var(--border-subtle)",
                    backgroundColor: "var(--color-bg-deep)",
                    color: "var(--color-text-primary)",
                    fontSize: "0.875rem",
                    outline: "none",
                  }}
                />
              </div>
            </div>

            <Button
              type="submit"
              variant="primary"
              size="lg"
              fullWidth
              isLoading={isSubmitting}
              disabled={isSubmitting || !email}
            >
              Enviar Link de Redefinição
            </Button>
          </form>
        </CardContent>

        <CardFooter
          style={{
            padding: "16px 24px",
            borderTop: "var(--border-subtle)",
            display: "flex",
            justifyContent: "center",
          }}
        >
          <Link
            to="/login"
            style={{
              color: "var(--color-text-muted)",
              fontSize: "0.8125rem",
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
              textDecoration: "none",
            }}
          >
            <ArrowLeft size={14} /> Voltar para o Login
          </Link>
        </CardFooter>
      </Card>
    </main>
  );
};
