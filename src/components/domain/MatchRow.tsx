'use client';

import React from 'react';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { MetaList } from '@/components/ui/MetaList';
import { ChipList } from '@/components/ui/ChipList';
import { Button } from '@/components/ui/Button';
import { OpportunityBadge, LeadTemperature } from './OpportunityBadge';
import { QualityIndicator } from './QualityIndicator';
import { localizeWebsiteStatus } from '@/lib/taxonomy';

export interface MatchedLeadData {
  id: string;
  businessName: string;
  category: string;
  city: string;
  governorate?: string;
  score: number;
  opportunityScore?: number;
  qualityScore?: number;
  freshnessStatus?: string;
  verificationStatus?: string;
  temperature: string;
  websiteStatus: string;
  matchStrength?: number;
  matchPercentage?: number;
  matchEvaluation?: {
    matchStrength?: number;
    matchedCriteria?: string[];
    explanation?: {
      reasons?: Array<{ reason?: string; reasonAr?: string }>;
    };
  };
}

export interface MatchRowProps {
  lead: MatchedLeadData;
  categoryLabel?: string;
  cityLabel?: string;
  websiteStatusLabel?: string;
  className?: string;
}

export const MatchRow: React.FC<MatchRowProps> = ({
  lead,
  categoryLabel,
  cityLabel,
  websiteStatusLabel,
  className = '',
}) => {
  const tCommon = useTranslations('common');
  const tEnums = useTranslations('enums');
  const locale = useLocale();

  const strength =
    lead.matchStrength ??
    lead.matchPercentage ??
    lead.matchEvaluation?.matchStrength ??
    100;

  // Localized meta values
  const displayCity = cityLabel || lead.city;
  const displayCategory = categoryLabel || lead.category;
  const displayWebsiteStatus =
    websiteStatusLabel ||
    localizeWebsiteStatus(lead.websiteStatus, (k) => tEnums(k as any));

  // Chips show ONLY discriminating facts (Item 4):
  // Website opportunity status and any explicit scoring/matching signals in frontend data.
  // Sector match and Location match are removed as they are true for all matched leads.
  const reasonChips: string[] = [];
  if (displayWebsiteStatus) {
    reasonChips.push(displayWebsiteStatus);
  }

  // Scoring/matching signals if present in frontend data
  if (Array.isArray((lead as any).signals)) {
    (lead as any).signals.forEach((sig: string) => {
      if (typeof sig === 'string' && sig.trim() && !reasonChips.includes(sig)) {
        reasonChips.push(sig);
      }
    });
  }

  if (lead.matchEvaluation?.explanation?.reasons) {
    lead.matchEvaluation.explanation.reasons.forEach((r) => {
      const text = locale === 'en' ? r.reason || r.reasonAr : r.reasonAr || r.reason;
      if (text && !reasonChips.includes(text)) {
        reasonChips.push(text);
      }
    });
  }

  return (
    <div
      className={`py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-colors ${className}`}
    >
      {/* Start side hierarchy */}
      <div className="flex flex-col gap-1.5 min-w-0 flex-1">
        {/* 1. Business Name wrapped in bdi with line-clamp-2 (Item 11) */}
        <Link
          href={`/leads/${lead.id}`}
          className="text-body font-semibold text-fg-primary hover:text-fg-brand transition-colors line-clamp-2"
        >
          <bdi dir="auto">{lead.businessName}</bdi>
        </Link>

        {/* 2. MetaList: Identity ONLY (category, city) per Item 1 */}
        <MetaList
          items={[
            <bdi key="category" dir="auto">{displayCategory}</bdi>,
            <bdi key="city" dir="auto">{displayCity}</bdi>,
          ]}
        />

        {/* 3. Reason chips: WHY it matches (website opportunity, sector match, location match) */}
        {reasonChips.length > 0 && (
          <ChipList chips={reasonChips} maxVisible={3} className="pt-0.5" />
        )}

        {/* 4. QualityIndicator per Base 6.2 and Addendum 3.7 */}
        <div className="pt-0.5">
          <QualityIndicator
            verificationStatus={lead.verificationStatus}
            freshnessStatus={lead.freshnessStatus}
            size="sm"
          />
        </div>
      </div>

      {/* End side */}
      <div className="flex items-center gap-3 shrink-0 self-start sm:self-center">
        {/* Match strength as a quiet caption with ltr-iso isolated percentage (Item 4) */}
        <span className="text-caption text-fg-secondary">
          {tCommon.rich('matchPercent', {
            percent: strength,
            pct: (chunks) => <span className="ltr-iso tabular-nums">{chunks}</span>,
          })}
        </span>

        {/* Tier pill + Score */}
        <OpportunityBadge
          temperature={(lead.temperature as LeadTemperature) || 'HOT'}
          score={lead.score || lead.opportunityScore}
          size="sm"
          showScore={true}
        />

        {/* Action Button */}
        <Link href={`/leads/${lead.id}`}>
          <Button variant="secondary" size="sm">
            {tCommon('preview')}
          </Button>
        </Link>
      </div>
    </div>
  );
};
