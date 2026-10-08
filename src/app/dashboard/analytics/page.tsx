'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { AppShell } from '@/components/AppShell';
import {
  BarChart3,
  Briefcase,
  CheckCircle2,
  Coins,
  Filter,
  MapPin,
  RefreshCw,
  TrendingUp,
  Trophy,
} from 'lucide-react';

export default function DeveloperAnalyticsPage() {
  const [preset, setPreset] = useState<string>('all_time');
  const [loading, setLoading] = useState<boolean>(true);
  const [data, setData] = useState<any>(null);

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
    <AppShell>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:flex-row sm:items-center">
          <div>
            <span className="rounded-lg bg-emerald-100 px-2.5 py-1 text-xs font-extrabold text-emerald-800">
              Developer Analytics • Scoped Performance
            </span>
            <h1 className="mt-2 text-xl font-extrabold text-slate-900">
              تحليلات أدائي وقمع المبيعات الخاص بي (My Sales & Conversion Analytics)
            </h1>
            <p className="mt-1 text-xs text-slate-500">
              مؤشرات دقيقة ومحمية لحسابك فقط مع توضيح البسط والمقام لكل معدل تحويل عبر مراحل المتابعة.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-emerald-600" />
            <select
              value={preset}
              onChange={(e) => setPreset(e.target.value)}
              className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-800"
            >
              <option value="all_time">كل الفترات (All Time)</option>
              <option value="last_7_days">آخر 7 أيام</option>
              <option value="last_30_days">آخر 30 يومًا</option>
              <option value="last_90_days">آخر 90 يومًا</option>
              <option value="month_to_date">الشهر الحالي</option>
            </select>

            <button
              onClick={loadDeveloperAnalytics}
              disabled={loading}
              className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-100"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              <span>تحديث</span>
            </button>
          </div>
        </div>

        {loading || !perf ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="h-28 animate-pulse rounded-2xl border border-slate-200 bg-white p-5"
              />
            ))}
          </div>
        ) : (
          <>
            {/* Top Summary Cards */}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-center justify-between text-xs font-bold text-slate-500">
                  <span>إجمالي الفرص المشتراة</span>
                  <Briefcase className="h-4 w-4 text-emerald-600" />
                </div>
                <p className="mt-2 text-2xl font-extrabold text-slate-900">
                  {perf.leadsClaimed}
                </p>
                <span className="text-[11px] text-slate-400">
                  متوسط قوة المطابقة: {perf.averageMatchStrength ?? '—'}%
                </span>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-center justify-between text-xs font-bold text-slate-500">
                  <span>الصفقات الناجحة (Deals Won)</span>
                  <Trophy className="h-4 w-4 text-amber-500" />
                </div>
                <p className="mt-2 text-2xl font-extrabold text-emerald-700">
                  {perf.totalWins}
                </p>
                <span className="text-[11px] text-slate-400">
                  معدل الفوز: {perf.winRate?.displayValue} ({perf.winRate?.numerator}/
                  {perf.winRate?.denominator})
                </span>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-center justify-between text-xs font-bold text-slate-500">
                  <span>قيمة المشاريع المكتسبة</span>
                  <TrendingUp className="h-4 w-4 text-blue-600" />
                </div>
                <p className="mt-2 text-2xl font-extrabold text-slate-900">
                  {(perf.estimatedProjectValueEgp || 0).toLocaleString()}{' '}
                  <span className="text-xs font-bold">ج.م</span>
                </p>
                <span className="text-[11px] text-slate-400">Estimated Won Deal Value</span>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-center justify-between text-xs font-bold text-slate-500">
                  <span>النقاط المستهلكة والرصيد</span>
                  <Coins className="h-4 w-4 text-purple-600" />
                </div>
                <p className="mt-2 text-2xl font-extrabold text-slate-900">
                  {perf.creditsConsumed}{' '}
                  <span className="text-xs font-bold text-slate-500">نقطة صافية</span>
                </p>
                <span className="text-[11px] text-slate-400">
                  المسترد: {perf.creditsRefunded} | الرصيد الحالي: {perf.creditsBalance}
                </span>
              </div>
            </div>

            {/* Funnel Stage Conversion Rates */}
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="text-base font-extrabold text-slate-900">
                قمع المبيعات ومعدلات التحويل المرحلية (Stage-to-Stage & Overall Funnel)
              </h2>
              <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                {[
                  { label: 'معدل التواصل (Contact / Claimed)', metric: perf.contactRate },
                  { label: 'معدل الرد (Replied / Contacted)', metric: perf.replyRate },
                  { label: 'معدل الاهتمام (Interested / Replied)', metric: perf.interestRate },
                  { label: 'معدل الاجتماعات (Meetings / Interested)', metric: perf.meetingRate },
                  {
                    label: 'معدل إغلاق الاجتماعات (Won / Meetings)',
                    metric: perf.winRateOfMeetings,
                  },
                ].map((item) => (
                  <div
                    key={item.label}
                    className="rounded-xl border border-slate-200 bg-slate-50 p-4"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-700">{item.label}</span>
                      <span className="rounded bg-white px-1.5 py-0.5 font-mono text-[10px] font-bold text-slate-500">
                        {item.metric?.numerator ?? 0}/{item.metric?.denominator ?? 0}
                      </span>
                    </div>
                    <p className="mt-2 text-xl font-extrabold text-emerald-700">
                      {item.metric?.displayValue || 'INSUFFICIENT_DATA'}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            {/* Breakdown by Niche & City */}
            <div className="grid gap-6 lg:grid-cols-2">
              <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <h3 className="text-sm font-extrabold text-slate-900">
                  أدائي حسب القطاع التجاري (Performance by Niche)
                </h3>
                <div className="mt-3 space-y-2">
                  {data.byNiche?.length === 0 ? (
                    <p className="text-xs text-slate-500">لا توجد بيانات كافية بعد.</p>
                  ) : (
                    data.byNiche?.map((n: any) => (
                      <div
                        key={n.niche}
                        className="flex items-center justify-between rounded-xl bg-slate-50 p-3 text-xs"
                      >
                        <div>
                          <span className="font-bold text-slate-800">{n.labelAr}</span>
                          <span className="block text-[11px] text-slate-500">
                            مشتراة: {n.claimed} | تواصل: {n.contacted} | اجتماعات: {n.meetings}
                          </span>
                        </div>
                        <div className="text-left">
                          <span className="block font-extrabold text-emerald-700">
                            فوز: {n.wins}
                          </span>
                          <span className="block text-[11px] text-slate-500">
                            {(n.estimatedValueEgp || 0).toLocaleString()} ج.م
                          </span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <h3 className="text-sm font-extrabold text-slate-900">
                  أدائي حسب المدينة (Performance by City)
                </h3>
                <div className="mt-3 space-y-2">
                  {data.byCity?.length === 0 ? (
                    <p className="text-xs text-slate-500">لا توجد بيانات كافية بعد.</p>
                  ) : (
                    data.byCity?.map((c: any) => (
                      <div
                        key={c.city}
                        className="flex items-center justify-between rounded-xl bg-slate-50 p-3 text-xs"
                      >
                        <div>
                          <span className="font-bold text-slate-800">{c.city}</span>
                          <span className="block text-[11px] text-slate-500">
                            مشتراة: {c.claimed} | تواصل: {c.contacted} | اجتماعات: {c.meetings}
                          </span>
                        </div>
                        <div className="text-left">
                          <span className="block font-extrabold text-emerald-700">
                            فوز: {c.wins}
                          </span>
                          <span className="block text-[11px] text-slate-500">
                            {(c.estimatedValueEgp || 0).toLocaleString()} ج.م
                          </span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}
