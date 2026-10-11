'use client';

import React from 'react';
import { useLocale, useTranslations } from 'next-intl';
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
    bgClass: string;
    textClass: string;
    dotClass: string;
    filledDots: number;
  }
> = {
  COLD: {
    bgClass: 'bg-tier-cold-bg',
    textClass: 'text-tier-cold-fg',
    dotClass: 'bg-tier-cold-fg',
    filledDots: 1,
  },
  WARM: {
    bgClass: 'bg-tier-warm-bg',
    textClass: 'text-tier-warm-fg',
    dotClass: 'bg-tier-warm-fg',
    filledDots: 2,
  },
  HOT: {
    bgClass: 'bg-tier-hot-bg',
    textClass: 'text-tier-hot-fg',
    dotClass: 'bg-tier-hot-fg',
    filledDots: 3,
  },
  PREMIUM: {
    bgClass: 'bg-tier-premium-bg',
    textClass: 'text-tier-premium-fg',
    dotClass: 'bg-tier-premium-fg',
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
  const tEnums = useTranslations('enums.LeadTemperature');
  const tCommon = useTranslations('common');
  const locale = useLocale();
  const config = TIER_CONFIG[temperature] || TIER_CONFIG.COLD;
  const isSmall = size === 'sm';

  const label = tEnums(temperature);

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
        aria-label={label}
      >
        <span>{label}</span>
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

      {/* Numeric Score (0 to 100) next to the pill with quiet Opportunity caption */}
      {showScore && typeof score === 'number' && (
        <div className="flex flex-col items-start leading-none gap-0.5">
          <span
            className="font-semibold tabular-nums text-fg-primary text-h4 leading-none"
            aria-label={`${score} / 100`}
          >
            {fmtNumber(score, locale)}
          </span>
          <span className="text-caption text-fg-muted font-normal leading-none">
            {tCommon('opportunity')}
          </span>
        </div>
      )}
    </div>
  );
};
