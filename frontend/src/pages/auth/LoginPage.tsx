import React, { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { authApi } from "../../services/authApi";
import { Button } from "../../components/ui/Button";
import { Card, CardContent, CardFooter, CardHeader } from "../../components/ui/Card";
import {
  AlertTriangle,
  ArrowRight,
  Eye,
  EyeOff,
  Lock,
  Mail,
} from "lucide-react";
import { LoginTestPage } from "./LoginTestPage";

export const LoginPage: React.FC = () => {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const from =
    (location.state as { from?: { pathname: string } })?.from?.pathname || "/";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!email.trim() || !password) {
      setErrorMessage("Por favor, preencha o e-mail e a senha.");
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await login({ email: email.trim(), password });

      if (result.mfaRequired) {
        navigate("/login/mfa-challenge", { state: { from } });
        return;
      }

      if (result.user.role === "CLIENT_VIEWER" && from === "/") {
        navigate("/portal", { replace: true });
      } else {
        navigate(from, { replace: true });
      }
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : "Falha na autenticação. Verifique suas credenciais.";
      setErrorMessage(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleGoogleLogin = async () => {
    setErrorMessage(null);
    setIsGoogleLoading(true);
    try {
      const { authorization_url, state } = await authApi.getGoogleAuthUrl();
      sessionStorage.setItem("google_oauth_state", state);
      sessionStorage.setItem("google_oauth_from", from);
      window.location.href = authorization_url;
    } catch (err) {
      setIsGoogleLoading(false);
      setErrorMessage(
        err instanceof Error
          ? err.message
          : "Não foi possível iniciar o login com o Google."
      );
    }
  };

  return (
    <main
      data-testid="login-page"
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
          {/* Logotipo Oficial 3D com Tag NOC */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "10px",
              marginBottom: "12px",
            }}
          >
            <div
              style={{
                width: "36px",
                height: "36px",
                borderRadius: "var(--radius-md)",
                backgroundColor: "rgba(7, 10, 18, 0.8)",
                border: "1px solid rgba(255, 255, 255, 0.12)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: "6px",
                boxShadow: "0 2px 8px rgba(0, 0, 0, 0.3)",
              }}
            >
              <svg viewBox="0 0 24 24" fill="none" style={{ width: "100%", height: "100%" }}>
                <polygon points="12,3 20,7.5 12,12 4,7.5" fill="#ffffff" stroke="#111827" strokeWidth="1.8" strokeLinejoin="round" />
                <polygon points="4,7.5 12,12 12,21 4,16.5" fill="var(--brand-primary, #eab308)" stroke="#ca8a04" strokeWidth="1.8" strokeLinejoin="round" />
                <polygon points="12,12 20,7.5 20,16.5 12,21" fill="#111827" stroke="#374151" strokeWidth="1.8" strokeLinejoin="round" />
              </svg>
            </div>
            <span
              style={{
                fontFamily: "var(--font-sans)",
                fontSize: "1.25rem",
                fontWeight: 700,
                color: "var(--color-text-primary)",
                letterSpacing: "-0.02em",
              }}
            >
              InfraWatch
            </span>
            <span
              style={{
                padding: "2px 8px",
                borderRadius: "var(--radius-full)",
                fontSize: "0.625rem",
                fontFamily: "var(--font-mono)",
                fontWeight: 700,
                backgroundColor: "var(--brand-badge-bg)",
                color: "var(--brand-primary)",
                border: "1px solid var(--brand-badge-border)",
              }}
            >
              NOC
            </span>
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
            Aceda à sua conta
          </h1>
          <p
            style={{
              fontSize: "0.8125rem",
              color: "var(--color-text-secondary)",
              margin: "6px 0 0 0",
            }}
          >
            Cockpit operacional de telemetria e infraestrutura
          </p>
        </CardHeader>

        <CardContent style={{ padding: "24px" }}>
          {errorMessage && (
            <div
              role="alert"
              aria-live="polite"
              data-testid="login-error-alert"
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
            {/* Campo E-mail */}
            <div style={{ marginBottom: "16px" }}>
              <label
                htmlFor="login-email"
                style={{
                  display: "block",
                  fontSize: "0.8125rem",
                  fontWeight: 600,
                  color: "var(--color-text-primary)",
                  marginBottom: "6px",
                }}
              >
                Endereço de E-mail
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
                  id="login-email"
                  name="email"
                  type="email"
                  autoComplete="username"
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
                    transition:
                      "border-color var(--transition-fast), box-shadow var(--transition-fast)",
                  }}
                />
              </div>
            </div>

            {/* Campo Senha */}
            <div style={{ marginBottom: "20px" }}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: "6px",
                }}
              >
                <label
                  htmlFor="login-password"
                  style={{
                    fontSize: "0.8125rem",
                    fontWeight: 600,
                    color: "var(--color-text-primary)",
                  }}
                >
                  Senha de Acesso
                </label>
                <Link
                  to="/password-reset"
                  style={{
                    fontSize: "0.75rem",
                    color: "var(--color-healthy)",
                    textDecoration: "none",
                  }}
                >
                  Esqueci minha senha
                </Link>
              </div>
              <div
                style={{
                  position: "relative",
                  display: "flex",
                  alignItems: "center",
                }}
              >
                <Lock
                  size={16}
                  style={{
                    position: "absolute",
                    left: "12px",
                    color: "var(--color-text-muted)",
                    pointerEvents: "none",
                  }}
                />
                <input
                  id="login-password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  required
                  placeholder="••••••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "10px 38px 10px 38px",
                    borderRadius: "var(--radius-sm)",
                    border: "var(--border-subtle)",
                    backgroundColor: "var(--color-bg-deep)",
                    color: "var(--color-text-primary)",
                    fontSize: "0.875rem",
                    outline: "none",
                    transition:
                      "border-color var(--transition-fast), box-shadow var(--transition-fast)",
                  }}
                />
                <button
                  type="button"
                  aria-label={showPassword ? "Ocultar senha" : "Exibir senha"}
                  onClick={() => setShowPassword(!showPassword)}
                  style={{
                    position: "absolute",
                    right: "10px",
                    background: "none",
                    border: "none",
                    color: "var(--color-text-muted)",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    padding: "4px",
                  }}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {/* Botão de Envio */}
            <Button
              type="submit"
              variant="primary"
              size="lg"
              fullWidth
              isLoading={isSubmitting}
              disabled={isSubmitting || isGoogleLoading}
              icon={<ArrowRight size={16} />}
              iconPosition="right"
            >
              Entrar no Cockpit
            </Button>
          </form>

          {/* Divisor */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              margin: "20px 0",
              color: "var(--color-text-muted)",
              fontSize: "0.75rem",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
            }}
          >
            <div style={{ flex: 1, height: "1px", backgroundColor: "rgba(255, 255, 255, 0.08)" }} />
            <span style={{ padding: "0 12px" }}>ou continue com</span>
            <div style={{ flex: 1, height: "1px", backgroundColor: "rgba(255, 255, 255, 0.08)" }} />
          </div>

          {/* Botão Google OAuth */}
          <Button
            type="button"
            variant="outline"
            size="md"
            fullWidth
            isLoading={isGoogleLoading}
            disabled={isSubmitting || isGoogleLoading}
            onClick={handleGoogleLogin}
            icon={
              <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
                <path
                  fill="#EA4335"
                  d="M12 5c1.6 0 3 .6 4.1 1.6l3.1-3.1C17.3 1.7 14.8 1 12 1 7.4 1 3.5 3.6 1.6 7.4l3.7 2.9C6.2 7.3 8.9 5 12 5z"
                />
                <path
                  fill="#4285F4"
                  d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5c-.3 1.5-1.1 2.8-2.4 3.7l3.7 2.9c2.2-2 3.7-5 3.7-8.8z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.3 14.7c-.2-.7-.4-1.5-.4-2.3s.2-1.6.4-2.3L1.6 7.2C.6 9.2 0 11.5 0 14s.6 4.8 1.6 6.8l3.7-3.1z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c3.2 0 6-1.1 8-3l-3.7-2.9c-1.1.7-2.5 1.2-4.3 1.2-3.1 0-5.8-2.3-6.7-5.3L1.6 16c1.9 3.8 5.8 7 10.4 7z"
                />
              </svg>
            }
          >
            Google OAuth2
          </Button>
        </CardContent>

        <CardFooter
          style={{
            padding: "16px 24px",
            borderTop: "var(--border-subtle)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            fontSize: "0.75rem",
          }}
        >
          <span style={{ color: "var(--color-text-muted)" }}>InfraWatch v0.1.0</span>
          <Link
            to="/login-test"
            style={{
              color: "var(--color-text-secondary)",
              textDecoration: "underline",
              transition: "color var(--transition-fast)",
            }}
          >
            Seletor Rápido (Dev / Testes)
          </Link>
        </CardFooter>
      </Card>
    </main>
  );
};

export { LoginTestPage };
