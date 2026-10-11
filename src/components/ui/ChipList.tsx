'use client';

import React from 'react';
import { Tooltip } from './Tooltip';

export interface ChipListProps {
  chips: (string | { label: string; key?: string })[];
  maxVisible?: number;
  chipClassName?: string;
  className?: string;
}

export const ChipList: React.FC<ChipListProps> = ({
  chips,
  maxVisible = 3,
  chipClassName = '',
  className = '',
}) => {
  if (!chips || chips.length === 0) return null;

  const visibleChips = chips.slice(0, maxVisible);
  const hiddenChips = chips.slice(maxVisible);
  const hiddenCount = hiddenChips.length;

  const hiddenLabels = hiddenChips
    .map((c) => (typeof c === 'string' ? c : c.label))
    .join(' • ');

  return (
    <div className={`flex flex-wrap items-center gap-1.5 ${className}`}>
      {visibleChips.map((chip, idx) => {
        const label = typeof chip === 'string' ? chip : chip.label;
        const key = typeof chip === 'string' ? `${chip}-${idx}` : chip.key || `${chip.label}-${idx}`;
        return (
          <span
            key={key}
            className={`inline-flex items-center rounded-full border border-line bg-surface px-2 py-0.5 text-caption font-medium text-fg-secondary transition-colors ${chipClassName}`}
          >
            {label}
          </span>
        );
      })}

      {hiddenCount > 0 && (
        <Tooltip content={hiddenLabels}>
          <span
            className="inline-flex items-center rounded-full border border-line bg-subtle px-1.5 py-0.5 text-caption font-medium text-fg-muted cursor-default tabular-nums hover:text-fg-secondary transition-colors"
            aria-label={`+${hiddenCount} more`}
          >
            +{hiddenCount}
          </span>
        </Tooltip>
      )}
    </div>
  );
};
