import React from 'react';
import Link from 'next/link';
import { fmtNumber } from '@/lib/format';

export interface BarListItem {
  label: string;
  value: number;
  percentage?: number;
  secondaryText?: string;
  href?: string;
}

export interface BarListProps {
  items: BarListItem[];
  maxValue?: number;
  showPercentage?: boolean;
  className?: string;
}

/**
 * BarList Component
 * Spec: LEADFORGE_SPEC_ADDENDUM_01.md
 * "rows of label, value, and a 6px bar: track --bg-brand-soft, fill --brand-accent"
 */
export const BarList: React.FC<BarListProps> = ({
  items,
  maxValue,
  showPercentage = true,
  className = '',
}) => {
  const calculatedMax = maxValue || Math.max(...items.map((i) => i.value), 1);

  return (
    <div className={`flex flex-col gap-3.5 w-full ${className}`}>
      {items.map((item, idx) => {
        const pct =
          typeof item.percentage === 'number'
            ? item.percentage
            : Math.min(100, Math.round((item.value / calculatedMax) * 100));

        const content = (
          <div className="flex flex-col gap-1 w-full group">
            {/* Row text: Label at start, Value & Percentage at end */}
            <div className="flex items-baseline justify-between text-caption gap-2">
              <div className="flex items-baseline gap-2 min-w-0">
                <span className="font-medium text-fg-primary truncate" title={item.label}> {/* design-allow: truncate */}
                  {item.label}
                </span>
                {item.secondaryText && (
                  <span className="text-caption text-fg-secondary shrink-0">
                    {item.secondaryText}
                  </span>
                )}
              </div>
              <div className="flex items-baseline gap-1.5 shrink-0">
                <span className="font-semibold text-fg-primary tabular-nums">
                  {fmtNumber(item.value)}
                </span>
                {showPercentage && (
                  <span className="text-fg-secondary font-normal ltr-iso tabular-nums">
                    ({pct}%)
                  </span>
                )}
              </div>
            </div>

            {/* 6px bar: track --bg-brand-soft, fill --brand-accent */}
            <div
              className="w-full bg-brand-soft rounded-full h-1.5 overflow-hidden"
              role="progressbar"
              aria-valuenow={item.value}
              aria-valuemin={0}
              aria-valuemax={calculatedMax}
              aria-label={item.label}
            >
              <div
                className="bg-brand-accent h-full rounded-full transition-all duration-300"
                style={{ width: `${Math.max(0, Math.min(100, pct))}%` }} /* design-allow: dynamic progress bar width */
              />
            </div>
          </div>
        );

        if (item.href) {
          return (
            <Link
              key={idx}
              href={item.href}
              className="block rounded focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand"
            >
              {content}
            </Link>
          );
        }

        return <div key={idx}>{content}</div>;
      })}
    </div>
  );
};
