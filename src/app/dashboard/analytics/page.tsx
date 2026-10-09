'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { AppShell } from '@/components/domain/AppShell';
import { PageHeader } from '@/components/domain/PageHeader';
import { StatTile } from '@/components/domain/StatTile';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import Link from 'next/link';
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
                  {t('bcDashboard')}
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
                value={fmtNumber(perf.leadsClaimed)}
                statusText={t('avgMatch', { val: perf.averageMatchStrength != null ? fmtNumber(perf.averageMatchStrength) + '%' : '—' })}
              />

              <StatTile
                label={t('totalWins')}
                value={fmtNumber(perf.totalWins)}
                statusText={t('winRate', { val: perf.winRate?.displayValue || '—', num: perf.winRate?.numerator ?? 0, den: perf.winRate?.denominator ?? 0 })}
              />

              <StatTile
                label={t('projectValue')}
                value={formatEGP(perf.estimatedProjectValueEgp || 0)}
                statusText={t('projectValueDesc')}
              />

              <StatTile
                label={t('netCredits')}
                value={fmtNumber(perf.creditsConsumed)}
                statusText={t('currentBalance', { val: fmtNumber(perf.creditsBalance) })}
              />
            </div>

            {/* Funnel Stage Conversion Rates */}
            <Card>
              <CardHeader>
                <CardTitle>{t('funnelTitle')}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
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
                      className="rounded-xl border border-line bg-subtle p-4 flex flex-col justify-between"
                    >
                      <div className="flex items-center justify-between text-caption text-fg-secondary">
                        <span className="font-medium line-clamp-1">{item.label}</span>
                        <span className="font-mono font-medium ltr-iso text-fg-muted">
                          {item.metric?.numerator ?? 0}/{item.metric?.denominator ?? 0}
                        </span>
                      </div>
                      <p className="mt-2 text-h3 font-bold font-mono tabular-nums text-brand">
                        {item.metric?.displayValue || t('insufficientData')}
                      </p>
                    </div>
                  ))}
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
                  <div className="flex flex-col gap-2">
                    {!data.byNiche || data.byNiche.length === 0 ? (
                      <EmptyState title={t('noData')} description={t('desc')} />
                    ) : (
                      data.byNiche.map((n) => (
                        <div
                          key={n.niche}
                          className="flex items-center justify-between rounded-xl bg-subtle p-3 text-body-sm"
                        >
                          <div>
                            <span className="font-semibold text-fg-primary">{n.labelAr}</span>
                            <span className="block text-caption text-fg-muted">
                              {t('breakdownMetrics', { claimed: fmtNumber(n.claimed), contacted: fmtNumber(n.contacted), meetings: fmtNumber(n.meetings) })}
                            </span>
                          </div>
                          <div className="text-end">
                            <span className="block font-bold text-brand">
                              {t('winCount', { count: fmtNumber(n.wins) })}
                            </span>
                            <span className="block text-caption text-fg-muted font-mono ltr-iso">
                              {formatEGP(n.estimatedValueEgp || 0)}
                            </span>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>{t('byCityTitle')}</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-col gap-2">
                    {!data.byCity || data.byCity.length === 0 ? (
                      <p className="text-body-sm text-fg-muted">{t('noData')}</p>
                    ) : (
                      data.byCity.map((c) => (
                        <div
                          key={c.city}
                          className="flex items-center justify-between rounded-xl bg-subtle p-3 text-body-sm"
                        >
                          <div>
                            <span className="font-semibold text-fg-primary">{c.city}</span>
                            <span className="block text-caption text-fg-muted">
                              {t('breakdownMetrics', { claimed: fmtNumber(c.claimed), contacted: fmtNumber(c.contacted), meetings: fmtNumber(c.meetings) })}
                            </span>
                          </div>
                          <div className="text-end">
                            <span className="block font-bold text-brand">
                              {t('winCount', { count: fmtNumber(c.wins) })}
                            </span>
                            <span className="block text-caption text-fg-muted font-mono ltr-iso">
                              {formatEGP(c.estimatedValueEgp || 0)}
                            </span>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}
