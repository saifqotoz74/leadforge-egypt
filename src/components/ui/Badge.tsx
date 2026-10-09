import React from 'react';

export type BadgeVariant = 'neutral' | 'brand' | 'warning' | 'danger' | 'outline';
export type BadgeSize = 'sm' | 'md';

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
  size?: BadgeSize;
  icon?: React.ReactNode;
}

const VARIANTS: Record<BadgeVariant, string> = {
  neutral: 'bg-subtle text-fg-secondary border border-transparent',
  brand: 'bg-brand-soft text-brand border border-transparent',
  warning: 'bg-warning-bg text-warning-text border border-warning-border',
  danger: 'bg-danger-bg text-danger-text border border-danger-border',
  outline: 'bg-transparent text-fg-secondary border border-line-strong',
};

const SIZES: Record<BadgeSize, string> = {
  sm: 'h-6 px-2.5 text-caption',
  md: 'h-7 px-3 text-caption',
};

export function Badge({
  variant = 'neutral',
  size = 'md',
  icon,
  children,
  className = '',
  ...props
}: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full font-medium select-none whitespace-nowrap ${
        SIZES[size]
      } ${VARIANTS[variant]} ${className}`}
      {...props}
    >
      {icon && <span className="w-3.5 h-3.5 shrink-0 flex items-center justify-center">{icon}</span>}
      <span>{children}</span>
    </span>
  );
}
