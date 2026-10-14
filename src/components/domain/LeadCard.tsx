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

export interface LeadCardProps {
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
  signals?: string[];
  seatsRemaining?: number;
  maxSeats?: number;
  hasPhone?: boolean;
  isFieldVisit?: boolean;
  onViewLead?: (id: string) => void;
  className?: string;
}

export const LeadCard: React.FC<LeadCardProps> = ({
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
  signals = [],
  seatsRemaining,
  maxSeats,
  hasPhone,
  isFieldVisit,
  onViewLead,
  className = '',
}) => {
  const tCommon = useTranslations('common');
  const locale = useLocale();

  return (
    <article
      className={`group relative rounded-lg border border-line bg-surface p-[var(--card-pad)] transition-all duration-200 hover:border-line-strong hover:shadow-sm focus-within:ring-2 focus-within:ring-brand flex flex-col justify-between gap-3 ${className}`}
      aria-labelledby={`lead-title-${id}`}
    >
      {/* 1. Header row: OpportunityBadge (start) and OwnershipTag (end) */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 flex-wrap">
          <OpportunityBadge
            temperature={temperature}
            score={score}
            size="sm"
          />
          {(isFieldVisit || hasPhone === false) && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-caption font-medium bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/20">
              📍 زيارة ميدانية / سوشيال
            </span>
          )}
        </div>
        <OwnershipTag
          type={ownershipType}
          seatsRemaining={seatsRemaining}
          maxSeats={maxSeats}
          size="sm"
        />
      </div>

      {/* 2. Business name and location/category */}
      <div className="flex flex-col gap-1">
        <h4
          id={`lead-title-${id}`}
          title={companyName}
          className="text-h4 font-semibold text-fg-primary truncate" /* design-allow: truncate */
        >
          {/* Stretched Link for accessible card click */}
          <Link
            href={`/leads/${id}`}
            onClick={(e) => {
              if (onViewLead) {
                e.preventDefault();
                onViewLead(id);
              }
            }}
            className="focus:outline-none after:absolute after:inset-0 after:z-10"
          >
            <bdi dir="auto">{companyName}</bdi>
          </Link>
        </h4>

        {/* Category and district/city separated by 4px gap per Spec 7.8 (no middle dot) */}
        <div className="flex items-center gap-1 text-body-sm text-fg-secondary">
          <span>{category}</span>
          <span className="w-1" aria-hidden="true" />
          <span><bdi dir="auto">{location}</bdi></span>
        </div>
      </div>

      {/* 3. Signals (up to 3 neutral outline chips per Spec 7.8) */}
      {signals && signals.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 py-0.5">
          {signals.slice(0, 3).map((signal, idx) => (
            <span
              key={idx}
              className="inline-flex items-center h-6 px-2 rounded-full border border-line text-caption text-fg-secondary bg-surface"
            >
              {signal}
            </span>
          ))}
        </div>
      )}

      {/* 4. QualityIndicator */}
      <div className="pt-0.5">
        <QualityIndicator
          status={qualityStatus}
          timestamp={qualityTimestamp}
          size="sm"
        />
      </div>

      {/* 5. Footer: Divider, Price, Action button */}
      <div className="pt-3 border-t border-line flex items-center justify-between gap-2">
        {/* Price display (inline credit format) */}
        <div className="flex items-center gap-1.5 text-fg-primary">
          <Coins className="h-4 w-4 text-fg-brand shrink-0" aria-hidden="true" />
          <span className="ltr-iso font-semibold tabular-nums text-body">
            {fmtNumber(price, locale)}
          </span>
          <span className="text-caption text-fg-secondary">{tCommon('unitPoint')}</span>
        </div>

        {/* Secondary sm action button per Spec 7.8 */}
        <div className="relative z-20">
          <Button
            variant="secondary"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              if (onViewLead) onViewLead(id);
            }}
          >
            {tCommon('viewLead')}
          </Button>
        </div>
      </div>
    </article>
  );
};
