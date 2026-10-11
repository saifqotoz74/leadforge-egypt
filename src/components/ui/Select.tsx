import React from 'react';
import { useTranslations } from 'next-intl';
import { AlertCircle, ChevronDown } from 'lucide-react';

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  optional?: boolean;
  optionalLabel?: string;
  helperText?: string;
  error?: string;
  options?: SelectOption[];
}

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  (
    {
      label,
      optional = false,
      optionalLabel,
      helperText,
      error,
      options,
      id,
      className = '',
      disabled,
      children,
      ...props
    },
    ref
  ) => {
    const tCommon = useTranslations('common');

    const selectId = id || (label ? `select-${label.replace(/\s+/g, '-').toLowerCase()}` : undefined);
    const hasError = Boolean(error);

    return (
      <div className="w-full text-start">
        {label && (
          <label
            htmlFor={selectId}
            className="block text-label font-medium text-fg-primary mb-2 select-none"
          >
            {label}
            {optional && (
              <span className="text-fg-secondary font-normal ms-2 text-caption">
                {optionalLabel || tCommon('optionalTag')}
              </span>
            )}
          </label>
        )}

        <div className="relative flex items-center w-full">
          <select
            ref={ref}
            id={selectId}
            disabled={disabled}
            aria-invalid={hasError}
            aria-describedby={
              hasError && selectId
                ? `${selectId}-error`
                : helperText && selectId
                ? `${selectId}-helper`
                : undefined
            }
            className={`w-full h-10 ps-4 pe-10 rounded-md bg-surface text-fg-primary text-body transition-colors border outline-none appearance-none cursor-pointer ${
              hasError
                ? 'border-danger-icon focus:ring-2 focus:ring-danger-icon'
                : 'border-line-strong hover:border-fg-muted focus:border-brand focus:ring-2 focus:ring-brand-accent'
            } ${disabled ? 'bg-subtle text-fg-muted cursor-not-allowed' : ''} ${className}`}
            {...props}
          >
            {options
              ? options.map((opt) => (
                  <option key={opt.value} value={opt.value} disabled={opt.disabled}>
                    {opt.label}
                  </option>
                ))
              : children}
          </select>

          <div className="absolute end-3.5 flex items-center justify-center text-fg-secondary pointer-events-none w-4 h-4">
            <ChevronDown className="w-4 h-4 shrink-0" aria-hidden="true" />
          </div>
        </div>

        {hasError ? (
          <p
            id={selectId ? `${selectId}-error` : undefined}
            className="flex items-center gap-1.5 mt-1.5 text-caption text-danger-text"
          >
            <AlertCircle className="w-4 h-4 shrink-0 text-danger-icon" aria-hidden="true" />
            <span>{error}</span>
          </p>
        ) : helperText ? (
          <p
            id={selectId ? `${selectId}-helper` : undefined}
            className="mt-1.5 text-caption text-fg-secondary"
          >
            {helperText}
          </p>
        ) : null}
      </div>
    );
  }
);

Select.displayName = 'Select';
