import React from 'react';
import { SearchX, Inbox, ShieldAlert, AlertCircle } from 'lucide-react';
import { Button } from './Button';

export type EmptyStateVariant = 'first-use' | 'no-results' | 'no-permission' | 'error';

export interface EmptyStateProps {
  variant?: EmptyStateVariant;
  title: string;
  description: string;
  action?: {
    label: string;
    onClick: () => void;
  };
  icon?: React.ReactNode;
  className?: string;
}

const DEFAULT_ICONS: Record<EmptyStateVariant, React.ReactNode> = {
  'first-use': <Inbox className="w-12 h-12 text-brand stroke-[1.5]" />,
  'no-results': <SearchX className="w-12 h-12 text-brand stroke-[1.5]" />,
  'no-permission': <ShieldAlert className="w-12 h-12 text-warning-icon stroke-[1.5]" />,
  error: <AlertCircle className="w-12 h-12 text-danger-icon stroke-[1.5]" />,
};

export function EmptyState({
  variant = 'first-use',
  title,
  description,
  action,
  icon,
  className = '',
}: EmptyStateProps) {
  return (
    <div
      className={`flex flex-col items-center justify-center text-center py-16 px-4 max-w-[420px] mx-auto select-none ${className}`}
    >
      {/* Icon / Illustration Frame */}
      <div className="flex items-center justify-center w-20 h-20 rounded-full bg-brand-soft mb-5">
        {icon || DEFAULT_ICONS[variant]}
      </div>

      <h3 className="text-h3 font-semibold text-fg-primary mb-2">
        {title}
      </h3>

      <p className="text-body-sm text-fg-secondary max-w-[360px] mb-6 leading-relaxed">
        {description}
      </p>

      {action && (
        <Button
          variant={variant === 'error' ? 'secondary' : 'primary'}
          onClick={action.onClick}
        >
          {action.label}
        </Button>
      )}
    </div>
  );
}
