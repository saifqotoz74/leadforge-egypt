'use client';

import React from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { PlatformStats } from '@/lib/stats';
import { fmtNumber, fmtDate } from '@/lib/format';

export interface StatsStripProps {
  stats?: PlatformStats;
  className?: string;
}

export const StatsStrip: React.FC<StatsStripProps> = ({ stats, className = '' }) => {
  const tLanding = useTranslations('landing');
  const locale = useLocale();

  if (!stats || (stats.businessesCount === 0 && stats.citiesCount === 0 && stats.categoriesCount === 0)) {
    return null;
  }

  return (
    <section
      className={`border-b border-line bg-surface py-10 ${className}`}
      aria-label={tLanding('statsStripAria')}
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex flex-wrap items-center justify-between gap-4 pb-6 mb-6 border-b border-line">
          <div className="inline-flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-brand shrink-0" aria-hidden="true" />
            <span className="text-caption font-semibold text-fg-brand">
              {tLanding('statsLiveBadge')}
            </span>
          </div>
          {stats.lastRefreshDate && (
            <div className="text-caption text-fg-muted flex items-center gap-1.5">
              <span>{tLanding('statsLastRefresh')}</span>
              <span className="ltr-iso tabular-nums font-medium text-fg-secondary">
                {fmtDate(stats.lastRefreshDate, locale)}
              </span>
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-6 text-center">
          {stats.businessesCount > 0 && (
            <div className="flex flex-col items-center justify-center p-4 rounded-xl bg-subtle border border-line">
              <span className="ltr-iso text-display font-bold tabular-nums text-fg-primary">
                {fmtNumber(stats.businessesCount, locale)}
              </span>
              <span className="mt-1 text-body-sm text-fg-secondary">
                {tLanding('statsBusinesses')}
              </span>
            </div>
          )}

          {stats.citiesCount > 0 && (
            <div className="flex flex-col items-center justify-center p-4 rounded-xl bg-subtle border border-line">
              <span className="ltr-iso text-display font-bold tabular-nums text-fg-primary">
                {fmtNumber(stats.citiesCount, locale)}
              </span>
              <span className="mt-1 text-body-sm text-fg-secondary">
                {tLanding('statsCities')}
              </span>
            </div>
          )}

          {stats.categoriesCount > 0 && (
            <div className="flex flex-col items-center justify-center p-4 rounded-xl bg-subtle border border-line col-span-2 md:col-span-1">
              <span className="ltr-iso text-display font-bold tabular-nums text-fg-primary">
                {fmtNumber(stats.categoriesCount, locale)}
              </span>
              <span className="mt-1 text-body-sm text-fg-secondary">
                {tLanding('statsCategories')}
              </span>
            </div>
          )}
        </div>
      </div>
    </section>
  );
};
