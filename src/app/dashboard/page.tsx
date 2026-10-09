'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { AppShell } from '@/components/AppShell';
import {
  Flame,
  Sun,
  Sparkles,
  CheckCircle2,
  Coins,
  Calendar,
  TrendingUp,
  ArrowLeft,
  Compass,
  Briefcase,
  Settings,
} from 'lucide-react';
import { CATEGORY_LABELS_AR, PIPELINE_STATUS_LABELS, TEMPERATURE_LABELS } from '@/lib/constants';

interface DashboardData {
  stats: {
    newMatchedLeadsCount: number;
    hotLeadsCount: number;
    warmLeadsCount: number;
    usedLeadsCount: number;
    availableLeadsCount: number;
    remainingCredits: number;
    leadsThisWeekCount: number;
  };
  conversion: {
    totalClaimed: number;
    contactedCount: number;
    repliedCount: number;
    meetingCount: number;
    wonCount: number;
    contactRate: number;
    replyRate: number;
    conversionRate: number;
  };
  subscription?: {
    status: string;
    credits: number;
    totalCreditsGranted: number;
    creditsUsed: number;
    currentPeriodEnd: string;
    plan?: {
      name: string;
      nameEn: string;
      priceEgp: number;
    };
  };
  profile?: {
    services: string[];
    locations: string[];
    niches: string[];
    minBudget: number;
    leadType: string;
  };
  topMatchedLeads: {
    id: string;
    businessName: string;
    category: string;
    city: string;
    score: number;
    opportunityScore?: number;
    qualityScore?: number;
    freshnessStatus?: string;
    requiredService?: string;
    matchStrength?: number;
    matchPercentage?: number;
    temperature: string;
    websiteStatus: string;
    estimatedBudget: number;
    exclusive: boolean;
    explanation?: {
      summary?: string;
      summaryAr?: string;
    };
    warnings?: Array<{ key: string; reason: string; reasonAr: string }>;
    matchEvaluation?: {
      matchStrength?: number;
      matchedCriteria?: string[];
    };
  }[];
  recentClaims: {
    id: string;
    leadId: string;
    pipelineStatus: string;
    claimedAt: string;
    lead: {
      businessName: string;
      city: string;
      category: string;
      phone: string;
    };
  }[];
}

