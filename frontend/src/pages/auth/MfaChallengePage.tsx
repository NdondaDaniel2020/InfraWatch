import React, { useState, useRef, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  KeyRound,
  ShieldCheck,
  Clock,
  Key,
} from "lucide-react";

export const MfaChallengePage: React.FC = () => {
  const { user: authUser, mfaPendingToken, submitMfaChallenge, clearMfaPending } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const from =
    (location.state as { from?: { pathname: string } })?.from?.pathname || "/";

  const [code, setCode] = useState("");
  const [isBackupMode, setIsBackupMode] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [timerSeconds, setTimerSeconds] = useState(299); // 04:59
  const [activeSlot, setActiveSlot] = useState(0);

  const otpInputRef = useRef<HTMLInputElement>(null);
  const backupInputRef = useRef<HTMLInputElement>(null);

  // Redireciona de volta para login se não houver desafio pendente
  useEffect(() => {
    if (!mfaPendingToken) {
      navigate("/login", { replace: true });
    }
  }, [mfaPendingToken, navigate]);

  // Contagem regressiva de expiração do token TOTP
  useEffect(() => {
    if (timerSeconds <= 0) return;
    const interval = setInterval(() => {
      setTimerSeconds((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(interval);
  }, [timerSeconds]);

  const formattedTimer = `${String(Math.floor(timerSeconds / 60)).padStart(2, "0")}:${String(
    timerSeconds % 60
  ).padStart(2, "0")}`;

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
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
      const authenticatedUser = await submitMfaChallenge(cleanCode);
      if (authenticatedUser.role === "CLIENT_VIEWER" && from === "/") {
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

  const handleOtpChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawVal = e.target.value.replace(/\D/g, "").slice(0, 6);
    setCode(rawVal);
    setActiveSlot(Math.min(rawVal.length, 5));
  };

  const handleBoxClick = (index: number) => {
    setActiveSlot(index);
    otpInputRef.current?.focus();
  };

  const handleResend = () => {
    setTimerSeconds(299);
    setErrorMessage(null);
  };

  return (
    <div
      data-testid="mfa-challenge-page"
      className="min-h-screen w-full flex flex-col items-center justify-center p-4 sm:p-6 md:p-8 bg-obsidian-950 text-slate-100 select-none relative overflow-hidden"
      style={{
        backgroundImage:
          "radial-gradient(circle at 50% 20%, rgba(234, 179, 8, 0.05) 0%, transparent 65%)",
      }}
    >
      {/* CARD CENTRAL DE VERIFICAÇÃO MFA (OBSIDIAN TELEMETRY) */}
      <main className="w-full max-w-[460px] bg-obsidian-900/95 rounded-[32px] sm:rounded-[38px] shadow-card-glass border border-white/10 p-7 sm:p-9 md:p-10 flex flex-col items-center text-center relative backdrop-blur-xl">
        {/* 1. Logotipo Oficial InfraWatch */}
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

        {/* 2. Ícone de Segurança & Badge de Sessão */}
        <div className="w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 shadow-glow-brand mb-3.5">
          {isBackupMode ? <KeyRound size={26} /> : <ShieldCheck size={26} />}
        </div>

        <div className="mb-3.5">
          <span className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full text-[11.5px] font-medium bg-obsidian-950/80 text-slate-300 border border-white/10 shadow-sm">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_6px_rgba(52,211,153,0.7)] shrink-0" />
            <span>Two-Factor Authentication</span>
          </span>
        </div>

        {/* 3. Título e Instrução */}
        <div className="mb-6">
          <h1 className="text-[23px] sm:text-[25px] font-bold font-display tracking-tight text-white leading-snug">
            {isBackupMode
              ? "Código de Recuperação"
              : "Insira o código de verificação"}
          </h1>
          <p className="text-[12.5px] sm:text-[13px] text-slate-400 font-normal mt-1 leading-relaxed max-w-[340px]">
            {isBackupMode ? (
              "Insira um dos seus códigos descartáveis de emergência"
            ) : (
              <>
                Digite o código de 6 dígitos gerado pelo seu app autenticador para{" "}
                <span className="font-mono font-semibold text-slate-200">
                  {authUser?.email || "operator@infrawatch.io"}
                </span>
              </>
            )}
          </p>
        </div>

        {/* Alerta de Erro */}
        {errorMessage && (
          <div
            role="alert"
            aria-live="polite"
            data-testid="mfa-error-alert"
            className="w-full flex items-start gap-2.5 p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-[12.5px] mb-5 text-left"
          >
            <AlertTriangle size={18} className="shrink-0 mt-0.5 text-rose-400" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* 4. Formulário OTP / Backup Code */}
        <form onSubmit={handleSubmit} noValidate className="w-full space-y-4">
          {!isBackupMode ? (
            /* Modo 1: 6 Caixas OTP com Alta Fidelidade ao Mockup */
            <div>
              <label htmlFor="mfa-code" className="sr-only">
                Código TOTP (6 dígitos)
              </label>

              {/* Input Real (acessível para leitores de tela e testes automatizados) */}
              <div className="relative">
                <input
                  id="mfa-code"
                  ref={otpInputRef}
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={6}
                  autoComplete="one-time-code"
                  autoFocus
                  value={code}
                  onChange={handleOtpChange}
                  className="sr-only"
                  aria-label="Código TOTP (6 dígitos)"
                />

                {/* Grid Visual de 6 slots Obsidian */}
                <div
                  className="flex items-center justify-between gap-1.5 sm:gap-2 cursor-pointer"
                  onClick={() => otpInputRef.current?.focus()}
                >
                  {[0, 1, 2, 3, 4, 5].map((idx) => {
                    const digit = code[idx] || "";
                    const isFocused =
                      activeSlot === idx ||
                      (activeSlot >= 6 && idx === 5) ||
                      (code.length === idx);

                    return (
                      <button
                        type="button"
                        key={idx}
                        onClick={() => handleBoxClick(idx)}
                        className={`w-11 h-13 sm:w-12 sm:h-14 flex items-center justify-center font-mono text-[22px] sm:text-[24px] font-bold rounded-xl sm:rounded-2xl border transition-all duration-150 select-none ${
                          digit
                            ? "bg-obsidian-950 text-white border-white/20 shadow-sm"
                            : isFocused
                            ? "bg-obsidian-900 border-amber-400 ring-2 ring-amber-400/20 text-amber-400 scale-[1.03]"
                            : "bg-obsidian-950/80 text-slate-600 border-white/10 hover:border-white/20"
                        }`}
                      >
                        {digit || (isFocused ? "|" : "•")}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Expiração & Reenvio com Relógio Monoespaçado */}
              <div className="flex items-center justify-between text-[12px] pt-3 px-1 font-mono">
                <span className="text-slate-400 flex items-center gap-1.5">
                  <Clock size={15} className="text-slate-400" />
                  <span>
                    Expira em{" "}
                    <strong className="font-mono text-white font-semibold tabular-nums">
                      {formattedTimer}
                    </strong>
                  </span>
                </span>

                <button
                  type="button"
                  onClick={handleResend}
                  className="font-semibold text-amber-400 hover:underline underline-offset-2 transition-colors cursor-pointer"
                >
                  Reenviar código
                </button>
              </div>
            </div>
          ) : (
            /* Modo 2: Código de Backup de Emergência */
            <div className="space-y-2 text-left">
              <label
                htmlFor="backup-code-input"
                className="block text-[12px] font-mono font-medium text-slate-300"
              >
                Código de Recuperação (8 a 16 caracteres):
              </label>
              <input
                id="backup-code-input"
                ref={backupInputRef}
                type="text"
                autoFocus
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="Ex: a1b2-c3d4"
                className="w-full bg-obsidian-950 border border-white/15 rounded-xl px-4 py-3 text-[14px] font-mono text-white focus:outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-400/20 uppercase placeholder:text-slate-600"
              />
            </div>
          )}

          {/* Botões de Ação Principal em Pílula */}
          <div className="space-y-2.5 pt-2">
            <button
              type="submit"
              disabled={isSubmitting || !code}
              className="w-full py-3 px-4 bg-amber-400 hover:bg-amber-300 active:scale-[0.99] text-slate-950 font-bold text-[14px] rounded-full shadow-glow-brand transition-all duration-150 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <CheckCircle2 size={18} />
              <span>
                {isSubmitting
                  ? "Verificando credencial..."
                  : "Confirmar e Acessar Cockpit"}
              </span>
            </button>

            {!isBackupMode && (
              <button
                type="button"
                onClick={() =>
                  setErrorMessage("Autenticação FIDO2 em processo de emissão...")
                }
                className="w-full py-2.5 sm:py-3 px-4 bg-obsidian-850 hover:bg-obsidian-800 border border-white/10 active:scale-[0.99] text-slate-200 font-medium text-[13px] rounded-full transition-all duration-150 flex items-center justify-center gap-2 cursor-pointer shadow-sm"
              >
                <Key size={16} className="text-slate-400" />
                <span>Usar Chave de Segurança (FIDO2 / YubiKey)</span>
              </button>
            )}
          </div>

          {/* Alternância para Código de Backup e Voltar ao Login */}
          <div className="pt-3 border-t border-white/10 flex flex-col items-center gap-2 text-center">
            <button
              type="button"
              onClick={() => {
                setIsBackupMode(!isBackupMode);
                setCode("");
                setErrorMessage(null);
              }}
              className="text-[12px] text-slate-400 hover:text-white underline underline-offset-2 transition-colors cursor-pointer"
            >
              {isBackupMode
                ? "← Voltar para verificação por aplicativo (TOTP)"
                : "Sem acesso ao telemóvel? Usar código de backup de emergência"}
            </button>

            <button
              type="button"
              onClick={handleCancel}
              className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-slate-400 hover:text-white transition-colors pt-1 cursor-pointer"
            >
              <ArrowLeft size={15} />
              <span>Voltar para o login</span>
            </button>
          </div>
        </form>

        {/* Rodapé de Auditoria e Rate Limiting */}
        <div className="mt-4 pt-3 border-t border-white/10 text-center w-full">
          <p className="text-[11px] text-slate-400 font-mono tabular-nums">
            Tentativas restantes:{" "}
            <span className="font-bold text-amber-400">3 de 5</span> antes do
            bloqueio temporário
          </p>
        </div>
      </main>

      {/* Rodapé Institucional do NOC */}
      <footer className="mt-6 flex flex-wrap items-center justify-center gap-2 text-[11.5px] font-mono text-slate-500">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
        <span>TLS 1.3 End-to-End Encrypted</span>
        <span>•</span>
        <span>Dual-Key Rate Limiting Active</span>
        <span>•</span>
        <span>Cluster Luanda-01</span>
      </footer>
    </div>
  );
};
