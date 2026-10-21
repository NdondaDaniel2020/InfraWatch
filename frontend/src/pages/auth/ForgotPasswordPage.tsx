import React, { useState } from "react";
import { Link } from "react-router-dom";
import { authApi } from "../../services/authApi";
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
    <div
      data-testid="forgot-password-page"
      className="min-h-screen w-full flex flex-col items-center justify-center p-4 sm:p-6 bg-obsidian-950 text-slate-100 select-none relative overflow-hidden"
      style={{
        backgroundImage:
          "radial-gradient(circle at 50% 20%, rgba(234, 179, 8, 0.05) 0%, transparent 65%)",
      }}
    >
      <main className="w-full max-w-[440px] bg-obsidian-900/95 rounded-[32px] sm:rounded-[36px] shadow-card-glass border border-white/10 p-7 sm:p-9 flex flex-col items-center text-center relative backdrop-blur-xl">
        {/* 1. Logotipo Oficial */}
        <header className="flex items-center justify-center gap-2.5 mb-5">
          <div className="w-8 h-8 rounded-xl bg-obsidian-950/80 border border-white/10 flex items-center justify-center p-1.5 shadow-sm">
            <svg className="w-full h-full shrink-0" viewBox="0 0 24 24" fill="none">
              <polygon
                points="12,3 20,7.5 12,12 4,7.5"
                fill="#ffffff"
                stroke="#111827"
                strokeWidth="1.8"
                strokeLinejoin="round"
              />
              <polygon
                points="4,7.5 12,12 12,21 4,16.5"
                fill="#eab308"
                stroke="#ca8a04"
                strokeWidth="1.8"
                strokeLinejoin="round"
              />
              <polygon
                points="12,12 20,7.5 20,16.5 12,21"
                fill="#111827"
                stroke="#374151"
                strokeWidth="1.8"
                strokeLinejoin="round"
              />
            </svg>
          </div>
          <span className="font-display font-bold text-[20px] tracking-tight text-white">
            InfraWatch
          </span>
        </header>

        {/* 2. Ícone & Título */}
        <div className="w-13 h-13 sm:w-14 sm:h-14 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 shadow-glow-brand mb-4">
          <KeyRound size={26} />
        </div>

        <h1 className="text-[22px] sm:text-[24px] font-bold font-display tracking-tight text-white leading-snug">
          Recuperação de Senha
        </h1>
        <p className="text-[12.5px] sm:text-[13px] text-slate-400 font-normal mt-1 mb-6 leading-relaxed max-w-[320px]">
          Enviaremos instruções criptografadas para redefinição de acesso à sua credencial
        </p>

        {/* Feedback de Sucesso */}
        {successMessage && (
          <div
            role="status"
            data-testid="forgot-password-success-alert"
            className="w-full flex items-start gap-2.5 p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[12.5px] mb-5 text-left"
          >
            <CheckCircle2 size={18} className="shrink-0 mt-0.5 text-emerald-400" />
            <span>{successMessage}</span>
          </div>
        )}

        {/* Alerta de Erro */}
        {errorMessage && (
          <div
            role="alert"
            className="w-full flex items-start gap-2.5 p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-[12.5px] mb-5 text-left"
          >
            <AlertTriangle size={18} className="shrink-0 mt-0.5 text-rose-400" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Formulário */}
        <form onSubmit={handleSubmit} noValidate className="w-full space-y-4">
          <div className="text-left space-y-1.5">
            <label
              htmlFor="reset-email"
              className="block text-[12px] font-medium text-slate-300"
            >
              E-mail Cadastrado
            </label>
            <div className="relative flex items-center">
              <Mail
                size={16}
                className="absolute left-3.5 text-slate-400 pointer-events-none"
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
                className="w-full bg-obsidian-950 border border-white/10 rounded-xl pl-10 pr-4 py-2.5 text-[13.5px] text-white placeholder:text-slate-600 focus:outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-400/20 transition-all duration-150"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={isSubmitting || !email}
            className="w-full py-3 px-4 bg-amber-400 hover:bg-amber-300 active:scale-[0.99] text-slate-950 font-bold text-[14px] rounded-full shadow-glow-brand transition-all duration-150 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <span>
              {isSubmitting
                ? "Enviando solicitação..."
                : "Enviar Link de Redefinição"}
            </span>
          </button>

          <div className="pt-3 border-t border-white/10 flex justify-center">
            <Link
              to="/login"
              className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-slate-400 hover:text-white transition-colors cursor-pointer"
            >
              <ArrowLeft size={15} />
              <span>Voltar para o Login</span>
            </Link>
          </div>
        </form>
      </main>

      <footer className="mt-6 flex items-center justify-center gap-2 text-[11.5px] font-mono text-slate-500">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
        <span>InfraWatch Identity &amp; Access Management</span>
      </footer>
    </div>
  );
};
