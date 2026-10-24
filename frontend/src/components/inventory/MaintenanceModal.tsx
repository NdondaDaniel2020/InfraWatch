import React from "react";
import { Modal } from "../ui/Modal";
import { Button } from "../ui/Button";

interface MaintenanceModalProps {
  isOpen: boolean;
  onClose: () => void;
  deviceName: string;
  onConfirm: (payload: { until: string; title: string; reason: string }) => void;
  isLoading?: boolean;
}

export const MaintenanceModal: React.FC<MaintenanceModalProps> = ({
  isOpen,
  onClose,
  deviceName,
  onConfirm,
  isLoading = false,
}) => {
  const [formData, setFormData] = React.useState({
    until: "",
    title: "",
    reason: "",
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (formData.until && formData.title.trim() && formData.reason.trim()) {
      onConfirm({
        until: formData.until,
        title: formData.title.trim(),
        reason: formData.reason.trim(),
      });
      setFormData({ until: "", title: "", reason: "" });
    }
  };

  const isValid = formData.until && formData.title.trim() && formData.reason.trim();

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Janela de Manutenção"
      description={`Agendar manutenção para ${deviceName}. Alarmes serão suprimidos até o prazo final.`}
      maxWidth="480px"
      footer={
        <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end", width: "100%" }}>
          <Button variant="ghost" onClick={onClose} disabled={isLoading}>
            Cancelar
          </Button>
          <Button
            variant="primary"
            onClick={handleSubmit}
            disabled={isLoading || !isValid}
            isLoading={isLoading}
            data-testid="maintenance-confirm-button"
          >
            Agendar Manutenção
          </Button>
        </div>
      }
    >
      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
        <div>
          <label
            htmlFor="maintenance-title"
            style={{
              display: "block",
              fontSize: "0.875rem",
              fontWeight: 500,
              color: "var(--color-text-primary)",
              marginBottom: "8px",
            }}
          >
            Título da manutenção
          </label>
          <input
            id="maintenance-title"
            type="text"
            value={formData.title}
            onChange={(e) => setFormData({ ...formData, title: e.target.value })}
            placeholder="Ex: Atualização de firmware, troca de hardware, manutenção preventiva"
            style={{
              width: "100%",
              padding: "10px 12px",
              backgroundColor: "var(--color-surface-card)",
              border: "var(--border-subtle)",
              borderRadius: "var(--radius-sm)",
              color: "var(--color-text-primary)",
              fontFamily: "var(--font-sans)",
              fontSize: "0.875rem",
              outline: "none",
              transition: "border-color var(--transition-fast)",
            }}
            onFocus={(e) => {
              e.currentTarget.style.borderColor = "var(--color-border-focus)";
            }}
            onBlur={(e) => {
              e.currentTarget.style.borderColor = "var(--color-border-subtle)";
            }}
            data-testid="maintenance-title-input"
          />
        </div>

        <div>
          <label
            htmlFor="maintenance-until"
            style={{
              display: "block",
              fontSize: "0.875rem",
              fontWeight: 500,
              color: "var(--color-text-primary)",
              marginBottom: "8px",
            }}
          >
            Prazo final (data e hora)
          </label>
          <input
            id="maintenance-until"
            type="datetime-local"
            value={formData.until}
            onChange={(e) => setFormData({ ...formData, until: e.target.value })}
            style={{
              width: "100%",
              padding: "10px 12px",
              backgroundColor: "var(--color-surface-card)",
              border: "var(--border-subtle)",
              borderRadius: "var(--radius-sm)",
              color: "var(--color-text-primary)",
              fontFamily: "var(--font-sans)",
              fontSize: "0.875rem",
              outline: "none",
              transition: "border-color var(--transition-fast)",
            }}
            onFocus={(e) => {
              e.currentTarget.style.borderColor = "var(--color-border-focus)";
            }}
            onBlur={(e) => {
              e.currentTarget.style.borderColor = "var(--color-border-subtle)";
            }}
            data-testid="maintenance-until-input"
          />
        </div>

        <div>
          <label
            htmlFor="maintenance-reason"
            style={{
              display: "block",
              fontSize: "0.875rem",
              fontWeight: 500,
              color: "var(--color-text-primary)",
              marginBottom: "8px",
            }}
          >
            Justificativa
          </label>
          <textarea
            id="maintenance-reason"
            value={formData.reason}
            onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
            placeholder="Descreva a manutenção planejada, impactos esperados, responsáveis..."
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
            data-testid="maintenance-reason-input"
          />
        </div>
      </form>
    </Modal>
  );
};