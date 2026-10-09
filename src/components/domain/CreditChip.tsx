import React from 'react';
import Link from 'next/link';
import { Coins } from 'lucide-react';
import { fmtNumber } from '@/lib/format';

export interface CreditChipProps {
  balance: number;
  href?: string;
  lowThreshold?: number;
  className?: string;
}

export const CreditChip: React.FC<CreditChipProps> = ({
  balance,
  href = '/subscription',
  lowThreshold = 10,
  className = '',
}) => {
  const isLow = balance < lowThreshold;

  const content = (
    <div
      className={`inline-flex items-center gap-2 h-9 px-3 rounded-full bg-subtle hover:bg-brand-soft/50 border border-transparent hover:border-line transition-colors group cursor-pointer ${className}`}
      role="status"
      aria-label={`رصيد النقاط: ${balance} نقطة${isLow ? ' (رصيد منخفض)' : ''}`}
    >
      {/* Coin Icon */}
      <Coins
        className={`h-4 w-4 shrink-0 ${
          isLow ? 'text-warning-icon' : 'text-fg-brand'
        } group-hover:scale-105 transition-transform`}
        aria-hidden="true"
      />

      {/* Number */}
      <span
        className={`ltr-iso font-mono font-semibold tabular-nums text-body-sm ${
          isLow ? 'text-warning-text' : 'text-fg-primary'
        }`}
      >
        {fmtNumber(balance)}
      </span>

      {/* Low State Indicator Dot per Spec 7.11 */}
      {isLow && (
        <span
          className="h-1.5 w-1.5 rounded-full bg-warning-icon shrink-0"
          title="رصيد منخفض"
          aria-hidden="true"
        />
      )}

      {/* Unit */}
      <span className="text-caption text-fg-secondary">نقطة</span>
    </div>
  );

  if (href) {
    return (
      <Link href={href} className="inline-block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand rounded-full">
        {content}
      </Link>
    );
  }

  return content;
};
