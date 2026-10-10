import React, { useEffect } from "react";
import { X } from "lucide-react";

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  maxWidth?: string | number;
}

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  description,
  children,
  footer,
  maxWidth = "520px",
}) => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };
    if (isOpen) {
      document.body.style.overflow = "hidden";
      window.addEventListener("keydown", handleKeyDown);
    }
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const overlayStyle: React.CSSProperties = {
    position: "fixed",
    inset: 0,
    backgroundColor: "rgba(9, 13, 22, 0.8)",
    backdropFilter: "blur(4px)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 9999,
    padding: "16px",
  };

  const modalStyle: React.CSSProperties = {
    backgroundColor: "var(--color-surface-elevated)",
    border: "var(--border-active)",
    borderRadius: "var(--radius-lg)",
    boxShadow: "var(--shadow-modal)",
    width: "100%",
    maxWidth,
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
    animation: "modal-in 0.2s cubic-bezier(0.16, 1, 0.3, 1)",
  };

  const headerStyle: React.CSSProperties = {
    padding: "20px 24px",
    borderBottom: "var(--border-subtle)",
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: "16px",
  };

  const titleStyle: React.CSSProperties = {
    fontSize: "1.125rem",
    fontWeight: 600,
    color: "var(--color-text-primary)",
    fontFamily: "var(--font-sans)",
  };

  const descStyle: React.CSSProperties = {
    fontSize: "0.875rem",
    color: "var(--color-text-secondary)",
    marginTop: "4px",
    lineHeight: 1.4,
  };

  const closeBtnStyle: React.CSSProperties = {
    background: "transparent",
    border: "none",
    color: "var(--color-text-muted)",
    cursor: "pointer",
    padding: "4px",
    borderRadius: "var(--radius-xs)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    transition: "color var(--transition-fast)",
  };

  const bodyStyle: React.CSSProperties = {
    padding: "24px",
    flex: 1,
    overflowY: "auto",
    color: "var(--color-text-primary)",
  };

  const footerStyle: React.CSSProperties = {
    padding: "16px 24px",
    borderTop: "var(--border-subtle)",
    display: "flex",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: "12px",
    backgroundColor: "rgba(0, 0, 0, 0.2)",
  };

  return (
    <div
      style={overlayStyle}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      data-testid="modal-overlay"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? "modal-title" : undefined}
        style={modalStyle}
        data-testid="modal-container"
      >
        {(title || description) && (
          <div style={headerStyle}>
            <div>
              {title && (
                <h2 id="modal-title" style={titleStyle}>
                  {title}
                </h2>
              )}
              {description && <p style={descStyle}>{description}</p>}
            </div>
            <button
              onClick={onClose}
              style={closeBtnStyle}
              aria-label="Fechar"
              data-testid="modal-close-button"
            >
              <X size={18} />
            </button>
          </div>
        )}

        <div style={bodyStyle}>{children}</div>

        {footer && <div style={footerStyle}>{footer}</div>}
      </div>
    </div>
  );
};
