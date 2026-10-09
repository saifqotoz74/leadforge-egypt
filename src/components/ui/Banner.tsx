import React from 'react';
import { Info, AlertTriangle, AlertCircle } from 'lucide-react';

export type BannerVariant = 'info' | 'warning' | 'danger';

export interface BannerProps {
  variant?: BannerVariant;
  children: React.ReactNode;
  action?: {
    label: string;
    onClick?: () => void;
    href?: string;
  };
  className?: string;
}

const STYLES: Record<
  BannerVariant,
  { container: string; text: string; icon: React.ReactNode }
> = {
  info: {
    container: 'bg-info-bg border-info-border',
    text: 'text-info-text',
    icon: <Info className="w-5 h-5 text-info-icon shrink-0" aria-hidden="true" />,
  },
  warning: {
    container: 'bg-warning-bg border-warning-border',
    text: 'text-warning-text',
    icon: <AlertTriangle className="w-5 h-5 text-warning-icon shrink-0" aria-hidden="true" />,
  },
  danger: {
    container: 'bg-danger-bg border-danger-border',
    text: 'text-danger-text',
    icon: <AlertCircle className="w-5 h-5 text-danger-icon shrink-0" aria-hidden="true" />,
  },
};

export function Banner({
  variant = 'info',
  children,
  action,
  className = '',
}: BannerProps) {
  const conf = STYLES[variant];

  return (
    <div
      role="region"
      className={`flex items-center gap-3 p-3.5 px-4 rounded-md border text-start text-body-sm font-medium ${conf.container} ${conf.text} ${className}`}
    >
      {conf.icon}
      <div className="flex-1 leading-normal">{children}</div>
      {action && (
        action.href ? (
          <a
            href={action.href}
            className="font-semibold underline underline-offset-2 shrink-0 hover:opacity-80"
          >
            {action.label}
          </a>
        ) : (
          <button
            type="button"
            onClick={action.onClick}
            className="font-semibold underline underline-offset-2 shrink-0 hover:opacity-80"
          >
            {action.label}
          </button>
        )
      )}
    </div>
  );
}
