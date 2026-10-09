import React from 'react';
import { Check } from 'lucide-react';

export interface CheckboxProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label?: React.ReactNode;
  description?: string;
}

export const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(
  ({ label, description, id, className = '', disabled, checked, defaultChecked, onChange, ...props }, ref) => {
    const inputId = id || (typeof label === 'string' ? `checkbox-${label.replace(/\s+/g, '-').toLowerCase()}` : undefined);

    return (
      <label
        htmlFor={inputId}
        className={`inline-flex items-start gap-3 select-none ${
          disabled ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'
        } ${className}`}
      >
        <div className="relative flex items-center justify-center shrink-0 mt-0.5">
          <input
            ref={ref}
            id={inputId}
            type="checkbox"
            disabled={disabled}
            checked={checked}
            defaultChecked={defaultChecked}
            onChange={onChange}
            className="peer sr-only"
            {...props}
          />
          <div className="w-5 h-5 rounded border border-line-strong bg-surface transition-colors peer-checked:bg-brand peer-checked:border-brand peer-focus-visible:ring-2 peer-focus-visible:ring-brand-accent/40" />
          <Check className="absolute w-3.5 h-3.5 text-white opacity-0 transition-opacity peer-checked:opacity-100 pointer-events-none stroke-[2.5]" />
        </div>

        {(label || description) && (
          <div className="flex flex-col text-start">
            {label && <span className="text-body-sm font-medium text-fg-primary leading-tight">{label}</span>}
            {description && <span className="text-caption text-fg-secondary mt-1">{description}</span>}
          </div>
        )}
      </label>
    );
  }
);

Checkbox.displayName = 'Checkbox';
