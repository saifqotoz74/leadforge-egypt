'use client';

import React from 'react';
import { Lock, Users } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { fmtNumber } from '@/lib/format';

export type OwnershipType = 'EXCLUSIVE' | 'SHARED';

export interface OwnershipTagProps {
  type: OwnershipType;
  seatsRemaining?: number;
  maxSeats?: number;
  className?: string;
  size?: 'sm' | 'md';
}

export const OwnershipTag: React.FC<OwnershipTagProps> = ({
  type,
  seatsRemaining,
  maxSeats,
  className = '',
  size = 'md',
}) => {
  const tCommon = useTranslations('common');
  const locale = useLocale();
  const isExclusive = type === 'EXCLUSIVE';
  const isSmall = size === 'sm';

  const hasSeatData =
    !isExclusive &&
    typeof seatsRemaining === 'number' &&
    typeof maxSeats === 'number';

  const typeLabel = isExclusive ? tCommon('exclusiveLabel') : tCommon('sharedLabel');

  return (
    <div className={`inline-flex items-center gap-1.5 ${className}`}>
      {/* Outlined Pill per Spec 6.3 */}
      <span
        className={`inline-flex items-center gap-1 rounded-full border bg-transparent font-medium transition-colors ${
          isSmall ? 'px-2 py-0.5 text-caption' : 'px-2.5 py-1 text-label'
        } ${
          isExclusive
            ? 'border-line-brand text-fg-brand'
            : 'border-line-strong text-fg-secondary'
        }`}
        role="status"
        aria-label={tCommon('distributionTypeAria', { type: typeLabel })}
      >
        {isExclusive ? (
          <Lock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        ) : (
          <Users className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        )}
        <span>{typeLabel}</span>
      </span>

      {/* Seat Availability Caption per Spec 6.3 */}
      {hasSeatData && (
        <span className="text-caption text-fg-muted font-normal">
          ({tCommon('seatsRemainingPrefix')}{' '}
          <span className="ltr-iso tabular-nums font-medium text-fg-secondary">
            {fmtNumber(seatsRemaining!, locale)}
          </span>{' '}
          {tCommon('seatsRemainingMiddle')}{' '}
          <span className="ltr-iso tabular-nums font-medium text-fg-secondary">
            {fmtNumber(maxSeats!, locale)}
          </span>
          )
        </span>
      )}
    </div>
  );
};
