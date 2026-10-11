'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { AppShell } from '@/components/domain/AppShell';
import { PageHeader } from '@/components/domain/PageHeader';
import { StatTile } from '@/components/domain/StatTile';
import { BarList } from '@/components/ui/BarList';
import { Banner } from '@/components/ui/Banner';
import { Select } from '@/components/ui/Select';
import { Input } from '@/components/ui/Input';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/Table';
import {
  CATEGORY_LABELS_AR,
  CATEGORY_LABELS_EN,
  FEEDBACK_REASON_LABELS,
  FEEDBACK_REASON_LABELS_EN,
  PIPELINE_STATUS_LABELS,
  WEBSITE_STATUS_LABELS,
} from '@/lib/constants';
import { localizeCity } from '@/lib/taxonomy';
import { AlertTriangle, BarChart3, ShieldAlert, ThumbsDown, ThumbsUp, Wrench, ArrowRight } from 'lucide-react';

interface AdminEngagementItem {
  id: string;
  leadId: string;
  developerId: string;
  currentStatus: string;
  finalOutcome?: string | null;
  outcomeReasonCode?: string | null;
  estimatedProjectValue?: number | null;
  currency?: string;
  developer: {
    id: string;
    name: string;
    email: string;
  };
  lead: {
    id: string;
    businessName: string;
    category: string;
    city: string;
    leadType: string;
  };
  _count: {
    statusHistories: number;
    contactAttempts: number;
    feedbacks: number;
  };
}

interface ReportsPayload {
  overview: {
    totalUsers: number;
    activeSubscribers: number;
    totalLeads: number;
    hotLeads: number;
    leadsClaimed: number;
    leadsWon: number;
    revenueEgp: number;
  };
  rates: {
    leadSuccessRate: number;
    invalidRate: number;
    contactRate: number;
    replyRate: number;
    meetingRate: number;
    wonRate: number;
  };
  feedbackStats: {
    totalFeedbacks: number;
    usefulFeedbacks: number;
    notUsefulFeedbacks: number;
    reasonsBreakdown: Record<string, number>;
  };
  engagementsOverview?: {
    engagements: AdminEngagementItem[];
    conversionFunnel: Record<string, number>;
    wonSummary: {
      totalWon: number;
      totalEstimatedValue: number;
      averageEstimatedValue: number;
    };
    lostReasons: { reasonCode: string; count: number }[];
    invalidReports: { reasonCode: string; count: number }[];
    suspiciousFlags: {
      id: string;
      action: string;
      entityId?: string | null;
      details?: Record<string, unknown> | null;
      createdAt: string;
      user?: { name: string; email: string } | null;
    }[];
  };
  distributions: {
    byCity: Record<string, number>;
    byCategory: Record<string, number>;
    byWebsiteStatus: Record<string, number>;
  };
}

const ENGAGEMENT_STATES = [
  'CLAIMED',
  'CONTACTED',
  'REPLIED',
  'INTERESTED',
  'MEETING',
  'PROPOSAL_SENT',
  'NEGOTIATION',
  'WON',
  'LOST',
  'INVALID',
];

