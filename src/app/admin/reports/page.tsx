'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { AppShell } from '@/components/domain/AppShell';
import {
  CATEGORY_LABELS_AR,
  FEEDBACK_REASON_LABELS,
  PIPELINE_STATUS_LABELS,
  WEBSITE_STATUS_LABELS,
} from '@/lib/constants';
import { AlertTriangle, BarChart3, ShieldAlert, ThumbsDown, ThumbsUp, Wrench } from 'lucide-react';

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
  'NOT_INTERESTED',
  'INVALID',
];

export default function AdminReportsPage() {
  const [data, setData] = useState<ReportsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [correctingEngagement, setCorrectingEngagement] = useState<AdminEngagementItem | null>(
    null
  );
  const [newState, setNewState] = useState('CONTACTED');
  const [correctionReason, setCorrectionReason] = useState('');
  const [savingCorrection, setSavingCorrection] = useState(false);
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/reports');
      if (res.ok) {
        setData(await res.json());
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
    if (!correctingEngagement || !correctionReason.trim()) return;
    setSavingCorrection(true);
    setMsg(null);
    try {
      const res = await fetch(
        `/api/admin/engagements/${correctingEngagement.id}/correct-status`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            previousState: correctingEngagement.currentStatus,
            newState,
            reason: correctionReason,
          }),
        }
      );
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
    <AppShell isAdmin={true} density="compact" pageTitle="تقارير الأداء والمراجعة">
      {loading || !data ? (
        <div className="h-96 animate-pulse rounded-2xl border border-line bg-surface p-6" />
      ) : (
        <div className="space-y-6">
          <div className="rounded-2xl border border-line bg-surface p-6 shadow-sm">
            <h1 className="flex items-center gap-2 text-xl font-extrabold text-fg-primary">
              <BarChart3 className="h-6 w-6 text-brand" />
              تقارير الأداء وجودة الفرص ومحرك النتائج (Phase 6 Operational & Outcome Reports)
            </h1>
            <p className="mt-1 text-xs text-fg-muted">
              تحليل شامل لمعدلات التحويل، الصفقات الناجحة والخاسرة، بلاغات عدم الصلاحية، وإشارات إساءة الاستخدام.
            </p>
          </div>

          {msg && (
            <div
              className={`rounded-xl border p-4 text-xs font-bold ${
                msg.type === 'success'
                  ? 'border-line-brand bg-brand-soft text-brand'
                  : 'border-danger-border bg-danger-bg text-danger-text'
              }`}
            >
              {msg.text}
            </div>
          )}

          {/* 6 Required Rates (Section 14) */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-6">
            <div className="rounded-2xl border border-line-brand bg-brand-soft/50 p-4 text-center">
              <span className="text-xs font-bold text-brand">Lead Success Rate</span>
              <p className="mt-2 text-2xl font-extrabold text-brand tabular-nums ltr-iso">
                {data.rates.leadSuccessRate}%
              </p>
              <span className="text-[11px] text-brand">نسبة الفرص المفيدة</span>
            </div>

            <div className="rounded-2xl border border-danger-border bg-danger-bg p-4 text-center">
              <span className="text-xs font-bold text-danger-text">Invalid Rate</span>
              <p className="mt-2 text-2xl font-extrabold text-danger tabular-nums ltr-iso">
                {data.rates.invalidRate}%
              </p>
              <span className="text-[11px] text-danger">نسبة غير الصالح</span>
            </div>

            <div className="rounded-2xl border border-line bg-surface p-4 text-center">
              <span className="text-xs font-bold text-fg-secondary">Contact Rate</span>
              <p className="mt-2 text-2xl font-extrabold text-fg-primary tabular-nums ltr-iso">
                {data.rates.contactRate}%
              </p>
              <span className="text-[11px] text-fg-muted">معدل التواصل</span>
            </div>

            <div className="rounded-2xl border border-line bg-surface p-4 text-center">
              <span className="text-xs font-bold text-fg-secondary">Reply Rate</span>
              <p className="mt-2 text-2xl font-extrabold text-fg-secondary tabular-nums ltr-iso">
                {data.rates.replyRate}%
              </p>
              <span className="text-[11px] text-fg-muted">معدل الرد</span>
            </div>

            <div className="rounded-2xl border border-line bg-surface p-4 text-center">
              <span className="text-xs font-bold text-fg-secondary">Meeting Rate</span>
              <p className="mt-2 text-2xl font-extrabold text-fg-secondary tabular-nums ltr-iso">
                {data.rates.meetingRate}%
              </p>
              <span className="text-[11px] text-fg-muted">معدل الاجتماعات</span>
            </div>

            <div className="rounded-2xl border border-line-brand bg-brand-soft/50 p-4 text-center">
              <span className="text-xs font-bold text-brand">Won Rate</span>
              <p className="mt-2 text-2xl font-extrabold text-brand tabular-nums ltr-iso">
                {data.rates.wonRate}%
              </p>
              <span className="text-[11px] text-brand">نسبة إغلاق الصفقات</span>
            </div>
          </div>

          {/* Phase 6 Engagement Conversion Funnel & Won Projects Summary */}
          {data.engagementsOverview && (
            <div className="grid gap-6 lg:grid-cols-12">
              <div className="lg:col-span-8 rounded-2xl border border-line bg-surface p-6 shadow-sm">
                <h2 className="text-base font-extrabold text-fg-primary">
                  قمع تحويل مراحل التعاقد (Phase 6 Engagement Conversion Funnel)
                </h2>
                <div className="mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-4 lg:grid-cols-6 text-xs">
                  {ENGAGEMENT_STATES.map((st) => {
                    const count = data.engagementsOverview?.conversionFunnel[st] ?? 0;
                    const badge =
                      PIPELINE_STATUS_LABELS[st]?.badgeClass ||
                      'bg-canvas text-fg-secondary border-line';
                    return (
                      <div
                        key={st}
                        className={`rounded-xl border p-3 text-center ${badge}`}
                      >
                        <div className="font-mono text-[10px] font-bold">{st}</div>
                        <div className="mt-1 text-lg font-extrabold">{count}</div>
                        <div className="text-[10px]">
                          {PIPELINE_STATUS_LABELS[st]?.labelAr || st}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="lg:col-span-4 rounded-2xl border border-line-brand bg-brand-soft/40 p-6 shadow-sm space-y-3">
                <h2 className="text-base font-extrabold text-brand">
                  ملخص المشاريع الناجحة (Won Projects Summary)
                </h2>
                <div className="rounded-xl bg-surface p-3.5 border border-line text-xs flex justify-between">
                  <span className="font-bold text-fg-secondary">إجمالي الصفقات المغلقة (WON):</span>
                  <strong className="text-brand text-base">
                    {data.engagementsOverview.wonSummary.totalWon}
                  </strong>
                </div>
                <div className="rounded-xl bg-surface p-3.5 border border-line text-xs flex justify-between">
                  <span className="font-bold text-fg-secondary">القيمة التقديرية للمشاريع:</span>
                  <strong className="text-brand text-base">
                    {data.engagementsOverview.wonSummary.totalEstimatedValue.toLocaleString()} EGP
                  </strong>
                </div>
                <div className="rounded-xl bg-surface p-3.5 border border-line text-xs flex justify-between">
                  <span className="font-bold text-fg-secondary">متوسط قيمة الصفقة:</span>
                  <strong className="text-fg-primary">
                    {data.engagementsOverview.wonSummary.averageEstimatedValue.toLocaleString()} EGP
                  </strong>
                </div>
              </div>
            </div>
          )}

          {/* Feedback Breakdown & Distributions */}
          <div className="grid gap-6 lg:grid-cols-12">
            <div className="lg:col-span-5 rounded-2xl border border-line bg-surface p-6 shadow-sm">
              <h2 className="text-base font-extrabold text-fg-primary">
                تقييمات المطورين لجودة الـ Leads
              </h2>
              <div className="mt-4 grid grid-cols-2 gap-3 text-xs font-bold">
                <div className="flex items-center justify-between rounded-xl bg-brand-soft p-3 text-brand">
                  <span className="flex items-center gap-1.5">
                    <ThumbsUp className="h-4 w-4" />
                    مفيدة (Yes)
                  </span>
                  <strong className="text-lg">{data.feedbackStats.usefulFeedbacks}</strong>
                </div>
                <div className="flex items-center justify-between rounded-xl bg-danger-bg p-3 text-danger-text">
                  <span className="flex items-center gap-1.5">
                    <ThumbsDown className="h-4 w-4" />
                    غير مفيدة (No)
                  </span>
                  <strong className="text-lg">{data.feedbackStats.notUsefulFeedbacks}</strong>
                </div>
              </div>

              <h3 className="mt-5 text-xs font-extrabold text-fg-secondary">
                تفصيل أسباب عدم الفائدة (Negative Feedback Reasons):
              </h3>
              <div className="mt-2 space-y-2 text-xs">
                {Object.entries(FEEDBACK_REASON_LABELS).map(([code, label]) => {
                  const count = data.feedbackStats.reasonsBreakdown[code] || 0;
                  return (
                    <div
                      key={code}
                      className="flex items-center justify-between rounded-lg bg-canvas px-3 py-2 font-semibold"
                    >
                      <span>{label}</span>
                      <span className="font-extrabold text-fg-primary">{count}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="lg:col-span-7 grid gap-6 sm:grid-cols-2">
              <div className="rounded-2xl border border-line bg-surface p-6 shadow-sm">
                <h2 className="text-base font-extrabold text-fg-primary">
                  توزيع الفرص حسب التصنيف (By Category)
                </h2>
                <div className="mt-4 space-y-2 text-xs">
                  {Object.entries(data.distributions.byCategory).map(([cat, count]) => (
                    <div
                      key={cat}
                      className="flex items-center justify-between rounded-lg bg-canvas px-3 py-2 font-semibold"
                    >
                      <span>
                        {CATEGORY_LABELS_AR[cat] || cat} ({cat})
                      </span>
                      <strong className="text-brand">{count} نشاط</strong>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-2xl border border-line bg-surface p-6 shadow-sm">
                <h2 className="text-base font-extrabold text-fg-primary">
                  توزيع الفرص حسب المدينة وحالة الموقع
                </h2>
                <div className="mt-4 space-y-2 text-xs">
                  {Object.entries(data.distributions.byWebsiteStatus).map(([st, count]) => (
                    <div
                      key={st}
                      className="flex items-center justify-between rounded-lg bg-brand-soft/60 px-3 py-2 font-bold text-brand"
                    >
                      <span>{WEBSITE_STATUS_LABELS[st]?.labelAr || st}</span>
                      <strong>{count}</strong>
                    </div>
                  ))}
                </div>

                <h3 className="mt-5 text-xs font-extrabold text-fg-secondary">أبرز المدن:</h3>
                <div className="mt-2 space-y-1.5 text-xs">
                  {Object.entries(data.distributions.byCity).map(([city, count]) => (
                    <div
                      key={city}
                      className="flex items-center justify-between border-b border-line py-1.5 font-semibold"
                    >
                      <span>{city}</span>
                      <strong>{count}</strong>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Phase 6 Operational Visibility: Engagements List, Admin Status Correction & Abuse Flags */}
          {data.engagementsOverview && (
            <div className="grid gap-6 lg:grid-cols-12">
              <div className="lg:col-span-8 rounded-2xl border border-line bg-surface p-6 shadow-sm">
                <h2 className="flex items-center gap-2 text-base font-extrabold text-fg-primary">
                  <Wrench className="h-5 w-5 text-fg-secondary" />
                  إدارة تعاملات المطورين وتصحيح الحالات النهائية (Developer Engagements & Admin Correction)
                </h2>
                <div className="mt-4 overflow-x-auto">
                  <table className="w-full text-start text-xs">
                    <thead>
                      <tr className="border-b border-line text-fg-muted">
                        <th className="py-2 px-2">العميل</th>
                        <th className="py-2 px-2">المطور</th>
                        <th className="py-2 px-2">النوع</th>
                        <th className="py-2 px-2">الحالة</th>
                        <th className="py-2 px-2">النتيجة / القيمة</th>
                        <th className="py-2 px-2">إجراء</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line">
                      {data.engagementsOverview.engagements.map((eng) => (
                        <tr key={eng.id} className="hover:bg-canvas">
                          <td className="py-2.5 px-2 font-bold text-fg-primary">
                            {eng.lead.businessName}
                          </td>
                          <td className="py-2.5 px-2 text-fg-secondary">
                            {eng.developer.name}
                          </td>
                          <td className="py-2.5 px-2 font-mono text-[11px]">
                            {eng.lead.leadType}
                          </td>
                          <td className="py-2.5 px-2">
                            <span
                              className={`rounded-full border px-2 py-0.5 text-[11px] font-bold ${
                                PIPELINE_STATUS_LABELS[eng.currentStatus]?.badgeClass ||
                                'bg-subtle text-fg-secondary'
                              }`}
                            >
                              {eng.currentStatus}
                            </span>
                          </td>
                          <td className="py-2.5 px-2 text-[11px] text-fg-secondary">
                            {eng.estimatedProjectValue
                              ? `${eng.estimatedProjectValue.toLocaleString()} ${eng.currency || 'EGP'}`
                              : eng.outcomeReasonCode || '—'}
                          </td>
                          <td className="py-2.5 px-2">
                            <button
                              type="button"
                              onClick={() => {
                                setCorrectingEngagement(eng);
                                setNewState(eng.currentStatus);
                              }}
                              className="rounded-lg border border-line bg-surface px-2.5 py-1 text-[11px] font-bold text-fg-secondary hover:bg-subtle"
                            >
                              تصحيح الحالة
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {correctingEngagement && (
                  <form
                    onSubmit={handleAdminCorrectStatus}
                    className="mt-4 rounded-xl border border-warning-border bg-warning-bg p-4 space-y-3 text-xs"
                  >
                    <div className="flex items-center justify-between font-extrabold text-warning-text">
                      <span>
                        تصحيح إداري لحالة الفرصة: {correctingEngagement.lead.businessName} (المطور:{' '}
                        {correctingEngagement.developer.name})
                      </span>
                      <button
                        type="button"
                        onClick={() => setCorrectingEngagement(null)}
                        className="text-fg-muted hover:text-fg-primary"
                      >
                        ✕ إغلاق
                      </button>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div>
                        <label className="block font-bold text-fg-secondary">
                          الحالة الجديدة (New State)
                        </label>
                        <select
                          value={newState}
                          onChange={(e) => setNewState(e.target.value)}
                          className="mt-1 w-full rounded-lg border border-line bg-surface px-3 py-2 font-bold"
                        >
                          {ENGAGEMENT_STATES.map((st) => (
                            <option key={st} value={st}>
                              {st} — {PIPELINE_STATUS_LABELS[st]?.labelAr || st}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block font-bold text-fg-secondary">
                          سبب التصحيح الإداري (إلزامي لسجل التدقيق)
                        </label>
                        <input
                          type="text"
                          required
                          value={correctionReason}
                          onChange={(e) => setCorrectionReason(e.target.value)}
                          placeholder="مثال: تصحيح إغلاق خاطئ بناءً على طلب المطور..."
                          className="mt-1 w-full rounded-lg border border-line bg-surface px-3 py-2 font-semibold"
                        />
                      </div>
                    </div>
                    <button
                      type="submit"
                      disabled={savingCorrection}
                      className="rounded-lg bg-brand px-4 py-2 font-extrabold text-white hover:bg-brand-hover disabled:opacity-50"
                    >
                      {savingCorrection ? 'جاري تطبيق التصحيح...' : 'تطبيق التصحيح وتوثيقه'}
                    </button>
                  </form>
                )}
              </div>

              <div className="lg:col-span-4 rounded-2xl border border-line bg-surface p-6 shadow-sm space-y-4">
                <h2 className="flex items-center gap-2 text-base font-extrabold text-fg-primary">
                  <ShieldAlert className="h-5 w-5 text-warning-icon" />
                  تنبيهات الحماية وجودة البلاغات (Abuse & Quality Signals)
                </h2>
                {data.engagementsOverview.suspiciousFlags.length === 0 ? (
                  <p className="text-xs text-fg-muted">
                    لا توجد تنبيهات إساءة استخدام مسجلة حاليًا.
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
                        <div className="text-[11px] text-fg-secondary">
                          المطور: {flag.user?.name || flag.user?.email || '—'}
                        </div>
                        <div className="font-mono text-[10px] text-warning-text" dir="ltr">
                          {JSON.stringify(flag.details)}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </AppShell>
  );
}

