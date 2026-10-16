import React, { useState } from "react";
import { Archive, Cloud, HardDrive, AlertCircle, CheckCircle2 } from "lucide-react";
import { Button } from "../ui/Button";
import { Modal } from "../ui/Modal";
import { Badge } from "../ui/Badge";

export interface BackupTriggerButtonProps {
  className?: string;
  variant?: "primary" | "secondary" | "outline" | "ghost";
  size?: "sm" | "md" | "lg";
  onSuccess?: (taskId: string) => void;
}

interface BackupApiResponse {
  task_id: string;
  status: string;
  message: string;
  started_at: string;
}

export const BackupTriggerButton: React.FC<BackupTriggerButtonProps> = ({
  className,
  variant = "secondary",
  size = "md",
  onSuccess,
}) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [skipRemote, setSkipRemote] = useState(false);
  const [dryRun, setDryRun] = useState(false);
  const [result, setResult] = useState<{
    type: "success" | "error";
    message: string;
    taskId?: string;
  } | null>(null);

  const handleTriggerBackup = async () => {
    setIsLoading(true);
    setResult(null);

    try {
      const response = await fetch("/api/v1/system/backup", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          skip_remote: skipRemote,
          dry_run: dryRun,
        }),
      });

      if (!response.ok) {
        if (response.status === 403 || response.status === 401) {
          throw new Error("Acesso negado: Requer privilégio SUPER_ADMIN.");
        }
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.detail || `Erro na API (HTTP ${response.status})`);
      }

      const data: BackupApiResponse = await response.json();
      setResult({
        type: "success",
        message: "Pipeline de backup disparado em segundo plano!",
        taskId: data.task_id,
      });

      if (onSuccess) {
        onSuccess(data.task_id);
      }
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : "Falha ao conectar com o servidor.";
      setResult({
        type: "error",
        message: errorMsg,
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleClose = () => {
    setIsModalOpen(false);
    // Limpa resultado após fechar
    setTimeout(() => setResult(null), 300);
  };

  return (
    <>
      <Button
        variant={variant}
        size={size}
        className={className}
        onClick={() => setIsModalOpen(true)}
        leftIcon={<Archive size={16} />}
        id="btn-trigger-backup-manual"
      >
        Gerar Backup Manual
      </Button>

      <Modal
        isOpen={isModalOpen}
        onClose={handleClose}
        title="Gerar Backup Manual do Sistema"
        description="Dispara a pipeline multi-destino (TimescaleDB, Redis e Segredos AES-256) sem degradação do processo principal da API."
        footer={
          <div style={{ display: "flex", gap: "10px", width: "100%", justifyContent: "flex-end" }}>
            <Button variant="outline" onClick={handleClose} disabled={isLoading}>
              {result?.type === "success" ? "Fechar" : "Cancelar"}
            </Button>
            {result?.type !== "success" && (
              <Button
                variant="primary"
                onClick={handleTriggerBackup}
                isLoading={isLoading}
                leftIcon={<HardDrive size={16} />}
                id="btn-confirm-backup-trigger"
              >
                Iniciar Backup Agora
              </Button>
            )}
          </div>
        }
      >
        <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
          {/* Alertas de Resultado */}
          {result && (
            <div
              style={{
                padding: "12px 16px",
                borderRadius: "var(--radius-md)",
                backgroundColor:
                  result.type === "success" ? "rgba(16, 185, 129, 0.12)" : "rgba(239, 68, 68, 0.12)",
                border:
                  result.type === "success"
                    ? "1px solid rgba(16, 185, 129, 0.3)"
                    : "1px solid rgba(239, 68, 68, 0.3)",
                color:
                  result.type === "success" ? "var(--color-healthy)" : "var(--color-critical)",
                display: "flex",
                alignItems: "flex-start",
                gap: "12px",
              }}
            >
              {result.type === "success" ? (
                <CheckCircle2 size={20} style={{ marginTop: "2px", flexShrink: 0 }} />
              ) : (
                <AlertCircle size={20} style={{ marginTop: "2px", flexShrink: 0 }} />
              )}
              <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                <span style={{ fontWeight: 600, fontSize: "0.875rem" }}>
                  {result.message}
                </span>
                {result.taskId && (
                  <span
                    style={{
                      fontSize: "0.75rem",
                      fontFamily: "var(--font-mono)",
                      color: "var(--color-text-secondary)",
                    }}
                  >
                    Task ID: {result.taskId}
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Destinos do Backup Multi-Destino */}
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            <span
              style={{
                fontSize: "0.8125rem",
                color: "var(--color-text-secondary)",
                fontWeight: 600,
                textTransform: "uppercase",
                letterSpacing: "0.05em",
              }}
            >
              Destinos em Fan-Out (Estratégia 3-2-1):
            </span>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "10px",
              }}
            >
              <div
                style={{
                  padding: "10px 12px",
                  borderRadius: "var(--radius-sm)",
                  backgroundColor: "var(--color-surface-hover)",
                  border: "var(--border-subtle)",
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                }}
              >
                <HardDrive size={16} color="var(--color-primary)" />
                <span style={{ fontSize: "0.8125rem", color: "var(--color-text-primary)" }}>
                  Local (/var/backups)
                </span>
              </div>
              <div
                style={{
                  padding: "10px 12px",
                  borderRadius: "var(--radius-sm)",
                  backgroundColor: "var(--color-surface-hover)",
                  border: "var(--border-subtle)",
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                }}
              >
                <Cloud size={16} color="#38BDF8" />
                <span style={{ fontSize: "0.8125rem", color: "var(--color-text-primary)" }}>
                  Google Drive & R2
                </span>
              </div>
            </div>
          </div>

          {/* Opções de Execução */}
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: "10px",
                cursor: "pointer",
                fontSize: "0.875rem",
                color: "var(--color-text-primary)",
              }}
            >
              <input
                type="checkbox"
                checked={skipRemote}
                onChange={(e) => setSkipRemote(e.target.checked)}
                disabled={isLoading}
                style={{ accentColor: "var(--color-primary)", cursor: "pointer" }}
              />
              <span>Ignorar envio para nuvem (gerar apenas cópia local)</span>
            </label>

            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: "10px",
                cursor: "pointer",
                fontSize: "0.875rem",
                color: "var(--color-text-primary)",
              }}
            >
              <input
                type="checkbox"
                checked={dryRun}
                onChange={(e) => setDryRun(e.target.checked)}
                disabled={isLoading}
                style={{ accentColor: "var(--color-primary)", cursor: "pointer" }}
              />
              <span>Modo Simulação (Dry-run — não altera dados nem persiste dumps)</span>
            </label>
          </div>

          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              paddingTop: "8px",
              borderTop: "var(--border-subtle)",
            }}
          >
            <Badge variant="maintenance" size="sm">
              ADR-032 / NON-BLOCKING 202
            </Badge>
            <span
              style={{
                fontSize: "0.75rem",
                color: "var(--color-text-muted)",
              }}
            >
              Permissão: SUPER_ADMIN
            </span>
          </div>
        </div>
      </Modal>
    </>
  );
};
