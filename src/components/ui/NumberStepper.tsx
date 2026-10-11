'use client';

import React from 'react';
import { Minus, Plus } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { fmtNumber } from '@/lib/format';

export interface NumberStepperProps {
  value: number;
  onChange: (newValue: number) => void;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
  size?: 'sm' | 'md';
  className?: string;
  'aria-label'?: string;
}

export const NumberStepper: React.FC<NumberStepperProps> = ({
  value,
  onChange,
  min = 0,
  max = 1000,
  step = 1,
  disabled = false,
  size = 'md',
  className = '',
  'aria-label': ariaLabel,
}) => {
  const tCommon = useTranslations('common');
  const locale = useLocale();
  const isSmall = size === 'sm';

  const handleDecrement = () => {
    if (disabled || value <= min) return;
    onChange(Math.max(min, value - step));
  };

  const handleIncrement = () => {
    if (disabled || value >= max) return;
    onChange(Math.min(max, value + step));
  };

  return (
    <div
      className={`inline-flex items-center rounded-md border border-line bg-surface p-1 shadow-xs ${className}`}
      role="group"
      aria-label={ariaLabel || tCommon('numberStepper')}
    >
      <button
        type="button"
        onClick={handleDecrement}
        disabled={disabled || value <= min}
        className={`${
          isSmall ? 'h-6 w-6' : 'h-8 w-8'
        } rounded flex items-center justify-center text-fg-secondary hover:text-fg-primary hover:bg-subtle disabled:opacity-30 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand transition-colors`}
        aria-label={tCommon('decreaseValue')}
        title={tCommon('decrease')}
      >
        <Minus className={isSmall ? 'h-3 w-3' : 'h-4 w-4'} />
      </button>

      <span
        className={`ltr-iso font-bold tabular-nums text-center text-fg-primary select-none ${
          isSmall ? 'min-w-8 text-caption' : 'min-w-10 text-body-sm'
        }`}
        aria-live="polite"
      >
        {fmtNumber(value, locale)}
      </span>

      <button
        type="button"
        onClick={handleIncrement}
        disabled={disabled || value >= max}
        className={`${
          isSmall ? 'h-6 w-6' : 'h-8 w-8'
        } rounded flex items-center justify-center text-fg-secondary hover:text-fg-primary hover:bg-subtle disabled:opacity-30 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand transition-colors`}
        aria-label={tCommon('increaseValue')}
        title={tCommon('increase')}
      >
        <Plus className={isSmall ? 'h-3 w-3' : 'h-4 w-4'} />
      </button>
    </div>
  );
};
