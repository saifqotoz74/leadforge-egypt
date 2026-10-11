'use client';

import React, { useEffect } from 'react';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';
import { useTranslations } from 'next-intl';

export type ToastVariant = 'success' | 'error' | 'info';

export interface ToastProps {
  id?: string;
  message: string;
  variant?: ToastVariant;
  action?: {
    label: string;
    onClick: () => void;
  };
  onClose?: () => void;
  duration?: number;
}

const ICONS = {
  success: <CheckCircle2 className="w-5 h-5 text-brand shrink-0" />,
  error: <AlertCircle className="w-5 h-5 text-danger-icon shrink-0" />,
  info: <Info className="w-5 h-5 text-info-icon shrink-0" />,
};

export function Toast({
  message,
  variant = 'success',
  action,
  onClose,
  duration = 5000,
}: ToastProps) {
  const tCommon = useTranslations('common');

  useEffect(() => {
    // Errors persist until dismissed per Spec 7.3
    if (variant === 'error' || !onClose) return;

    const timer = setTimeout(() => {
      onClose();
    }, duration);

    return () => clearTimeout(timer);
  }, [variant, duration, onClose]);

  return (
    <div
      role="status"
      aria-live={variant === 'error' ? 'assertive' : 'polite'}
      className="inline-flex items-center gap-3 w-full max-w-toast p-3.5 bg-surface rounded-lg border border-line shadow-md text-start transition-all duration-200"
    >
      {ICONS[variant]}
      <p className="flex-1 text-body-sm text-fg-primary leading-tight font-medium">
        {message}
      </p>

      {action && (
        <button
          type="button"
          onClick={action.onClick}
          className="text-body-sm font-semibold text-brand hover:underline shrink-0"
        >
          {action.label}
        </button>
      )}

      {onClose && (
        <button
          type="button"
          onClick={onClose}
          className="text-fg-secondary hover:text-fg-primary p-1 -me-1 rounded hover:bg-subtle"
          aria-label={tCommon('closeNotification')}
        >
          <X className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}
