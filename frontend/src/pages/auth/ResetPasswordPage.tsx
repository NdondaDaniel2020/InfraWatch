import React, { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { authApi } from "../../services/authApi";
import { Button } from "../../components/ui/Button";
import { Card, CardContent, CardFooter, CardHeader } from "../../components/ui/Card";
import { AlertTriangle, ArrowLeft, CheckCircle2, Eye, EyeOff, Lock, ShieldCheck } from "lucide-react";

export const ResetPasswordPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get("token") || "";

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const isLengthValid = password.length >= 8;
  const hasLetter = /[A-Za-z]/.test(password);
  const hasNumber = /[0-9]/.test(password);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!token) {
      setErrorMessage("Token de redefinição não fornecido ou inválido.");
      return;
    }

    if (password !== confirmPassword) {
      setErrorMessage("As senhas informadas não coincidem.");
      return;
    }

    if (!isLengthValid || !hasLetter || !hasNumber) {
      setErrorMessage("A senha deve conter no mínimo 8 caracteres, com letras e números.");
      return;
    }

    setIsSubmitting(true);
    try {
      await authApi.confirmPasswordReset(token, password);
      setIsSuccess(true);
    } catch (err) {
      setErrorMessage(
        err instanceof Error
          ? err.message
          : "Falha ao redefinir senha. O link pode ter expirado."
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main
      data-testid="reset-password-page"
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
            <ShieldCheck size={26} />
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
            Criar Nova Senha
          </h1>
          <p
            style={{
              fontSize: "0.8125rem",
              color: "var(--color-text-secondary)",
              margin: "6px 0 0 0",
            }}
          >
            Escolha uma senha forte para proteger sua conta
          </p>
        </CardHeader>

        <CardContent style={{ padding: "24px" }}>
          {isSuccess ? (
            <div style={{ textAlign: "center", padding: "12px 0" }}>
              <div
                style={{
                  display: "inline-flex",
                  padding: "12px",
                  borderRadius: "50%",
                  backgroundColor: "rgba(16, 185, 129, 0.1)",
                  color: "var(--color-healthy)",
                  marginBottom: "16px",
                }}
              >
                <CheckCircle2 size={36} />
              </div>
              <h2
                style={{
                  fontSize: "1.125rem",
                  color: "var(--color-text-primary)",
                  fontWeight: 600,
                  marginBottom: "8px",
                }}
              >
                Senha Alterada com Sucesso!
              </h2>
              <p
                style={{
                  fontSize: "0.8125rem",
                  color: "var(--color-text-secondary)",
                  marginBottom: "24px",
                }}
              >
                Sua credencial foi atualizada. Você já pode fazer login no Cockpit com a nova senha.
              </p>
              <Button
                variant="primary"
                size="lg"
                fullWidth
                onClick={() => navigate("/login")}
              >
                Ir para o Login
              </Button>
            </div>
          ) : (
            <>
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
                {/* Nova Senha */}
                <div style={{ marginBottom: "16px" }}>
                  <label
                    htmlFor="reset-new-password"
                    style={{
                      display: "block",
                      fontSize: "0.8125rem",
                      fontWeight: 600,
                      color: "var(--color-text-primary)",
                      marginBottom: "6px",
                    }}
                  >
                    Nova Senha
                  </label>
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
                      id="reset-new-password"
                      name="password"
                      type={showPassword ? "text" : "password"}
                      autoComplete="new-password"
                      required
                      placeholder="Mínimo 8 caracteres"
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
                        padding: "4px",
                      }}
                    >
                      {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>

                {/* Confirmação de Senha */}
                <div style={{ marginBottom: "20px" }}>
                  <label
                    htmlFor="reset-confirm-password"
                    style={{
                      display: "block",
                      fontSize: "0.8125rem",
                      fontWeight: 600,
                      color: "var(--color-text-primary)",
                      marginBottom: "6px",
                    }}
                  >
                    Confirmar Nova Senha
                  </label>
                  <input
                    id="reset-confirm-password"
                    name="confirmPassword"
                    type={showPassword ? "text" : "password"}
                    autoComplete="new-password"
                    required
                    placeholder="Repita a senha"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "10px 12px",
                      borderRadius: "var(--radius-sm)",
                      border: "var(--border-subtle)",
                      backgroundColor: "var(--color-bg-deep)",
                      color: "var(--color-text-primary)",
                      fontSize: "0.875rem",
                      outline: "none",
                    }}
                  />
                </div>

                {/* Requisitos de Segurança */}
                <div
                  style={{
                    backgroundColor: "var(--color-bg-deep)",
                    padding: "12px",
                    borderRadius: "var(--radius-sm)",
                    marginBottom: "20px",
                    fontSize: "0.75rem",
                    color: "var(--color-text-secondary)",
                    display: "flex",
                    flexDirection: "column",
                    gap: "4px",
                  }}
                >
                  <span
                    style={{
                      color: isLengthValid ? "var(--color-healthy)" : "var(--color-text-muted)",
                    }}
                  >
                    • Pelo menos 8 caracteres
                  </span>
                  <span
                    style={{
                      color: hasLetter && hasNumber ? "var(--color-healthy)" : "var(--color-text-muted)",
                    }}
                  >
                    • Letras e números combinados
                  </span>
                </div>

                <Button
                  type="submit"
                  variant="primary"
                  size="lg"
                  fullWidth
                  isLoading={isSubmitting}
                  disabled={isSubmitting || !password || !confirmPassword}
                >
                  Atualizar Senha
                </Button>
              </form>
            </>
          )}
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
