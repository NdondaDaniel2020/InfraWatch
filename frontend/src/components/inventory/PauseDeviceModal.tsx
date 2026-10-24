import React from "react";
import { Modal } from "../ui/Modal";
import { Button } from "../ui/Button";

interface PauseDeviceModalProps {
  isOpen: boolean;
  onClose: () => void;
  deviceName: string;
  onConfirm: (reason: string) => void;
  isLoading?: boolean;
}

export const PauseDeviceModal: React.FC<PauseDeviceModalProps> = ({
  isOpen,
  onClose,
  deviceName,
  onConfirm,
  isLoading = false,
}) => {
  const [reason, setReason] = React.useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (reason.trim().length >= 10) {
      onConfirm(reason.trim());
      setReason("");
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Pausar Monitoramento"
      description={`Inserir justificativa para pausar o monitoramento de ${deviceName}`}
      maxWidth="480px"
      footer={
        <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end", width: "100%" }}>
          <Button variant="ghost" onClick={onClose} disabled={isLoading}>
            Cancelar
          </Button>
          <Button
            variant="destructive"
            onClick={handleSubmit}
            disabled={isLoading || reason.trim().length < 10}
            isLoading={isLoading}
            data-testid="pause-confirm-button"
          >
            Confirmar Pausa
          </Button>
        </div>
      }
    >
      <form onSubmit={handleSubmit}>
        <p style={{ color: "var(--color-text-secondary)", marginBottom: "16px" }}>
          O dispositivo <strong>{deviceName}</strong> deixará de ser sondado até ser retomado manualmente.
        </p>
        <label
          htmlFor="pause-reason"
          style={{
            display: "block",
            fontSize: "0.875rem",
            fontWeight: 500,
            color: "var(--color-text-primary)",
            marginBottom: "8px",
          }}
        >
          Motivo da pausa (obrigatório, mínimo 10 caracteres)
        </label>
        <textarea
          id="pause-reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Ex: Manutenção programada, investigação de incidente, mudança de janela..."
          style={{
            width: "100%",
            minHeight: "100px",
            padding: "10px 12px",
            backgroundColor: "var(--color-surface-card)",
            border: "var(--border-subtle)",
            borderRadius: "var(--radius-sm)",
            color: "var(--color-text-primary)",
            fontFamily: "var(--font-sans)",
            fontSize: "0.875rem",
            resize: "vertical",
            outline: "none",
            transition: "border-color var(--transition-fast)",
          }}
          onFocus={(e) => {
            e.currentTarget.style.borderColor = "var(--color-border-focus)";
          }}
          onBlur={(e) => {
            e.currentTarget.style.borderColor = "var(--color-border-subtle)";
          }}
          data-testid="pause-reason-input"
        />
        {reason.trim().length > 0 && reason.trim().length < 10 && (
          <p style={{ color: "var(--color-critical)", fontSize: "0.75rem", marginTop: "8px" }}>
            O motivo deve ter pelo menos 10 caracteres ({reason.trim().length}/10).
          </p>
        )}
      </form>
    </Modal>
  );
};