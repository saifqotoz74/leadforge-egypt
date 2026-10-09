import React from 'react';

export interface SwitchProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label?: React.ReactNode;
  description?: string;
}

export const Switch = React.forwardRef<HTMLInputElement, SwitchProps>(
  ({ label, description, id, className = '', disabled, checked, defaultChecked, onChange, ...props }, ref) => {
    const inputId = id || (typeof label === 'string' ? `switch-${label.replace(/\s+/g, '-').toLowerCase()}` : undefined);

    return (
      <label
        htmlFor={inputId}
        className={`inline-flex items-center justify-between gap-4 select-none ${
          disabled ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'
        } ${className}`}
      >
        {(label || description) && (
          <div className="flex flex-col text-start">
            {label && <span className="text-body-sm font-medium text-fg-primary">{label}</span>}
            {description && <span className="text-caption text-fg-secondary mt-0.5">{description}</span>}
          </div>
        )}

        <div className="relative inline-flex items-center shrink-0">
          <input
            ref={ref}
            id={inputId}
            type="checkbox"
            role="switch"
            disabled={disabled}
            checked={checked}
            defaultChecked={defaultChecked}
            onChange={onChange}
            className="peer sr-only"
            {...props}
          />
          <div className="w-11 h-6 bg-line-strong rounded-full transition-colors peer-checked:bg-brand peer-focus-visible:ring-2 peer-focus-visible:ring-brand-accent/40" />
          <div className="absolute start-0.5 top-0.5 w-5 h-5 bg-surface rounded-full transition-transform peer-checked:translate-x-5 rtl:peer-checked:-translate-x-5 shadow-xs pointer-events-none" />
        </div>
      </label>
    );
  }
);

Switch.displayName = 'Switch';
