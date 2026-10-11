'use client';

import React from 'react';
import { AlertCircle } from 'lucide-react';
import { useLocale } from 'next-intl';
import { fmtNumber } from '@/lib/format';

export interface StatTileProps {
  label: string;
  value: number | string;
  unit?: string;
  statusText?: string;
  isOutOfRange?: boolean;
  className?: string;
}

export const StatTile: React.FC<StatTileProps> = ({
  label,
  value,
  unit,
  statusText,
  isOutOfRange = false,
  className = '',
}) => {
  const locale = useLocale();

  return (
    <div
      className={`rounded-lg border bg-surface p-4 flex flex-col justify-between gap-2 shadow-xs transition-colors text-start items-start ${
        isOutOfRange ? 'border-warning-border bg-warning-bg' : 'border-line'
      } ${className}`}
      role="region"
      aria-label={label}
    >
      <span className="text-caption font-medium text-fg-secondary">
        {label}
      </span>

      <div className="flex items-baseline gap-1.5 my-1">
        <span className="text-2xl font-semibold tabular-nums text-fg-primary">
          {typeof value === 'number' ? fmtNumber(value, locale) : value}
        </span>
        {unit && <span className="text-caption text-fg-secondary">{unit}</span>}
      </div>

      {statusText && (
        <div
          className={`flex items-start gap-1.5 text-caption pt-2 border-t border-line w-full ${
            isOutOfRange
              ? '!border-warning-border text-warning-text font-medium'
              : 'text-fg-secondary'
          }`}
        >
          {isOutOfRange && (
            <AlertCircle className="h-3.5 w-3.5 shrink-0 text-warning-icon mt-0.5" />
          )}
          <span className="leading-snug break-words">{statusText}</span>
        </div>
      )}
    </div>
  );
};
