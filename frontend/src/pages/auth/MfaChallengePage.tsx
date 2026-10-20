import React, { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { Button } from "../../components/ui/Button";
import { Card, CardContent, CardFooter, CardHeader } from "../../components/ui/Card";
import { AlertTriangle, ArrowLeft, CheckCircle2, KeyRound, ShieldAlert } from "lucide-react";

export const MfaChallengePage: React.FC = () => {
  const { mfaPendingToken, submitMfaChallenge, clearMfaPending } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const from =
    (location.state as { from?: { pathname: string } })?.from?.pathname || "/";

  const [code, setCode] = useState("");
  const [isBackupMode, setIsBackupMode] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Se não houver token pendente, redireciona de volta para o login
  React.useEffect(() => {
    if (!mfaPendingToken) {
      navigate("/login", { replace: true });
    }
  }, [mfaPendingToken, navigate]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setErrorMessage(null);

    const cleanCode = code.trim();
    if (!cleanCode) {
      setErrorMessage(
        isBackupMode
          ? "Informe o código de backup de recuperação."
          : "Informe o código de 6 dígitos gerado no seu aplicativo."
      );
      return;
    }

    if (!isBackupMode && cleanCode.length !== 6) {
      setErrorMessage("O código TOTP deve conter exatamente 6 dígitos.");
      return;
    }

    setIsSubmitting(true);
    try {
      const user = await submitMfaChallenge(cleanCode);
      if (user.role === "CLIENT_VIEWER" && from === "/") {
        navigate("/portal", { replace: true });
      } else {
        navigate(from, { replace: true });
      }
    } catch (err) {
      setErrorMessage(
        err instanceof Error
          ? err.message
          : "Código inválido ou expirado. Tente novamente."
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancel = () => {
    clearMfaPending();
    navigate("/login", { replace: true });
  };

  return (
    <main
      data-testid="mfa-challenge-page"
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
              backgroundColor: "rgba(245, 158, 11, 0.1)",
              border: "1px solid rgba(245, 158, 11, 0.3)",
              color: "var(--color-warning)",
              margin: "0 auto 12px auto",
            }}
          >
            {isBackupMode ? <KeyRound size={28} /> : <ShieldAlert size={28} />}
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
            {isBackupMode ? "Código de Backup" : "Verificação em Duas Etapas"}
          </h1>
          <p
            style={{
              fontSize: "0.8125rem",
              color: "var(--color-text-secondary)",
              margin: "6px 0 0 0",
            }}
          >
            {isBackupMode
              ? "Insira um dos seus códigos de recuperação descartáveis"
              : "Insira o código de 6 dígitos do Google Authenticator ou similar"}
          </p>
        </CardHeader>

        <CardContent style={{ padding: "24px" }}>
          {errorMessage && (
            <div
              role="alert"
              aria-live="polite"
              data-testid="mfa-error-alert"
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
                htmlFor="mfa-code"
                style={{
                  display: "block",
                  fontSize: "0.8125rem",
                  fontWeight: 600,
                  color: "var(--color-text-primary)",
                  marginBottom: "8px",
                  textAlign: "center",
                }}
              >
                {isBackupMode ? "Código de Recuperação" : "Código TOTP (6 dígitos)"}
              </label>
              <input
                id="mfa-code"
                name="code"
                type="text"
                inputMode={isBackupMode ? "text" : "numeric"}
                autoComplete="one-time-code"
                autoFocus
                required
                maxLength={isBackupMode ? 16 : 6}
                placeholder={isBackupMode ? "Ex: a1b2c3d4" : "000000"}
                value={code}
                onChange={(e) => {
                  const val = isBackupMode
                    ? e.target.value
                    : e.target.value.replace(/\D/g, "");
                  setCode(val);
                }}
                style={{
                  width: "100%",
                  padding: "14px",
                  borderRadius: "var(--radius-sm)",
                  border: "1px solid var(--color-border-focus)",
                  backgroundColor: "var(--color-bg-deep)",
                  color: "var(--color-text-primary)",
                  fontSize: isBackupMode ? "1.125rem" : "1.75rem",
                  fontWeight: 700,
                  textAlign: "center",
                  letterSpacing: isBackupMode ? "0.15em" : "0.3em",
                  fontFamily: "var(--font-mono)",
                  outline: "none",
                  boxShadow: "0 0 12px rgba(16, 185, 129, 0.15)",
                }}
              />
            </div>

            <Button
              type="submit"
              variant="primary"
              size="lg"
              fullWidth
              isLoading={isSubmitting}
              disabled={isSubmitting || !code}
              icon={<CheckCircle2 size={16} />}
              iconPosition="right"
            >
              Confirmar e Acessar
            </Button>
          </form>

          {/* Alternância para Código de Backup */}
          <div style={{ marginTop: "16px", textAlign: "center" }}>
            <button
              type="button"
              onClick={() => {
                setIsBackupMode(!isBackupMode);
                setCode("");
                setErrorMessage(null);
              }}
              style={{
                background: "none",
                border: "none",
                color: "var(--color-healthy)",
                fontSize: "0.8125rem",
                cursor: "pointer",
                textDecoration: "underline",
                padding: "6px 12px",
              }}
            >
              {isBackupMode
                ? "← Usar código do aplicativo autenticador"
                : "Perdeu o acesso? Usar código de backup de emergência"}
            </button>
          </div>
        </CardContent>

        <CardFooter
          style={{
            padding: "16px 24px",
            borderTop: "var(--border-subtle)",
            display: "flex",
            justifyContent: "center",
          }}
        >
          <button
            type="button"
            onClick={handleCancel}
            style={{
              background: "none",
              border: "none",
              color: "var(--color-text-muted)",
              fontSize: "0.8125rem",
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
              cursor: "pointer",
            }}
          >
            <ArrowLeft size={14} /> Voltar para o Login
          </button>
        </CardFooter>
      </Card>
    </main>
  );
};
