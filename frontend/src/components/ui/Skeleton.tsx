import React from "react";

export interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  width?: string | number;
  height?: string | number;
  circle?: boolean;
}

export const Skeleton: React.FC<SkeletonProps> = ({
  width = "100%",
  height = "20px",
  circle = false,
  style,
  className,
  ...props
}) => {
  const skeletonStyle: React.CSSProperties = {
    width: circle && !width ? height : width,
    height,
    borderRadius: circle ? "50%" : "var(--radius-sm)",
    backgroundColor: "var(--color-surface-card)",
    border: "var(--border-subtle)",
    display: "inline-block",
    ...style,
  };

  return (
    <div
      style={skeletonStyle}
      className={`shimmer-effect ${className || ""}`.trim()}
      data-testid="skeleton"
      {...props}
    />
  );
};
