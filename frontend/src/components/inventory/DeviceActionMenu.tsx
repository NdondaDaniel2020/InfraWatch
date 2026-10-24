import React, { useRef, useEffect, useState } from "react";
import { MoreVertical, Pause, Play, Wrench, Eye } from "lucide-react";
import { Button } from "../ui/Button";
import { Modal } from "../ui/Modal";
import type { DeviceHealthStatus } from "../../types/inventory";

interface DeviceActionMenuProps {
  deviceId: string;
  deviceName: string;
  healthStatus: DeviceHealthStatus;
  onPause: (deviceId: string, reason: string) => void;
  onResume: (deviceId: string, reason?: string) => void;
  onMaintenance: (deviceId: string, payload: { until: string; title: string; reason: string }) => void;
  onViewDetails: (deviceId: string) => void;
}

const actionItems = [
  {
    id: "pause",
    label: "Pausar Monitoramento",
    icon: Pause,
    variant: "warning" as const,
    requiresConfirmation: true,
  },
  {
    id: "resume",
    label: "Retomar Monitoramento",
    icon: Play,
    variant: "success" as const,
    requiresConfirmation: false,
  },
  {
    id: "maintenance",
    label: "Janela de Manutenção",
    icon: Wrench,
    variant: "info" as const,
    requiresConfirmation: true,
  },
  {
    id: "details",
    label: "Ver Detalhes",
    icon: Eye,
    variant: "default" as const,
    requiresConfirmation: false,
  },
] as const;

type ActionId = (typeof actionItems)[number]["id"];

interface ActionItemProps {
  action: (typeof actionItems)[number];
  onClick: () => void;
  disabled?: boolean;
  role?: string;
  "data-testid"?: string;
}

const ActionItem: React.FC<ActionItemProps> = ({ action, onClick, disabled, role, "data-testid": dataTestId }) => {
  const Icon = action.icon;
  const variantStyles: Record<string, React.CSSProperties> = {
    warning: { color: "var(--color-degraded)" },
    success: { color: "var(--color-healthy)" },
    info: { color: "var(--color-maintenance)" },
    default: { color: "var(--color-text-primary)" },
  };

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      role={role}
      data-testid={dataTestId}
      style={{
        ...variantStyles[action.variant],
        display: "flex",
        alignItems: "center",
        gap: "10px",
        width: "100%",
        padding: "10px 12px",
        background: "transparent",
        border: "none",
        fontSize: "0.875rem",
        fontFamily: "var(--font-sans)",
        fontWeight: 500,
        cursor: disabled ? "not-allowed" : "pointer",
        borderRadius: "var(--radius-sm)",
        transition: "background-color var(--transition-fast)",
        opacity: disabled ? 0.5 : 1,
      }}
      onMouseEnter={(e) => {
        if (!disabled) e.currentTarget.style.backgroundColor = "var(--color-surface-hover)";
      }}
      onMouseLeave={(e) => {
        if (!disabled) e.currentTarget.style.backgroundColor = "transparent";
      }}
    >
      <Icon size={16} />
      <span>{action.label}</span>
    </button>
  );
};

