'use client';

import React from 'react';
import Link from 'next/link';
import { Coins } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { OpportunityBadge, LeadTemperature } from './OpportunityBadge';
import { OwnershipTag, OwnershipType } from './OwnershipTag';
import { QualityIndicator, QualityState } from './QualityIndicator';
import { Button } from '@/components/ui/Button';
import { fmtNumber } from '@/lib/format';

export interface LeadRowProps {
  id: string;
  companyName: string;
  category: string;
  location: string;
  temperature: LeadTemperature;
  score: number;
  ownershipType: OwnershipType;
  qualityStatus: QualityState;
  qualityTimestamp?: Date | string | null;
  price: number;
  seatsRemaining?: number;
  maxSeats?: number;
  onViewLead?: (id: string) => void;
  className?: string;
}

export const LeadRow: React.FC<LeadRowProps> = ({
  id,
  companyName,
  category,
  location,
  temperature,
  score,
  ownershipType,
  qualityStatus,
  qualityTimestamp,
  price,
  seatsRemaining,
  maxSeats,
  onViewLead,
  className = '',
}) => {
  const tCommon = useTranslations('common');
  const locale = useLocale();

  return (
    <tr
      className={`border-b border-line hover:bg-brand-soft transition-colors h-[var(--row-h)] group ${className}`}
    >
      {/* Name block */}
      <td className="px-4 py-2 align-middle">
        <div className="flex flex-col">
          <Link
            href={`/leads/${id}`}
            onClick={(e) => {
              if (onViewLead) {
                e.preventDefault();
                onViewLead(id);
              }
            }}
            title={companyName}
            className="text-body font-semibold text-fg-primary hover:text-fg-brand truncate max-w-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand rounded-sm" /* design-allow: truncate */
          >
            <bdi dir="auto">{companyName}</bdi>
          </Link>
          <div className="flex items-center gap-1 text-caption text-fg-secondary">
            <span>{category}</span>
            <span className="w-1" aria-hidden="true" />
            <span><bdi dir="auto">{location}</bdi></span>
          </div>
        </div>
      </td>

      {/* Tier with score */}
      <td className="px-4 py-2 align-middle whitespace-nowrap">
        <OpportunityBadge
          temperature={temperature}
          score={score}
          size="sm"
        />
      </td>

      {/* Quality */}
      <td className="px-4 py-2 align-middle whitespace-nowrap">
        <QualityIndicator
          status={qualityStatus}
          timestamp={qualityTimestamp}
          size="sm"
        />
      </td>

      {/* Ownership */}
      <td className="px-4 py-2 align-middle whitespace-nowrap">
        <OwnershipTag
          type={ownershipType}
          seatsRemaining={seatsRemaining}
          maxSeats={maxSeats}
          size="sm"
        />
      </td>

      {/* Price */}
      <td className="px-4 py-2 align-middle text-end whitespace-nowrap">
        <div className="inline-flex items-center gap-1.5 justify-end">
          <Coins className="h-4 w-4 text-fg-brand shrink-0" aria-hidden="true" />
          <span className="ltr-iso font-semibold tabular-nums text-body-sm text-fg-primary">
            {fmtNumber(price, locale)}
          </span>
          <span className="text-caption text-fg-secondary">{tCommon('unitPoint')}</span>
        </div>
      </td>

      {/* Action */}
      <td className="px-4 py-2 align-middle text-end whitespace-nowrap">
        <Button
          variant="secondary"
          size="sm"
          onClick={() => {
            if (onViewLead) onViewLead(id);
          }}
        >
          {tCommon('viewLead')}
        </Button>
      </td>
    </tr>
  );
};
