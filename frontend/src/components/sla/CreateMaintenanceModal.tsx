import React, { useMemo } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { AlertCircle, AlertTriangle, Calendar, X } from "lucide-react";
import type { CreateMaintenanceInput, MaintenanceWindow } from "../../types/sla";
import {
  createMaintenanceSchema,
  type CreateMaintenanceFormData,
} from "../../schemas/slaSchema";
import { Button } from "../ui";

interface DeviceOption {
  id: string;
  name: string;
  ipAddress?: string;
  category?: string;
}

interface OrganizationOption {
  id: string;
  name: string;
}

interface CreateMaintenanceModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: CreateMaintenanceInput) => void;
  isSubmitting?: boolean;
  organizations?: OrganizationOption[];
  devices?: DeviceOption[];
  existingMaintenances?: MaintenanceWindow[];
}

const getDefaultTimes = () => {
  const now = new Date();
  const start = new Date(now.getTime() + 60 * 60 * 1000);
  start.setMinutes(0, 0, 0);
  const end = new Date(start.getTime() + 2 * 60 * 60 * 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  const toLocalIso = (d: Date) =>
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  return {
    startTime: toLocalIso(start),
    endTime: toLocalIso(end),
  };
};

export const CreateMaintenanceModal: React.FC<CreateMaintenanceModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
  isSubmitting = false,
  organizations = [],
  devices = [],
  existingMaintenances = [],
}) => {
  const initialTimes = useMemo(() => getDefaultTimes(), []);
  const defaultDevice = devices[0]?.name || "SW-CORE-LUANDA-01";
  const defaultClient = organizations[0]?.name || "Unitel Angola (Backbone Core)";

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<CreateMaintenanceFormData>({
    resolver: zodResolver(createMaintenanceSchema),
    defaultValues: {
      title: "",
      description: "",
      targetDeviceInput: defaultDevice,
      clientName: defaultClient,
      startTime: initialTimes.startTime,
      endTime: initialTimes.endTime,
      alarmSuppression: true,
      slaExemption: true,
      rollbackPlan: "",
    },
    mode: "onChange",
  });

  const targetDeviceInput = watch("targetDeviceInput", defaultDevice);

  const conflictingMaintenance = useMemo(() => {
    if (!targetDeviceInput || existingMaintenances.length === 0) return null;
    const inputUpper = targetDeviceInput.toUpperCase().trim();
    return existingMaintenances.find((m) => {
      if (m.status === "CANCELLED" || m.status === "COMPLETED") return false;
      return (
        m.targetDeviceNames.some(
          (d) => d.toUpperCase().includes(inputUpper) || inputUpper.includes(d.toUpperCase())
        ) ||
        m.targetDeviceIds.some((id) => id.toLowerCase() === targetDeviceInput.toLowerCase().trim())
      );
    });
  }, [targetDeviceInput, existingMaintenances]);

  const isCoreAsset = useMemo(() => {
    const upper = (targetDeviceInput || "").toUpperCase();
    return (
      upper.includes("SW-CORE") ||
      upper.includes("10.0.1.1") ||
      upper.includes("CORE") ||
      upper.includes("BACKBONE")
    );
  }, [targetDeviceInput]);

  const hasConflict = Boolean(conflictingMaintenance || isCoreAsset);

  if (!isOpen) return null;

  const onFormSubmit = (data: CreateMaintenanceFormData) => {
    const startDate = new Date(data.startTime);
    const endDate = new Date(data.endTime);

    const deviceValues = data.targetDeviceInput
      .split(",")
      .map((d) => d.trim())
      .filter(Boolean);

    // Mapeia nomes informados para UUIDs reais caso existam no inventário
    const resolvedDeviceIds = deviceValues.map((val) => {
      const match = devices.find(
        (d) => d.name.toLowerCase() === val.toLowerCase() || d.id === val
      );
      return match ? match.id : val;
    });

    const matchedOrg = organizations.find(
      (org) => org.name.toLowerCase() === data.clientName.trim().toLowerCase()
    );

    onSubmit({
      title: data.title,
      description: data.description,
      targetDeviceIds: resolvedDeviceIds,
      clientName: data.clientName,
      organizationId: matchedOrg ? matchedOrg.id : undefined,
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
          backgroundColor: "var(--color-surface-card, #0d1424)",
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
              {conflictingMaintenance ? (
                <>
                  Atenção: Conflito operacional detectado com a RFC <strong>{conflictingMaintenance.rfcNumber}</strong> ({conflictingMaintenance.title}).
                </>
              ) : (
                <>
                  Atenção: O ativo <strong>{targetDeviceInput}</strong> é um nó core crítico de agregação. O tráfego redundante será automaticamente desviado.
                </>
              )}
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
                backgroundColor: "var(--color-bg-deep, #070a12)",
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
              <div style={{ display: "flex", gap: "6px" }}>
                <input
                  type="text"
                  list="maint-devices-datalist"
                  {...register("targetDeviceInput")}
                  placeholder="Ex: SW-CORE-LUANDA-01, SW-CORE-LUANDA-02"
                  aria-invalid={!!errors.targetDeviceInput}
                  style={{
                    flex: 1,
                    backgroundColor: "var(--color-bg-deep, #070a12)",
                    border: errors.targetDeviceInput ? "1px solid var(--color-critical)" : "var(--border-subtle)",
                    borderRadius: "var(--radius-sm)",
                    padding: "8px 12px",
                    color: "var(--color-text-primary)",
                    fontSize: "0.75rem",
                    fontFamily: "var(--font-mono)",
                    outline: "none",
                  }}
                />
                {devices.length > 0 && (
                  <select
                    aria-label="Selecionar ativo do inventário"
                    onChange={(e) => {
                      if (e.target.value) {
                        setValue("targetDeviceInput", e.target.value, { shouldValidate: true });
                      }
                    }}
                    style={{
                      maxWidth: "110px",
                      backgroundColor: "var(--color-bg-deep, #070a12)",
                      border: "var(--border-subtle)",
                      borderRadius: "var(--radius-sm)",
                      padding: "6px",
                      color: "var(--color-text-muted)",
                      fontSize: "0.7rem",
                      outline: "none",
                      cursor: "pointer",
                    }}
                  >
                    <option value="">Ativos...</option>
                    {devices.map((d) => (
                      <option key={d.id} value={d.name}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                )}
              </div>
              <datalist id="maint-devices-datalist">
                {devices.map((d) => (
                  <option key={d.id} value={d.name}>
                    {d.ipAddress ? `${d.ipAddress} (${d.category || "Ativo"})` : d.name}
                  </option>
                ))}
              </datalist>
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
              <div style={{ display: "flex", gap: "6px" }}>
                <input
                  type="text"
                  list="maint-orgs-datalist"
                  {...register("clientName")}
                  placeholder="Ex: Unitel Angola, Banco Sol..."
                  aria-invalid={!!errors.clientName}
                  style={{
                    flex: 1,
                    backgroundColor: "var(--color-bg-deep, #070a12)",
                    border: errors.clientName ? "1px solid var(--color-critical)" : "var(--border-subtle)",
                    borderRadius: "var(--radius-sm)",
                    padding: "8px 12px",
                    color: "var(--color-text-primary)",
                    fontSize: "0.75rem",
                    outline: "none",
                  }}
                />
                {organizations.length > 0 && (
                  <select
                    aria-label="Selecionar contratante"
                    onChange={(e) => {
                      if (e.target.value) {
                        setValue("clientName", e.target.value, { shouldValidate: true });
                      }
                    }}
                    style={{
                      maxWidth: "110px",
                      backgroundColor: "var(--color-bg-deep, #070a12)",
                      border: "var(--border-subtle)",
                      borderRadius: "var(--radius-sm)",
                      padding: "6px",
                      color: "var(--color-text-muted)",
                      fontSize: "0.7rem",
                      outline: "none",
                      cursor: "pointer",
                    }}
                  >
                    <option value="">Clientes...</option>
                    {organizations.map((org) => (
                      <option key={org.id} value={org.name}>
                        {org.name}
                      </option>
                    ))}
                  </select>
                )}
              </div>
              <datalist id="maint-orgs-datalist">
                {organizations.map((org) => (
                  <option key={org.id} value={org.name} />
                ))}
              </datalist>
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
                  backgroundColor: "var(--color-bg-deep, #070a12)",
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
                  backgroundColor: "var(--color-bg-deep, #070a12)",
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
                backgroundColor: "var(--color-bg-deep, #070a12)",
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
                backgroundColor: "var(--color-bg-deep, #070a12)",
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
              backgroundColor: "var(--color-bg-deep, #070a12)",
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
