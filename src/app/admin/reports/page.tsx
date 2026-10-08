'use client';

import React, { useEffect, useState } from 'react';
import { AppShell } from '@/components/AppShell';
import {
  CATEGORY_LABELS_AR,
  FEEDBACK_REASON_LABELS,
  WEBSITE_STATUS_LABELS,
} from '@/lib/constants';
import { BarChart3, ThumbsDown, ThumbsUp } from 'lucide-react';

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
  distributions: {
    byCity: Record<string, number>;
    byCategory: Record<string, number>;
    byWebsiteStatus: Record<string, number>;
  };
}

export default function AdminReportsPage() {
  const [data, setData] = useState<ReportsPayload | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch('/api/admin/reports');
        if (res.ok) {
          setData(await res.json());
        }
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  return (
    <AppShell isAdminView>
      {loading || !data ? (
        <div className="h-96 animate-pulse rounded-2xl border border-slate-200 bg-white p-6" />
      ) : (
        <div className="space-y-6">
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h1 className="flex items-center gap-2 text-xl font-extrabold text-slate-900">
              <BarChart3 className="h-6 w-6 text-emerald-600" />
              تقارير الأداء وجودة الفرص (Performance & Feedback Reports)
            </h1>
            <p className="mt-1 text-xs text-slate-500">
              تحليل شامل لمعدلات نجاح الـ Leads، مراحل البيع، وأسباب التقييم السلبي من المطورين.
            </p>
          </div>

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
        </div>
      )}
    </AppShell>
  );
}
