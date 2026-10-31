import React, { forwardRef } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "../../lib/utils";

export type ButtonVariant = "primary" | "secondary" | "destructive" | "outline" | "ghost";
export type ButtonSize = "sm" | "md" | "lg";

export const buttonVariants = ({
  variant = "primary",
  size = "md",
  className,
}: {
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
} = {}): string => {
  return cn(
    "inline-flex items-center justify-center font-semibold rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 disabled:pointer-events-none disabled:opacity-50",
    variant === "primary" && "bg-sky-500 text-white hover:bg-sky-400 active:bg-sky-600 shadow-sm",
    variant === "secondary" && "bg-slate-800 text-slate-100 hover:bg-slate-700 border border-slate-700",
    variant === "destructive" && "bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 border border-rose-500/30",
    variant === "outline" && "border border-slate-700 text-slate-200 hover:bg-slate-800",
    variant === "ghost" && "text-slate-300 hover:bg-slate-800 hover:text-white",
    size === "sm" && "h-8 px-3 text-xs gap-1.5",
    size === "md" && "h-9 px-4 text-sm gap-2",
    size === "lg" && "h-11 px-6 text-base gap-2.5",
    className
  );
};

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  isLoading?: boolean;
  fullWidth?: boolean;
  icon?: React.ReactNode;
  iconPosition?: "left" | "right";
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

const variantStyles: Record<ButtonVariant, React.CSSProperties> = {
  primary: {
    backgroundColor: "var(--color-primary)",
    color: "var(--color-primary-fg)",
    border: "1px solid var(--color-primary)",
  },
  secondary: {
    backgroundColor: "var(--color-surface-hover)",
    color: "var(--color-text-primary)",
    border: "var(--border-subtle)",
  },
  destructive: {
    backgroundColor: "var(--color-critical-bg)",
    color: "var(--color-critical)",
    border: "1px solid var(--color-critical-border)",
  },
  outline: {
    backgroundColor: "transparent",
    color: "var(--color-text-primary)",
    border: "var(--border-subtle)",
  },
  ghost: {
    backgroundColor: "transparent",
    color: "var(--color-text-secondary)",
    border: "1px solid transparent",
  },
};

const sizeStyles: Record<ButtonSize, React.CSSProperties> = {
  sm: {
    padding: "6px 12px",
    fontSize: "0.75rem",
    borderRadius: "var(--radius-sm)",
    gap: "6px",
  },
  md: {
    padding: "8px 16px",
    fontSize: "0.875rem",
    borderRadius: "var(--radius-md)",
    gap: "8px",
  },
  lg: {
    padding: "12px 22px",
    fontSize: "1rem",
    borderRadius: "var(--radius-md)",
    gap: "10px",
  },
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      children,
      variant = "primary",
      size = "md",
      isLoading = false,
      fullWidth = false,
      icon,
      iconPosition = "left",
      leftIcon,
      rightIcon,
      disabled,
      style,
      className,
      ...props
    },
    ref
  ) => {
    const [isHovered, setIsHovered] = React.useState(false);
    const [isActive, setIsActive] = React.useState(false);

    const isDisabled = disabled || isLoading;

    // Hover adjustments por variante
    let hoverBg = variantStyles[variant].backgroundColor;
    let hoverBorder = variantStyles[variant].border;
    let hoverColor = variantStyles[variant].color;

    if (isHovered && !isDisabled) {
      if (variant === "primary") {
        hoverBg = "var(--color-primary-hover)";
        hoverBorder = "1px solid var(--color-primary-hover)";
      } else if (variant === "secondary" || variant === "outline" || variant === "ghost") {
        hoverBg = "var(--color-surface-hover)";
        hoverBorder = "var(--border-hover)";
        hoverColor = "var(--color-text-primary)";
      } else if (variant === "destructive") {
        hoverBg = "rgba(239, 68, 68, 0.22)";
        hoverBorder = "1px solid var(--color-critical)";
      }
    }

    if (isActive && !isDisabled && variant === "primary") {
      hoverBg = "var(--color-primary-active)";
    }

    const effectiveLeftIcon = leftIcon || (iconPosition === "left" ? icon : null);
    const effectiveRightIcon = rightIcon || (iconPosition === "right" ? icon : null);

    const baseStyle: React.CSSProperties = {
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      fontWeight: 600,
      fontFamily: "var(--font-sans)",
      cursor: isDisabled ? "not-allowed" : "pointer",
      opacity: isDisabled ? 0.5 : 1,
      transition:
        "background-color var(--transition-fast), border-color var(--transition-fast), color var(--transition-fast), opacity var(--transition-fast)",
      outline: "none",
      userSelect: "none",
      whiteSpace: "nowrap",
      width: fullWidth ? "100%" : "auto",
      ...sizeStyles[size],
      ...variantStyles[variant],
      backgroundColor: hoverBg,
      border: hoverBorder,
      color: hoverColor,
      ...style,
    };

    return (
      <button
        ref={ref}
        disabled={isDisabled}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => {
          setIsHovered(false);
          setIsActive(false);
        }}
        onMouseDown={() => setIsActive(true)}
        onMouseUp={() => setIsActive(false)}
        style={baseStyle}
        className={className}
        {...props}
      >
        {isLoading && (
          <Loader2
            size={size === "sm" ? 14 : size === "md" ? 16 : 18}
            className="animate-spin"
            style={{ animation: "spin 1s linear infinite" }}
          />
        )}
        {!isLoading && effectiveLeftIcon}
        <span className="inline-flex items-center gap-1.5">{children}</span>
        {!isLoading && effectiveRightIcon}
      </button>
    );
  }
);

Button.displayName = "Button";
