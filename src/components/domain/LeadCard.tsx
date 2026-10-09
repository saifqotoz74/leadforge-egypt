import React from 'react';
import Link from 'next/link';
import { Coins } from 'lucide-react';
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
  onViewLead,
  className = '',
}) => {
  return (
    <article
      className={`group relative rounded-lg border border-line bg-surface p-[var(--card-pad)] transition-all duration-200 hover:border-line-strong hover:shadow-sm focus-within:ring-2 focus-within:ring-brand flex flex-col justify-between gap-3 ${className}`}
      aria-labelledby={`lead-title-${id}`}
    >
      {/* 1. Header row: OpportunityBadge (start) and OwnershipTag (end) */}
      <div className="flex items-center justify-between gap-2">
        <OpportunityBadge
          temperature={temperature}
          score={score}
          size="sm"
        />
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
          className="text-h4 font-semibold text-fg-primary truncate"
          title={companyName}
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
            {companyName}
          </Link>
        </h4>

        {/* Category and district/city separated by 4px gap per Spec 7.8 (no middle dot) */}
        <div className="flex items-center gap-1 text-body-sm text-fg-secondary">
          <span>{category}</span>
          <span className="w-1" aria-hidden="true" />
          <span>{location}</span>
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
          <span className="ltr-iso font-mono font-semibold tabular-nums text-body">
            {fmtNumber(price)}
          </span>
          <span className="text-caption text-fg-secondary">نقطة</span>
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
            عرض الفرصة
          </Button>
        </div>
      </div>
    </article>
  );
};
