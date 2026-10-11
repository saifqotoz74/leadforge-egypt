'use client';

import React from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Settings } from 'lucide-react';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { ChipList } from '@/components/ui/ChipList';
import { fmtNumber } from '@/lib/format';
import { localizePlanName } from '@/lib/taxonomy';

export interface PlanSummaryData {
  status: string;
  credits: number;
  totalCreditsGranted: number;
  creditsUsed?: number;
  currentPeriodEnd?: string;
  plan?: {
    slug?: string;
    name: string;
    nameEn?: string;
    priceEgp?: number;
  };
}

export interface ProfileData {
  services: string[];
  locations: string[];
  niches: string[];
  minBudget: number;
  leadType: string;
}

export interface PlanSummaryProps {
  subscription?: PlanSummaryData;
  profile?: ProfileData;
  planName?: string;
  nicheLabels?: Record<string, string>;
  cityLabels?: Record<string, string>;
  className?: string;
}

export const PlanSummary: React.FC<PlanSummaryProps> = ({
  subscription,
  profile,
  planName,
  nicheLabels = {},
  cityLabels = {},
  className = '',
}) => {
  const tDash = useTranslations('dashboard');
  const tPlans = useTranslations('plans');

  const credits = subscription?.credits ?? 0;
  const totalCredits = subscription?.totalCreditsGranted || Math.max(credits, 3);
  const percentage = Math.min(100, Math.max(0, Math.round((credits / totalCredits) * 100)));

  // Resolve plan name strictly through localized plan catalog
  const displayPlanName = localizePlanName(
    subscription?.plan || planName || 'free',
    tPlans as any
  );

  const priceEgp = subscription?.plan?.priceEgp ?? 0;

  return (
    <Card className={`h-full flex flex-col justify-between ${className}`}>
      <div className="flex flex-col gap-4">
        {/* Card Header with Status Pill */}
        <CardHeader className="pb-0">
          <CardTitle>{tDash('planAndCredits')}</CardTitle>
          <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-brand-soft text-fg-brand text-caption font-semibold">
            {tDash('active')}
          </span>
        </CardHeader>

        {/* Plan & Balance Details - Flat layout, NO nested card */}
        <div className="flex flex-col gap-3 pt-2">
          {/* Plan Name & Price */}
          <div className="flex items-baseline justify-between">
            <span className="text-body font-semibold text-fg-primary">
              {displayPlanName}
            </span>
            <span className="text-caption font-semibold text-fg-brand tabular-nums">
              {tDash('egpMonth', { amount: fmtNumber(priceEgp) })}
            </span>
          </div>

          {/* Balance with unit and tabular numerals */}
          <div className="flex items-baseline justify-between text-caption text-fg-secondary">
            <span>{tDash('availableBalance')}</span>
            <span className="font-semibold text-fg-primary tabular-nums">
              {tDash('pointsRatio', {
                credits: fmtNumber(credits),
                total: fmtNumber(totalCredits),
              })}
            </span>
          </div>

          {/* Progress Bar (Spec: 6px track, brand-accent fill) */}
          <div
            className="w-full bg-subtle rounded-full h-1.5 overflow-hidden"
            role="progressbar"
            aria-valuenow={credits}
            aria-valuemin={0}
            aria-valuemax={totalCredits}
            aria-label={tDash('availableBalance')}
          >
            <div
              className="bg-brand-accent h-full rounded-full transition-all duration-300"
              style={{ width: `${percentage}%` }} /* design-allow: dynamic progress bar width */
            />
          </div>

          {/* Match Preferences section (Item 9: ChipList +N with tooltip) */}
          {profile && (
            <div className="mt-2 pt-3 border-t border-line flex flex-col gap-2 text-caption text-fg-secondary">
              <div className="flex items-center justify-between font-semibold text-fg-primary">
                <span>{tDash('matchPreferences')}</span>
                <Link
                  href="/settings"
                  className="inline-flex items-center gap-1 text-fg-brand hover:underline font-normal text-caption"
                >
                  <Settings className="w-3.5 h-3.5" />
                  <span>{tDash('edit')}</span>
                </Link>
              </div>

              {profile.locations && profile.locations.length > 0 && (
                <div className="flex flex-col gap-1">
                  <span className="text-fg-secondary font-medium">{tDash('cities')}</span>
                  <ChipList
                    chips={profile.locations.map((loc) => cityLabels[loc] || loc)}
                    maxVisible={2}
                  />
                </div>
              )}

              {profile.niches && profile.niches.length > 0 && (
                <div className="flex flex-col gap-1">
                  <span className="text-fg-secondary font-medium">{tDash('niches')}</span>
                  <ChipList
                    chips={profile.niches.map((n) => nicheLabels[n] || n)}
                    maxVisible={2}
                  />
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Footer actions: secondary Upgrade, ghost Top Up Points (Item 9) */}
      <div className="pt-4 mt-4 border-t border-line flex items-center gap-2">
        <Link href="/subscription" className="flex-1">
          <Button variant="secondary" size="sm" fullWidth>
            {tDash('upgradePlan')}
          </Button>
        </Link>
        <Link href="/subscription" className="flex-1">
          <Button variant="ghost" size="sm" fullWidth>
            {tDash('topUpPoints')}
          </Button>
        </Link>
      </div>
    </Card>
  );
};
