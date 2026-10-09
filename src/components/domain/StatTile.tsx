import React from 'react';
import { AlertCircle, CheckCircle2 } from 'lucide-react';
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
  return (
    <div
      className={`rounded-lg border bg-surface p-4 flex flex-col justify-between gap-2 shadow-xs transition-colors ${
        isOutOfRange ? 'border-warning-border bg-warning-bg/20' : 'border-line'
      } ${className}`}
      role="region"
      aria-label={label}
    >
      <span className="text-caption font-medium text-fg-secondary">
        {label}
      </span>

      <div className="flex items-baseline gap-1.5 my-1">
        <span className="ltr-iso font-mono text-2xl font-semibold tabular-nums text-fg-primary">
          {typeof value === 'number' ? fmtNumber(value) : value}
        </span>
        {unit && <span className="text-caption text-fg-muted">{unit}</span>}
      </div>

      {statusText && (
        <div
          className={`flex items-center gap-1.5 text-caption pt-1 border-t ${
            isOutOfRange
              ? 'border-warning-border/60 text-warning-text font-medium'
              : 'border-line/60 text-fg-secondary'
          }`}
        >
          {isOutOfRange ? (
            <AlertCircle className="h-3.5 w-3.5 shrink-0 text-warning-icon" />
          ) : (
            <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-fg-brand" />
          )}
          <span className="truncate">{statusText}</span>
        </div>
      )}
    </div>
  );
};
