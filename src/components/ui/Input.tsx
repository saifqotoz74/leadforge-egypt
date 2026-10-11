'use client';

import React, { useState } from 'react';
import { useTranslations } from 'next-intl';
import { AlertCircle, Eye, EyeOff } from 'lucide-react';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  optional?: boolean;
  optionalLabel?: string;
  helperText?: string;
  error?: string;
  startIcon?: React.ReactNode;
  endIcon?: React.ReactNode;
  showPasswordToggle?: boolean;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  (
    {
      label,
      optional = false,
      optionalLabel,
      helperText,
      error,
      startIcon,
      endIcon,
      showPasswordToggle,
      type = 'text',
      id,
      className = '',
      disabled,
      ...props
    },
    ref
  ) => {
    const tCommon = useTranslations('common');
    const [isPasswordVisible, setIsPasswordVisible] = useState(false);

    const isPasswordField = type === 'password' || showPasswordToggle;
    const effectiveType = isPasswordField
      ? isPasswordVisible
        ? 'text'
        : 'password'
      : type;

    const inputId = id || (label ? `input-${label.replace(/\s+/g, '-').toLowerCase()}` : undefined);
    const hasError = Boolean(error);

    return (
      <div className="w-full text-start">
        {label && (
          <label
            htmlFor={inputId}
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
          {startIcon && (
            <div className="absolute start-3 flex items-center justify-center text-fg-secondary pointer-events-none w-5 h-5">
              {startIcon}
            </div>
          )}

          <input
            ref={ref}
            id={inputId}
            type={effectiveType}
            disabled={disabled}
            aria-invalid={hasError}
            aria-describedby={
              hasError && inputId
                ? `${inputId}-error`
                : helperText && inputId
                ? `${inputId}-helper`
                : undefined
            }
            className={`w-full h-10 px-4 rounded-md bg-surface text-fg-primary text-body transition-colors border outline-none placeholder:text-fg-muted ${
              startIcon ? 'ps-10' : ''
            } ${endIcon || isPasswordField ? 'pe-10' : ''} ${
              hasError
                ? 'border-danger-icon focus:ring-2 focus:ring-danger-icon'
                : 'border-line-strong hover:border-fg-muted focus:border-brand focus:ring-2 focus:ring-brand-accent'
            } ${disabled ? 'bg-subtle text-fg-muted cursor-not-allowed' : ''} ${className}`}
            {...props}
          />

          {isPasswordField ? (
            <button
              type="button"
              onClick={() => setIsPasswordVisible(!isPasswordVisible)}
              className="absolute end-3 p-1 rounded text-fg-secondary hover:text-fg-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
              aria-label={isPasswordVisible ? tCommon('hidePassword') : tCommon('showPassword')}
              title={isPasswordVisible ? tCommon('hidePassword') : tCommon('showPassword')}
            >
              {isPasswordVisible ? (
                <EyeOff className="w-4 h-4" aria-hidden="true" />
              ) : (
                <Eye className="w-4 h-4" aria-hidden="true" />
              )}
            </button>
          ) : endIcon ? (
            <div className="absolute end-3 flex items-center justify-center text-fg-secondary pointer-events-none w-5 h-5">
              {endIcon}
            </div>
          ) : null}
        </div>

        {hasError ? (
          <p
            id={inputId ? `${inputId}-error` : undefined}
            className="flex items-center gap-1.5 mt-1.5 text-caption text-danger-text"
          >
            <AlertCircle className="w-4 h-4 shrink-0 text-danger-icon" aria-hidden="true" />
            <span>{error}</span>
          </p>
        ) : helperText ? (
          <p
            id={inputId ? `${inputId}-helper` : undefined}
            className="mt-1.5 text-caption text-fg-secondary"
          >
            {helperText}
          </p>
        ) : null}
      </div>
    );
  }
);

Input.displayName = 'Input';

