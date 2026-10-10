import React from "react";

export type BadgeVariant = "healthy" | "degraded" | "critical" | "maintenance" | "neutral";
export type BadgeSize = "sm" | "md";

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
  size?: BadgeSize;
  dot?: boolean;
  pulse?: boolean;
  children: React.ReactNode;
}

const variantConfig: Record<
  BadgeVariant,
  { bg: string; color: string; border: string; dotColor: string }
> = {
  healthy: {
    bg: "var(--color-healthy-bg)",
    color: "var(--color-healthy)",
    border: "var(--color-healthy-border)",
    dotColor: "var(--color-healthy)",
  },
  degraded: {
    bg: "var(--color-degraded-bg)",
    color: "var(--color-degraded)",
    border: "var(--color-degraded-border)",
    dotColor: "var(--color-degraded)",
  },
  critical: {
    bg: "var(--color-critical-bg)",
    color: "var(--color-critical)",
    border: "var(--color-critical-border)",
    dotColor: "var(--color-critical)",
  },
  maintenance: {
    bg: "var(--color-maintenance-bg)",
    color: "var(--color-maintenance)",
    border: "var(--color-maintenance-border)",
    dotColor: "var(--color-maintenance)",
  },
  neutral: {
    bg: "var(--color-neutral-bg)",
    color: "var(--color-neutral)",
    border: "var(--color-neutral-border)",
    dotColor: "var(--color-neutral)",
  },
};

export const Badge: React.FC<BadgeProps> = ({
  variant = "neutral",
  size = "md",
  dot = true,
  pulse = false,
  children,
  style,
  className,
  ...props
}) => {
  const config = variantConfig[variant];

  const badgeStyle: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    gap: "6px",
    padding: size === "sm" ? "2px 8px" : "4px 10px",
    fontSize: size === "sm" ? "0.7rem" : "0.75rem",
    fontWeight: 600,
    fontFamily: "var(--font-mono)",
    letterSpacing: "0.02em",
    textTransform: "uppercase",
    borderRadius: "var(--radius-full)",
    backgroundColor: config.bg,
    color: config.color,
    border: `1px solid ${config.border}`,
    lineHeight: 1.2,
    userSelect: "none",
    ...style,
  };

  const dotStyle: React.CSSProperties = {
    width: "6px",
    height: "6px",
    borderRadius: "50%",
    backgroundColor: config.dotColor,
    flexShrink: 0,
    boxShadow: pulse ? `0 0 6px ${config.dotColor}` : "none",
  };

  return (
    <span style={badgeStyle} className={className} {...props}>
      {dot && (
        <span
          style={dotStyle}
          className={pulse ? "pulse-indicator" : undefined}
          data-testid="badge-dot"
        />
      )}
      <span>{children}</span>
    </span>
  );
};
