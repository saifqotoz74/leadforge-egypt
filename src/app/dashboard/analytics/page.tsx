'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { AppShell } from '@/components/domain/AppShell';
import { PageHeader } from '@/components/domain/PageHeader';
import { StatTile } from '@/components/domain/StatTile';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { BarList } from '@/components/ui/BarList';
import { MetaList } from '@/components/ui/MetaList';
import Link from 'next/link';
import { localizeCity, localizeCategory } from '@/lib/taxonomy';
import { fmtNumber, formatEGP } from '@/lib/format';
import { RefreshCw, ArrowRight } from 'lucide-react';

interface MetricRateDto {
  numerator: number;
  denominator: number;
  displayValue: string;
}

interface PerformanceDto {
  leadsClaimed: number;
  averageMatchStrength?: number | null;
  totalWins: number;
  winRate?: MetricRateDto;
  estimatedProjectValueEgp?: number;
  creditsConsumed: number;
  creditsRefunded: number;
  creditsBalance: number;
  contactRate?: MetricRateDto;
  replyRate?: MetricRateDto;
  interestRate?: MetricRateDto;
  meetingRate?: MetricRateDto;
  winRateOfMeetings?: MetricRateDto;
}

interface AnalyticsDataDto {
  performance?: PerformanceDto;
  byNiche?: Array<{
    niche: string;
    labelAr: string;
    claimed: number;
    contacted: number;
    meetings: number;
    wins: number;
    estimatedValueEgp?: number;
  }>;
  byCity?: Array<{
    city: string;
    claimed: number;
    contacted: number;
    meetings: number;
    wins: number;
    estimatedValueEgp?: number;
  }>;
}

