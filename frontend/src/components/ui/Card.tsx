import React from "react";

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  elevated?: boolean;
}

export const Card: React.FC<CardProps> = ({
  children,
  elevated = false,
  style,
  className,
  ...props
}) => {
  const cardStyle: React.CSSProperties = {
    backgroundColor: elevated ? "var(--color-surface-elevated)" : "var(--color-surface-card)",
    border: "var(--border-subtle)",
    borderRadius: "var(--radius-md)",
    boxShadow: "var(--shadow-card)",
    transition: "border-color var(--transition-fast), background-color var(--transition-fast)",
    overflow: "hidden",
    display: "flex",
    flexDirection: "column",
    ...style,
  };

  return (
    <div style={cardStyle} className={className} {...props}>
      {children}
    </div>
  );
};

export interface CardHeaderProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
}

export const CardHeader: React.FC<CardHeaderProps> = ({ children, style, className, ...props }) => {
  const headerStyle: React.CSSProperties = {
    padding: "16px 20px",
    borderBottom: "var(--border-subtle)",
    display: "flex",
    flexDirection: "column",
    gap: "4px",
    ...style,
  };

  return (
    <div style={headerStyle} className={className} {...props}>
      {children}
    </div>
  );
};

export interface CardTitleProps extends React.HTMLAttributes<HTMLHeadingElement> {
  children: React.ReactNode;
}

export const CardTitle: React.FC<CardTitleProps> = ({ children, style, className, ...props }) => {
  const titleStyle: React.CSSProperties = {
    fontSize: "1rem",
    fontWeight: 600,
    color: "var(--color-text-primary)",
    fontFamily: "var(--font-sans)",
    letterSpacing: "-0.01em",
    ...style,
  };

  return (
    <h3 style={titleStyle} className={className} {...props}>
      {children}
    </h3>
  );
};

export interface CardDescriptionProps extends React.HTMLAttributes<HTMLParagraphElement> {
  children: React.ReactNode;
}

export const CardDescription: React.FC<CardDescriptionProps> = ({
  children,
  style,
  className,
  ...props
}) => {
  const descStyle: React.CSSProperties = {
    fontSize: "0.8125rem",
    color: "var(--color-text-secondary)",
    lineHeight: 1.4,
    ...style,
  };

  return (
    <p style={descStyle} className={className} {...props}>
      {children}
    </p>
  );
};

export interface CardContentProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
}

export const CardContent: React.FC<CardContentProps> = ({ children, style, className, ...props }) => {
  const contentStyle: React.CSSProperties = {
    padding: "20px",
    flex: 1,
    ...style,
  };

  return (
    <div style={contentStyle} className={className} {...props}>
      {children}
    </div>
  );
};

export interface CardFooterProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
}

export const CardFooter: React.FC<CardFooterProps> = ({ children, style, className, ...props }) => {
  const footerStyle: React.CSSProperties = {
    padding: "12px 20px",
    borderTop: "var(--border-subtle)",
    display: "flex",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: "8px",
    backgroundColor: "rgba(0, 0, 0, 0.15)",
    ...style,
  };

  return (
    <div style={footerStyle} className={className} {...props}>
      {children}
    </div>
  );
};