export const DeviceActionMenu: React.FC<DeviceActionMenuProps> = ({
  deviceId,
  deviceName,
  healthStatus,
  onPause,
  onResume,
  onMaintenance,
  onViewDetails,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedAction, setSelectedAction] = useState<ActionId | null>(null);
  const [pauseReason, setPauseReason] = useState("");
  const [maintenancePayload, setMaintenancePayload] = useState<{ until: string; title: string; reason: string }>({
    until: "",
    title: "",
    reason: "",
  });
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setSelectedAction(null);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleActionClick = (actionId: ActionId) => {
    setSelectedAction(actionId);
    if (actionItems.find((a) => a.id === actionId)?.requiresConfirmation) {
      setIsOpen(true);
    } else {
      executeAction(actionId);
      setIsOpen(false);
      setSelectedAction(null);
    }
  };

  const executeAction = (actionId: ActionId) => {
    switch (actionId) {
      case "pause":
        if (pauseReason.trim()) {
          onPause(deviceId, pauseReason.trim());
        }
        break;
      case "resume":
        onResume(deviceId);
        break;
      case "maintenance":
        if (maintenancePayload.until && maintenancePayload.title.trim() && maintenancePayload.reason.trim()) {
          onMaintenance(deviceId, maintenancePayload);
        }
        break;
      case "details":
        onViewDetails(deviceId);
        break;
    }
    setPauseReason("");
    setMaintenancePayload({ until: "", title: "", reason: "" });
  };

  const canPause = healthStatus !== "PAUSED" && healthStatus !== "MAINT";
  const canResume = healthStatus === "PAUSED";

  const getModalContent = () => {
    switch (selectedAction) {
      case "pause":
        return (
          <div>
            <p style={{ color: "var(--color-text-secondary)", marginBottom: "16px" }}>
              Pausar o monitoramento de <strong>{deviceName}</strong>. O dispositivo não será sondado até ser retomado manualmente.
            </p>
            <label
              style={{
                display: "block",
                fontSize: "0.875rem",
                fontWeight: 500,
                color: "var(--color-text-primary)",
                marginBottom: "8px",
              }}
            >
              Motivo da pausa (obrigatório)
            </label>
            <textarea
              value={pauseReason}
              onChange={(e) => setPauseReason(e.target.value)}
              placeholder="Ex: Manutenção programada, investigação de incidente, etc."
              style={{
                width: "100%",
                minHeight: "80px",
                padding: "10px 12px",
                backgroundColor: "var(--color-surface-card)",
                border: "var(--border-subtle)",
                borderRadius: "var(--radius-sm)",
                color: "var(--color-text-primary)",
                fontFamily: "var(--font-sans)",
                fontSize: "0.875rem",
                resize: "vertical",
                outline: "none",
              }}
              data-testid="pause-reason-input"
            />
            {pauseReason.trim().length < 10 && (
              <p style={{ color: "var(--color-critical)", fontSize: "0.75rem", marginTop: "8px" }}>
                O motivo deve ter pelo menos 10 caracteres.
              </p>
            )}
          </div>
        );
      case "maintenance":
        return (
          <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            <p style={{ color: "var(--color-text-secondary)", marginBottom: "8px" }}>
              Agendar janela de manutenção para <strong>{deviceName}</strong>. Alarmes serão suprimidos até o prazo final.
            </p>
            <div>
              <label
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
                type="text"
                value={maintenancePayload.title}
                onChange={(e) => setMaintenancePayload({ ...maintenancePayload, title: e.target.value })}
                placeholder="Ex: Manutenção de firmware do roteador core"
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
                }}
              />
            </div>
            <div>
              <label
                style={{
                  display: "block",
                  fontSize: "0.875rem",
                  fontWeight: 500,
                  color: "var(--color-text-primary)",
                  marginBottom: "8px",
                }}
              >
                Prazo final (ISO 8601)
              </label>
              <input
                type="datetime-local"
                value={maintenancePayload.until}
                onChange={(e) => setMaintenancePayload({ ...maintenancePayload, until: e.target.value })}
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
                }}
              />
            </div>
            <div>
              <label
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
                value={maintenancePayload.reason}
                onChange={(e) => setMaintenancePayload({ ...maintenancePayload, reason: e.target.value })}
                placeholder="Descreva a manutenção planejada..."
                style={{
                  width: "100%",
                  minHeight: "80px",
                  padding: "10px 12px",
                  backgroundColor: "var(--color-surface-card)",
                  border: "var(--border-subtle)",
                  borderRadius: "var(--radius-sm)",
                  color: "var(--color-text-primary)",
                  fontFamily: "var(--font-sans)",
                  fontSize: "0.875rem",
                  resize: "vertical",
                  outline: "none",
                }}
              />
            </div>
          </div>
        );
      default:
        return null;
    }
  };

  const getConfirmButton = () => {
    const isPause = selectedAction === "pause";
    const isMaintenance = selectedAction === "maintenance";
    const disabled = isPause
      ? pauseReason.trim().length < 10
      : isMaintenance
      ? !maintenancePayload.until || !maintenancePayload.title.trim() || !maintenancePayload.reason.trim()
      : false;

    return (
      <Button
        variant={isPause ? "destructive" : isMaintenance ? "primary" : "secondary"}
        onClick={() => executeAction(selectedAction!)}
        disabled={disabled}
        data-testid="confirm-action-button"
      >
        {isPause ? "Confirmar Pausa" : isMaintenance ? "Agendar Manutenção" : "Confirmar"}
      </Button>
    );
  };

  return (
    <div ref={dropdownRef} style={{ position: "relative", display: "inline-block" }}>
      <Button
        variant="ghost"
        size="sm"
        icon={<MoreVertical size={16} />}
        onClick={() => setIsOpen(!isOpen)}
        aria-label="Ações do dispositivo"
        aria-expanded={isOpen}
        aria-haspopup="true"
        data-testid="device-action-menu-trigger"
      />
      {isOpen && !selectedAction && (
        <div
          style={{
            position: "absolute",
            top: "100%",
            right: 0,
            marginTop: "6px",
            backgroundColor: "var(--color-surface-elevated)",
            border: "var(--border-subtle)",
            borderRadius: "var(--radius-md)",
            boxShadow: "var(--shadow-modal)",
            minWidth: "200px",
            zIndex: 100,
            overflow: "hidden",
          }}
          role="menu"
          data-testid="device-action-dropdown"
        >
          {actionItems.map((action) => {
            const disabled =
              (action.id === "pause" && !canPause) ||
              (action.id === "resume" && !canResume);
            return (
              <ActionItem
                key={action.id}
                action={action}
                onClick={() => handleActionClick(action.id)}
                disabled={disabled}
                role="menuitem"
                data-testid={`action-${action.id}`}
              />
            );
          })}
        </div>
      )}
      {(selectedAction === "pause" || selectedAction === "maintenance") && (
        <Modal
          isOpen={true}
          onClose={() => {
            setIsOpen(false);
            setSelectedAction(null);
          }}
          title={selectedAction === "pause" ? "Pausar Monitoramento" : "Janela de Manutenção"}
          maxWidth="480px"
          footer={
            <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end", width: "100%" }}>
              <Button variant="ghost" onClick={() => { setIsOpen(false); setSelectedAction(null); }}>
                Cancelar
              </Button>
              {getConfirmButton()}
            </div>
          }
        >
          {getModalContent()}
        </Modal>
      )}
    </div>
  );
};