export default function DeveloperDashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch('/api/developer/dashboard');
        if (res.ok) {
          const json = await res.json();
          setData(json);
        }
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  return (
    <AppShell>
      {loading || !data ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div
              key={i}
              className="h-28 animate-pulse rounded-2xl border border-slate-200 bg-white p-5"
            />
          ))}
        </div>
      ) : (
        <div className="space-y-6">
          {/* Top KPI Grid (Section 4 requirements) */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between text-xs font-bold text-slate-500">
                <span>الـ Leads الجديدة المطابقة</span>
                <Sparkles className="h-4 w-4 text-emerald-600" />
              </div>
              <p className="mt-2 text-2xl font-extrabold text-slate-900">
                {data.stats.newMatchedLeadsCount}
              </p>
              <span className="text-[11px] font-semibold text-emerald-600">
                متوافقة مع ملفك الشخصي
              </span>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between text-xs font-bold text-slate-500">
                <span>عدد الـ Hot Leads</span>
                <Flame className="h-4 w-4 text-rose-600" />
              </div>
              <p className="mt-2 text-2xl font-extrabold text-rose-700">
                {data.stats.hotLeadsCount}
              </p>
              <span className="text-[11px] font-semibold text-slate-500">
                تقييم 70 إلى 100 نقطة
              </span>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between text-xs font-bold text-slate-500">
                <span>عدد الـ Warm Leads</span>
                <Sun className="h-4 w-4 text-amber-500" />
              </div>
              <p className="mt-2 text-2xl font-extrabold text-amber-700">
                {data.stats.warmLeadsCount}
              </p>
              <span className="text-[11px] font-semibold text-slate-500">
                تقييم 50 إلى 69 نقطة
              </span>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between text-xs font-bold text-slate-500">
                <span>الـ Leads المستخدمة</span>
                <CheckCircle2 className="h-4 w-4 text-blue-600" />
              </div>
              <p className="mt-2 text-2xl font-extrabold text-slate-900">
                {data.stats.usedLeadsCount}
              </p>
              <span className="text-[11px] font-semibold text-slate-500">
                في قائمة عملائك الحالية
              </span>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between text-xs font-bold text-slate-500">
                <span>الرصيد / المتاحة لك</span>
                <Coins className="h-4 w-4 text-emerald-600" />
              </div>
              <p className="mt-2 text-2xl font-extrabold text-emerald-700">
                {data.stats.remainingCredits}{' '}
                <span className="text-xs font-normal text-slate-400">
                  ({data.stats.availableLeadsCount} فرصة بالمنصة)
                </span>
              </p>
              <span className="text-[11px] font-semibold text-slate-500">نقطة رصيد متبقية</span>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between text-xs font-bold text-slate-500">
                <span>Leads هذا الأسبوع</span>
                <Calendar className="h-4 w-4 text-indigo-600" />
              </div>
              <p className="mt-2 text-2xl font-extrabold text-slate-900">
                {data.stats.leadsThisWeekCount}
              </p>
              <span className="text-[11px] font-semibold text-indigo-600">
                أضيفت خلال آخر 7 أيام
              </span>
            </div>
          </div>

          {/* Conversion Statistics + Subscription Status Row */}
          <div className="grid gap-6 lg:grid-cols-12">
            {/* Conversion Statistics */}
            <div className="lg:col-span-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                <div>
                  <h2 className="flex items-center gap-2 text-base font-extrabold text-slate-900">
                    <TrendingUp className="h-5 w-5 text-emerald-600" />
                    إحصائيات التحويل والمبيعات (Conversion Statistics)
                  </h2>
                  <p className="mt-0.5 text-xs text-slate-500">
                    أداء متابعتك للعملاء الذين حصلت على بياناتهم عبر المنصة
                  </p>
                </div>
                <Link
                  href="/my-leads"
                  className="text-xs font-bold text-emerald-600 hover:underline"
                >
                  إدارة الصفقات ←
                </Link>
              </div>

              <div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-4">
                <div className="rounded-xl bg-slate-50 p-3.5 text-center">
                  <span className="text-xs font-semibold text-slate-500">معدل التواصل</span>
                  <p className="mt-1 text-2xl font-extrabold text-slate-900">
                    {data.conversion.contactRate}%
                  </p>
                  <span className="text-[11px] text-slate-400">
                    {data.conversion.contactedCount} من {data.conversion.totalClaimed}
                  </span>
                </div>

                <div className="rounded-xl bg-slate-50 p-3.5 text-center">
                  <span className="text-xs font-semibold text-slate-500">معدل الرد</span>
                  <p className="mt-1 text-2xl font-extrabold text-blue-700">
                    {data.conversion.replyRate}%
                  </p>
                  <span className="text-[11px] text-slate-400">
                    {data.conversion.repliedCount} عميل متفاعل
                  </span>
                </div>

                <div className="rounded-xl bg-slate-50 p-3.5 text-center">
                  <span className="text-xs font-semibold text-slate-500">اجتماعات محددة</span>
                  <p className="mt-1 text-2xl font-extrabold text-purple-700">
                    {data.conversion.meetingCount}
                  </p>
                  <span className="text-[11px] text-slate-400">عروض فنية ومالية</span>
                </div>

                <div className="rounded-xl bg-emerald-50 p-3.5 text-center">
                  <span className="text-xs font-bold text-emerald-800">صفقات ناجحة (WON)</span>
                  <p className="mt-1 text-2xl font-extrabold text-emerald-700">
                    {data.conversion.wonCount} ({data.conversion.conversionRate}%)
                  </p>
                  <span className="text-[11px] text-emerald-600">نسبة الإغلاق الفعلي</span>
                </div>
              </div>
            </div>

            {/* Subscription & Matching Summary Card */}
            <div className="lg:col-span-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between">
                  <h2 className="text-base font-extrabold text-slate-900">
                    حالة الاشتراك (Subscription)
                  </h2>
                  <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-extrabold text-emerald-800">
                    {data.subscription?.status || 'ACTIVE'}
                  </span>
                </div>

                <div className="mt-4 rounded-xl bg-slate-900 p-4 text-white">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-bold">
                      {data.subscription?.plan?.name || 'الباقة المجانية'}
                    </span>
                    <span className="text-xs text-emerald-400 font-bold">
                      {data.subscription?.plan?.priceEgp || 0} ج.م/شهر
                    </span>
                  </div>
                  <div className="mt-3 flex items-baseline justify-between text-xs text-slate-300">
                    <span>الرصيد المتبقي:</span>
                    <strong className="text-base text-white">
                      {data.subscription?.credits ?? 0} /{' '}
                      {data.subscription?.totalCreditsGranted ?? 3} نقطة
                    </strong>
                  </div>
                </div>

                {data.profile && (
                  <div className="mt-4 space-y-1.5 text-xs text-slate-600">
                    <div className="flex items-center justify-between font-bold text-slate-800">
                      <span>إعدادات المطابقة الحالية:</span>
                      <Link
                        href="/settings"
                        className="flex items-center gap-1 text-emerald-600 hover:underline"
                      >
                        <Settings className="h-3.5 w-3.5" />
                        تعديل
                      </Link>
                    </div>
                    <p>• المدن: {data.profile.locations.join('، ')}</p>
                    <p>
                      • التخصصات:{' '}
                      {data.profile.niches
                        .map((n) => CATEGORY_LABELS_AR[n] || n)
                        .join('، ')}
                    </p>
                    <p>• الحد الأدنى للميزانية: {data.profile.minBudget.toLocaleString()} ج.م</p>
                  </div>
                )}
              </div>

              <div className="mt-5 pt-3 border-t border-slate-100 flex gap-2">
                <Link
                  href="/subscription"
                  className="flex-1 rounded-xl border border-slate-300 py-2 text-center text-xs font-bold text-slate-700 hover:bg-slate-50"
                >
                  ترقية الباقة
                </Link>
                <Link
                  href="/leads"
                  className="flex-1 rounded-xl bg-emerald-600 py-2 text-center text-xs font-bold text-white hover:bg-emerald-700"
                >
                  استكشاف الفرص
                </Link>
              </div>
            </div>
          </div>

          {/* Top Matched Opportunities & Recent Claimed Leads */}
          <div className="grid gap-6 lg:grid-cols-12">
            <div className="lg:col-span-7 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                <h2 className="flex items-center gap-2 text-base font-extrabold text-slate-900">
                  <Compass className="h-5 w-5 text-emerald-600" />
                  أبرز الفرص المتوافقة مع ملفك الآن
                </h2>
                <Link
                  href="/leads"
                  className="inline-flex items-center gap-1 text-xs font-bold text-emerald-600 hover:underline"
                >
                  <span>عرض كل الفرص</span>
                  <ArrowLeft className="h-3.5 w-3.5" />
                </Link>
              </div>

              <div className="mt-4 divide-y divide-slate-100">
                {data.topMatchedLeads.length === 0 ? (
                  <p className="py-8 text-center text-xs text-slate-500">
                    لا توجد فرص جديدة غير مفتوحة تطابق فلاتر ملفك حاليًا. يمكنك توسيع نطاق الاستهداف من
                    الإعدادات.
                  </p>
                ) : (
                  data.topMatchedLeads.map((lead) => {
                    const tempInfo =
                      TEMPERATURE_LABELS[lead.temperature] || TEMPERATURE_LABELS.HOT;
                    const strength =
                      lead.matchStrength ??
                      lead.matchPercentage ??
                      lead.matchEvaluation?.matchStrength ??
                      100;
                    return (
                      <div
                        key={lead.id}
                        className="flex flex-wrap items-center justify-between gap-3 py-3"
                      >
                        <div>
                          <Link
                            href={`/leads/${lead.id}`}
                            className="text-sm font-extrabold text-slate-900 hover:text-emerald-600"
                          >
                            {lead.businessName}
                          </Link>
                          <p className="text-xs text-slate-500">
                            {lead.city} • {CATEGORY_LABELS_AR[lead.category] || lead.category} •{' '}
                            {lead.websiteStatus === 'NO_WEBSITE'
                              ? 'بدون موقع إلكتروني'
                              : 'موقع قديم'}
                          </p>
                          {lead.explanation?.summaryAr && (
                            <p className="mt-0.5 text-[11px] font-semibold text-emerald-700">
                              ✓ {lead.explanation.summaryAr}
                            </p>
                          )}
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                          <span className="rounded-full border border-indigo-200 bg-indigo-50 px-2.5 py-0.5 text-xs font-extrabold text-indigo-800">
                            تطابق {strength}%
                          </span>
                          {typeof lead.qualityScore === 'number' && (
                            <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-bold text-slate-700">
                              الجودة: {lead.qualityScore}/100
                            </span>
                          )}
                          <span
                            className={`rounded-full border px-2.5 py-0.5 text-xs font-extrabold ${tempInfo.badgeClass}`}
                          >
                            {lead.score}/100 ({tempInfo.labelEn})
                          </span>
                          <Link
                            href={`/leads/${lead.id}`}
                            className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-600"
                          >
                            معاينة
                          </Link>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            <div className="lg:col-span-5 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                <h2 className="flex items-center gap-2 text-base font-extrabold text-slate-900">
                  <Briefcase className="h-5 w-5 text-blue-600" />
                  آخر العملاء الذين اقتنصتهم
                </h2>
                <Link
                  href="/my-leads"
                  className="text-xs font-bold text-emerald-600 hover:underline"
                >
                  عرض الكل ←
                </Link>
              </div>

              <div className="mt-4 divide-y divide-slate-100">
                {data.recentClaims.length === 0 ? (
                  <p className="py-8 text-center text-xs text-slate-500">
                    لم تقم بفتح بيانات أي عميل بعد. ابدأ باستكشاف الفرص المتاحة!
                  </p>
                ) : (
                  data.recentClaims.map((claim) => {
                    const pInfo =
                      PIPELINE_STATUS_LABELS[claim.pipelineStatus] ||
                      PIPELINE_STATUS_LABELS.NEW;
                    return (
                      <div
                        key={claim.id}
                        className="flex items-center justify-between gap-2 py-3"
                      >
                        <div>
                          <Link
                            href={`/leads/${claim.leadId}`}
                            className="text-sm font-bold text-slate-900 hover:text-emerald-600"
                          >
                            {claim.lead.businessName}
                          </Link>
                          <p className="text-xs text-slate-500">
                            {claim.lead.city} • هاتف: {claim.lead.phone}
                          </p>
                        </div>
                        <span
                          className={`rounded-full border px-2.5 py-0.5 text-[11px] font-bold ${pInfo.badgeClass}`}
                        >
                          {pInfo.labelAr}
                        </span>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
