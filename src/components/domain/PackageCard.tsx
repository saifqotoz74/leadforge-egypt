'use client';

import React from 'react';
import { Check } from 'lucide-react';
import { useTranslations, useLocale } from 'next-intl';
import { Button } from '@/components/ui/Button';
import { fmtNumber, formatEGP } from '@/lib/format';
import { localizePlanCatalog } from '@/lib/taxonomy';

export interface PackageCardProps {
  id: string;
  slug?: string;
  name: string;
  points: number;
  priceEGP: number;
  features: string[];
  allowsExclusive?: boolean;
  isRecommended?: boolean;
  isCurrent?: boolean;
  recommendedReason?: string;
  ctaLabel?: string;
  onSelectPackage?: (id: string) => void;
  reassuranceText?: string;
  className?: string;
}

export const PackageCard: React.FC<PackageCardProps> = ({
  id,
  slug,
  name,
  points,
  priceEGP,
  allowsExclusive = true,
  isRecommended = false,
  isCurrent = false,
  recommendedReason,
  ctaLabel,
  onSelectPackage,
  reassuranceText,
  className = '',
}) => {
  const tPlans = useTranslations('plans');
  const locale = useLocale();

  const pricePerPoint = points > 0 ? Math.round((priceEGP / points) * 100) / 100 : 0;
  const localized = localizePlanCatalog(
    {
      slug,
      id,
      name,
      monthlyCredits: points,
      allowsExclusive,
    },
    tPlans as any,
    fmtNumber(points, locale)
  );

  const resolvedTagline = recommendedReason || localized.tagline;
  const resolvedReassurance = reassuranceText ?? tPlans('defaultReassurance');

  return (
    <div
      className={`relative h-full rounded-xl bg-surface p-6 sm:p-8 transition-all flex flex-col justify-between ${
        isRecommended
          ? 'border-2 border-brand shadow-sm'
          : 'border border-line hover:border-line-strong'
      } ${className}`}
    >
      {/* Recommended Pill Badge straddling top edge per Spec 7.12 */}
      {isRecommended && (
        <div className="absolute -top-3.5 inset-x-0 flex justify-center z-10">
          <span className="inline-flex items-center h-7 px-4 rounded-full bg-brand text-fg-on-brand text-caption font-medium shadow-xs">
            {tPlans('mostPopularBadge')}
          </span>
        </div>
      )}

      {/* 1. Plan name & 2. Tagline area (consistent minimum height for vertical alignment) */}
      <div className="flex flex-col gap-1.5 mb-4">
        <h3 className="text-h3 font-semibold text-fg-primary break-words">
          {localized.name}
        </h3>
        <p className="text-body-sm text-fg-secondary min-h-12 break-words">
          {resolvedTagline}
        </p>
      </div>

      {/* 3. Included points */}
      <div className="flex items-baseline gap-2 mb-3">
        <span className="ltr-iso text-display font-bold leading-none tabular-nums text-fg-primary">
          {fmtNumber(points, locale)}
        </span>
        <span className="text-body text-fg-secondary">{tPlans('pointsUnit')}</span>
      </div>

      {/* 4. Price with per-point caption (no parentheses, tabular-nums) */}
      <div className="flex flex-col gap-1 pb-6 mb-6 border-b border-line min-h-16 justify-center">
        {priceEGP === 0 ? (
          <div className="text-h2 font-bold text-fg-primary">
            {tPlans('freePrice')}
          </div>
        ) : (
          <>
            <div className="ltr-iso text-h2 font-bold tabular-nums text-fg-primary">
              {formatEGP(priceEGP, locale)}
            </div>
            <span className="text-caption text-fg-secondary tabular-nums">
              {tPlans('perPointCaption', { price: fmtNumber(pricePerPoint, locale) })}
            </span>
          </>
        )}
      </div>

      {/* 5. Feature list (flex-1 aligns primary action across all cards in a row) */}
      <ul className="flex-1 flex flex-col gap-3 mb-8">
        {localized.features.map((feature, idx) => (
          <li key={idx} className="flex items-start gap-2.5 text-body-sm text-fg-primary">
            <Check className="h-4 w-4 shrink-0 text-fg-brand mt-1" aria-hidden="true" />
            <span className="break-words">{feature}</span>
          </li>
        ))}
      </ul>

      {/* 6. Primary action & Reassurance text */}
      <div className="mt-auto flex flex-col gap-2">
        <Button
          variant={isRecommended ? 'primary' : 'secondary'}
          size="lg"
          className="w-full"
          onClick={() => {
            if (onSelectPackage) onSelectPackage(id);
          }}
        >
          {ctaLabel || (isCurrent ? tPlans('currentPlanCta') : tPlans('selectPlanCta'))}
        </Button>

        {resolvedReassurance && (
          <p className="text-caption text-fg-secondary text-center pt-1 min-h-6">
            {resolvedReassurance}
          </p>
        )}
      </div>
    </div>
  );
};