export default function AdminReportsPage() {
  const t = useTranslations('adminReports');
  const tCities = useTranslations('geo');
  const locale = useLocale();
  const [data, setData] = useState<ReportsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [correctingEngagement, setCorrectingEngagement] = useState<AdminEngagementItem | null>(null);
  const [newState, setNewState] = useState('');
  const [correctionReason, setCorrectionReason] = useState('');
  const [savingCorrection, setSavingCorrection] = useState(false);
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/reports');
      if (res.ok) {
        const json = await res.json();
        setData(json);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleAdminCorrectStatus(e: React.FormEvent) {
    e.preventDefault();
    if (!correctingEngagement || !newState || !correctionReason.trim()) return;
    setSavingCorrection(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/admin/engagements/${correctingEngagement.id}/correct-status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          newState,
          reason: correctionReason.trim(),
        }),
      });
      const result = await res.json();
      if (!res.ok) {
        setMsg({ type: 'error', text: result.error || 'تعذر تصحيح حالة التعاقد.' });
      } else {
        setMsg({
          type: 'success',
          text: `تم تصحيح حالة الفرصة من ${result.previousState} إلى ${result.newState} وتوثيقها في سجل المراجعة.`,
        });
        setCorrectingEngagement(null);
        setCorrectionReason('');
        await load();
      }
    } finally {
      setSavingCorrection(false);
    }
  }

  return (
    <AppShell isAdmin={true} density="compact" pageTitle={t('pageTitle')}>
      {loading || !data ? (
        <div className="space-y-4">
          <Skeleton className="h-16 w-full rounded-xl" />
          <Skeleton className="h-96 w-full rounded-xl" />
        </div>
      ) : (
        <div className="space-y-6">
          <PageHeader
            title={t('title')}
            description={t('desc')}
          />

          {msg && (
            <Banner
              variant={msg.type === 'success' ? 'info' : 'danger'}
              onClose={() => setMsg(null)}
            >
              {msg.text}
            </Banner>
          )}

          {/* 6 Required Rates via StatTile */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-6">
            <StatTile
              label={t('kpiSuccessRate')}
              value={`${data.rates.leadSuccessRate}%`}
            />
            <StatTile
              label={t('kpiInvalidRate')}
              value={`${data.rates.invalidRate}%`}
              isOutOfRange={data.rates.invalidRate > 15}
              statusText={data.rates.invalidRate > 15 ? t('kpiInvalidRate') : undefined}
            />
            <StatTile
              label={t('kpiContactRate')}
              value={`${data.rates.contactRate}%`}
            />
            <StatTile
              label={t('kpiReplyRate')}
              value={`${data.rates.replyRate}%`}
            />
            <StatTile
              label={t('kpiMeetingRate')}
              value={`${data.rates.meetingRate}%`}
            />
            <StatTile
              label={t('kpiWonRate')}
              value={`${data.rates.wonRate}%`}
            />
          </div>

          {/* Phase 6 Engagement Conversion Funnel & Won Projects Summary */}
          {data.engagementsOverview && (
            <div className="grid gap-6 lg:grid-cols-12">
              <Card className="lg:col-span-8 rounded-xl border border-line bg-surface p-6 shadow-xs space-y-4">
                <h2 className="text-base font-extrabold text-fg-primary">
                  {t('funnelTitle')}
                </h2>
                <BarList
                  items={ENGAGEMENT_STATES.map((st) => {
                    const count = data.engagementsOverview?.conversionFunnel[st] ?? 0;
                    const label =
                      locale === 'en'
                        ? PIPELINE_STATUS_LABELS[st]?.labelEn || st
                        : PIPELINE_STATUS_LABELS[st]?.labelAr || st;
                    return {
                      label,
                      value: count,
                    };
                  })}
                />
              </Card>

              <Card className="lg:col-span-4 rounded-xl border border-line-brand bg-brand-soft p-6 shadow-xs space-y-3">
                <h2 className="text-base font-extrabold text-brand">
                  {t('wonSummaryTitle')}
                </h2>
                <div className="rounded-xl bg-surface p-3.5 border border-line text-xs flex justify-between items-center">
                  <span className="font-bold text-fg-secondary">{t('wonClosedLabel')}</span>
                  <strong className="text-brand text-base tabular-nums">
                    {data.engagementsOverview.wonSummary.totalWon}
                  </strong>
                </div>
                <div className="rounded-xl bg-surface p-3.5 border border-line text-xs flex justify-between items-center">
                  <span className="font-bold text-fg-secondary">{t('wonEstimatedValueLabel')}</span>
                  <strong className="text-brand text-base tabular-nums ltr-iso">
                    {data.engagementsOverview.wonSummary.totalEstimatedValue.toLocaleString('en-US')} EGP
                  </strong>
                </div>
                <div className="rounded-xl bg-surface p-3.5 border border-line text-xs flex justify-between items-center">
                  <span className="font-bold text-fg-secondary">{t('wonAverageValueLabel')}</span>
                  <strong className="text-fg-primary tabular-nums ltr-iso">
                    {data.engagementsOverview.wonSummary.averageEstimatedValue.toLocaleString('en-US')} EGP
                  </strong>
                </div>
              </Card>
            </div>
          )}

          {/* Feedback Breakdown & Distributions */}
          <div className="grid gap-6 lg:grid-cols-12">
            <Card className="lg:col-span-5 rounded-xl border border-line bg-surface p-6 shadow-xs space-y-4">
              <h2 className="text-base font-extrabold text-fg-primary">
                {t('feedbackTitle')}
              </h2>
              <div className="grid grid-cols-2 gap-3 text-xs font-bold">
                <div className="flex items-center justify-between rounded-xl bg-brand-soft p-3 text-brand">
                  <span className="flex items-center gap-1.5">
                    <ThumbsUp className="h-4 w-4" />
                    {t('feedbackUseful')}
                  </span>
                  <strong className="text-lg tabular-nums">{data.feedbackStats.usefulFeedbacks}</strong>
                </div>
                <div className="flex items-center justify-between rounded-xl bg-danger-bg p-3 text-danger-text">
                  <span className="flex items-center gap-1.5">
                    <ThumbsDown className="h-4 w-4" />
                    {t('feedbackNotUseful')}
                  </span>
                  <strong className="text-lg tabular-nums">{data.feedbackStats.notUsefulFeedbacks}</strong>
                </div>
              </div>

              <h3 className="text-xs font-extrabold text-fg-secondary pt-2 border-t border-line">
                {t('feedbackNegativeReasons')}
              </h3>
              <div className="space-y-2 text-xs">
                {Object.entries(FEEDBACK_REASON_LABELS).map(([code, labelAr]) => {
                  const count = data.feedbackStats.reasonsBreakdown[code] || 0;
                  const label = locale === 'en' ? (FEEDBACK_REASON_LABELS_EN[code] || code) : labelAr;
                  return (
                    <div
                      key={code}
                      className="flex items-center justify-between rounded-lg bg-subtle px-3 py-2 font-semibold"
                    >
                      <span>{label}</span>
                      <span className="font-extrabold text-fg-primary tabular-nums">{count}</span>
                    </div>
                  );
                })}
              </div>
            </Card>

            <div className="lg:col-span-7 grid gap-6 sm:grid-cols-2">
              <Card className="rounded-xl border border-line bg-surface p-6 shadow-xs space-y-4">
                <h2 className="text-base font-extrabold text-fg-primary">
                  {t('categoryDistTitle')}
                </h2>
                <BarList
                  items={Object.entries(data.distributions.byCategory).map(([cat, count]) => ({
                    label: locale === 'en' ? (CATEGORY_LABELS_EN[cat] || cat) : (CATEGORY_LABELS_AR[cat] || cat),
                    value: count,
                  }))}
                />
              </Card>

              <Card className="rounded-xl border border-line bg-surface p-6 shadow-xs space-y-4">
                <h2 className="text-base font-extrabold text-fg-primary">
                  {t('websiteDistTitle')}
                </h2>
                <BarList
                  items={Object.entries(data.distributions.byWebsiteStatus).map(([st, count]) => ({
                    label: locale === 'en' ? (WEBSITE_STATUS_LABELS[st]?.labelEn || st) : (WEBSITE_STATUS_LABELS[st]?.labelAr || st),
                    value: count,
                  }))}
                />

                <h3 className="pt-2 border-t border-line text-xs font-extrabold text-fg-secondary">
                  {t('topCitiesTitle')}
                </h3>
                <BarList
                  items={Object.entries(data.distributions.byCity).map(([city, count]) => ({
                    label: localizeCity(city, tCities),
                    value: count,
                  }))}
                />
              </Card>
            </div>
          </div>

          {/* Phase 6 Operational Visibility: Engagements List, Admin Status Correction & Abuse Flags */}
          {data.engagementsOverview && (
            <div className="grid gap-6 lg:grid-cols-12">
              <Card className="lg:col-span-8 rounded-xl border border-line bg-surface p-6 shadow-xs">
                <h2 className="flex items-center gap-2 text-base font-extrabold text-fg-primary">
                  <Wrench className="h-5 w-5 text-fg-secondary" />
                  {t('engagementsTitle')}
                </h2>
                <div className="mt-4">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t('colLead')}</TableHead>
                        <TableHead>{t('colDev')}</TableHead>
                        <TableHead>{t('colType')}</TableHead>
                        <TableHead>{t('colStatus')}</TableHead>
                        <TableHead>{t('colOutcome')}</TableHead>
                        <TableHead>{t('colAction')}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.engagementsOverview.engagements.map((eng) => (
                        <TableRow key={eng.id}>
                          <TableCell className="font-bold text-fg-primary">
                            <bdi dir="auto">{eng.lead.businessName}</bdi>
                          </TableCell>
                          <TableCell className="text-fg-secondary">
                            <bdi dir="auto">{eng.developer.name}</bdi>
                          </TableCell>
                          <TableCell className="text-xs">
                            {eng.lead.leadType}
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant="neutral"
                              className={`text-xs ${
                                PIPELINE_STATUS_LABELS[eng.currentStatus]?.badgeClass || ''
                              }`}
                            >
                              {locale === 'en'
                                ? PIPELINE_STATUS_LABELS[eng.currentStatus]?.labelEn || eng.currentStatus
                                : PIPELINE_STATUS_LABELS[eng.currentStatus]?.labelAr || eng.currentStatus}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-xs text-fg-secondary tabular-nums ltr-iso">
                            {eng.estimatedProjectValue
                              ? `${eng.estimatedProjectValue.toLocaleString('en-US')} ${eng.currency || 'EGP'}`
                              : eng.outcomeReasonCode || '-'}
                          </TableCell>
                          <TableCell>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setCorrectingEngagement(eng);
                                setNewState(eng.currentStatus);
                              }}
                              className="text-xs"
                            >
                              {t('btnCorrectStatus')}
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                {correctingEngagement && (
                  <form
                    onSubmit={handleAdminCorrectStatus}
                    className="mt-5 rounded-xl border border-warning-border bg-warning-bg p-4 space-y-4 text-xs"
                  >
                    <div className="flex items-center justify-between font-extrabold text-warning-text">
                      <span>
                        {t('correctionTitle', {
                          lead: correctingEngagement.lead.businessName,
                          dev: correctingEngagement.developer.name,
                        })}
                      </span>
                      <button
                        type="button"
                        onClick={() => setCorrectingEngagement(null)}
                        className="text-fg-muted hover:text-fg-primary"
                      >
                        ✕
                      </button>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Select
                        label={t('labelNewState')}
                        value={newState}
                        onChange={(e) => setNewState(e.target.value)}
                        options={ENGAGEMENT_STATES.map((st) => ({
                          value: st,
                          label:
                            locale === 'en'
                              ? PIPELINE_STATUS_LABELS[st]?.labelEn || st
                              : PIPELINE_STATUS_LABELS[st]?.labelAr || st,
                        }))}
                      />
                      <Input
                        label={t('labelCorrectionReason')}
                        required
                        value={correctionReason}
                        onChange={(e) => setCorrectionReason(e.target.value)}
                        placeholder={t('labelCorrectionReason')}
                      />
                    </div>
                    <Button
                      variant="primary"
                      type="submit"
                      disabled={savingCorrection}
                      className="gap-1.5"
                    >
                      <ArrowRight className="h-3.5 w-3.5 rtl:-scale-x-100" />
                      <span>{savingCorrection ? t('applyingCorrection') : t('btnApplyCorrection')}</span>
                    </Button>
                  </form>
                )}
              </Card>

              <Card className="lg:col-span-4 rounded-xl border border-line bg-surface p-6 shadow-xs space-y-4">
                <h2 className="flex items-center gap-2 text-base font-extrabold text-fg-primary">
                  <ShieldAlert className="h-5 w-5 text-warning-icon" />
                  {t('abuseTitle')}
                </h2>
                {data.engagementsOverview.suspiciousFlags.length === 0 ? (
                  <p className="text-xs text-fg-muted">
                    {t('noAbuse')}
                  </p>
                ) : (
                  <div className="space-y-2 max-h-72 overflow-y-auto text-xs">
                    {data.engagementsOverview.suspiciousFlags.map((flag) => (
                      <div
                        key={flag.id}
                        className="rounded-xl border border-warning-border bg-warning-bg p-3 space-y-1"
                      >
                        <div className="flex items-center gap-1.5 font-extrabold text-warning-text">
                          <AlertTriangle className="h-3.5 w-3.5" />
                          <span>{flag.action}</span>
                        </div>
                        <div className="text-xs text-fg-secondary">
                          <bdi dir="auto">{flag.user?.name || flag.user?.email || '-'}</bdi>
                        </div>
                        <div className="text-xs text-warning-text ltr-iso" dir="ltr">
                          {JSON.stringify(flag.details)}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            </div>
          )}
        </div>
      )}
    </AppShell>
  );
}
