import React, { useEffect, useState } from "react";
import { useAuth } from "../../context/AuthContext";
import { securityApi } from "../../services/securityApi";
import { Button } from "../../components/ui/Button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/Card";
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
    if (!verificationCode) return;

    setIsActionLoading(true);
    try {
      const res = await securityApi.enableMfa(verificationCode);
      setBackupCodes(res.backup_codes);
      setIsMfaActive(true);
      setFeedbackMessage({
        type: "success",
        text: "MFA ativado com sucesso! Guarde seus códigos de backup.",
      });
    } catch (err) {
      setFeedbackMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Código de ativação inválido.",
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
        text: "Autenticação em dois fatores desativada.",
      });
    } catch (err) {
      setFeedbackMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Erro ao desativar MFA.",
      });
    } finally {
      setIsActionLoading(false);
    }
  };

  // Revogar uma sessão
  const handleRevokeSession = async (sessionId: string) => {
    try {
      await securityApi.revokeSession(sessionId);
      setSessions((prev) => prev.filter((s) => s.id !== sessionId));
      setFeedbackMessage({
        type: "success",
        text: "Dispositivo desconectado com sucesso.",
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
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "24px",
        maxWidth: "960px",
        margin: "0 auto",
      }}
    >
      <div>
        <h1
          style={{
            fontSize: "1.5rem",
            fontWeight: 700,
            color: "var(--color-text-primary)",
            margin: "0 0 6px 0",
          }}
        >
          Segurança da Conta & Gestão de Acessos
        </h1>
        <p style={{ fontSize: "0.875rem", color: "var(--color-text-secondary)", margin: 0 }}>
          Gerencie a proteção de login em duas etapas (MFA) e controle os dispositivos com sessões ativas
        </p>
      </div>

      {feedbackMessage && (
        <div
          role="alert"
          style={{
            display: "flex",
            alignItems: "center",
            gap: "10px",
            padding: "12px 16px",
            borderRadius: "var(--radius-sm)",
            backgroundColor:
              feedbackMessage.type === "success"
                ? "rgba(16, 185, 129, 0.1)"
                : "var(--color-critical-bg)",
            border:
              feedbackMessage.type === "success"
                ? "1px solid var(--color-border-focus)"
                : "1px solid var(--color-critical-border)",
            color:
              feedbackMessage.type === "success"
                ? "var(--color-healthy)"
                : "var(--color-critical)",
            fontSize: "0.875rem",
          }}
        >
          {feedbackMessage.type === "success" ? (
            <CheckCircle2 size={18} />
          ) : (
            <AlertTriangle size={18} />
          )}
          <span>{feedbackMessage.text}</span>
        </div>
      )}

      {/* =================================================================== */}
      {/* 1. SEÇÃO DE AUTENTICAÇÃO EM DUAS ETAPAS (MFA TOTP)                  */}
      {/* =================================================================== */}
      <Card>
        <CardHeader>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <CardTitle>Autenticação em Duas Etapas (MFA / 2FA)</CardTitle>
              <CardDescription>
                Protege sua conta exigindo um código de 6 dígitos gerado no Google Authenticator ou 1Password
              </CardDescription>
            </div>
            <Badge variant={isMfaActive ? "healthy" : "neutral"}>
              {isMfaActive ? "MFA Ativo" : "Desativado"}
            </Badge>
          </div>
        </CardHeader>

        <CardContent>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "16px",
              borderRadius: "var(--radius-sm)",
              backgroundColor: "var(--color-bg-deep)",
              border: "var(--border-subtle)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: "44px",
                  height: "44px",
                  borderRadius: "var(--radius-sm)",
                  backgroundColor: isMfaActive
                    ? "rgba(16, 185, 129, 0.1)"
                    : "rgba(255, 255, 255, 0.05)",
                  color: isMfaActive ? "var(--color-healthy)" : "var(--color-text-muted)",
                }}
              >
                {isMfaActive ? <ShieldCheck size={24} /> : <ShieldAlert size={24} />}
              </div>
              <div>
                <strong style={{ display: "block", color: "var(--color-text-primary)", fontSize: "0.9375rem" }}>
                  {isMfaActive
                    ? "Sua conta está protegida com TOTP"
                    : "MFA não está configurado"}
                </strong>
                <span style={{ fontSize: "0.8125rem", color: "var(--color-text-secondary)" }}>
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
        </CardContent>
      </Card>

      {/* =================================================================== */}
      {/* 2. SEÇÃO DE DISPOSITIVOS E SESSÕES ATIVAS                            */}
      {/* =================================================================== */}
      <Card>
        <CardHeader>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <CardTitle>Sessões & Dispositivos Conectados</CardTitle>
              <CardDescription>
                Lista de computadores e navegadores autorizados com refresh tokens ativos
              </CardDescription>
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
        </CardHeader>

        <CardContent>
          {isLoadingSessions ? (
            <p style={{ color: "var(--color-text-secondary)", fontSize: "0.875rem" }}>
              Carregando lista de dispositivos...
            </p>
          ) : sessions.length === 0 ? (
            <div
              style={{
                textAlign: "center",
                padding: "24px",
                color: "var(--color-text-secondary)",
                fontSize: "0.875rem",
              }}
            >
              Nenhuma outra sessão ativa encontrada.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              {sessions.map((session) => (
                <article
                  key={session.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "12px 16px",
                    borderRadius: "var(--radius-sm)",
                    backgroundColor: "var(--color-bg-deep)",
                    border: "var(--border-subtle)",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                    <div style={{ color: "var(--color-text-secondary)" }}>
                      {session.device_name?.toLowerCase().includes("mobile") ? (
                        <Smartphone size={20} />
                      ) : (
                        <Laptop size={20} />
                      )}
                    </div>
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <span style={{ fontWeight: 600, color: "var(--color-text-primary)", fontSize: "0.875rem" }}>
                          {session.device_name || "Navegador Web Desconhecido"}
                        </span>
                        {session.is_current && (
                          <Badge variant="healthy" size="sm">
                            Esta Sessão
                          </Badge>
                        )}
                      </div>
                      <div
                        style={{
                          fontSize: "0.75rem",
                          color: "var(--color-text-muted)",
                          fontFamily: "var(--font-mono)",
                          marginTop: "2px",
                        }}
                      >
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
        </CardContent>
      </Card>

      {/* =================================================================== */}
      {/* MODAL DE CONFIGURAÇÃO DO MFA                                        */}
      {/* =================================================================== */}
      <Modal
        isOpen={isSetupModalOpen}
        onClose={() => setIsSetupModalOpen(false)}
        title={backupCodes.length > 0 ? "Códigos de Backup" : "Configurar Google Authenticator"}
        maxWidth="540px"
      >
        {backupCodes.length > 0 ? (
          <div>
            <p style={{ fontSize: "0.875rem", color: "var(--color-text-secondary)", marginBottom: "16px" }}>
              Guarde os 10 códigos abaixo em um local seguro (gerenciador de senhas ou impresso). Cada código pode ser utilizado apenas uma vez caso você perca o acesso ao seu aplicativo autenticador.
            </p>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "8px",
                padding: "16px",
                backgroundColor: "var(--color-bg-deep)",
                borderRadius: "var(--radius-sm)",
                border: "var(--border-subtle)",
                fontFamily: "var(--font-mono)",
                fontSize: "0.875rem",
                color: "var(--color-text-primary)",
                marginBottom: "20px",
              }}
            >
              {backupCodes.map((c, i) => (
                <div key={i} style={{ padding: "4px 8px", backgroundColor: "rgba(255, 255, 255, 0.03)", borderRadius: "var(--radius-xs)" }}>
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
              style={{ marginBottom: "12px" }}
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
          <form onSubmit={handleConfirmEnableMfa}>
            <p style={{ fontSize: "0.875rem", color: "var(--color-text-secondary)", marginBottom: "16px" }}>
              1. Insira a chave secreta abaixo no seu aplicativo autenticador (Google Authenticator, Authy ou 1Password):
            </p>

            <div
              style={{
                padding: "12px",
                borderRadius: "var(--radius-sm)",
                backgroundColor: "var(--color-bg-deep)",
                border: "var(--border-subtle)",
                fontFamily: "var(--font-mono)",
                fontSize: "1rem",
                fontWeight: 700,
                textAlign: "center",
                color: "var(--color-healthy)",
                letterSpacing: "0.1em",
                marginBottom: "16px",
              }}
            >
              {setupData?.secret}
            </div>

            <p style={{ fontSize: "0.875rem", color: "var(--color-text-secondary)", marginBottom: "8px" }}>
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
              style={{
                width: "100%",
                padding: "12px",
                borderRadius: "var(--radius-sm)",
                border: "1px solid var(--color-border-focus)",
                backgroundColor: "var(--color-bg-deep)",
                color: "var(--color-text-primary)",
                fontSize: "1.25rem",
                fontWeight: 700,
                textAlign: "center",
                letterSpacing: "0.2em",
                fontFamily: "var(--font-mono)",
                marginBottom: "20px",
                outline: "none",
              }}
            />

            <div style={{ display: "flex", gap: "12px", justifyContent: "flex-end" }}>
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

      {/* =================================================================== */}
      {/* MODAL DE DESATIVAÇÃO DO MFA                                         */}
      {/* =================================================================== */}
      <Modal
        isOpen={isDisableModalOpen}
        onClose={() => setIsDisableModalOpen(false)}
        title="Desativar Autenticação em Duas Etapas"
        maxWidth="440px"
      >
        <form onSubmit={handleConfirmDisableMfa}>
          <p style={{ fontSize: "0.8125rem", color: "var(--color-text-secondary)", marginBottom: "16px" }}>
            Para confirmar a desativação da proteção em duas etapas, forneça sua senha atual e um código do aplicativo autenticador.
          </p>

          <div style={{ marginBottom: "12px" }}>
            <label
              htmlFor="disable-pwd"
              style={{ display: "block", fontSize: "0.8125rem", color: "var(--color-text-primary)", marginBottom: "4px" }}
            >
              Sua Senha
            </label>
            <input
              id="disable-pwd"
              type="password"
              required
              value={disablePassword}
              onChange={(e) => setDisablePassword(e.target.value)}
              style={{
                width: "100%",
                padding: "8px 12px",
                borderRadius: "var(--radius-sm)",
                border: "var(--border-subtle)",
                backgroundColor: "var(--color-bg-deep)",
                color: "var(--color-text-primary)",
                fontSize: "0.875rem",
              }}
            />
          </div>

          <div style={{ marginBottom: "20px" }}>
            <label
              htmlFor="disable-code"
              style={{ display: "block", fontSize: "0.8125rem", color: "var(--color-text-primary)", marginBottom: "4px" }}
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
              style={{
                width: "100%",
                padding: "8px 12px",
                borderRadius: "var(--radius-sm)",
                border: "var(--border-subtle)",
                backgroundColor: "var(--color-bg-deep)",
                color: "var(--color-text-primary)",
                fontSize: "0.875rem",
                fontFamily: "var(--font-mono)",
              }}
            />
          </div>

          <div style={{ display: "flex", gap: "12px", justifyContent: "flex-end" }}>
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
