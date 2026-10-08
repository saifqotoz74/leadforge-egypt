'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { AppShell } from '@/components/AppShell';
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
    <AppShell isAdminView>
      {loading || !data ? (
        <div className="h-96 animate-pulse rounded-2xl border border-slate-200 bg-white p-6" />
      ) : (
        <div className="space-y-6">
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h1 className="flex items-center gap-2 text-xl font-extrabold text-slate-900">
              <BarChart3 className="h-6 w-6 text-emerald-600" />
              تقارير الأداء وجودة الفرص ومحرك النتائج (Phase 6 Operational & Outcome Reports)
            </h1>
            <p className="mt-1 text-xs text-slate-500">
              تحليل شامل لمعدلات التحويل، الصفقات الناجحة والخاسرة، بلاغات عدم الصلاحية، وإشارات إساءة الاستخدام.
            </p>
          </div>

          {msg && (
            <div
              className={`rounded-xl border p-4 text-xs font-bold ${
                msg.type === 'success'
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                  : 'border-rose-200 bg-rose-50 text-rose-800'
              }`}
            >
              {msg.text}
            </div>
          )}

          {/* 6 Required Rates (Section 14) */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-6">
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-center">
              <span className="text-xs font-bold text-emerald-800">Lead Success Rate</span>
              <p className="mt-2 text-2xl font-extrabold text-emerald-700">
                {data.rates.leadSuccessRate}%
              </p>
              <span className="text-[11px] text-emerald-600">نسبة الفرص المفيدة</span>
            </div>

            <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-center">
              <span className="text-xs font-bold text-rose-800">Invalid Rate</span>
              <p className="mt-2 text-2xl font-extrabold text-rose-700">
                {data.rates.invalidRate}%
              </p>
              <span className="text-[11px] text-rose-600">نسبة غير الصالح</span>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-4 text-center">
              <span className="text-xs font-bold text-slate-600">Contact Rate</span>
              <p className="mt-2 text-2xl font-extrabold text-slate-900">
                {data.rates.contactRate}%
              </p>
              <span className="text-[11px] text-slate-400">معدل التواصل</span>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-4 text-center">
              <span className="text-xs font-bold text-slate-600">Reply Rate</span>
              <p className="mt-2 text-2xl font-extrabold text-blue-700">
                {data.rates.replyRate}%
              </p>
              <span className="text-[11px] text-slate-400">معدل الرد</span>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-4 text-center">
              <span className="text-xs font-bold text-slate-600">Meeting Rate</span>
              <p className="mt-2 text-2xl font-extrabold text-purple-700">
                {data.rates.meetingRate}%
              </p>
              <span className="text-[11px] text-slate-400">معدل الاجتماعات</span>
            </div>

            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-center">
              <span className="text-xs font-bold text-emerald-800">Won Rate</span>
              <p className="mt-2 text-2xl font-extrabold text-emerald-700">
                {data.rates.wonRate}%
              </p>
              <span className="text-[11px] text-emerald-600">نسبة إغلاق الصفقات</span>
            </div>
          </div>

          {/* Phase 6 Engagement Conversion Funnel & Won Projects Summary */}
          {data.engagementsOverview && (
            <div className="grid gap-6 lg:grid-cols-12">
              <div className="lg:col-span-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <h2 className="text-base font-extrabold text-slate-900">
                  قمع تحويل مراحل التعاقد (Phase 6 Engagement Conversion Funnel)
                </h2>
                <div className="mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-4 lg:grid-cols-6 text-xs">
                  {ENGAGEMENT_STATES.map((st) => {
                    const count = data.engagementsOverview?.conversionFunnel[st] ?? 0;
                    const badge =
                      PIPELINE_STATUS_LABELS[st]?.badgeClass ||
                      'bg-slate-50 text-slate-700 border-slate-200';
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

              <div className="lg:col-span-4 rounded-2xl border border-emerald-200 bg-emerald-50/50 p-6 shadow-sm space-y-3">
                <h2 className="text-base font-extrabold text-emerald-950">
                  ملخص المشاريع الناجحة (Won Projects Summary)
                </h2>
                <div className="rounded-xl bg-white p-3.5 border border-emerald-200 text-xs flex justify-between">
                  <span className="font-bold text-slate-600">إجمالي الصفقات المغلقة (WON):</span>
                  <strong className="text-emerald-700 text-base">
                    {data.engagementsOverview.wonSummary.totalWon}
                  </strong>
                </div>
                <div className="rounded-xl bg-white p-3.5 border border-emerald-200 text-xs flex justify-between">
                  <span className="font-bold text-slate-600">القيمة التقديرية للمشاريع:</span>
                  <strong className="text-emerald-700 text-base">
                    {data.engagementsOverview.wonSummary.totalEstimatedValue.toLocaleString()} EGP
                  </strong>
                </div>
                <div className="rounded-xl bg-white p-3.5 border border-emerald-200 text-xs flex justify-between">
                  <span className="font-bold text-slate-600">متوسط قيمة الصفقة:</span>
                  <strong className="text-slate-900">
                    {data.engagementsOverview.wonSummary.averageEstimatedValue.toLocaleString()} EGP
                  </strong>
                </div>
              </div>
            </div>
          )}

          {/* Feedback Breakdown & Distributions */}
          <div className="grid gap-6 lg:grid-cols-12">
            <div className="lg:col-span-5 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="text-base font-extrabold text-slate-900">
                تقييمات المطورين لجودة الـ Leads
              </h2>
              <div className="mt-4 grid grid-cols-2 gap-3 text-xs font-bold">
                <div className="flex items-center justify-between rounded-xl bg-emerald-50 p-3 text-emerald-800">
                  <span className="flex items-center gap-1.5">
                    <ThumbsUp className="h-4 w-4" />
                    مفيدة (Yes)
                  </span>
                  <strong className="text-lg">{data.feedbackStats.usefulFeedbacks}</strong>
                </div>
                <div className="flex items-center justify-between rounded-xl bg-rose-50 p-3 text-rose-800">
                  <span className="flex items-center gap-1.5">
                    <ThumbsDown className="h-4 w-4" />
                    غير مفيدة (No)
                  </span>
                  <strong className="text-lg">{data.feedbackStats.notUsefulFeedbacks}</strong>
                </div>
              </div>

              <h3 className="mt-5 text-xs font-extrabold text-slate-700">
                تفصيل أسباب عدم الفائدة (Negative Feedback Reasons):
              </h3>
              <div className="mt-2 space-y-2 text-xs">
                {Object.entries(FEEDBACK_REASON_LABELS).map(([code, label]) => {
                  const count = data.feedbackStats.reasonsBreakdown[code] || 0;
                  return (
                    <div
                      key={code}
                      className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 font-semibold"
                    >
                      <span>{label}</span>
                      <span className="font-extrabold text-slate-900">{count}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="lg:col-span-7 grid gap-6 sm:grid-cols-2">
              <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <h2 className="text-base font-extrabold text-slate-900">
                  توزيع الفرص حسب التصنيف (By Category)
                </h2>
                <div className="mt-4 space-y-2 text-xs">
                  {Object.entries(data.distributions.byCategory).map(([cat, count]) => (
                    <div
                      key={cat}
                      className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 font-semibold"
                    >
                      <span>
                        {CATEGORY_LABELS_AR[cat] || cat} ({cat})
                      </span>
                      <strong className="text-emerald-700">{count} نشاط</strong>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <h2 className="text-base font-extrabold text-slate-900">
                  توزيع الفرص حسب المدينة وحالة الموقع
                </h2>
                <div className="mt-4 space-y-2 text-xs">
                  {Object.entries(data.distributions.byWebsiteStatus).map(([st, count]) => (
                    <div
                      key={st}
                      className="flex items-center justify-between rounded-lg bg-emerald-50/60 px-3 py-2 font-bold text-emerald-900"
                    >
                      <span>{WEBSITE_STATUS_LABELS[st]?.labelAr || st}</span>
                      <strong>{count}</strong>
                    </div>
                  ))}
                </div>

                <h3 className="mt-5 text-xs font-extrabold text-slate-700">أبرز المدن:</h3>
                <div className="mt-2 space-y-1.5 text-xs">
                  {Object.entries(data.distributions.byCity).map(([city, count]) => (
                    <div
                      key={city}
                      className="flex items-center justify-between border-b border-slate-100 py-1.5 font-semibold"
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
              <div className="lg:col-span-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <h2 className="flex items-center gap-2 text-base font-extrabold text-slate-900">
                  <Wrench className="h-5 w-5 text-slate-700" />
                  إدارة تعاملات المطورين وتصحيح الحالات النهائية (Developer Engagements & Admin Correction)
                </h2>
                <div className="mt-4 overflow-x-auto">
                  <table className="w-full text-right text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 text-slate-500">
                        <th className="py-2 px-2">العميل</th>
                        <th className="py-2 px-2">المطور</th>
                        <th className="py-2 px-2">النوع</th>
                        <th className="py-2 px-2">الحالة</th>
                        <th className="py-2 px-2">النتيجة / القيمة</th>
                        <th className="py-2 px-2">إجراء</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {data.engagementsOverview.engagements.map((eng) => (
                        <tr key={eng.id} className="hover:bg-slate-50">
                          <td className="py-2.5 px-2 font-bold text-slate-900">
                            {eng.lead.businessName}
                          </td>
                          <td className="py-2.5 px-2 text-slate-700">
                            {eng.developer.name}
                          </td>
                          <td className="py-2.5 px-2 font-mono text-[11px]">
                            {eng.lead.leadType}
                          </td>
                          <td className="py-2.5 px-2">
                            <span
                              className={`rounded-full border px-2 py-0.5 text-[11px] font-bold ${
                                PIPELINE_STATUS_LABELS[eng.currentStatus]?.badgeClass ||
                                'bg-slate-100 text-slate-700'
                              }`}
                            >
                              {eng.currentStatus}
                            </span>
                          </td>
                          <td className="py-2.5 px-2 text-[11px] text-slate-600">
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
                              className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-[11px] font-bold text-slate-700 hover:bg-slate-100"
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
                    className="mt-4 rounded-xl border border-amber-300 bg-amber-50 p-4 space-y-3 text-xs"
                  >
                    <div className="flex items-center justify-between font-extrabold text-amber-950">
                      <span>
                        تصحيح إداري لحالة الفرصة: {correctingEngagement.lead.businessName} (المطور:{' '}
                        {correctingEngagement.developer.name})
                      </span>
                      <button
                        type="button"
                        onClick={() => setCorrectingEngagement(null)}
                        className="text-slate-500 hover:text-slate-800"
                      >
                        ✕ إغلاق
                      </button>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div>
                        <label className="block font-bold text-slate-700">
                          الحالة الجديدة (New State)
                        </label>
                        <select
                          value={newState}
                          onChange={(e) => setNewState(e.target.value)}
                          className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-bold"
                        >
                          {ENGAGEMENT_STATES.map((st) => (
                            <option key={st} value={st}>
                              {st} — {PIPELINE_STATUS_LABELS[st]?.labelAr || st}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block font-bold text-slate-700">
                          سبب التصحيح الإداري (إلزامي لسجل التدقيق)
                        </label>
                        <input
                          type="text"
                          required
                          value={correctionReason}
                          onChange={(e) => setCorrectionReason(e.target.value)}
                          placeholder="مثال: تصحيح إغلاق خاطئ بناءً على طلب المطور..."
                          className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-semibold"
                        />
                      </div>
                    </div>
                    <button
                      type="submit"
                      disabled={savingCorrection}
                      className="rounded-lg bg-slate-900 px-4 py-2 font-extrabold text-white hover:bg-slate-800 disabled:opacity-50"
                    >
                      {savingCorrection ? 'جاري تطبيق التصحيح...' : 'تطبيق التصحيح وتوثيقه'}
                    </button>
                  </form>
                )}
              </div>

              <div className="lg:col-span-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
                <h2 className="flex items-center gap-2 text-base font-extrabold text-slate-900">
                  <ShieldAlert className="h-5 w-5 text-amber-600" />
                  تنبيهات الحماية وجودة البلاغات (Abuse & Quality Signals)
                </h2>
                {data.engagementsOverview.suspiciousFlags.length === 0 ? (
                  <p className="text-xs text-slate-500">
                    لا توجد تنبيهات إساءة استخدام مسجلة حاليًا.
                  </p>
                ) : (
                  <div className="space-y-2 max-h-72 overflow-y-auto text-xs">
                    {data.engagementsOverview.suspiciousFlags.map((flag) => (
                      <div
                        key={flag.id}
                        className="rounded-xl border border-amber-200 bg-amber-50/70 p-3 space-y-1"
                      >
                        <div className="flex items-center gap-1.5 font-extrabold text-amber-900">
                          <AlertTriangle className="h-3.5 w-3.5" />
                          <span>{flag.action}</span>
                        </div>
                        <div className="text-[11px] text-slate-700">
                          المطور: {flag.user?.name || flag.user?.email || '—'}
                        </div>
                        <div className="font-mono text-[10px] text-amber-800" dir="ltr">
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