export default function DeveloperAnalyticsPage() {
  const t = useTranslations('analytics');
  const tNav = useTranslations('nav');
  const tGeo = useTranslations('geo');
  const tCat = useTranslations('categories');
  const locale = useLocale();

  const [preset, setPreset] = useState<string>('all_time');
  const [loading, setLoading] = useState<boolean>(true);
  const [data, setData] = useState<AnalyticsDataDto | null>(null);

  const loadDeveloperAnalytics = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/developer/analytics?preset=${preset}`);
      if (res.ok) {
        setData(await res.json());
      }
    } finally {
      setLoading(false);
    }
  }, [preset]);

  useEffect(() => {
    loadDeveloperAnalytics();
  }, [loadDeveloperAnalytics]);

  const perf = data?.performance;

  return (
    <AppShell density="compact" pageTitle={t('pageTitle')}>
      <div className="flex flex-col gap-6">
        <PageHeader
          title={t('title')}
          description={t('description')}
          actions={
            <div className="flex items-center gap-3">
              <div className="w-48">
                <Select
                  aria-label={t('timeRange')}
                  value={preset}
                  onChange={(e) => setPreset(e.target.value)}
                  options={[
                    { value: 'all_time', label: t('allTime') },
                    { value: 'last_7_days', label: t('last7Days') },
                    { value: 'last_30_days', label: t('last30Days') },
                    { value: 'last_90_days', label: t('last90Days') },
                    { value: 'month_to_date', label: t('monthToDate') },
                  ]}
                />
              </div>

              <Link href="/dashboard">
                <Button
                  variant="ghost"
                  size="md"
                  startIcon={<ArrowRight className="h-4 w-4 rtl:-scale-x-100" />}
                >
                  {tNav('dashboard')}
                </Button>
              </Link>

              <Button
                variant="secondary"
                size="md"
                onClick={loadDeveloperAnalytics}
                disabled={loading}
                className="gap-1.5"
              >
                <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                <span>{t('refresh')}</span>
              </Button>
            </div>
          }
        />

        {loading || !perf ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-28 rounded-xl" />
            ))}
          </div>
        ) : (
          <>
            {/* Top StatTiles */}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <StatTile
                label={t('totalClaimed')}
                value={fmtNumber(perf.leadsClaimed, locale)}
                statusText={t('avgMatch', {
                  val: perf.averageMatchStrength != null ? fmtNumber(perf.averageMatchStrength, locale) + '%' : '-',
                })}
              />

              <StatTile
                label={t('totalWins')}
                value={fmtNumber(perf.totalWins, locale)}
                statusText={t('winRate', {
                  val: perf.winRate?.displayValue || '-',
                  num: perf.winRate?.numerator ?? 0,
                  den: perf.winRate?.denominator ?? 0,
                })}
              />

              <StatTile
                label={t('projectValue')}
                value={formatEGP(perf.estimatedProjectValueEgp || 0, locale)}
                statusText={t('projectValueDesc')}
              />

              <StatTile
                label={t('netCredits')}
                value={fmtNumber(perf.creditsConsumed, locale)}
                statusText={t('currentBalance', { val: fmtNumber(perf.creditsBalance, locale) })}
              />
            </div>

            {/* Funnel Stage Conversion Rates */}
            <Card>
              <CardHeader>
                <CardTitle>{t('funnelTitle')}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5 mb-6">
                  {[
                    { label: t('contactRate'), metric: perf.contactRate },
                    { label: t('replyRate'), metric: perf.replyRate },
                    { label: t('interestRate'), metric: perf.interestRate },
                    { label: t('meetingRate'), metric: perf.meetingRate },
                    {
                      label: t('winRateMeetings'),
                      metric: perf.winRateOfMeetings,
                    },
                  ].map((item) => (
                    <div
                      key={item.label}
                      className="rounded-lg border border-line bg-surface p-4 flex flex-col justify-between gap-2 shadow-xs"
                    >
                      <div className="flex items-center justify-between text-caption text-fg-secondary">
                        <span className="font-medium line-clamp-1">{item.label}</span>
                        <span className="font-medium tabular-nums ltr-iso text-fg-muted">
                          {item.metric?.numerator ?? 0}/{item.metric?.denominator ?? 0}
                        </span>
                      </div>
                      <p className="mt-1 text-2xl font-bold tabular-nums text-brand ltr-iso">
                        {item.metric?.displayValue || t('insufficientData')}
                      </p>
                    </div>
                  ))}
                </div>

                <div className="pt-4 border-t border-line">
                  <BarList
                    maxValue={100}
                    items={[
                      {
                        label: t('contactRate'),
                        value: perf.contactRate?.denominator
                          ? Math.round((perf.contactRate.numerator / perf.contactRate.denominator) * 100)
                          : 0,
                        secondaryText: `${perf.contactRate?.numerator ?? 0}/${perf.contactRate?.denominator ?? 0}`,
                      },
                      {
                        label: t('replyRate'),
                        value: perf.replyRate?.denominator
                          ? Math.round((perf.replyRate.numerator / perf.replyRate.denominator) * 100)
                          : 0,
                        secondaryText: `${perf.replyRate?.numerator ?? 0}/${perf.replyRate?.denominator ?? 0}`,
                      },
                      {
                        label: t('interestRate'),
                        value: perf.interestRate?.denominator
                          ? Math.round((perf.interestRate.numerator / perf.interestRate.denominator) * 100)
                          : 0,
                        secondaryText: `${perf.interestRate?.numerator ?? 0}/${perf.interestRate?.denominator ?? 0}`,
                      },
                      {
                        label: t('meetingRate'),
                        value: perf.meetingRate?.denominator
                          ? Math.round((perf.meetingRate.numerator / perf.meetingRate.denominator) * 100)
                          : 0,
                        secondaryText: `${perf.meetingRate?.numerator ?? 0}/${perf.meetingRate?.denominator ?? 0}`,
                      },
                      {
                        label: t('winRateMeetings'),
                        value: perf.winRateOfMeetings?.denominator
                          ? Math.round((perf.winRateOfMeetings.numerator / perf.winRateOfMeetings.denominator) * 100)
                          : 0,
                        secondaryText: `${perf.winRateOfMeetings?.numerator ?? 0}/${perf.winRateOfMeetings?.denominator ?? 0}`,
                      },
                    ]}
                  />
                </div>
              </CardContent>
            </Card>

            {/* Breakdown by Niche & City */}
            <div className="grid gap-6 lg:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>{t('byNicheTitle')}</CardTitle>
                </CardHeader>
                <CardContent>
                  {!data.byNiche || data.byNiche.length === 0 ? (
                    <EmptyState title={t('noData')} description={t('description')} />
                  ) : (
                    <div className="space-y-6">
                      <BarList
                        items={data.byNiche.map((n) => ({
                          label: localizeCategory(n.niche, tCat as any),
                          value: n.claimed,
                          secondaryText: t('winCount', { count: fmtNumber(n.wins, locale) }),
                        }))}
                      />

                      <div className="space-y-2 pt-4 border-t border-line">
                        {data.byNiche.map((n) => {
                          const metaParts = t('breakdownMetrics', {
                            claimed: fmtNumber(n.claimed, locale),
                            contacted: fmtNumber(n.contacted, locale),
                            meetings: fmtNumber(n.meetings, locale),
                          }).split(' • ');

                          return (
                            <div
                              key={n.niche}
                              className="flex items-center justify-between rounded-lg bg-subtle p-3 text-body-sm"
                            >
                              <div className="space-y-1">
                                <span className="font-semibold text-fg-primary block">
                                  <bdi dir="auto">{localizeCategory(n.niche, tCat as any)}</bdi>
                                </span>
                                <MetaList items={metaParts} />
                              </div>
                              <div className="text-end shrink-0">
                                <span className="block font-bold text-brand">
                                  {t('winCount', { count: fmtNumber(n.wins, locale) })}
                                </span>
                                <span className="block text-caption text-fg-muted tabular-nums ltr-iso">
                                  {formatEGP(n.estimatedValueEgp || 0, locale)}
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>{t('byCityTitle')}</CardTitle>
                </CardHeader>
                <CardContent>
                  {!data.byCity || data.byCity.length === 0 ? (
                    <EmptyState title={t('noData')} description={t('description')} />
                  ) : (
                    <div className="space-y-6">
                      <BarList
                        items={data.byCity.map((c) => ({
                          label: localizeCity(c.city, tGeo as any),
                          value: c.claimed,
                          secondaryText: t('winCount', { count: fmtNumber(c.wins, locale) }),
                        }))}
                      />

                      <div className="space-y-2 pt-4 border-t border-line">
                        {data.byCity.map((c) => {
                          const metaParts = t('breakdownMetrics', {
                            claimed: fmtNumber(c.claimed, locale),
                            contacted: fmtNumber(c.contacted, locale),
                            meetings: fmtNumber(c.meetings, locale),
                          }).split(' • ');

                          return (
                            <div
                              key={c.city}
                              className="flex items-center justify-between rounded-lg bg-subtle p-3 text-body-sm"
                            >
                              <div className="space-y-1">
                                <span className="font-semibold text-fg-primary block">
                                  <bdi dir="auto">{localizeCity(c.city, tGeo as any)}</bdi>
                                </span>
                                <MetaList items={metaParts} />
                              </div>
                              <div className="text-end shrink-0">
                                <span className="block font-bold text-brand">
                                  {t('winCount', { count: fmtNumber(c.wins, locale) })}
                                </span>
                                <span className="block text-caption text-fg-muted tabular-nums ltr-iso">
                                  {formatEGP(c.estimatedValueEgp || 0, locale)}
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}
