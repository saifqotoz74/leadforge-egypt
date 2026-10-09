'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { AppShell } from '@/components/domain/AppShell';
import { PageHeader } from '@/components/domain/PageHeader';
import { StatTile } from '@/components/domain/StatTile';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { Skeleton } from '@/components/ui/Skeleton';
import { fmtNumber, formatEGP } from '@/lib/format';
import { RefreshCw } from 'lucide-react';

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
    <AppShell density="compact" pageTitle="تحليلات الأداء">
      <div className="flex flex-col gap-6">
        <PageHeader
          title="تحليلات الأداء ومعدلات التحويل"
          description="مؤشرات دقيقة ومحمية لحسابك مع توضيح البسط والمقام لكل مرحلة مبيعات"
          actions={
            <div className="flex items-center gap-3">
              <div className="w-48">
                <Select
                  value={preset}
                  onChange={(e) => setPreset(e.target.value)}
                  options={[
                    { value: 'all_time', label: 'كل الفترات' },
                    { value: 'last_7_days', label: 'آخر 7 أيام' },
                    { value: 'last_30_days', label: 'آخر 30 يوماً' },
                    { value: 'last_90_days', label: 'آخر 90 يوماً' },
                    { value: 'month_to_date', label: 'الشهر الحالي' },
                  ]}
                />
              </div>

              <Button
                variant="secondary"
                size="md"
                onClick={loadDeveloperAnalytics}
                disabled={loading}
                className="gap-1.5"
              >
                <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                <span>تحديث</span>
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
                label="إجمالي الفرص المشتراة"
                value={fmtNumber(perf.leadsClaimed)}
                statusText={`متوسط المطابقة: ${perf.averageMatchStrength != null ? fmtNumber(perf.averageMatchStrength) + '%' : '—'}`}
              />

              <StatTile
                label="الصفقات الناجحة"
                value={fmtNumber(perf.totalWins)}
                statusText={`معدل الفوز: ${perf.winRate?.displayValue || '—'} (${perf.winRate?.numerator ?? 0}/${perf.winRate?.denominator ?? 0})`}
              />

              <StatTile
                label="قيمة المشاريع المكتسبة"
                value={formatEGP(perf.estimatedProjectValueEgp || 0)}
                statusText="إجمالي قيمة العقود التقديرية"
              />

              <StatTile
                label="النقاط المستهلكة الصافية"
                value={fmtNumber(perf.creditsConsumed)}
                statusText={`الرصيد الحالي: ${fmtNumber(perf.creditsBalance)} نقطة`}
              />
            </div>

            {/* Funnel Stage Conversion Rates */}
            <Card>
              <CardHeader>
                <CardTitle>قمع المبيعات ومعدلات التحويل بين المراحل</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                  {[
                    { label: 'معدل التواصل (Contact / Claimed)', metric: perf.contactRate },
                    { label: 'معدل الرد (Replied / Contacted)', metric: perf.replyRate },
                    { label: 'معدل الاهتمام (Interested / Replied)', metric: perf.interestRate },
                    { label: 'معدل الاجتماعات (Meetings / Interested)', metric: perf.meetingRate },
                    {
                      label: 'إغلاق الاجتماعات (Won / Meetings)',
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
                        {item.metric?.displayValue || 'INSUFFICIENT_DATA'}
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
                  <CardTitle>الأداء بحسب القطاع التجاري</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-col gap-2">
                    {!data.byNiche || data.byNiche.length === 0 ? (
                      <p className="text-body-sm text-fg-muted">لا توجد بيانات كافية بعد.</p>
                    ) : (
                      data.byNiche.map((n) => (
                        <div
                          key={n.niche}
                          className="flex items-center justify-between rounded-xl bg-subtle p-3 text-body-sm"
                        >
                          <div>
                            <span className="font-semibold text-fg-primary">{n.labelAr}</span>
                            <span className="block text-caption text-fg-muted">
                              مشتراة: {fmtNumber(n.claimed)} • تواصل: {fmtNumber(n.contacted)} • اجتماعات: {fmtNumber(n.meetings)}
                            </span>
                          </div>
                          <div className="text-end">
                            <span className="block font-bold text-brand">
                              فوز: {fmtNumber(n.wins)}
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
                  <CardTitle>الأداء بحسب المدينة</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-col gap-2">
                    {!data.byCity || data.byCity.length === 0 ? (
                      <p className="text-body-sm text-fg-muted">لا توجد بيانات كافية بعد.</p>
                    ) : (
                      data.byCity.map((c) => (
                        <div
                          key={c.city}
                          className="flex items-center justify-between rounded-xl bg-subtle p-3 text-body-sm"
                        >
                          <div>
                            <span className="font-semibold text-fg-primary">{c.city}</span>
                            <span className="block text-caption text-fg-muted">
                              مشتراة: {fmtNumber(c.claimed)} • تواصل: {fmtNumber(c.contacted)} • اجتماعات: {fmtNumber(c.meetings)}
                            </span>
                          </div>
                          <div className="text-end">
                            <span className="block font-bold text-brand">
                              فوز: {fmtNumber(c.wins)}
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
