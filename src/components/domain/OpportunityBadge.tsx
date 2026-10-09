import React from 'react';
import { fmtNumber } from '@/lib/format';

export type LeadTemperature = 'COLD' | 'WARM' | 'HOT' | 'PREMIUM';

export interface OpportunityBadgeProps {
  temperature: LeadTemperature;
  score?: number;
  size?: 'sm' | 'md';
  className?: string;
  showScore?: boolean;
}

const TIER_CONFIG: Record<
  LeadTemperature,
  {
    label: string;
    bgClass: string;
    textClass: string;
    dotClass: string;
    filledDots: number;
  }
> = {
  COLD: {
    label: 'بارد',
    bgClass: 'bg-subtle',
    textClass: 'text-fg-secondary',
    dotClass: 'bg-fg-secondary',
    filledDots: 1,
  },
  WARM: {
    label: 'دافئ',
    bgClass: 'bg-sand-100',
    textClass: 'text-sand-700',
    dotClass: 'bg-sand-700',
    filledDots: 2,
  },
  HOT: {
    label: 'ساخن',
    bgClass: 'bg-clay-50',
    textClass: 'text-clay-700',
    dotClass: 'bg-clay-700',
    filledDots: 3,
  },
  PREMIUM: {
    label: 'مميز',
    bgClass: 'bg-inverse',
    textClass: 'text-fg-inverse',
    dotClass: 'bg-fg-inverse',
    filledDots: 4,
  },
};

export const OpportunityBadge: React.FC<OpportunityBadgeProps> = ({
  temperature,
  score,
  size = 'md',
  className = '',
  showScore = true,
}) => {
  const config = TIER_CONFIG[temperature] || TIER_CONFIG.COLD;
  const isSmall = size === 'sm';

  return (
    <div className={`inline-flex items-center gap-2 ${className}`}>
      {/* Pill with Heat Meter */}
      <span
        className={`inline-flex items-center gap-1.5 rounded-full font-medium transition-colors ${
          config.bgClass
        } ${config.textClass} ${
          isSmall ? 'px-2 py-0.5 text-caption' : 'px-2.5 py-1 text-label'
        }`}
        role="status"
        aria-label={`درجة الفرصة: ${config.label}`}
      >
        <span>{config.label}</span>
        {/* 4-dot heat meter (Spec 6.1: 6px circles) */}
        <span className="inline-flex items-center gap-0.5" aria-hidden="true">
          {[1, 2, 3, 4].map((dotIndex) => {
            const isFilled = dotIndex <= config.filledDots;
            return (
              <span
                key={dotIndex}
                className={`h-1.5 w-1.5 rounded-full ${config.dotClass} ${
                  isFilled ? 'opacity-100' : 'opacity-30'
                }`}
              />
            );
          })}
        </span>
      </span>

      {/* Optional Separate Numeric Score (0 to 100) next to the pill */}
      {showScore && typeof score === 'number' && (
        <span
          className="ltr-iso font-mono font-semibold tabular-nums text-fg-primary text-h4"
          aria-label={`الدرجة: ${score} من 100`}
        >
          {fmtNumber(score)}
        </span>
      )}
    </div>
  );
};
