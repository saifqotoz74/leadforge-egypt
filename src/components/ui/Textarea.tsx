import React from 'react';
import { AlertCircle } from 'lucide-react';

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  optional?: boolean;
  helperText?: string;
  error?: string;
}

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  (
    {
      label,
      optional = false,
      helperText,
      error,
      id,
      className = '',
      disabled,
      rows = 4,
      ...props
    },
    ref
  ) => {
    const textareaId = id || (label ? `textarea-${label.replace(/\s+/g, '-').toLowerCase()}` : undefined);
    const hasError = Boolean(error);

    return (
      <div className="w-full text-start">
        {label && (
          <label
            htmlFor={textareaId}
            className="block text-label font-medium text-fg-primary mb-2 select-none"
          >
            {label}
            {optional && (
              <span className="text-fg-secondary font-normal ms-2 text-caption">
                (اختياري)
              </span>
            )}
          </label>
        )}

        <textarea
          ref={ref}
          id={textareaId}
          rows={rows}
          disabled={disabled}
          aria-invalid={hasError}
          aria-describedby={
            hasError && textareaId
              ? `${textareaId}-error`
              : helperText && textareaId
              ? `${textareaId}-helper`
              : undefined
          }
          className={`w-full p-3.5 rounded-md bg-surface text-fg-primary text-body transition-colors border outline-none placeholder:text-fg-muted resize-y ${
            hasError
              ? 'border-danger-icon focus:ring-2 focus:ring-danger-icon/30'
              : 'border-line-strong hover:border-fg-muted focus:border-brand focus:ring-2 focus:ring-brand-accent/40'
          } ${disabled ? 'bg-subtle text-fg-muted cursor-not-allowed' : ''} ${className}`}
          {...props}
        />

        {hasError ? (
          <p
            id={textareaId ? `${textareaId}-error` : undefined}
            className="flex items-center gap-1.5 mt-1.5 text-caption text-danger-text"
          >
            <AlertCircle className="w-4 h-4 shrink-0 text-danger-icon" aria-hidden="true" />
            <span>{error}</span>
          </p>
        ) : helperText ? (
          <p
            id={textareaId ? `${textareaId}-helper` : undefined}
            className="mt-1.5 text-caption text-fg-secondary"
          >
            {helperText}
          </p>
        ) : null}
      </div>
    );
  }
);

Textarea.displayName = 'Textarea';
