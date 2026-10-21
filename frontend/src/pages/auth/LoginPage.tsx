import React, { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useAuth } from "../../context/AuthContext";
import { authApi } from "../../services/authApi";
import { AlertTriangle, Eye, EyeOff, Loader2 } from "lucide-react";
import { LoginTestPage } from "./LoginTestPage";
import vectorArt from "../../assets/images/infrawatch_vector_transparent.png";
import "./LoginPage.css";

const loginSchema = z.object({
  email: z
    .string()
    .min(1, "Por favor, preencha o e-mail e a senha.")
    .email("Formato de e-mail inválido."),
  password: z
    .string()
    .min(1, "Por favor, preencha o e-mail e a senha."),
});

type LoginFormData = z.infer<typeof loginSchema>;

export const LoginPage: React.FC = () => {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const from =
    (location.state as { from?: { pathname: string } })?.from?.pathname || "/";

  const [showPassword, setShowPassword] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: "",
      password: "",
    },
  });

  const onSubmit = async (data: LoginFormData) => {
    setErrorMessage(null);
    try {
      const result = await login({ email: data.email.trim(), password: data.password });

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

  const displayError = errorMessage || errors.email?.message || errors.password?.message;

  return (
    <main data-testid="login-page" className="login-page-canvas">
      {/* Moldura Principal - Card Duplo Obsidian com Glassmorphism (Mockup 01_LoginPage) */}
      <div id="auth-card" className="login-auth-card">
        {/* =================================================================== */}
        {/* COLUNA ESQUERDA: FORMULÁRIO DE LOGIN                                */}
        {/* =================================================================== */}
        <section id="left-column-login" className="login-form-column">
          <div className="login-form-container">
            {/* 1. Logotipo Oficial InfraWatch 3D */}
            <header className="login-brand-header">
              <div className="login-logo-cube-box">
                <svg viewBox="0 0 24 24" fill="none" style={{ width: "100%", height: "100%" }} aria-hidden="true">
                  <polygon points="12,3 20,7.5 12,12 4,7.5" fill="#ffffff" stroke="#111827" strokeWidth="1.8" strokeLinejoin="round" />
                  <polygon points="4,7.5 12,12 12,21 4,16.5" fill="var(--brand-primary, #eab308)" stroke="#ca8a04" strokeWidth="1.8" strokeLinejoin="round" />
                  <polygon points="12,12 20,7.5 20,16.5 12,21" fill="#111827" stroke="#374151" strokeWidth="1.8" strokeLinejoin="round" />
                </svg>
              </div>
              <span className="login-brand-title">InfraWatch</span>
              <span className="login-noc-badge">NOC</span>
            </header>

            {/* 2. Cabeçalho de Boas-vindas */}
            <div className="login-heading-section">
              <h1 className="login-heading-title">Aceda à sua conta</h1>
              <p className="login-heading-subtitle">
                Cockpit operacional de telemetria e infraestrutura.
              </p>
            </div>

            {/* Alerta de Erro Semântico Acessível */}
            {displayError && (
              <div
                role="alert"
                aria-live="polite"
                data-testid="login-error-alert"
                className="login-error-banner"
              >
                <AlertTriangle size={18} style={{ flexShrink: 0, marginTop: "2px" }} />
                <span>{displayError}</span>
              </div>
            )}

            {/* 3. Formulário de Autenticação */}
            <form onSubmit={handleSubmit(onSubmit)} noValidate>
              {/* Campo E-mail */}
              <div className={`login-input-underline ${errors.email ? "has-error" : ""}`}>
                <label htmlFor="login-email" className="login-field-label">
                  Endereço de E-mail
                </label>
                <input
                  id="login-email"
                  type="email"
                  autoComplete="username"
                  required
                  placeholder="operador@infrawatch.io"
                  className="login-input-raw"
                  {...register("email")}
                />
              </div>

              {/* Campo Senha com Toggle */}
              <div className={`login-input-underline ${errors.password ? "has-error" : ""}`}>
                <label htmlFor="login-password" className="login-field-label">
                  Senha de Acesso
                </label>
                <div className="login-field-row">
                  <input
                    id="login-password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="current-password"
                    required
                    placeholder="••••••••••••"
                    className="login-input-raw"
                    {...register("password")}
                  />
                  <button
                    type="button"
                    aria-label={showPassword ? "Ocultar senha" : "Exibir senha"}
                    onClick={() => setShowPassword(!showPassword)}
                    className="login-eye-toggle-btn"
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>

              {/* Linha de Opções: Lembrar por 30 dias & Esqueceu a Senha */}
              <div className="login-options-row">
                <label className="login-remember-label">
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    className="login-remember-checkbox"
                  />
                  <span>Lembrar por 30 dias</span>
                </label>

                <Link to="/password-reset" className="login-forgot-link">
                  Esqueceu a senha?
                </Link>
              </div>

              {/* Botões de Ação em Pílula */}
              <div className="login-actions-group">
                <button
                  type="submit"
                  aria-label="Entrar no Cockpit"
                  disabled={isSubmitting || isGoogleLoading}
                  className="login-btn-primary-pill"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 size={16} className="animate-spin" />
                      <span>Autenticando...</span>
                    </>
                  ) : (
                    <span>Iniciar Sessão</span>
                  )}
                </button>

                <button
                  type="button"
                  onClick={handleGoogleLogin}
                  disabled={isSubmitting || isGoogleLoading}
                  className="login-btn-google-pill"
                >
                  {isGoogleLoading ? (
                    <>
                      <Loader2 size={16} className="animate-spin" />
                      <span>Conectando Google...</span>
                    </>
                  ) : (
                    <>
                      <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
                        <path
                          fill="#4285F4"
                          d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                        />
                        <path
                          fill="#34A853"
                          d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                        />
                        <path
                          fill="#FBBC05"
                          d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                        />
                        <path
                          fill="#EA4335"
                          d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                        />
                      </svg>
                      <span>Continuar com Google Workspace</span>
                    </>
                  )}
                </button>
              </div>

              {/* Rodapé: Navegação e Atalhos */}
              <div className="login-card-footer">
                <div>
                  <span style={{ color: "#94a3b8" }}>Não tem uma conta? </span>
                  <Link
                    to="/dev/login"
                    style={{
                      color: "var(--brand-primary, #eab308)",
                      fontWeight: 600,
                      textDecoration: "underline",
                      textUnderlineOffset: "2px",
                    }}
                  >
                    Solicitar acesso
                  </Link>
                </div>
                <div>
                  <Link to="/login-test" className="login-dev-link">
                    Seletor Rápido (Dev / Testes)
                  </Link>
                </div>
              </div>
            </form>
          </div>
        </section>

        {/* =================================================================== */}
        {/* COLUNA DIREITA: PAINEL DE ARTE VETORIAL & TELEMETRIA OBSIDIAN      */}
        {/* =================================================================== */}
        <section className="login-art-column" aria-hidden="true">
          <div className="login-art-inner-card">
            {/* Halo Dourado de Iluminação Ambiente */}
            <div className="login-art-ambient-halo" />

            {/* Badges Flutuantes de Telemetria Ativa */}
            <div className="telemetry-floating-badge badge-top-left">
              <span className="badge-pulse-dot dot-healthy" />
              <span className="badge-label">LUANDA-CORE-01</span>
              <span className="badge-value-healthy">• 1.2ms</span>
            </div>

            <div className="telemetry-floating-badge badge-top-right">
              <span className="badge-pulse-dot dot-k8s" />
              <span className="badge-label">Cluster K8s</span>
              <span className="badge-value-k8s">• 99.98% SLA</span>
            </div>

            <div className="telemetry-floating-badge badge-bottom-center">
              <span className="badge-pulse-dot dot-gold" />
              <span className="badge-label">Telemetria Ativa</span>
              <span className="badge-value-gold">• SSE v2</span>
            </div>

            {/* Ilustração Vetorial Transparente de Redes */}
            <img
              src={vectorArt}
              alt="InfraWatch Network & Infrastructure Monitoring"
              className="login-art-image"
              onError={(e) => {
                // Fallback para caminho estático público caso bundle path varie
                e.currentTarget.src = "/images/infrawatch_vector_transparent.png";
              }}
            />
          </div>
        </section>
      </div>
    </main>
  );
};

export { LoginTestPage };
