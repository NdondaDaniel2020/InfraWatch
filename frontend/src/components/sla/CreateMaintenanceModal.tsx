import React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { AlertCircle, AlertTriangle, Calendar, X } from "lucide-react";
import type { CreateMaintenanceInput } from "../../types/sla";
import {
  createMaintenanceSchema,
  type CreateMaintenanceFormData,
} from "../../schemas/slaSchema";
import { Button } from "../ui";

interface CreateMaintenanceModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: CreateMaintenanceInput) => void;
  isSubmitting?: boolean;
}

export const CreateMaintenanceModal: React.FC<CreateMaintenanceModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
  isSubmitting = false,
}) => {
  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<CreateMaintenanceFormData>({
    resolver: zodResolver(createMaintenanceSchema),
    defaultValues: {
      title: "",
      description: "",
      targetDeviceInput: "SW-CORE-LUANDA-01",
      clientName: "Unitel Angola (Backbone Core)",
      startTime: "2026-10-22T02:00",
      endTime: "2026-10-22T04:00",
      alarmSuppression: true,
      slaExemption: true,
      rollbackPlan: "",
    },
    mode: "onChange",
  });

  const targetDeviceInput = watch("targetDeviceInput", "SW-CORE-LUANDA-01");

  if (!isOpen) return null;

  const hasConflict =
    targetDeviceInput.toUpperCase().includes("SW-CORE") ||
    targetDeviceInput.includes("10.0.1.1");

  const onFormSubmit = (data: CreateMaintenanceFormData) => {
    const startDate = new Date(data.startTime);
    const endDate = new Date(data.endTime);

    const targetDeviceIds = data.targetDeviceInput
      .split(",")
      .map((d) => d.trim())
      .filter(Boolean);

    onSubmit({
      title: data.title,
      description: data.description,
      targetDeviceIds,
      clientName: data.clientName,
      startTimeUtc: startDate.toISOString(),
      endTimeUtc: endDate.toISOString(),
      alarmSuppression: data.alarmSuppression,
      slaExemption: data.slaExemption,
      rollbackPlan: data.rollbackPlan,
    });
  };

  // Coleta qualquer erro geral de validação para exibir no banner superior
  const topErrorMessage =
    errors.title?.message ||
    errors.description?.message ||
    errors.targetDeviceInput?.message ||
    errors.clientName?.message ||
    errors.startTime?.message ||
    errors.endTime?.message;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(0, 0, 0, 0.8)",
        backdropFilter: "blur(4px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "16px",
        zIndex: 50,
      }}
    >
      <div
        style={{
          backgroundColor: "var(--color-surface-elevated)",
          border: "var(--border-subtle)",
          borderRadius: "var(--radius-lg)",
          maxWidth: "600px",
          width: "100%",
          padding: "24px",
          display: "flex",
          flexDirection: "column",
          gap: "20px",
          boxShadow: "var(--shadow-card)",
          maxHeight: "90vh",
          overflowY: "auto",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <div
              style={{
                width: "36px",
                height: "36px",
                borderRadius: "var(--radius-md)",
                backgroundColor: "rgba(56, 189, 248, 0.1)",
                border: "1px solid rgba(56, 189, 248, 0.3)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "var(--color-primary)",
              }}
            >
              <Calendar size={20} />
            </div>
            <div>
              <h2 id="modal-title" style={{ fontSize: "1rem", fontWeight: 700, color: "var(--color-text-primary)" }}>
                Agendar Nova Parada Técnica / RFC
              </h2>
              <span style={{ fontSize: "0.6875rem", color: "var(--color-text-muted)", fontFamily: "var(--font-mono)" }}>
                Isenção formal de SLA & Supressão de Alarmes (ADR-009)
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar modal de agendamento"
            style={{
              background: "transparent",
              border: "none",
              color: "var(--color-text-muted)",
              cursor: "pointer",
              padding: "4px",
            }}
          >
            <X size={18} />
          </button>
        </div>

        {topErrorMessage && (
          <div
            role="alert"
            style={{
              padding: "10px 14px",
              borderRadius: "var(--radius-sm)",
              backgroundColor: "rgba(244, 63, 94, 0.1)",
              border: "1px solid var(--color-critical-border)",
              color: "var(--color-critical)",
              fontSize: "0.75rem",
              display: "flex",
              alignItems: "center",
              gap: "8px",
            }}
          >
            <AlertCircle size={16} />
            <span>{topErrorMessage}</span>
          </div>
        )}

        {hasConflict && (
          <div
            data-testid="conflict-warning"
            style={{
              padding: "10px 14px",
              borderRadius: "var(--radius-sm)",
              backgroundColor: "rgba(245, 158, 11, 0.1)",
              border: "1px solid var(--color-warning-border)",
              color: "var(--color-warning)",
              fontSize: "0.75rem",
              display: "flex",
              alignItems: "center",
              gap: "8px",
            }}
          >
            <AlertTriangle size={16} />
            <span>
              Atenção: O ativo <strong>{targetDeviceInput}</strong> é um nó core crítico de agregação. O tráfego redundante será automaticamente desviado.
            </span>
          </div>
        )}

        <form onSubmit={handleSubmit(onFormSubmit)} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            <label style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--color-text-secondary)" }}>
              Título da Mudança (RFC) *
            </label>
            <input
              type="text"
              {...register("title")}
              placeholder="Ex: Atualização Crítica de Firmware Cisco IOS-XE"
              aria-invalid={!!errors.title}
              style={{
                backgroundColor: "var(--color-surface-card)",
                border: errors.title ? "1px solid var(--color-critical)" : "var(--border-subtle)",
                borderRadius: "var(--radius-sm)",
                padding: "8px 12px",
                color: "var(--color-text-primary)",
                fontSize: "0.75rem",
                outline: "none",
              }}
            />
            {errors.title && (
              <span style={{ fontSize: "0.6875rem", color: "var(--color-critical)" }}>
                {errors.title.message}
              </span>
            )}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              <label style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--color-text-secondary)" }}>
                Ativo(s) Alvo (separados por vírgula) *
              </label>
              <input
                type="text"
                {...register("targetDeviceInput")}
                placeholder="Ex: SW-CORE-LUANDA-01, SW-CORE-LUANDA-02"
                aria-invalid={!!errors.targetDeviceInput}
                style={{
                  backgroundColor: "var(--color-surface-card)",
                  border: errors.targetDeviceInput ? "1px solid var(--color-critical)" : "var(--border-subtle)",
                  borderRadius: "var(--radius-sm)",
                  padding: "8px 12px",
                  color: "var(--color-text-primary)",
                  fontSize: "0.75rem",
                  fontFamily: "var(--font-mono)",
                  outline: "none",
                }}
              />
              {errors.targetDeviceInput && (
                <span style={{ fontSize: "0.6875rem", color: "var(--color-critical)" }}>
                  {errors.targetDeviceInput.message}
                </span>
              )}
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              <label style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--color-text-secondary)" }}>
                Contratante / Cliente Afetado *
              </label>
              <input
                type="text"
                {...register("clientName")}
                aria-invalid={!!errors.clientName}
                style={{
                  backgroundColor: "var(--color-surface-card)",
                  border: errors.clientName ? "1px solid var(--color-critical)" : "var(--border-subtle)",
                  borderRadius: "var(--radius-sm)",
                  padding: "8px 12px",
                  color: "var(--color-text-primary)",
                  fontSize: "0.75rem",
                  outline: "none",
                }}
              />
              {errors.clientName && (
                <span style={{ fontSize: "0.6875rem", color: "var(--color-critical)" }}>
                  {errors.clientName.message}
                </span>
              )}
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              <label style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--color-text-secondary)" }}>
                Início da Parada (UTC) *
              </label>
              <input
                type="datetime-local"
                {...register("startTime")}
                aria-invalid={!!errors.startTime}
                style={{
                  backgroundColor: "var(--color-surface-card)",
                  border: errors.startTime ? "1px solid var(--color-critical)" : "var(--border-subtle)",
                  borderRadius: "var(--radius-sm)",
                  padding: "8px 12px",
                  color: "var(--color-text-primary)",
                  fontSize: "0.75rem",
                  fontFamily: "var(--font-mono)",
                  outline: "none",
                }}
              />
              {errors.startTime && (
                <span style={{ fontSize: "0.6875rem", color: "var(--color-critical)" }}>
                  {errors.startTime.message}
                </span>
              )}
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              <label style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--color-text-secondary)" }}>
                Término Estimado (UTC) *
              </label>
              <input
                type="datetime-local"
                {...register("endTime")}
                aria-invalid={!!errors.endTime}
                style={{
                  backgroundColor: "var(--color-surface-card)",
                  border: errors.endTime ? "1px solid var(--color-critical)" : "var(--border-subtle)",
                  borderRadius: "var(--radius-sm)",
                  padding: "8px 12px",
                  color: "var(--color-text-primary)",
                  fontSize: "0.75rem",
                  fontFamily: "var(--font-mono)",
                  outline: "none",
                }}
              />
              {errors.endTime && (
                <span style={{ fontSize: "0.6875rem", color: "var(--color-critical)" }}>
                  {errors.endTime.message}
                </span>
              )}
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            <label style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--color-text-secondary)" }}>
              Escopo e Procedimento Técnico *
            </label>
            <textarea
              rows={3}
              {...register("description")}
              placeholder="Descreva o escopo da parada e impacto previsto na topologia..."
              aria-invalid={!!errors.description}
              style={{
                backgroundColor: "var(--color-surface-card)",
                border: errors.description ? "1px solid var(--color-critical)" : "var(--border-subtle)",
                borderRadius: "var(--radius-sm)",
                padding: "8px 12px",
                color: "var(--color-text-primary)",
                fontSize: "0.75rem",
                outline: "none",
                resize: "vertical",
              }}
            />
            {errors.description && (
              <span style={{ fontSize: "0.6875rem", color: "var(--color-critical)" }}>
                {errors.description.message}
              </span>
            )}
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            <label style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--color-text-secondary)" }}>
              Plano de Rollback / Contingência
            </label>
            <input
              type="text"
              {...register("rollbackPlan")}
              placeholder="Ex: Rollback de firmware para versão anterior em até 15 minutos"
              style={{
                backgroundColor: "var(--color-surface-card)",
                border: "var(--border-subtle)",
                borderRadius: "var(--radius-sm)",
                padding: "8px 12px",
                color: "var(--color-text-primary)",
                fontSize: "0.75rem",
                outline: "none",
              }}
            />
          </div>

          {/* Opções de Governança e Supressão */}
          <div
            style={{
              padding: "12px",
              borderRadius: "var(--radius-sm)",
              backgroundColor: "var(--color-surface-card)",
              border: "var(--border-subtle)",
              display: "flex",
              flexDirection: "column",
              gap: "10px",
            }}
          >
            <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer", fontSize: "0.75rem", color: "var(--color-text-secondary)" }}>
              <input
                type="checkbox"
                {...register("alarmSuppression")}
              />
              <span>Ativar supressão automática de telemetria e alarmes durante a janela</span>
            </label>

            <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer", fontSize: "0.75rem", color: "var(--color-text-secondary)" }}>
              <input
                type="checkbox"
                {...register("slaExemption")}
              />
              <span>Requerer homologação formal de Isenção de SLA (ADR-009 / BNA)</span>
            </label>
          </div>

          <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: "10px", paddingTop: "8px" }}>
            <Button type="button" onClick={onClose} variant="ghost" size="sm">
              Cancelar
            </Button>
            <Button
              type="submit"
              variant="primary"
              size="sm"
              disabled={isSubmitting}
            >
              {isSubmitting ? "Submetendo..." : "Submeter Parada Programada"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};
