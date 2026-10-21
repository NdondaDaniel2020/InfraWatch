import React from "react";
import type { ToastMessage, ToastType } from "../../types/telemetry";

export type { ToastMessage, ToastType };

export interface ToastNotificationProps {
  message: ToastMessage | null;
}

export const TOAST_VISUALS: Record<ToastType, { borderColor: string; dotColor: string }> = {
  warning: {
    borderColor: "rgba(245, 158, 11, 0.5)",
    dotColor: "#f59e0b",
  },
  info: {
    borderColor: "rgba(56, 189, 248, 0.5)",
    dotColor: "#38bdf8",
  },
  success: {
    borderColor: "rgba(16, 185, 129, 0.5)",
    dotColor: "#10b981",
  },
  error: {
    borderColor: "rgba(244, 63, 94, 0.5)",
    dotColor: "#f43f5e",
  },
};

/**
 * Toast de notificação orientado a estado.
 * Renderiza de forma declarativa baseado no tipo de mensagem sem ternários dispersos no JSX.
 */
export const ToastNotification: React.FC<ToastNotificationProps> = ({ message }) => {
  if (!message) return null;

  const visuals = TOAST_VISUALS[message.type] || TOAST_VISUALS.success;

  return (
    <aside
      data-testid="toast-notification"
      aria-live="polite"
      className="fixed top-20 right-6 z-[9999] px-4 py-3 rounded-xl bg-obsidian-900/95 border shadow-2xl text-xs font-mono text-white flex items-center gap-2.5 backdrop-blur-md transition-all"
      style={{
        borderColor: visuals.borderColor,
      }}
    >
      <span
        className="w-2 h-2 rounded-full"
        style={{
          backgroundColor: visuals.dotColor,
        }}
      />
      <span>{message.text}</span>
    </aside>
  );
};
