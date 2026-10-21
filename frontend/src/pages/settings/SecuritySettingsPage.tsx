import React, { useEffect, useState } from "react";
import { useAuth } from "../../context/AuthContext";
import { securityApi } from "../../services/securityApi";
import { Button } from "../../components/ui/Button";
import { Badge } from "../../components/ui/Badge";
import { Modal } from "../../components/ui/Modal";
import type { ActiveSession, MfaSetupResponse } from "../../types/auth";
import {
  AlertTriangle,
  CheckCircle2,
  Copy,
  Laptop,
  LogOut,
  ShieldAlert,
  ShieldCheck,
  Smartphone,
  Trash2,
} from "lucide-react";

export const SecuritySettingsPage: React.FC = () => {
  const { user } = useAuth();

  // Estados de MFA
  const [isMfaActive, setIsMfaActive] = useState<boolean>(user?.mfa_enabled ?? false);
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
  const [feedbackMessage, setFeedbackMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const [isActionLoading, setIsActionLoading] = useState(false);

  // Carrega sessões ativas
  const fetchSessions = async () => {
    setIsLoadingSessions(true);
    try {
      const res = await securityApi.listSessions();
      setSessions(res.sessions || []);
    } catch {
      // Ignora erro se rota não autorizada
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

  // Desativar MFA
  const handleConfirmDisableMfa = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!disablePassword || !disableCode) return;

    setIsActionLoading(true);
    try {
      await securityApi.disableMfa(disablePassword, disableCode);
      setIsMfaActive(false);
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
    <div
      data-testid="security-settings-page"
      className="max-w-4xl mx-auto flex flex-col gap-6"
    >
      <div>
        <h1 className="text-2xl font-bold font-display text-white tracking-tight mb-1">
          Segurança da Conta &amp; Gestão de Acessos
        </h1>
        <p className="text-sm text-slate-400">
          Gerencie a proteção de login em duas etapas (MFA) e controle os dispositivos com sessões ativas
        </p>
      </div>

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

      {/* 1. SEÇÃO DE AUTENTICAÇÃO EM DUAS ETAPAS (MFA TOTP) */}
      <section className="bg-obsidian-900 border border-white/10 rounded-2xl p-6 shadow-card-glass space-y-5">
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

        <div className="flex items-center justify-between p-4 rounded-xl bg-obsidian-950/80 border border-white/5 flex-wrap gap-4">
          <div className="flex items-center gap-4">
            <div
              className={`flex items-center justify-center w-11 h-11 rounded-xl ${
                isMfaActive
                  ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                  : "bg-white/5 text-slate-400 border border-white/10"
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

      {/* 2. SEÇÃO DE DISPOSITIVOS E SESSÕES ATIVAS */}
      <section className="bg-obsidian-900 border border-white/10 rounded-2xl p-6 shadow-card-glass space-y-5">
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
          {isLoadingSessions ? (
            <p className="text-sm text-slate-400">Carregando lista de dispositivos...</p>
          ) : sessions.length === 0 ? (
            <div className="text-center p-6 text-slate-400 text-sm">
              Nenhuma outra sessão ativa encontrada.
            </div>
          ) : (
            <div className="flex flex-col gap-2.5">
              {sessions.map((session) => (
                <article
                  key={session.id}
                  className="flex items-center justify-between p-3.5 rounded-xl bg-obsidian-950/80 border border-white/5 hover:border-white/10 transition-colors"
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

            <Button
              variant="outline"
              size="md"
              fullWidth
              icon={<Copy size={16} />}
              onClick={() => {
                navigator.clipboard.writeText(backupCodes.join("\n"));
                alert("Códigos copiados para a área de transferência!");
              }}
              className="mb-3"
            >
              Copiar Todos os Códigos
            </Button>

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
              1. Insira a chave secreta abaixo no seu aplicativo autenticador (Google Authenticator, Authy ou 1Password):
            </p>

            <div className="p-3 rounded-xl bg-obsidian-950 border border-white/10 font-mono text-base font-bold text-center text-amber-400 tracking-wider">
              {setupData?.secret}
            </div>

            <p className="text-sm text-slate-400">
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
    </div>
  );
};
