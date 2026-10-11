'use client';

import React, { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { IconButton } from './Button';

export interface DialogProps {
  isOpen: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  size?: 'sm' | 'md' | 'lg';
  isSubmitting?: boolean;
}

const DIALOG_WIDTHS = {
  sm: 'max-w-dialogSm',
  md: 'max-w-dialogMd',
  lg: 'max-w-dialogLg',
};

export function Dialog({
  isOpen,
  onClose,
  title,
  children,
  footer,
  size = 'md',
  isSubmitting = false,
}: DialogProps) {
  const tCommon = useTranslations('common');
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape' && !isSubmitting && isOpen) {
        onClose();
      }
    }
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.body.style.overflow = 'unset';
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, isSubmitting, onClose]);

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-dialog flex items-center justify-center p-4"
    >
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-overlay transition-opacity duration-200"
        onClick={() => !isSubmitting && onClose()}
        aria-hidden="true"
      />

      {/* Dialog Surface */}
      <div
        ref={dialogRef}
        className={`relative z-10 w-full bg-surface rounded-xl border border-line shadow-lg p-6 text-start flex flex-col max-h-screen overflow-y-auto transition-all duration-200 ${DIALOG_WIDTHS[size]}`}
      >
        {/* Header */}
        {title && (
          <div className="flex items-center justify-between pb-4 mb-4 border-b border-line">
            <h3 className="text-h3 font-semibold text-fg-primary leading-snug">
              {title}
            </h3>
            <IconButton
              size="sm"
              variant="ghost"
              aria-label={tCommon('closeDialog')}
              disabled={isSubmitting}
              onClick={onClose}
              className="text-fg-secondary hover:text-fg-primary -me-1"
            >
              <X className="w-5 h-5" />
            </IconButton>
          </div>
        )}

        {/* Content */}
        <div className="overflow-y-auto flex-1">{children}</div>

        {/* Footer */}
        {footer && (
          <div className="flex items-center justify-end gap-3 pt-4 mt-6 border-t border-line">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

