import React, { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useAuth } from "../../context/AuthContext";
import { authApi } from "../../services/authApi";
import { AlertTriangle, ArrowRight, CheckCircle2, Eye, EyeOff, KeyRound, Loader2 } from "lucide-react";
import { LoginTestPage } from "./LoginTestPage";
import vectorArt from "../../assets/images/infrawatch_vector_transparent.png";

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
type AuthMode = "login" | "signup" | "forgot";

export const LoginPage: React.FC = () => {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const from =
    (location.state as { from?: { pathname: string } })?.from?.pathname || "/";

  // Modo Interativo (login | signup | forgot) sincronizado com o hash da URL
  const [mode, setMode] = useState<AuthMode>(() => {
    if (typeof window !== "undefined") {
      if (window.location.hash === "#signup") return "signup";
      if (window.location.hash === "#forgot") return "forgot";
    }
    return "login";
  });

  // Alternadores de Senha
  const [showPassword, setShowPassword] = useState(false);
  const [showSignupPassword, setShowSignupPassword] = useState(false);

  // Estados de Formulário
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);

  // Estados de Cadastro
  const [signupName, setSignupName] = useState("");
  const [signupEmail, setSignupEmail] = useState("");
  const [signupPassword, setSignupPassword] = useState("");
  const [signupFeedback, setSignupFeedback] = useState<string | null>(null);

  // Estados de Recuperação de Senha
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotSuccess, setForgotSuccess] = useState(false);
  const [forgotError, setForgotError] = useState<string | null>(null);

  useEffect(() => {
    const handleHashChange = () => {
      if (window.location.hash === "#signup") {
        setMode("signup");
      } else if (window.location.hash === "#forgot") {
        setMode("forgot");
      } else {
        setMode("login");
      }
    };

    window.addEventListener("hashchange", handleHashChange);
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, []);

  const switchMode = (newMode: AuthMode) => {
    setMode(newMode);
    setErrorMessage(null);
    setForgotError(null);
    setSignupFeedback(null);
    if (typeof window !== "undefined") {
      window.history.replaceState(null, "", `#${newMode}`);
    }
  };

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

  // Avaliador de Força de Senha
  const getPasswordStrength = (val: string) => {
    let score = 0;
    if (val.length >= 8) score++;
    if (/[A-Z]/.test(val) && /[a-z]/.test(val)) score++;
    if (/[0-9]/.test(val)) score++;
    if (/[^A-Za-z0-9]/.test(val)) score++;

    if (val.length === 0) return { score: 0, label: "8+ caracteres", color: "bg-white/10", textColor: "text-slate-500" };
    if (score <= 1) return { score: 1, label: "Fraca", color: "bg-rose-500", textColor: "text-rose-400" };
    if (score === 2) return { score: 2, label: "Média", color: "bg-amber-500", textColor: "text-amber-400" };
    if (score === 3) return { score: 3, label: "Forte", color: "bg-sky-500", textColor: "text-sky-400" };
    return { score: 4, label: "Excelente", color: "bg-emerald-500", textColor: "text-emerald-400" };
  };

  const strength = getPasswordStrength(signupPassword);

  const handleSignupSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!signupName.trim() || !signupEmail.trim() || !signupPassword) {
      setSignupFeedback("Por favor, preencha todos os campos do formulário.");
      return;
    }
    setSignupFeedback(
      "Solicitação de conta enviada ao Administrador do NOC. Em ambiente local de desenvolvimento, utilize o Seletor Rápido de Testes."
    );
  };

  const handleForgotSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setForgotError(null);
    if (!forgotEmail.trim()) {
      setForgotError("Por favor, introduza o seu email corporativo.");
      return;
    }

    setForgotLoading(true);
    try {
      await authApi.requestPasswordReset(forgotEmail.trim());
      setForgotSuccess(true);
    } catch {
      setForgotSuccess(true);
    } finally {
      setForgotLoading(false);
    }
  };

  const displayError = errorMessage || errors.email?.message || errors.password?.message;

  return (
    <main
      data-testid="login-page"
      className="min-h-screen w-screen flex items-center justify-center p-3 sm:p-6 md:p-8 select-none bg-obsidian-950 font-sans"
    >
      {/* ========================================================================= */}
      {/* MOLDURA PRINCIPAL (CARD UNIFICADO COM PAINEL DESLIZANTE OBSIDIAN)          */}
      {/* ========================================================================= */}
      <div
        id="auth-card"
        className="w-full max-w-[440px] sm:max-w-[480px] md:max-w-[1012px] min-h-0 md:min-h-[660px] md:h-[710px] bg-obsidian-900/95 rounded-[28px] sm:rounded-[36px] md:rounded-[40px] shadow-card-glass border border-white/10 overflow-hidden relative flex flex-col md:flex-row backdrop-blur-xl"
      >
        {/* ======================================================================= */}
        {/* COLUNA ESQUERDA: FORMULÁRIO DE LOGIN                                    */}
        {/* ======================================================================= */}
        <section
          id="left-column-login"
          className={`w-full md:w-1/2 h-full px-7 sm:px-11 md:px-14 py-8 sm:py-10 md:py-8 flex flex-col justify-center items-center shrink-0 z-10 transition-all duration-500 ${
            mode === "login"
              ? "opacity-100 scale-100 pointer-events-auto"
              : "opacity-0 scale-95 pointer-events-none max-md:hidden"
          }`}
        >
          <div className="w-full max-w-[370px] mx-auto my-auto">
            {/* 1. Logotipo Oficial InfraWatch 3D */}
            <header className="flex items-center justify-center gap-2.5 mb-5">
              <div className="w-8 h-8 rounded-xl bg-obsidian-950/80 border border-white/10 flex items-center justify-center p-1.5 shadow-sm">
                <svg className="w-full h-full shrink-0" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <polygon points="12,3 20,7.5 12,12 4,7.5" fill="#ffffff" stroke="#111827" strokeWidth="1.8" strokeLinejoin="round" />
                  <polygon points="4,7.5 12,12 12,21 4,16.5" fill="var(--brand-primary, #eab308)" stroke="#ca8a04" strokeWidth="1.8" strokeLinejoin="round" />
                  <polygon points="12,12 20,7.5 20,16.5 12,21" fill="#111827" stroke="#374151" strokeWidth="1.8" strokeLinejoin="round" />
                </svg>
              </div>
              <span className="font-display font-bold text-[20px] tracking-tight text-white">
                InfraWatch
              </span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-amber-500/10 text-amber-400 border border-amber-500/30">
                NOC
              </span>
            </header>

            {/* 2. Cabeçalho de Boas-vindas */}
            <div className="text-center mb-6">
              <h1 className="text-[25px] sm:text-[27px] font-bold font-display tracking-tight text-white leading-snug">
                Aceda à sua conta
              </h1>
              <p className="text-[13px] text-slate-400 font-normal mt-1">
                Cockpit operacional de telemetria e infraestrutura.
              </p>
            </div>

            {/* Alerta de Erro Semântico Acessível */}
            {displayError && (
              <div
                role="alert"
                aria-live="polite"
                data-testid="login-error-alert"
                className="flex items-start gap-2.5 p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-[13px] mb-4"
              >
                <AlertTriangle size={18} className="shrink-0 mt-0.5" />
                <span>{displayError}</span>
              </div>
            )}

            {/* 3. Formulário de Autenticação */}
            <form className="space-y-4" onSubmit={handleSubmit(onSubmit)} noValidate>
              {/* Campo: Email */}
              <div className={`border-b pb-1.5 transition-colors ${errors.email ? "border-rose-500" : "border-white/15 focus-within:border-brand"}`}>
                <label htmlFor="login-email" className="block text-[12px] font-medium text-slate-400 mb-0.5">
                  Endereço de E-mail
                </label>
                <input
                  type="email"
                  id="login-email"
                  autoComplete="username"
                  required
                  placeholder="operador@infrawatch.io"
                  className="w-full bg-transparent p-0 border-0 text-[14.5px] font-normal text-white focus:ring-0 focus:outline-none placeholder:text-slate-500"
                  {...register("email")}
                />
              </div>

              {/* Campo: Password com Toggle */}
              <div className={`border-b pb-1.5 pt-1 transition-colors ${errors.password ? "border-rose-500" : "border-white/15 focus-within:border-brand"}`}>
                <label htmlFor="login-password" className="block text-[12px] font-medium text-slate-400 mb-0.5">
                  Senha de Acesso
                </label>
                <div className="flex items-center justify-between">
                  <input
                    type={showPassword ? "text" : "password"}
                    id="login-password"
                    autoComplete="current-password"
                    required
                    placeholder="••••••••••••"
                    className="w-full bg-transparent p-0 border-0 text-[14.5px] font-normal text-white focus:ring-0 focus:outline-none placeholder:text-slate-500"
                    {...register("password")}
                  />
                  <button
                    type="button"
                    aria-label={showPassword ? "Ocultar senha" : "Exibir senha"}
                    onClick={() => setShowPassword(!showPassword)}
                    className="text-slate-400 hover:text-white transition-colors p-1 shrink-0 cursor-pointer"
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>

              {/* Linha de Opções: Lembrar por 30 dias & Recuperar Senha */}
              <div className="flex items-center justify-between pt-1 text-[12.5px]">
                <label className="flex items-center gap-2.5 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    className="w-4 h-4 rounded-[4px] bg-obsidian-950 border-white/20 text-brand focus:ring-0 focus:ring-offset-0 cursor-pointer accent-amber-500"
                  />
                  <span className="text-slate-400 font-normal">Lembrar por 30 dias</span>
                </label>

                <button
                  type="button"
                  id="btn-goto-forgot"
                  onClick={() => switchMode("forgot")}
                  className="font-semibold text-brand hover:underline underline-offset-2 transition-colors cursor-pointer"
                >
                  Esqueceu a senha?
                </button>
              </div>

              {/* Botões de Ação em Pílula */}
              <div className="space-y-2.5 pt-2">
                <button
                  type="submit"
                  aria-label="Entrar no Cockpit"
                  disabled={isSubmitting || isGoogleLoading}
                  className="w-full py-3 px-4 bg-brand hover:opacity-90 active:scale-[0.99] text-slate-950 font-bold text-[14px] rounded-full shadow-glow-brand transition-all duration-150 flex items-center justify-center cursor-pointer disabled:opacity-60"
                >
                  {isSubmitting ? (
                    <span className="flex items-center gap-2">
                      <Loader2 size={16} className="animate-spin" />
                      Autenticando...
                    </span>
                  ) : (
                    <span>Iniciar Sessão</span>
                  )}
                </button>

                <button
                  type="button"
                  onClick={handleGoogleLogin}
                  disabled={isSubmitting || isGoogleLoading}
                  className="w-full py-2.5 sm:py-3 px-4 bg-obsidian-850 hover:bg-obsidian-800 border border-white/10 active:scale-[0.99] text-slate-200 font-medium text-[13.5px] rounded-full transition-all duration-150 flex items-center justify-center gap-2.5 cursor-pointer shadow-sm disabled:opacity-60"
                >
                  {isGoogleLoading ? (
                    <span className="flex items-center gap-2">
                      <Loader2 size={16} className="animate-spin" />
                      Conectando Google...
                    </span>
                  ) : (
                    <>
                      <svg className="w-[18px] h-[18px] shrink-0" width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
                        <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                        <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                        <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                        <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
                      </svg>
                      <span>Continuar com Google Workspace</span>
                    </>
                  )}
                </button>
              </div>

              {/* Rodapé: Alternar para Cadastro & Link Dev */}
              <div className="text-center pt-2.5 space-y-1.5">
                <div>
                  <span className="text-[12.5px] text-slate-400 font-normal">Não tem uma conta?</span>
                  <button
                    type="button"
                    id="btn-goto-signup"
                    onClick={() => switchMode("signup")}
                    className="text-[12.5px] font-semibold text-brand underline underline-offset-2 hover:opacity-90 transition-colors ml-1 cursor-pointer"
                  >
                    Criar conta
                  </button>
                </div>
                <div>
                  <Link to="/login-test" className="text-[11.5px] text-slate-500 hover:text-slate-400 underline transition-colors">
                    Seletor Rápido (Dev / Testes)
                  </Link>
                </div>
              </div>
            </form>
          </div>
        </section>

        {/* ======================================================================= */}
        {/* COLUNA DIREITA: FORMULÁRIOS INVERSOS (SIGN UP & FORGOT PASSWORD)        */}
        {/* ======================================================================= */}
        <section
          id="right-column-container"
          className={`w-full md:w-1/2 h-full px-7 sm:px-11 md:px-14 py-8 sm:py-10 md:py-8 flex flex-col justify-center items-center shrink-0 z-10 transition-all duration-500 ${
            mode !== "login"
              ? "opacity-100 scale-100 pointer-events-auto"
              : "opacity-0 scale-95 pointer-events-none max-md:hidden"
          }`}
        >
          <div className="w-full max-w-[370px] mx-auto my-auto">
            {/* SUB-VIEW 1: FORMULÁRIO DE CADASTRO / SIGN UP */}
            {mode === "signup" && (
              <div id="view-signup" className="w-full">
                <header className="flex items-center justify-center gap-2.5 mb-4">
                  <div className="w-8 h-8 rounded-xl bg-obsidian-950/80 border border-white/10 flex items-center justify-center p-1.5 shadow-sm">
                    <svg className="w-full h-full shrink-0" viewBox="0 0 24 24" fill="none">
                      <polygon points="12,3 20,7.5 12,12 4,7.5" fill="#ffffff" stroke="#111827" strokeWidth="1.8" strokeLinejoin="round" />
                      <polygon points="4,7.5 12,12 12,21 4,16.5" fill="var(--brand-primary, #eab308)" stroke="#ca8a04" strokeWidth="1.8" strokeLinejoin="round" />
                      <polygon points="12,12 20,7.5 20,16.5 12,21" fill="#111827" stroke="#374151" strokeWidth="1.8" strokeLinejoin="round" />
                    </svg>
                  </div>
                  <span className="font-display font-bold text-[20px] tracking-tight text-white">
                    InfraWatch
                  </span>
                </header>

                <div className="text-center mb-5">
                  <h1 className="text-[24px] sm:text-[26px] font-bold font-display tracking-tight text-white leading-snug">
                    Criar uma conta
                  </h1>
                  <p className="text-[12.5px] text-slate-400 font-normal mt-0.5">
                    Inicie a avaliação de 14 dias sem cartão de crédito.
                  </p>
                </div>

                {signupFeedback && (
                  <div className="p-3 mb-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-[12px] leading-relaxed flex items-start gap-2">
                    <AlertTriangle size={16} className="shrink-0 mt-0.5 text-amber-400" />
                    <span>{signupFeedback}</span>
                  </div>
                )}

                <form className="space-y-3" onSubmit={handleSignupSubmit}>
                  {/* Nome Completo */}
                  <div className="border-b border-white/15 pb-1 focus-within:border-brand transition-colors">
                    <label htmlFor="signup-name" className="block text-[11.5px] font-medium text-slate-400 mb-0.5">
                      Nome Completo
                    </label>
                    <input
                      type="text"
                      id="signup-name"
                      name="fullname"
                      required
                      value={signupName}
                      onChange={(e) => setSignupName(e.target.value)}
                      className="w-full bg-transparent p-0 border-0 text-[14px] font-normal text-white focus:ring-0 focus:outline-none placeholder:text-slate-500"
                      placeholder="Daniel Ndonda"
                    />
                  </div>

                  {/* Email Corporativo */}
                  <div className="border-b border-white/15 pb-1 focus-within:border-brand transition-colors">
                    <label htmlFor="signup-email" className="block text-[11.5px] font-medium text-slate-400 mb-0.5">
                      Email de Trabalho
                    </label>
                    <input
                      type="email"
                      id="signup-email"
                      name="email"
                      required
                      value={signupEmail}
                      onChange={(e) => setSignupEmail(e.target.value)}
                      className="w-full bg-transparent p-0 border-0 text-[14px] font-normal text-white focus:ring-0 focus:outline-none placeholder:text-slate-500"
                      placeholder="operator@empresa.ao"
                    />
                  </div>

                  {/* Password com Avaliador de Força */}
                  <div className="border-b border-white/15 pb-1 focus-within:border-brand transition-colors">
                    <div className="flex items-center justify-between">
                      <label htmlFor="signup-password" className="block text-[11.5px] font-medium text-slate-400 mb-0.5">
                        Palavra-passe
                      </label>
                      <span className={`text-[10px] font-medium ${strength.textColor}`}>
                        {strength.label}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <input
                        type={showSignupPassword ? "text" : "password"}
                        id="signup-password"
                        name="password"
                        required
                        value={signupPassword}
                        onChange={(e) => setSignupPassword(e.target.value)}
                        className="w-full bg-transparent p-0 border-0 text-[14px] font-normal text-white focus:ring-0 focus:outline-none placeholder:text-slate-500"
                        placeholder="Mínimo de 8 caracteres"
                      />
                      <button
                        type="button"
                        onClick={() => setShowSignupPassword(!showSignupPassword)}
                        className="text-slate-400 hover:text-white transition-colors p-1 shrink-0 cursor-pointer"
                        title="Mostrar/Ocultar Senha"
                        aria-label="Toggle password visibility"
                      >
                        {showSignupPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                  </div>

                  {/* Barra de Força da Senha */}
                  <div className="flex gap-1.5 h-1 w-full pt-0.5">
                    <div className={`h-full flex-1 rounded-full transition-colors duration-300 ${strength.score >= 1 ? strength.color : "bg-white/10"}`} />
                    <div className={`h-full flex-1 rounded-full transition-colors duration-300 ${strength.score >= 2 ? strength.color : "bg-white/10"}`} />
                    <div className={`h-full flex-1 rounded-full transition-colors duration-300 ${strength.score >= 3 ? strength.color : "bg-white/10"}`} />
                    <div className={`h-full flex-1 rounded-full transition-colors duration-300 ${strength.score >= 4 ? strength.color : "bg-white/10"}`} />
                  </div>

                  {/* Botão de Envio */}
                  <div className="space-y-2 pt-2">
                    <button
                      type="submit"
                      className="w-full py-3 px-4 bg-brand hover:opacity-90 active:scale-[0.99] text-slate-950 font-bold text-[13.5px] rounded-full shadow-glow-brand transition-all duration-150 flex items-center justify-center cursor-pointer"
                    >
                      Começar Teste Grátis
                    </button>
                  </div>

                  {/* Voltar ao Login */}
                  <div className="text-center pt-2">
                    <span className="text-[12px] text-slate-400 font-normal">Já tem uma conta?</span>
                    <button
                      type="button"
                      id="btn-backto-login"
                      onClick={() => switchMode("login")}
                      className="text-[12px] font-semibold text-brand underline underline-offset-2 hover:opacity-90 transition-colors ml-1 cursor-pointer"
                    >
                      Iniciar sessão
                    </button>
                  </div>
                </form>
              </div>
            )}

            {/* SUB-VIEW 2: FORMULÁRIO DE RECUPERAÇÃO / FORGOT PASSWORD */}
            {mode === "forgot" && (
              <div id="view-forgot" className="w-full">
                <header className="flex items-center justify-center gap-2.5 mb-4">
                  <div className="w-8 h-8 rounded-xl bg-obsidian-950/80 border border-white/10 flex items-center justify-center p-1.5 shadow-sm">
                    <svg className="w-full h-full shrink-0" viewBox="0 0 24 24" fill="none">
                      <polygon points="12,3 20,7.5 12,12 4,7.5" fill="#ffffff" stroke="#111827" strokeWidth="1.8" strokeLinejoin="round" />
                      <polygon points="4,7.5 12,12 12,21 4,16.5" fill="var(--brand-primary, #eab308)" stroke="#ca8a04" strokeWidth="1.8" strokeLinejoin="round" />
                      <polygon points="12,12 20,7.5 20,16.5 12,21" fill="#111827" stroke="#374151" strokeWidth="1.8" strokeLinejoin="round" />
                    </svg>
                  </div>
                  <span className="font-display font-bold text-[20px] tracking-tight text-white">
                    InfraWatch
                  </span>
                </header>

                <div className="text-center mb-5">
                  <div className="w-11 h-11 rounded-2xl bg-amber-500/10 border border-amber-500/30 mx-auto flex items-center justify-center text-brand mb-2.5 shadow-glow-brand">
                    <KeyRound size={20} />
                  </div>
                  <h1 className="text-[23px] sm:text-[25px] font-bold font-display tracking-tight text-white leading-snug">
                    Recuperar palavra-passe
                  </h1>
                  <p className="text-[12.5px] text-slate-400 font-normal mt-0.5 leading-relaxed max-w-[310px] mx-auto">
                    Introduza o seu email e enviaremos um link de redefinição imediato.
                  </p>
                </div>

                {forgotSuccess && (
                  <div id="forgot-success-alert" className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-2xl text-left space-y-0.5 mb-3">
                    <div className="flex items-center gap-1.5 text-emerald-400 font-semibold text-[12.5px]">
                      <CheckCircle2 size={16} />
                      <span>Link de recuperação enviado!</span>
                    </div>
                    <p className="text-[11.5px] text-slate-300 leading-relaxed">
                      Enviámos as instruções para a sua caixa de correio. Por favor verifique o seu email.
                    </p>
                  </div>
                )}

                {forgotError && (
                  <div className="p-3 mb-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-[12px] flex items-center gap-2">
                    <AlertTriangle size={16} />
                    <span>{forgotError}</span>
                  </div>
                )}

                <form id="forgot-form" className="space-y-3.5" onSubmit={handleForgotSubmit}>
                  <div className="border-b border-white/15 pb-1 focus-within:border-brand transition-colors">
                    <label htmlFor="forgot-email" className="block text-[11.5px] font-medium text-slate-400 mb-0.5">
                      Email de Trabalho
                    </label>
                    <input
                      type="email"
                      id="forgot-email"
                      name="email"
                      required
                      value={forgotEmail}
                      onChange={(e) => setForgotEmail(e.target.value)}
                      className="w-full bg-transparent p-0 border-0 text-[14px] font-normal text-white focus:ring-0 focus:outline-none placeholder:text-slate-500"
                      placeholder="operator@infrawatch.io"
                    />
                  </div>

                  <div className="space-y-2 pt-1">
                    <button
                      type="submit"
                      id="btn-forgot-submit"
                      disabled={forgotLoading}
                      className="w-full py-3 px-4 bg-brand hover:opacity-90 active:scale-[0.99] text-slate-950 font-bold text-[13.5px] rounded-full shadow-glow-brand transition-all duration-150 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
                    >
                      {forgotLoading ? (
                        <span className="flex items-center gap-2">
                          <Loader2 size={16} className="animate-spin" />
                          A enviar instruções...
                        </span>
                      ) : (
                        <>
                          <span>Enviar Link de Recuperação</span>
                          <ArrowRight size={16} />
                        </>
                      )}
                    </button>
                  </div>

                  <div className="text-center pt-1.5 space-y-1">
                    <div>
                      <span className="text-[12px] text-slate-400 font-normal">Lembrou-se da senha?</span>
                      <button
                        type="button"
                        onClick={() => switchMode("login")}
                        className="text-[12px] font-semibold text-brand underline underline-offset-2 hover:opacity-90 transition-colors ml-1 cursor-pointer"
                      >
                        Iniciar sessão
                      </button>
                    </div>
                    <div>
                      <span className="text-[12px] text-slate-400 font-normal">Não tem uma conta?</span>
                      <button
                        type="button"
                        onClick={() => switchMode("signup")}
                        className="text-[12px] font-semibold text-brand underline underline-offset-2 hover:opacity-90 transition-colors ml-1 cursor-pointer"
                      >
                        Criar conta
                      </button>
                    </div>
                  </div>
                </form>
              </div>
            )}
          </div>
        </section>

        {/* ======================================================================= */}
        {/* PAINEL DESLIZANTE DA IMAGEM VETORIAL (SLIDING OVERLAY EM OBSIDIAN DARK) */}
        {/* ======================================================================= */}
        <div
          id="sliding-art-panel"
          className={`hidden md:flex absolute top-0 bottom-0 left-0 w-1/2 p-3.5 sm:p-5 md:p-6 z-20 pointer-events-none transition-transform duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] will-change-transform ${
            mode === "login" ? "translate-x-full" : "translate-x-0"
          }`}
        >
          <div className="w-full h-full rounded-[24px] sm:rounded-[28px] md:rounded-[32px] overflow-hidden relative flex items-center justify-center bg-obsidian-950/85 shadow-inner border border-white/10 pointer-events-auto">
            {/* Halo sutil de iluminação ambiente dourada atrás dos servidores */}
            <div className="absolute w-56 h-56 rounded-full bg-amber-500/10 blur-3xl pointer-events-none" />


            {/* Ilustração Vetorial Transparente de Redes */}
            <img
              src={vectorArt}
              alt="InfraWatch Network & Infrastructure Monitoring"
              className="w-full h-full object-contain object-center p-4 sm:p-6 select-none pointer-events-none transition-transform duration-700 hover:scale-[1.02] relative z-10"
              onError={(e) => {
                e.currentTarget.src = "/images/infrawatch_vector_transparent.png";
              }}
            />
          </div>
        </div>
      </div>
    </main>
  );
};

export { LoginTestPage };
