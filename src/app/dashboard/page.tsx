'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { AppShell } from '@/components/domain/AppShell';
import { PageHeader } from '@/components/domain/PageHeader';
import { StatTile } from '@/components/domain/StatTile';
import { OpportunityBadge, LeadTemperature } from '@/components/domain/OpportunityBadge';
import { StageBadge, PipelineStage } from '@/components/domain/StageBadge';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { CATEGORY_LABELS_AR, PIPELINE_STATUS_LABELS } from '@/lib/constants';
import { fmtNumber } from '@/lib/format';
import {
  TrendingUp,
  Settings,
  Compass,
  Briefcase,
  ChevronLeft,
} from 'lucide-react';

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

  if (loading || !data) {
    return (
      <AppShell density="compact" pageTitle="لوحة القيادة">
        <div className="flex flex-col gap-6">
          <Skeleton className="h-10 w-48 rounded" />
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <Skeleton key={i} className="h-24 w-full rounded-lg" />
            ))}
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-8">
              <Skeleton className="h-72 w-full rounded-xl" />
            </div>
            <div className="lg:col-span-4">
              <Skeleton className="h-72 w-full rounded-xl" />
            </div>
          </div>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell
      density="compact"
      pageTitle="لوحة القيادة"
      userCredits={data.stats.remainingCredits}
    >
      <div className="flex flex-col gap-6">
        {/* Template T11 PageHeader */}
        <PageHeader
          title="لوحة القيادة"
          description="نظرة شاملة على الفرص المطابقة لملفك، أداء التحويل، والرصيد المتبقي."
          actions={
            <Link href="/leads">
              <Button variant="primary" size="sm">
                استعراض الفرص
              </Button>
            </Link>
          }
        />

        {/* Template T11: Slim Row of Summary Tiles Above Actionable Content */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <StatTile
            label="الفرص المطابقة"
            value={data.stats.newMatchedLeadsCount}
            unit="فرصة"
            statusText="متوافقة مع ملفك"
          />
          <StatTile
            label="الفرص الساخنة"
            value={data.stats.hotLeadsCount}
            unit="فرصة"
            statusText="تقييم 70+"
          />
          <StatTile
            label="الفرص الدافئة"
            value={data.stats.warmLeadsCount}
            unit="فرصة"
            statusText="تقييم 50 – 69"
          />
          <StatTile
            label="الصفقات المفتوحة"
            value={data.stats.usedLeadsCount}
            unit="صفقة"
            statusText="في قائمة عملائك"
          />
          <StatTile
            label="الرصيد المتبقي"
            value={data.stats.remainingCredits}
            unit="نقطة"
            statusText="جاهزة للاستخدام"
          />
          <StatTile
            label="إضافات الأسبوع"
            value={data.stats.leadsThisWeekCount}
            unit="فرصة"
            statusText="آخر 7 أيام"
          />
        </div>

        {/* Template T11: Most Actionable Block First (Matches & Urgent Claims) */}
        <div className="grid gap-6 lg:grid-cols-12">
          {/* Top Matched Opportunities */}
          <div className="lg:col-span-7">
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Compass className="w-5 h-5 text-fg-brand" />
                  <CardTitle>أبرز الفرص المتوافقة مع ملفك</CardTitle>
                </div>
                <Link
                  href="/leads"
                  className="inline-flex items-center gap-1 text-caption font-semibold text-fg-brand hover:underline"
                >
                  <span>عرض كل الفرص</span>
                  <ChevronLeft className="w-3.5 h-3.5 rtl:-scale-x-100" />
                </Link>
              </CardHeader>

              <div className="divide-y divide-line">
                {data.topMatchedLeads.length === 0 ? (
                  <p className="py-8 text-center text-body-sm text-fg-secondary">
                    لا توجد فرص جديدة مطابقة حالياً. يمكنك تعديل تفضيلات المطابقة في الإعدادات.
                  </p>
                ) : (
                  data.topMatchedLeads.slice(0, 5).map((lead) => {
                    const strength =
                      lead.matchStrength ??
                      lead.matchPercentage ??
                      lead.matchEvaluation?.matchStrength ??
                      100;
                    return (
                      <div
                        key={lead.id}
                        className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                      >
                        <div className="flex flex-col gap-0.5 min-w-0">
                          <Link
                            href={`/leads/${lead.id}`}
                            className="text-body font-semibold text-fg-primary hover:text-fg-brand truncate"
                          >
                            {lead.businessName}
                          </Link>
                          <p className="text-caption text-fg-secondary truncate">
                            <span>{lead.city}</span>
                            <span className="mx-1.5">—</span>
                            <span>{CATEGORY_LABELS_AR[lead.category] || lead.category}</span>
                            <span className="mx-1.5">—</span>
                            <span>
                              {lead.websiteStatus === 'NO_WEBSITE'
                                ? 'بدون موقع إلكتروني'
                                : 'موقع يحتاج تطوير'}
                            </span>
                          </p>
                          {lead.explanation?.summaryAr && (
                            <p className="text-caption text-fg-brand font-medium">
                              ✓ {lead.explanation.summaryAr}
                            </p>
                          )}
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-brand-soft text-fg-brand text-caption font-mono font-semibold">
                            تطابق {strength}%
                          </span>
                          <OpportunityBadge
                            temperature={(lead.temperature as LeadTemperature) || 'HOT'}
                            score={lead.score}
                            size="sm"
                          />
                          <Link href={`/leads/${lead.id}`}>
                            <Button variant="secondary" size="sm">
                              معاينة
                            </Button>
                          </Link>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </Card>
          </div>

          {/* Recent Claims / Active Pipeline Deals */}
          <div className="lg:col-span-5">
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Briefcase className="w-5 h-5 text-fg-brand" />
                  <CardTitle>آخر الصفقات المقتنصة</CardTitle>
                </div>
                <Link
                  href="/my-leads"
                  className="inline-flex items-center gap-1 text-caption font-semibold text-fg-brand hover:underline"
                >
                  <span>عرض الكل</span>
                  <ChevronLeft className="w-3.5 h-3.5 rtl:-scale-x-100" />
                </Link>
              </CardHeader>

              <div className="divide-y divide-line">
                {data.recentClaims.length === 0 ? (
                  <p className="py-8 text-center text-body-sm text-fg-secondary">
                    لم تقم باقتناص أي فرصة بعد. ابدأ باستكشاف الفرص المتاحة!
                  </p>
                ) : (
                  data.recentClaims.slice(0, 5).map((claim) => (
                    <div
                      key={claim.id}
                      className="py-3 flex items-center justify-between gap-3"
                    >
                      <div className="flex flex-col gap-0.5 min-w-0">
                        <Link
                          href={`/leads/${claim.leadId}`}
                          className="text-body-sm font-semibold text-fg-primary hover:text-fg-brand truncate"
                        >
                          {claim.lead.businessName}
                        </Link>
                        <p className="text-caption text-fg-secondary truncate">
                          <span>{claim.lead.city}</span>
                          <span className="mx-1.5">—</span>
                          <span>
                            هاتف: <span className="ltr-iso font-mono">{claim.lead.phone}</span>
                          </span>
                        </p>
                      </div>

                      <StageBadge
                        stage={(claim.pipelineStatus as PipelineStage) || 'NEW'}
                        size="sm"
                      />
                    </div>
                  ))
                )}
              </div>
            </Card>
          </div>
        </div>

        {/* Secondary Dashboard Blocks: Conversion Analytics & Subscription Overview */}
        <div className="grid gap-6 lg:grid-cols-12">
          {/* Conversion Statistics */}
          <div className="lg:col-span-8">
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <TrendingUp className="w-5 h-5 text-fg-brand" />
                  <CardTitle>إحصائيات المبيعات والتحويل</CardTitle>
                </div>
                <Link
                  href="/my-leads"
                  className="inline-flex items-center gap-1 text-caption font-semibold text-fg-brand hover:underline"
                >
                  <span>إدارة الصفقات</span>
                  <ChevronLeft className="w-3.5 h-3.5 rtl:-scale-x-100" />
                </Link>
              </CardHeader>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 py-2 text-center">
                <div className="rounded-lg bg-subtle p-3.5 flex flex-col items-center gap-1">
                  <span className="text-caption text-fg-secondary font-medium">معدل التواصل</span>
                  <p className="ltr-iso font-mono text-2xl font-bold tabular-nums text-fg-primary">
                    {data.conversion.contactRate}%
                  </p>
                  <span className="text-caption text-fg-muted">
                    {data.conversion.contactedCount} من {data.conversion.totalClaimed}
                  </span>
                </div>

                <div className="rounded-lg bg-subtle p-3.5 flex flex-col items-center gap-1">
                  <span className="text-caption text-fg-secondary font-medium">معدل الرد</span>
                  <p className="ltr-iso font-mono text-2xl font-bold tabular-nums text-fg-brand">
                    {data.conversion.replyRate}%
                  </p>
                  <span className="text-caption text-fg-muted">
                    {data.conversion.repliedCount} عميل متفاعل
                  </span>
                </div>

                <div className="rounded-lg bg-subtle p-3.5 flex flex-col items-center gap-1">
                  <span className="text-caption text-fg-secondary font-medium">اجتماعات مجدولة</span>
                  <p className="ltr-iso font-mono text-2xl font-bold tabular-nums text-fg-primary">
                    {data.conversion.meetingCount}
                  </p>
                  <span className="text-caption text-fg-muted">عروض فنية</span>
                </div>

                <div className="rounded-lg bg-brand-soft p-3.5 flex flex-col items-center gap-1">
                  <span className="text-caption text-fg-brand font-semibold">صفقات ناجحة (WON)</span>
                  <p className="ltr-iso font-mono text-2xl font-bold tabular-nums text-fg-brand">
                    {data.conversion.wonCount}
                  </p>
                  <span className="text-caption text-fg-brand font-medium">
                    {data.conversion.conversionRate}% نسبة الإغلاق
                  </span>
                </div>
              </div>
            </Card>
          </div>

          {/* Subscription & Profile Preferences Card */}
          <div className="lg:col-span-4">
            <Card className="h-full flex flex-col justify-between">
              <div>
                <CardHeader>
                  <CardTitle>الباقة والرصيد</CardTitle>
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full bg-brand-soft text-fg-brand text-caption font-semibold">
                    {data.subscription?.status || 'نشط'}
                  </span>
                </CardHeader>

                <div className="p-4 rounded-lg bg-subtle border border-line flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <span className="text-body-sm font-semibold text-fg-primary">
                      {data.subscription?.plan?.name || 'الباقة المجانية'}
                    </span>
                    <span className="ltr-iso font-mono text-caption font-semibold text-fg-brand">
                      {data.subscription?.plan?.priceEgp || 0} ج.م / شهر
                    </span>
                  </div>
                  <div className="flex items-baseline justify-between text-caption text-fg-secondary pt-1 border-t border-line/60">
                    <span>الرصيد المتاح:</span>
                    <span className="ltr-iso font-mono font-semibold text-fg-primary">
                      {data.subscription?.credits ?? 0} /{' '}
                      {data.subscription?.totalCreditsGranted ?? 3} نقطة
                    </span>
                  </div>
                </div>

                {data.profile && (
                  <div className="mt-4 flex flex-col gap-1 text-caption text-fg-secondary">
                    <div className="flex items-center justify-between font-semibold text-fg-primary">
                      <span>تفضيلات المطابقة:</span>
                      <Link
                        href="/settings"
                        className="inline-flex items-center gap-1 text-fg-brand hover:underline"
                      >
                        <Settings className="w-3.5 h-3.5" />
                        تعديل
                      </Link>
                    </div>
                    <p className="truncate">المدن: {data.profile.locations.join('، ')}</p>
                    <p className="truncate">
                      التخصصات:{' '}
                      {data.profile.niches
                        .map((n) => CATEGORY_LABELS_AR[n] || n)
                        .join('، ')}
                    </p>
                  </div>
                )}
              </div>

              <div className="pt-4 mt-4 border-t border-line flex gap-2">
                <Link href="/subscription" className="flex-1">
                  <Button variant="secondary" size="sm" fullWidth>
                    ترقية الباقة
                  </Button>
                </Link>
                <Link href="/leads" className="flex-1">
                  <Button variant="primary" size="sm" fullWidth>
                    استعراض الفرص
                  </Button>
                </Link>
              </div>
            </Card>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
