import React, { useEffect, useState, useMemo } from "react";
import { Link, useInRouterContext } from "react-router-dom";
import { QRCodeSVG } from "qrcode.react";
import { useAuth } from "../../context/AuthContext";
import { securityApi } from "../../services/securityApi";
import { Button } from "../../components/ui/Button";
import { Badge } from "../../components/ui/Badge";
import { Modal } from "../../components/ui/Modal";
import { Pagination, RfcErrorBanner } from "../../components/common";
import type { ActiveSession, MfaSetupResponse } from "../../types/auth";
import {
  AlertTriangle,
  CheckCircle2,
  Copy,
  Download,
  Key,
  Laptop,
  LogOut,
  ShieldAlert,
  ShieldCheck,
  Smartphone,
  Trash2,
} from "lucide-react";

const BreadcrumbLink: React.FC<{
  to: string;
  className?: string;
  children: React.ReactNode;
}> = ({ to, className, children }) => {
  const inRouter = useInRouterContext();
  if (inRouter) {
    return (
      <Link to={to} className={className}>
        {children}
      </Link>
    );
  }
  return (
    <a href={to} className={className}>
      {children}
    </a>
  );
};

export const SecuritySettingsPage: React.FC = () => {
  const { user, setUser } = useAuth();

  // Estados de MFA
  const [isMfaActive, setIsMfaActive] = useState<boolean>(user?.mfa_enabled ?? false);

  useEffect(() => {
    if (user?.mfa_enabled !== undefined) {
      setIsMfaActive(user.mfa_enabled);
    }
  }, [user?.mfa_enabled]);
  const [isSetupModalOpen, setIsSetupModalOpen] = useState(false);
  const [setupData, setSetupData] = useState<MfaSetupResponse | null>(null);
  const [verificationCode, setVerificationCode] = useState("");
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [isDisableModalOpen, setIsDisableModalOpen] = useState(false);
  const [disablePassword, setDisablePassword] = useState("");
  const [disableCode, setDisableCode] = useState("");

  // Estados de Sessões Conectadas
  const [sessions, setSessions] = useState<ActiveSession[]>([]);
  const [isLoadingSessions, setIsLoadingSessions] = useState(true);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [sessionPage, setSessionPage] = useState(1);
  const [sessionPageSize, setSessionPageSize] = useState(5);
  const [feedbackMessage, setFeedbackMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const [isActionLoading, setIsActionLoading] = useState(false);

  const totalSessions = sessions.length;
  const totalSessionPages = Math.max(1, Math.ceil(totalSessions / sessionPageSize));

  useEffect(() => {
    if (sessionPage > totalSessionPages) {
      setSessionPage(totalSessionPages);
    }
  }, [sessionPage, totalSessionPages]);

  const paginatedSessions = useMemo(() => {
    const start = (sessionPage - 1) * sessionPageSize;
    return sessions.slice(start, start + sessionPageSize);
  }, [sessions, sessionPage, sessionPageSize]);

  const handleSessionPageSizeChange = (newSize: number) => {
    setSessionPageSize(newSize);
    setSessionPage(1);
  };

  // Carrega sessões ativas
  const fetchSessions = async () => {
    setIsLoadingSessions(true);
    setSessionError(null);
    try {
      const res = await securityApi.listSessions();
      setSessions(res.sessions || []);
    } catch (err: unknown) {
      setSessionError(err instanceof Error ? err.message : "Falha ao consultar sessões ativas");
    } finally {
      setIsLoadingSessions(false);
    }
  };

  useEffect(() => {
    fetchSessions();
  }, []);

  // Iniciar configuração do MFA
  const handleStartMfaSetup = async () => {
    setIsActionLoading(true);
    setFeedbackMessage(null);
    try {
      const data = await securityApi.setupMfa();
      setSetupData(data);
      setVerificationCode("");
      setBackupCodes([]);
      setIsSetupModalOpen(true);
    } catch (err) {
      setFeedbackMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Erro ao gerar segredo MFA.",
      });
    } finally {
      setIsActionLoading(false);
    }
  };

  // Validar primeiro código e habilitar MFA
  const handleConfirmEnableMfa = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!setupData || verificationCode.length !== 6) return;

    setIsActionLoading(true);
    try {
      const res = await securityApi.enableMfa(verificationCode);
      setIsMfaActive(true);
      if (user) {
        setUser({ ...user, mfa_enabled: true });
      }
      setBackupCodes(res.backup_codes || []);
      setFeedbackMessage({
        type: "success",
        text: "Autenticação em duas etapas configurada com sucesso!",
      });
    } catch (err) {
      setFeedbackMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Código de verificação incorreto.",
      });
    } finally {
      setIsActionLoading(false);
    }
  };

  // Download dos códigos de recuperação em arquivo txt
  const handleDownloadBackupCodes = () => {
    if (backupCodes.length === 0) return;

    const formattedDate = new Date().toISOString().slice(0, 10);
    const content = [
      "==================================================",
      "INFRAWATCH - CÓDIGOS DE RECUPERAÇÃO MFA (BACKUP)",
      `Data de Emissão: ${new Date().toLocaleString("pt-BR")}`,
      `Conta: ${user?.email || user?.name || "Usuário"}`,
      "==================================================",
      "",
      "AVISO DE SEGURANÇA:",
      "- Cada código abaixo pode ser utilizado apenas UMA vez.",
      "- Guarde este arquivo em um local seguro (ex: cofre de senhas).",
      "- Não compartilhe estes códigos com ninguém.",
      "",
      "--- SEUS 10 CÓDIGOS DE BACKUP ---",
      ...backupCodes.map((c, i) => `${String(i + 1).padStart(2, "0")}. ${c}`),
      "",
      "==================================================",
    ].join("\n");

    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `infrawatch-backup-codes-${formattedDate}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Desativar MFA
  const handleConfirmDisableMfa = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!disablePassword || !disableCode) return;

    setIsActionLoading(true);
    try {
      await securityApi.disableMfa(disablePassword, disableCode);
      setIsMfaActive(false);
      if (user) {
        setUser({ ...user, mfa_enabled: false });
      }
      setIsDisableModalOpen(false);
      setDisablePassword("");
      setDisableCode("");
      setFeedbackMessage({
        type: "success",
        text: "Proteção MFA desativada na conta.",
      });
    } catch (err) {
      setFeedbackMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Falha ao desativar MFA.",
      });
    } finally {
      setIsActionLoading(false);
    }
  };

  // Revogar uma sessão específica
  const handleRevokeSession = async (sessionId: string) => {
    try {
      await securityApi.revokeSession(sessionId);
      await fetchSessions();
      setFeedbackMessage({
        type: "success",
        text: "Sessão desconectada com sucesso.",
      });
    } catch (err) {
      setFeedbackMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Falha ao revogar sessão.",
      });
    }
  };

  // Revogar todas as outras sessões
  const handleRevokeAllSessions = async () => {
    if (!window.confirm("Deseja realmente desconectar todos os outros dispositivos conectados?")) {
      return;
    }

    try {
      await securityApi.revokeAllSessions();
      await fetchSessions();
      setFeedbackMessage({
        type: "success",
        text: "Todas as outras sessões foram encerradas.",
      });
    } catch (err) {
      setFeedbackMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Falha ao encerrar todas as sessões.",
      });
    }
  };

  return (
    <main
      data-testid="security-settings-page"
      role="main"
      className="p-4 md:p-6 flex flex-col gap-6 w-full text-slate-100 bg-obsidian-950 min-h-screen"
    >
      {/* 1. Header com Breadcrumb Institucional */}
      <header className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 pb-4 border-b border-obsidian-800">
        <div className="flex flex-col gap-1">
          <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-xs font-mono">
            <BreadcrumbLink to="/noc" className="text-slate-400 hover:text-slate-200 transition-colors">
              Cockpit NOC
            </BreadcrumbLink>
            <span className="text-obsidian-700">/</span>
            <span className="text-emerald-400 font-semibold">
              Segurança &amp; Gestão de Acessos
            </span>
          </nav>
          <h1 className="text-2xl font-bold font-display text-white tracking-tight">
            Segurança da Conta &amp; Gestão de Acessos
          </h1>
          <p className="text-xs text-slate-400 max-w-3xl leading-relaxed">
            Gerencie a proteção de login em duas etapas (MFA) e controle os dispositivos com sessões ativas
          </p>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap shrink-0">
          <span className="px-2.5 py-1 rounded-md bg-obsidian-900 border border-obsidian-800 text-xs font-mono text-slate-300 flex items-center gap-1.5">
            <ShieldCheck size={14} className="text-emerald-400" />
            <span>RFC 6238 TOTP</span>
          </span>
        </div>
      </header>

      {/* 2. Grid Tático de Indicadores (DNA Visual do InfraWatch) */}
      <section
        aria-label="Indicadores de Segurança da Conta"
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4"
        data-testid="security-kpis-grid"
      >
        <article className="bg-obsidian-900 border border-obsidian-800 p-4 rounded-xl relative overflow-hidden shadow-sm flex flex-col justify-between">
          <div className="flex justify-between items-start">
            <span className="text-xs font-mono uppercase text-slate-400 tracking-wider">
              Status MFA
            </span>
            {isMfaActive ? (
              <ShieldCheck size={18} className="text-emerald-400" />
            ) : (
              <ShieldAlert size={18} className="text-amber-400" />
            )}
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span
              className={`text-2xl font-bold font-mono tabular-nums ${
                isMfaActive ? "text-emerald-400" : "text-amber-400"
              }`}
            >
              {isMfaActive ? "ATIVO" : "INATIVO"}
            </span>
          </div>
          <span className="text-[10px] text-slate-500 font-mono mt-1">
            {isMfaActive ? "Protegido por Authenticator (TOTP)" : "Camada extra recomendada"}
          </span>
        </article>

        <article className="bg-obsidian-900 border border-obsidian-800 p-4 rounded-xl relative overflow-hidden shadow-sm flex flex-col justify-between">
          <div className="flex justify-between items-start">
            <span className="text-xs font-mono uppercase text-slate-400 tracking-wider">
              Sessões Ativas
            </span>
            <Laptop size={18} className="text-sky-400" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold font-mono text-white tabular-nums">
              {totalSessions}
            </span>
            <span className="text-xs font-mono text-sky-400">
              dispositivo(s)
            </span>
          </div>
          <span className="text-[10px] text-slate-500 font-mono mt-1">
            Refresh tokens com rotação segura
          </span>
        </article>

        <article className="bg-obsidian-900 border border-obsidian-800 p-4 rounded-xl relative overflow-hidden shadow-sm flex flex-col justify-between">
          <div className="flex justify-between items-start">
            <span className="text-xs font-mono uppercase text-slate-400 tracking-wider">
              Algoritmo
            </span>
            <Key size={18} className="text-slate-400" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-xl font-bold font-mono text-white tabular-nums">
              SHA-1 (TOTP)
            </span>
          </div>
          <span className="text-[10px] text-slate-500 font-mono mt-1">
            Padrão RFC 6238 (código 30s)
          </span>
        </article>

        <article className="bg-obsidian-900 border border-obsidian-800 p-4 rounded-xl relative overflow-hidden shadow-sm flex flex-col justify-between">
          <div className="flex justify-between items-start">
            <span className="text-xs font-mono uppercase text-slate-400 tracking-wider">
              Revogação Remota
            </span>
            <LogOut size={18} className="text-emerald-400" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-xl font-bold font-mono text-emerald-400">
              DISPONÍVEL
            </span>
          </div>
          <span className="text-[10px] text-slate-500 font-mono mt-1">
            Encerramento instantâneo de sessões
          </span>
        </article>
      </section>

      {feedbackMessage && (
        <div
          role="alert"
          className={`flex items-center gap-2.5 p-3.5 rounded-xl border text-sm ${
            feedbackMessage.type === "success"
              ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
              : "bg-rose-500/10 border-rose-500/20 text-rose-400"
          }`}
        >
          {feedbackMessage.type === "success" ? (
            <CheckCircle2 size={18} className="shrink-0" />
          ) : (
            <AlertTriangle size={18} className="shrink-0" />
          )}
          <span>{feedbackMessage.text}</span>
        </div>
      )}

      {/* 3. SEÇÃO DE AUTENTICAÇÃO EM DUAS ETAPAS (MFA TOTP) */}
      <section className="bg-obsidian-900 border border-obsidian-800 rounded-xl p-5 shadow-sm space-y-4">
        <div className="flex justify-between items-start flex-wrap gap-3">
          <div>
            <h2 className="text-lg font-bold text-white tracking-tight">
              Autenticação em Duas Etapas (MFA / 2FA)
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Protege sua conta exigindo um código de 6 dígitos gerado no Google Authenticator ou 1Password
            </p>
          </div>
          <Badge variant={isMfaActive ? "healthy" : "neutral"}>
            {isMfaActive ? "MFA Ativo" : "Desativado"}
          </Badge>
        </div>

        <div className="flex items-center justify-between p-4 rounded-xl bg-obsidian-950 border border-obsidian-800 flex-wrap gap-4">
          <div className="flex items-center gap-4">
            <div
              className={`flex items-center justify-center w-11 h-11 rounded-xl ${
                isMfaActive
                  ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                  : "bg-white/5 text-slate-400 border border-obsidian-800"
              }`}
            >
              {isMfaActive ? <ShieldCheck size={24} /> : <ShieldAlert size={24} />}
            </div>
            <div>
              <strong className="block text-white text-[14px]">
                {isMfaActive
                  ? "Sua conta está protegida com TOTP"
                  : "MFA não está configurado"}
              </strong>
              <span className="text-xs text-slate-400">
                {isMfaActive
                  ? "Será solicitado um código de segurança em cada novo login."
                  : "Adicione uma camada extra de proteção contra roubo de senhas."}
              </span>
            </div>
          </div>

          <div>
            {isMfaActive ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsDisableModalOpen(true)}
              >
                Desativar MFA
              </Button>
            ) : (
              <Button
                variant="primary"
                size="sm"
                isLoading={isActionLoading}
                onClick={handleStartMfaSetup}
              >
                Configurar MFA Agora
              </Button>
            )}
          </div>
        </div>
      </section>

      {/* 4. SEÇÃO DE DISPOSITIVOS E SESSÕES ATIVAS */}
      <section className="bg-obsidian-900 border border-obsidian-800 rounded-xl p-5 shadow-sm space-y-4">
        <div className="flex justify-between items-start flex-wrap gap-3">
          <div>
            <h2 className="text-lg font-bold text-white tracking-tight">
              Sessões &amp; Dispositivos Conectados
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Lista de computadores e navegadores autorizados com refresh tokens ativos
            </p>
          </div>
          {sessions.length > 1 && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleRevokeAllSessions}
              icon={<LogOut size={14} />}
            >
              Desconectar Outras Sessões
            </Button>
          )}
        </div>

        <div>
          {sessionError && (
            <div className="mb-4">
              <RfcErrorBanner
                title="FALHA NO SUBSISTEMA DE CONTROLE DE SESSÕES ATIVAS"
                rfcCode="RFC 6749 / RFC 7519 • ERR_SESSION_SYNC_FAILURE"
                message={sessionError}
                onRetry={fetchSessions}
                isRetrying={isLoadingSessions}
              />
            </div>
          )}

          {isLoadingSessions ? (
            <div className="flex flex-col gap-2.5" data-testid="sessions-skeleton">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="h-16 bg-obsidian-950 border border-obsidian-800 rounded-xl p-3.5 flex items-center justify-between animate-pulse"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-5 h-5 bg-obsidian-800 rounded" />
                    <div className="space-y-1.5">
                      <div className="h-3.5 w-32 bg-obsidian-800 rounded" />
                      <div className="h-2.5 w-48 bg-obsidian-800/60 rounded" />
                    </div>
                  </div>
                  <div className="h-6 w-16 bg-obsidian-800 rounded" />
                </div>
              ))}
            </div>
          ) : sessions.length === 0 ? (
            <div className="text-center p-6 text-slate-400 text-sm">
              Nenhuma outra sessão ativa encontrada.
            </div>
          ) : (
            <div className="flex flex-col gap-2.5">
              {paginatedSessions.map((session) => (
                <article
                  key={session.id}
                  className="flex items-center justify-between p-3.5 rounded-xl bg-obsidian-950 border border-obsidian-800 hover:border-obsidian-700 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className="text-slate-400">
                      {session.device_name?.toLowerCase().includes("mobile") ||
                      session.device_name?.toLowerCase().includes("iphone") ? (
                        <Smartphone size={20} />
                      ) : (
                        <Laptop size={20} />
                      )}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-white text-sm">
                          {session.device_name || "Navegador Web Desconhecido"}
                        </span>
                        {session.is_current && (
                          <Badge variant="healthy" size="sm">
                            Esta Sessão
                          </Badge>
                        )}
                      </div>
                      <div className="text-xs font-mono text-slate-500 mt-0.5">
                        IP: {session.ip_address || "Não informado"} • Criado em:{" "}
                        {new Date(session.created_at).toLocaleString("pt-BR")}
                      </div>
                    </div>
                  </div>

                  {!session.is_current && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleRevokeSession(session.id)}
                      icon={<Trash2 size={14} />}
                      aria-label={`Desconectar dispositivo ${session.device_name || session.id}`}
                    >
                      Encerrar
                    </Button>
                  )}
                </article>
              ))}

              <Pagination
                currentPage={sessionPage}
                totalPages={totalSessionPages}
                totalItems={totalSessions}
                pageSize={sessionPageSize}
                onPageChange={setSessionPage}
                onPageSizeChange={handleSessionPageSizeChange}
                pageSizeOptions={[5]}
                itemLabel="sessões"
                testIdPrefix="sessions-pagination"
                className="rounded-xl border border-obsidian-800 mt-2"
              />
            </div>
          )}
        </div>
      </section>

      {/* MODAL DE CONFIGURAÇÃO DO MFA */}
      <Modal
        isOpen={isSetupModalOpen}
        onClose={() => setIsSetupModalOpen(false)}
        title={backupCodes.length > 0 ? "Códigos de Backup" : "Configurar Google Authenticator"}
        maxWidth="540px"
      >
        {backupCodes.length > 0 ? (
          <div>
            <p className="text-sm text-slate-400 mb-4">
              Guarde os 10 códigos abaixo em um local seguro (gerenciador de senhas ou impresso). Cada código pode ser utilizado apenas uma vez caso você perca o acesso ao seu aplicativo autenticador.
            </p>
            <div className="grid grid-cols-2 gap-2 p-4 bg-obsidian-950 rounded-xl border border-white/10 font-mono text-sm text-white mb-5">
              {backupCodes.map((c, i) => (
                <div
                  key={i}
                  className="p-1.5 px-2 bg-white/5 rounded text-center tracking-wider"
                >
                  {c}
                </div>
              ))}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
              <Button
                variant="outline"
                size="md"
                fullWidth
                icon={<Copy size={16} />}
                onClick={() => {
                  if (navigator?.clipboard?.writeText) {
                    navigator.clipboard.writeText(backupCodes.join("\n"));
                  }
                  alert("Códigos copiados para a área de transferência!");
                }}
              >
                Copiar Códigos
              </Button>

              <Button
                variant="outline"
                size="md"
                fullWidth
                icon={<Download size={16} />}
                onClick={handleDownloadBackupCodes}
              >
                Baixar (.txt)
              </Button>
            </div>

            <Button
              variant="primary"
              size="md"
              fullWidth
              onClick={() => setIsSetupModalOpen(false)}
            >
              Concluir Configuração
            </Button>
          </div>
        ) : (
          <form onSubmit={handleConfirmEnableMfa} className="space-y-4">
            <p className="text-sm text-slate-400">
              1. Aponte a câmera do seu aplicativo autenticador (Google Authenticator, Authy ou 1Password) para escanear o QR Code:
            </p>

            {setupData?.otpauth_uri && (
              <div
                data-testid="mfa-qrcode-container"
                className="flex flex-col items-center justify-center p-3.5 bg-white rounded-2xl mx-auto w-fit shadow-md border border-white/20"
              >
                <QRCodeSVG
                  value={setupData.otpauth_uri}
                  size={168}
                  level="M"
                  includeMargin={false}
                />
              </div>
            )}

            <div className="space-y-1.5">
              <span className="text-xs text-slate-400 block text-center">
                Ou insira a chave secreta manualmente se preferir:
              </span>
              <div className="p-2.5 rounded-xl bg-obsidian-950 border border-white/10 font-mono text-sm font-bold text-center text-amber-400 tracking-wider select-all">
                {setupData?.secret}
              </div>
            </div>

            <p className="text-sm text-slate-400 pt-1">
              2. Digite o código de 6 dígitos exibido no aplicativo para validar:
            </p>

            <input
              type="text"
              inputMode="numeric"
              maxLength={6}
              required
              placeholder="000000"
              value={verificationCode}
              onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, ""))}
              className="w-full bg-obsidian-950 border border-white/15 rounded-xl p-3 text-xl font-mono font-bold text-center tracking-widest text-white focus:outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-400/20"
            />

            <div className="flex gap-3 justify-end pt-2">
              <Button
                variant="outline"
                type="button"
                onClick={() => setIsSetupModalOpen(false)}
              >
                Cancelar
              </Button>
              <Button
                variant="primary"
                type="submit"
                isLoading={isActionLoading}
                disabled={verificationCode.length !== 6}
              >
                Ativar MFA
              </Button>
            </div>
          </form>
        )}
      </Modal>

      {/* MODAL DE DESATIVAÇÃO DO MFA */}
      <Modal
        isOpen={isDisableModalOpen}
        onClose={() => setIsDisableModalOpen(false)}
        title="Desativar Autenticação em Duas Etapas"
        maxWidth="440px"
      >
        <form onSubmit={handleConfirmDisableMfa} className="space-y-4">
          <p className="text-xs text-slate-400">
            Para confirmar a desativação da proteção em duas etapas, forneça sua senha atual e um código do aplicativo autenticador.
          </p>

          <div className="space-y-1">
            <label
              htmlFor="disable-pwd"
              className="block text-xs font-medium text-slate-300"
            >
              Sua Senha
            </label>
            <input
              id="disable-pwd"
              type="password"
              required
              value={disablePassword}
              onChange={(e) => setDisablePassword(e.target.value)}
              className="w-full bg-obsidian-950 border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-400/20"
            />
          </div>

          <div className="space-y-1">
            <label
              htmlFor="disable-code"
              className="block text-xs font-medium text-slate-300"
            >
              Código TOTP ou de Backup
            </label>
            <input
              id="disable-code"
              type="text"
              required
              value={disableCode}
              onChange={(e) => setDisableCode(e.target.value)}
              placeholder="000000"
              className="w-full bg-obsidian-950 border border-white/10 rounded-xl px-3 py-2 text-sm font-mono text-white focus:outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-400/20"
            />
          </div>

          <div className="flex gap-3 justify-end pt-2">
            <Button
              variant="outline"
              type="button"
              onClick={() => setIsDisableModalOpen(false)}
            >
              Cancelar
            </Button>
            <Button
              variant="destructive"
              type="submit"
              isLoading={isActionLoading}
              disabled={!disablePassword || !disableCode}
            >
              Desativar MFA
            </Button>
          </div>
        </form>
      </Modal>
    </main>
  );
};
