'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { AppShell } from '@/components/domain/AppShell';
import {
  AlertTriangle,
  BarChart3,
  Database,
  Download,
  Filter,
  RefreshCw,
  Sliders,
  TrendingUp,
  Users,
} from 'lucide-react';

interface RateMetricDto {
  metric: string;
  metricVersion: string;
  name?: string;
  nameAr?: string;
  label?: string;
  labelAr?: string;
  numerator: number;
  denominator: number;
  value: number | null;
  percentage: number | null;
  displayValue: string;
  status: 'VALID' | 'INSUFFICIENT_DATA' | 'INSUFFICIENT_SAMPLE';
  minimumSampleSize: number;
}

type DashboardTab = 'executive' | 'leads' | 'developers' | 'quality' | 'flywheel';

function RateCard({
  titleAr,
  metric,
  accent = 'brand',
}: {
  titleAr: string;
  metric?: RateMetricDto;
  accent?: 'brand' | 'danger' | 'warning' | 'neutral';
}) {
  if (!metric) return null;
  const colorMap = {
    brand: 'border-line-brand bg-brand-soft/50 text-brand-dark',
    danger: 'border-red-200 bg-red-50/60 text-red-800',
    warning: 'border-amber-200 bg-amber-50/60 text-amber-800',
    neutral: 'border-line bg-surface text-fg-primary',
  };

  return (
    <div className={`rounded-2xl border p-4 shadow-sm ${colorMap[accent]}`}>
      <div className="flex items-start justify-between gap-2">
        <span className="text-xs font-bold leading-snug">{titleAr}</span>
        <span className="rounded bg-surface/80 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-fg-secondary tabular-nums ltr-iso">
          {metric.numerator}/{metric.denominator}
        </span>
      </div>
      <div className="mt-2 flex items-baseline justify-between">
        {metric.status === 'INSUFFICIENT_DATA' ? (
          <span className="text-sm font-bold text-fg-muted">INSUFFICIENT_DATA (0 مقام)</span>
        ) : (
          <span className="text-2xl font-extrabold tabular-nums ltr-iso">
            {metric.percentage !== null ? `${metric.percentage}%` : metric.displayValue}
          </span>
        )}
        {metric.status !== 'VALID' && (
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800">
            {metric.status}
          </span>
        )}
      </div>
      <p className="mt-1 truncate text-[10px] text-fg-muted">
        {metric.nameAr || metric.name || metric.label} ({metric.metricVersion})
      </p>
    </div>
  );
}

function StatCard({
  titleAr,
  subtitleEn,
  value,
  unit = '',
}: {
  titleAr: string;
  subtitleEn: string;
  value: number | string | null | undefined;
  unit?: string;
}) {
  return (
    <div className="rounded-2xl border border-line bg-surface p-4 shadow-sm">
      <span className="text-xs font-bold text-fg-secondary">{titleAr}</span>
      <div className="mt-2 flex items-baseline gap-1">
        {value === null || value === undefined ? (
          <span className="text-sm font-bold text-fg-muted">INSUFFICIENT_DATA</span>
        ) : (
          <>
            <span className="text-2xl font-extrabold text-fg-primary tabular-nums ltr-iso">
              {typeof value === 'number' ? value.toLocaleString() : value}
            </span>
            {unit && <span className="text-xs font-bold text-fg-muted">{unit}</span>}
          </>
        )}
      </div>
      <p className="mt-1 truncate text-[10px] text-fg-muted">{subtitleEn}</p>
    </div>
  );
}

export default function AdminAnalyticsHubPage() {
  const [activeTab, setActiveTab] = useState<DashboardTab>('executive');
  const [preset, setPreset] = useState<string>('all_time');
  const [fromDate, setFromDate] = useState<string>('');
  const [toDate, setToDate] = useState<string>('');
  const [sourceFilter, setSourceFilter] = useState<string>('');
  const [categoryFilter, setCategoryFilter] = useState<string>('');
  const [cityFilter, setCityFilter] = useState<string>('');
  const [serviceFilter, setServiceFilter] = useState<string>('');
  const [scoreBandFilter, setScoreBandFilter] = useState<string>('');
  const [qualityBandFilter, setQualityBandFilter] = useState<string>('');
  const [freshnessFilter, setFreshnessFilter] = useState<string>('');
  const [claimModeFilter, setClaimModeFilter] = useState<string>('');
  const [developerFilter, setDeveloperFilter] = useState<string>('');

  const [loading, setLoading] = useState<boolean>(true);
  const [overviewData, setOverviewData] = useState<any>(null);
  const [leadsData, setLeadsData] = useState<any>(null);
  const [sourcesData, setSourcesData] = useState<any>(null);
  const [nichesData, setNichesData] = useState<any>(null);
  const [locationsData, setLocationsData] = useState<any>(null);
  const [servicesData, setServicesData] = useState<any>(null);
  const [funnelData, setFunnelData] = useState<any>(null);
  const [developersData, setDevelopersData] = useState<any>(null);
  const [qualityData, setQualityData] = useState<any>(null);
  const [rulesData, setRulesData] = useState<any>(null);
  const [reviewCandidatesData, setReviewCandidatesData] = useState<any>(null);

  const [reviewStatusFilter, setReviewStatusFilter] = useState<string>('');
  const [reviewTypeFilter, setReviewTypeFilter] = useState<string>('');
  const [decisionNotesMap, setDecisionNotesMap] = useState<Record<string, string>>({});
  const [actionBusy, setActionBusy] = useState<string | null>(null);
  const [bannerMessage, setBannerMessage] = useState<string | null>(null);

  const buildQueryString = useCallback(
    (extra?: Record<string, string>) => {
      const params = new URLSearchParams();
      params.set('preset', preset);
      if (preset === 'custom') {
        if (fromDate) params.set('from', fromDate);
        if (toDate) params.set('to', toDate);
      }
      if (sourceFilter) params.set('source', sourceFilter);
      if (categoryFilter) params.set('niche', categoryFilter);
      if (cityFilter) params.set('city', cityFilter);
      if (serviceFilter) params.set('service', serviceFilter);
      if (scoreBandFilter) params.set('scoreBand', scoreBandFilter);
      if (qualityBandFilter) params.set('qualityBand', qualityBandFilter);
      if (freshnessFilter) params.set('freshness', freshnessFilter);
      if (claimModeFilter) params.set('accessType', claimModeFilter);
      if (developerFilter) params.set('developerId', developerFilter);
      if (extra) {
        for (const [k, v] of Object.entries(extra)) {
          if (v) params.set(k, v);
        }
      }
      return params.toString();
    },
    [
      preset,
      fromDate,
      toDate,
      sourceFilter,
      categoryFilter,
      cityFilter,
      serviceFilter,
      scoreBandFilter,
      qualityBandFilter,
      freshnessFilter,
      claimModeFilter,
      developerFilter,
    ]
  );

  const loadAnalytics = useCallback(async () => {
    setLoading(true);
    try {
      const qs = buildQueryString();
      if (activeTab === 'executive') {
        const res = await fetch(`/api/admin/analytics/overview?${qs}`);
        if (res.ok) setOverviewData(await res.json());
      } else if (activeTab === 'leads') {
        const [leadsRes, sourcesRes, nichesRes, locRes, srvRes, funRes] = await Promise.all([
          fetch(`/api/admin/analytics/leads?${qs}`),
          fetch(`/api/admin/analytics/sources?${qs}`),
          fetch(`/api/admin/analytics/niches?${qs}`),
          fetch(`/api/admin/analytics/locations?${qs}`),
          fetch(`/api/admin/analytics/services?${qs}`),
          fetch(`/api/admin/analytics/funnel?${qs}`),
        ]);
        if (leadsRes.ok) setLeadsData(await leadsRes.json());
        if (sourcesRes.ok) setSourcesData(await sourcesRes.json());
        if (nichesRes.ok) setNichesData(await nichesRes.json());
        if (locRes.ok) setLocationsData(await locRes.json());
        if (srvRes.ok) setServicesData(await srvRes.json());
        if (funRes.ok) setFunnelData(await funRes.json());
      } else if (activeTab === 'developers') {
        const res = await fetch(`/api/admin/analytics/developers?${qs}`);
        if (res.ok) setDevelopersData(await res.json());
      } else if (activeTab === 'quality') {
        const res = await fetch(`/api/admin/analytics/data-quality?${qs}`);
        if (res.ok) setQualityData(await res.json());
      } else if (activeTab === 'flywheel') {
        const reviewQs = buildQueryString({
          status: reviewStatusFilter,
          ruleType: reviewTypeFilter,
        });
        const [rulesRes, revRes] = await Promise.all([
          fetch(`/api/admin/analytics/rules?${qs}`),
          fetch(`/api/admin/analytics/rule-review?${reviewQs}`),
        ]);
        if (rulesRes.ok) setRulesData(await rulesRes.json());
        if (revRes.ok) setReviewCandidatesData(await revRes.json());
      }
    } finally {
      setLoading(false);
    }
  }, [activeTab, buildQueryString, reviewStatusFilter, reviewTypeFilter]);

  useEffect(() => {
    loadAnalytics();
  }, [loadAnalytics]);

  async function handleMaterializeSnapshot() {
    setActionBusy('snapshot');
    setBannerMessage(null);
    try {
      const res = await fetch('/api/admin/analytics/overview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      if (res.ok) {
        const data = await res.json();
        setBannerMessage(
          `تم حفظ لقطة المؤشرات اليومية (${data.dateKey}) بنجاح — عدد المؤشرات المسجلة: ${data.snapshotsCount}`
        );
        await loadAnalytics();
      }
    } finally {
      setActionBusy(null);
    }
  }

  async function handleGenerateRuleCandidates() {
    setActionBusy('generate-candidates');
    setBannerMessage(null);
    try {
      const qs = buildQueryString();
      const res = await fetch(`/api/admin/analytics/rule-review?${qs}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'generate' }),
      });
      if (res.ok) {
        const data = await res.json();
        setBannerMessage(
          `تم فحص الأداء التراكمي للقواعد حتمياً — تم توليد/تحديث ${
            data.candidatesGeneratedOrUpdated?.length ?? 0
          } مقترح للمراجعة البشرية (تم تخطي ${
            data.skippedInsufficientSample?.length ?? 0
          } قاعدة لعدم بلوغ الحد الأدنى للعينة).`
        );
        await loadAnalytics();
      }
    } finally {
      setActionBusy(null);
    }
  }

  async function handleCandidateDecision(
    candidateId: string,
    status: 'APPROVED' | 'REJECTED' | 'DEFERRED' | 'UNDER_REVIEW'
  ) {
    setActionBusy(candidateId);
    setBannerMessage(null);
    try {
      const res = await fetch(`/api/admin/analytics/rule-review/${candidateId}/decision`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status,
          decisionNotes:
            decisionNotesMap[candidateId] ||
            `Admin review decision: ${status}`,
        }),
      });
      if (res.ok) {
        setBannerMessage(`تم تسجيل قرار المراجعة (${status}) في سجل التدقيق بنجاح.`);
        await loadAnalytics();
      }
    } finally {
      setActionBusy(null);
    }
  }

  const exportReportType =
    activeTab === 'executive'
      ? 'overview'
      : activeTab === 'leads'
        ? 'sources'
        : activeTab === 'developers'
          ? 'developers'
          : activeTab === 'quality'
            ? 'data-quality'
            : 'rules';

  return (
    <AppShell isAdmin={true} density="compact" pageTitle="تحليلات المنصة ودولاب القيمة">
      <div className="space-y-6">
        {/* Header & Governance Badge */}
        <div className="flex flex-col gap-4 rounded-2xl border border-line bg-surface p-6 shadow-sm lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="rounded-lg bg-brand-soft px-2.5 py-1 text-xs font-extrabold text-brand-dark">
                Phase 7 • Deterministic Analytics & Data Flywheel
              </span>
              <span className="rounded-lg bg-surface-subtle px-2.5 py-1 font-mono text-xs font-semibold text-fg-secondary">
                Centralized Metric Dictionary
              </span>
            </div>
            <h1 className="mt-2 text-xl font-extrabold text-fg-primary sm:text-2xl">
              مركز التحليلات التنفيذية وحلقة تحسين البيانات (Analytics & Flywheel Hub)
            </h1>
            <p className="mt-1 text-xs text-fg-muted">
              جميع المؤشرات حتمية (100% Deterministic)، قابلة للتفسير مع عرض البسط والمقام وحجم العينة، وبدون أي تعديل تلقائي للقواعد دون مراجعة بشرية.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={loadAnalytics}
              disabled={loading}
              className="flex items-center gap-1.5 rounded-xl border border-line bg-canvas px-3.5 py-2 text-xs font-bold text-fg-secondary hover:bg-slate-100"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              <span>تحديث البيانات</span>
            </button>

            <a
              href={`/api/admin/analytics/export?report=${exportReportType}&${buildQueryString()}`}
              className="flex items-center gap-1.5 rounded-xl bg-brand px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-brand-hover"
            >
              <Download className="h-4 w-4" />
              <span>تصدير CSV آمن</span>
            </a>
          </div>
        </div>

        {/* Global Filter Bar */}
        <div className="rounded-2xl border border-line bg-surface p-4 shadow-sm">
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="flex items-center gap-1.5 text-xs font-extrabold text-fg-secondary">
              <Filter className="h-4 w-4 text-brand" />
              <span>تصفية الأتراب (Cohort Filters):</span>
            </div>

            <select
              value={preset}
              onChange={(e) => setPreset(e.target.value)}
              className="rounded-xl border border-line bg-canvas px-3 py-1.5 text-xs font-bold text-fg-primary"
            >
              <option value="all_time">كل الفترات (All Time)</option>
              <option value="today">اليوم (Today)</option>
              <option value="yesterday">أمس (Yesterday)</option>
              <option value="last_7_days">آخر 7 أيام (Last 7 Days)</option>
              <option value="last_30_days">آخر 30 يومًا (Last 30 Days)</option>
              <option value="last_90_days">آخر 90 يومًا (Last 90 Days)</option>
              <option value="month_to_date">الشهر الحالي (MTD)</option>
              <option value="previous_month">الشهر السابق (Previous Month)</option>
              <option value="custom">فترة مخصصة (Custom Range)</option>
            </select>

            {preset === 'custom' && (
              <>
                <input
                  type="date"
                  value={fromDate}
                  onChange={(e) => setFromDate(e.target.value)}
                  className="rounded-xl border border-line bg-canvas px-2.5 py-1.5 text-xs font-semibold text-fg-primary"
                />
                <input
                  type="date"
                  value={toDate}
                  onChange={(e) => setToDate(e.target.value)}
                  className="rounded-xl border border-line bg-canvas px-2.5 py-1.5 text-xs font-semibold text-fg-primary"
                />
              </>
            )}

            <input
              type="text"
              placeholder="المصدر (Source)"
              value={sourceFilter}
              onChange={(e) => setSourceFilter(e.target.value)}
              className="w-36 rounded-xl border border-line bg-canvas px-3 py-1.5 text-xs font-semibold text-fg-primary"
            />

            <input
              type="text"
              placeholder="القطاع (Niche)"
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="w-32 rounded-xl border border-line bg-canvas px-3 py-1.5 text-xs font-semibold text-fg-primary"
            />

            <input
              type="text"
              placeholder="المدينة (City)"
              value={cityFilter}
              onChange={(e) => setCityFilter(e.target.value)}
              className="w-32 rounded-xl border border-line bg-canvas px-3 py-1.5 text-xs font-semibold text-fg-primary"
            />

            <input
              type="text"
              placeholder="الخدمة (Service)"
              value={serviceFilter}
              onChange={(e) => setServiceFilter(e.target.value)}
              className="w-36 rounded-xl border border-line bg-canvas px-3 py-1.5 text-xs font-semibold text-fg-primary"
            />

            <select
              value={scoreBandFilter}
              onChange={(e) => setScoreBandFilter(e.target.value)}
              className="rounded-xl border border-line bg-canvas px-2.5 py-1.5 text-xs font-bold text-fg-primary"
            >
              <option value="">كل درجات الفرص (Score Band)</option>
              <option value="PREMIUM">PREMIUM</option>
              <option value="HOT">HOT</option>
              <option value="WARM">WARM</option>
              <option value="COLD">COLD</option>
            </select>

            <select
              value={qualityBandFilter}
              onChange={(e) => setQualityBandFilter(e.target.value)}
              className="rounded-xl border border-line bg-canvas px-2.5 py-1.5 text-xs font-bold text-fg-primary"
            >
              <option value="">كل فئات الجودة (Quality Band)</option>
              <option value="EXCELLENT">EXCELLENT</option>
              <option value="HIGH">HIGH</option>
              <option value="MEDIUM">MEDIUM</option>
              <option value="LOW">LOW</option>
              <option value="VERY_LOW">VERY_LOW</option>
            </select>

            <select
              value={freshnessFilter}
              onChange={(e) => setFreshnessFilter(e.target.value)}
              className="rounded-xl border border-line bg-canvas px-2.5 py-1.5 text-xs font-bold text-fg-primary"
            >
              <option value="">كل حالات الحداثة (Freshness)</option>
              <option value="FRESH">FRESH</option>
              <option value="RECENT">RECENT</option>
              <option value="NEEDS_VERIFICATION">NEEDS_VERIFICATION</option>
              <option value="STALE">STALE</option>
              <option value="VERY_STALE">VERY_STALE</option>
            </select>

            <select
              value={claimModeFilter}
              onChange={(e) => setClaimModeFilter(e.target.value)}
              className="rounded-xl border border-line bg-canvas px-2.5 py-1.5 text-xs font-bold text-fg-primary"
            >
              <option value="">كل أنماط الشراء (Access Type)</option>
              <option value="SHARED">مشترك (SHARED)</option>
              <option value="EXCLUSIVE">حصري (EXCLUSIVE)</option>
            </select>

            <input
              type="text"
              placeholder="معرف المطور (Developer ID)"
              value={developerFilter}
              onChange={(e) => setDeveloperFilter(e.target.value)}
              className="w-40 rounded-xl border border-line bg-canvas px-3 py-1.5 text-xs font-semibold text-fg-primary"
            />

            {(sourceFilter ||
              categoryFilter ||
              cityFilter ||
              serviceFilter ||
              scoreBandFilter ||
              qualityBandFilter ||
              freshnessFilter ||
              claimModeFilter ||
              developerFilter ||
              fromDate ||
              toDate ||
              preset !== 'all_time') && (
              <button
                onClick={() => {
                  setPreset('all_time');
                  setFromDate('');
                  setToDate('');
                  setSourceFilter('');
                  setCategoryFilter('');
                  setCityFilter('');
                  setServiceFilter('');
                  setScoreBandFilter('');
                  setQualityBandFilter('');
                  setFreshnessFilter('');
                  setClaimModeFilter('');
                  setDeveloperFilter('');
                }}
                className="text-xs font-bold text-danger hover:underline"
              >
                إعادة ضبط الفلاتر
              </button>
            )}
          </div>
        </div>

        {/* 5 Dashboard Navigation Tabs */}
        <div className="flex flex-wrap gap-2 border-b border-line pb-3">
          {[
            {
              id: 'executive' as DashboardTab,
              label: '1. اللوحة التنفيذية (Executive)',
              icon: BarChart3,
            },
            {
              id: 'leads' as DashboardTab,
              label: '2. أداء الـ Leads والمصادر والقمع',
              icon: TrendingUp,
            },
            {
              id: 'developers' as DashboardTab,
              label: '3. أداء المطورين (Developers)',
              icon: Users,
            },
            {
              id: 'quality' as DashboardTab,
              label: '4. جودة البيانات والحداثة (Data Quality)',
              icon: Database,
            },
            {
              id: 'flywheel' as DashboardTab,
              label: '5. أداء القواعد وطابور المراجعة (Rule Flywheel)',
              icon: Sliders,
            },
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-extrabold transition-all ${
                  isActive
                    ? 'bg-brand text-white shadow-sm'
                    : 'bg-surface text-fg-secondary border border-line hover:bg-surface-subtle'
                }`}
              >
                <Icon className="h-4 w-4" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {bannerMessage && (
          <div className="rounded-xl border border-line-brand bg-brand-soft px-4 py-3 text-xs font-bold text-brand-dark">
            {bannerMessage}
          </div>
        )}

        {/* TAB 1: EXECUTIVE DASHBOARD */}
        {activeTab === 'executive' && overviewData && (
          <div className="space-y-6">
            {/* Layer 1 & Layer 2 Summary */}
            <div className="rounded-2xl border border-line bg-surface p-6 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-base font-extrabold text-fg-primary">
                  الطبقة 1 و 2: مخزون الفرص وجودة البيانات (Inventory & Quality Metrics)
                </h2>
                <button
                  onClick={handleMaterializeSnapshot}
                  disabled={actionBusy === 'snapshot'}
                  className="rounded-xl border border-line-brand bg-brand-soft px-3 py-1.5 text-xs font-bold text-brand-dark hover:bg-teal-100"
                >
                  {actionBusy === 'snapshot'
                    ? 'جاري حفظ اللقطة...'
                    : 'حفظ لقطة المؤشرات اليومية (Materialize Daily Snapshot)'}
                </button>
              </div>

              <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <StatCard
                  titleAr="إجمالي الفرص الموحدة (Canonical Leads)"
                  subtitleEn="TOTAL_LEADS"
                  value={overviewData.layers?.layer1Inventory?.totalLeads}
                />
                <StatCard
                  titleAr="الفرص المتاحة للشراء (Saleable Leads)"
                  subtitleEn="SALEABLE_LEADS"
                  value={overviewData.layers?.layer1Inventory?.saleableLeads}
                />
                <StatCard
                  titleAr="متوسط جودة البيانات (Avg Quality Score)"
                  subtitleEn="AVERAGE_QUALITY_SCORE"
                  value={overviewData.executiveSummary?.averageQualityScore}
                  unit="درجة"
                />
                <RateCard
                  titleAr="معدل التحقق (Verification Rate)"
                  metric={overviewData.layers?.layer2Quality?.verificationRate}
                  accent="brand"
                />
                <RateCard
                  titleAr="معدل عدم الصلاحية (Invalid Rate)"
                  metric={overviewData.layers?.layer2Quality?.invalidRate}
                  accent="danger"
                />
                <RateCard
                  titleAr="معدل التكرارات المكتشفة (Duplicate Rate)"
                  metric={overviewData.layers?.layer2Quality?.duplicateRate}
                  accent="neutral"
                />
                <StatCard
                  titleAr="الفرص المتقادمة (Stale Leads)"
                  subtitleEn="STALE_LEADS"
                  value={overviewData.layers?.layer1Inventory?.staleLeads}
                />
                <StatCard
                  titleAr="متوسط تقييم الفرصة (Avg Opportunity Score)"
                  subtitleEn="AVERAGE_OPPORTUNITY_SCORE"
                  value={overviewData.executiveSummary?.averageOpportunityScore}
                  unit="درجة"
                />
              </div>
            </div>

            {/* Layer 4 & 5: Matching & Sales Funnel */}
            <div className="rounded-2xl border border-line bg-surface p-6 shadow-sm">
              <h2 className="text-base font-extrabold text-fg-primary">
                الطبقة 4 و 5: محرك المطابقة وقمع المبيعات (Matching & Sales Funnel Rates)
              </h2>
              <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <RateCard
                  titleAr="معدل المطابقة المؤهلة (Match Rate)"
                  metric={overviewData.layers?.layer4Matching?.matchRate}
                  accent="neutral"
                />
                <RateCard
                  titleAr="التحويل من مطابقة إلى شراء (Claims / Match)"
                  metric={overviewData.layers?.layer4Matching?.claimsPerMatchRate}
                  accent="brand"
                />
                <RateCard
                  titleAr="معدل الشراء العام (Claim Rate)"
                  metric={overviewData.layers?.layer5SalesFunnel?.claimRate}
                  accent="brand"
                />
                <RateCard
                  titleAr="معدل التواصل (Contact Rate)"
                  metric={overviewData.layers?.layer5SalesFunnel?.stageRates?.contactRate}
                  accent="brand"
                />
                <RateCard
                  titleAr="معدل الرد من المتواصل معهم (Reply Rate)"
                  metric={overviewData.layers?.layer5SalesFunnel?.stageRates?.replyRate}
                  accent="brand"
                />
                <RateCard
                  titleAr="معدل الاهتمام (Interest Rate)"
                  metric={overviewData.layers?.layer5SalesFunnel?.stageRates?.interestRate}
                  accent="neutral"
                />
                <RateCard
                  titleAr="معدل الفوز من الاجتماعات (Win / Meetings)"
                  metric={overviewData.layers?.layer5SalesFunnel?.stageRates?.winRate}
                  accent="brand"
                />
                <RateCard
                  titleAr="معدل الفوز من إجمالي المشتراة (Win / Claimed)"
                  metric={overviewData.layers?.layer5SalesFunnel?.overallRates?.winRateOfClaimed}
                  accent="brand"
                />
              </div>
            </div>

            {/* Layer 6: Economics & Revenue */}
            <div className="rounded-2xl border border-line bg-surface p-6 shadow-sm">
              <h2 className="text-base font-extrabold text-fg-primary">
                الطبقة 6: الاقتصاديات والإيرادات المحققة (Economics & Realized Revenue)
              </h2>
              <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <StatCard
                  titleAr="صافي إيرادات الاشتراكات النقدية"
                  subtitleEn="NET_CASH_REVENUE_EGP"
                  value={overviewData.layers?.layer6Economics?.revenue?.netCashRevenueEgp}
                  unit="ج.م"
                />
                <StatCard
                  titleAr="الإيراد المحقق المسند للـ Claims"
                  subtitleEn="ATTRIBUTED_CLAIM_REVENUE_EGP"
                  value={overviewData.layers?.layer6Economics?.revenue?.attributedClaimRevenueEgp}
                  unit="ج.م"
                />
                <StatCard
                  titleAr="قيمة مشاريع الصفقات الناجحة للمطورين"
                  subtitleEn="WON_DEAL_VALUE_EGP"
                  value={overviewData.layers?.layer5SalesFunnel?.totalEstimatedProjectValueEgp}
                  unit="ج.م"
                />
                <StatCard
                  titleAr="النقاط الممنوحة (Credits Granted)"
                  subtitleEn="CREDITS_GRANTED"
                  value={overviewData.layers?.layer6Economics?.credits?.creditsGranted}
                  unit="نقطة"
                />
                <StatCard
                  titleAr="النقاط المستهلكة الصافية (Net Consumed)"
                  subtitleEn="CREDITS_CONSUMED"
                  value={overviewData.layers?.layer6Economics?.credits?.creditsConsumed}
                  unit="نقطة"
                />
                <StatCard
                  titleAr="النقاط المستردة (Refunded Credits)"
                  subtitleEn="CREDITS_REFUNDED"
                  value={overviewData.layers?.layer6Economics?.credits?.creditsRefunded}
                  unit="نقطة"
                />
                <StatCard
                  titleAr="رصيد النقاط المتاح حالياً (Outstanding)"
                  subtitleEn="CREDITS_OUTSTANDING"
                  value={overviewData.layers?.layer6Economics?.credits?.creditsOutstanding}
                  unit="نقطة"
                />
                <RateCard
                  titleAr="معدل استرداد النقاط (Refund Rate)"
                  metric={overviewData.layers?.layer6Economics?.credits?.refundRate}
                  accent="warning"
                />
              </div>
            </div>

            {/* Deterministic Operational Anomaly Flags */}
            <div className="rounded-2xl border border-line bg-surface p-6 shadow-sm">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-amber-600" />
                <h2 className="text-base font-extrabold text-fg-primary">
                  التنبيهات التشخيصية الحتمية (Deterministic Operational Anomaly Flags)
                </h2>
              </div>
              <div className="mt-4 space-y-2.5">
                {overviewData.anomalyFlags?.length === 0 ? (
                  <p className="text-xs font-semibold text-fg-muted">
                    لا توجد انحرافات تشغيلية تتجاوز العتبات الحتمية في هذه الفترة.
                  </p>
                ) : (
                  overviewData.anomalyFlags?.map((anom: any, idx: number) => (
                    <div
                      key={`${anom.code}-${idx}`}
                      className={`flex flex-col justify-between gap-2 rounded-xl border p-3.5 text-xs sm:flex-row sm:items-center ${
                        anom.severity === 'CRITICAL'
                          ? 'border-red-300 bg-red-50 text-red-900'
                          : anom.severity === 'WARNING'
                            ? 'border-amber-300 bg-amber-50 text-amber-900'
                            : 'border-line bg-surface text-fg-primary'
                      }`}
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="rounded bg-surface/80 px-2 py-0.5 font-mono text-[10px] font-bold">
                            {anom.code}
                          </span>
                          <span className="font-extrabold">
                            [{anom.entityType}: {anom.entityKey}]
                          </span>
                        </div>
                        <p className="mt-1 font-semibold">
                          {anom.explanationAr || anom.explanation}
                        </p>
                      </div>
                      <div className="shrink-0 font-mono text-[11px] font-bold">
                        Observed: {anom.observedValue} | Threshold: {anom.thresholdValue} |{' '}
                        {anom.numerator}/{anom.denominator}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: LEAD, SOURCE, NICHE, LOCATION, SERVICE & FUNNEL PERFORMANCE */}
        {activeTab === 'leads' && (
          <div className="space-y-6">
            {/* Funnel & Reasons */}
            {funnelData && (
              <div className="rounded-2xl border border-line bg-surface p-6 shadow-sm">
                <h2 className="text-base font-extrabold text-fg-primary">
                  تفصيل قمع المبيعات، المقامات، وأسباب الخسارة وعدم الصلاحية (Funnel & Reason Analysis)
                </h2>
                <div className="mt-4 grid gap-3 sm:grid-cols-3 lg:grid-cols-7">
                  {funnelData.funnel?.stages?.map((st: any) => (
                    <div
                      key={st.stage}
                      className="rounded-xl border border-line bg-canvas p-3 text-center"
                    >
                      <span className="block font-mono text-[10px] font-bold uppercase text-fg-muted">
                        {st.stage}
                      </span>
                      <span className="mt-1 block text-xl font-extrabold text-fg-primary">
                        {st.count}
                      </span>
                      <span className="mt-0.5 block font-mono text-[10px] text-brand">
                        {st.conversionFromClaimed?.displayValue} من المشتراة
                      </span>
                    </div>
                  ))}
                </div>

                {/* Lost & Invalid Reasons */}
                <div className="mt-6 grid gap-6 lg:grid-cols-2">
                  <div>
                    <h3 className="text-xs font-extrabold text-fg-secondary">
                      توزيع أسباب خسارة الصفقات (Lost Deal Reasons)
                    </h3>
                    <div className="mt-2 space-y-1.5">
                      {funnelData.lostReasonAnalysis?.reasons?.map((r: any) => (
                        <div
                          key={r.reasonCode}
                          className="flex items-center justify-between rounded-lg bg-canvas px-3 py-2 text-xs"
                        >
                          <span className="font-mono font-bold text-fg-primary">{r.reasonCode}</span>
                          <span className="font-mono font-bold text-danger">
                            {r.count} ({r.rate?.displayValue})
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div>
                    <h3 className="text-xs font-extrabold text-fg-secondary">
                      توزيع أسباب عدم الصلاحية والاسترداد (Invalid Lead Reasons)
                    </h3>
                    <div className="mt-2 space-y-1.5">
                      {funnelData.invalidReasonAnalysis?.reasons?.map((r: any) => (
                        <div
                          key={r.reasonCode}
                          className="flex items-center justify-between rounded-lg bg-canvas px-3 py-2 text-xs"
                        >
                          <span className="font-mono font-bold text-fg-primary">{r.reasonCode}</span>
                          <span className="font-mono font-bold text-amber-700">
                            {r.count} ({r.rate?.displayValue})
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Lead Performance Breakdowns (Section 36) */}
            {leadsData && (
              <div className="rounded-2xl border border-line bg-surface p-6 shadow-sm">
                <h2 className="text-base font-extrabold text-fg-primary">
                  أداء الفرص حسب درجة الفرصة، الجودة، الحداثة، ونمط الشراء (Lead Performance Breakdowns)
                </h2>
                <div className="mt-4 grid gap-6 lg:grid-cols-2">
                  <div>
                    <h3 className="text-xs font-extrabold text-fg-secondary">
                      حسب فئة درجة الفرصة (Opportunity Score Bands)
                    </h3>
                    <div className="mt-2 space-y-1.5">
                      {leadsData.byScoreBand?.map((b: any) => (
                        <div
                          key={b.scoreBand}
                          className="flex items-center justify-between rounded-lg bg-canvas px-3 py-2 text-xs font-semibold"
                        >
                          <span className="font-mono font-bold text-fg-primary">
                            {b.scoreBand} ({b.leadsCount} فرصة / {b.claimsCount} شراء)
                          </span>
                          <span className="font-mono text-brand">
                            شراء: {b.rates?.claimRate?.displayValue} | فوز: {b.rates?.winRate?.displayValue}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div>
                    <h3 className="text-xs font-extrabold text-fg-secondary">
                      حسب فئة الجودة والحداثة ونمط الوصول (Quality, Freshness & Shared vs Exclusive)
                    </h3>
                    <div className="mt-2 space-y-1.5">
                      {leadsData.byQualityBand?.map((q: any) => (
                        <div
                          key={q.qualityBand}
                          className="flex items-center justify-between rounded-lg bg-canvas px-3 py-1.5 text-xs font-semibold"
                        >
                          <span className="font-mono text-fg-primary">
                            جودة {q.qualityBand} ({q.leadsCount} فرصة)
                          </span>
                          <span className="font-mono text-fg-secondary">
                            فوز: {q.rates?.winRate?.displayValue} | غير صالح: {q.rates?.invalidRate?.displayValue}
                          </span>
                        </div>
                      ))}
                      {leadsData.sharedVsExclusive?.map((acc: any) => (
                        <div
                          key={acc.accessType}
                          className="flex items-center justify-between rounded-lg border border-line-brand bg-brand-soft/40 px-3 py-1.5 text-xs font-bold"
                        >
                          <span className="font-mono text-brand-dark">
                            نمط {acc.accessType} ({acc.leadsCount} فرصة / {acc.claimsCount} شراء)
                          </span>
                          <span className="font-mono text-brand-dark">
                            فوز: {acc.rates?.winRate?.displayValue} | إيراد: {acc.attributedRevenueEgp?.toLocaleString()} ج.م
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Origin Sources Table */}
            {sourcesData && (
              <div className="rounded-2xl border border-line bg-surface p-6 shadow-sm">
                <h2 className="text-base font-extrabold text-fg-primary">
                  أداء المصادر ونسب الإسناد (Primary Origin vs Secondary Enrichment & Verification)
                </h2>
                <p className="text-xs text-fg-muted">
                  يتم إسناد حجم الـ Leads والإيرادات للمصدر الأصلي فقط (Origin Source) لمنع الازدواج الحسابي (Zero Double-Counting).
                </p>
                <div className="mt-4 overflow-x-auto">
                  <table className="w-full text-start text-xs">
                    <thead>
                      <tr className="border-b border-line text-fg-muted">
                        <th className="py-2.5 px-3">المصدر (Source)</th>
                        <th className="py-2.5 px-3">النوع</th>
                        <th className="py-2.5 px-3">كمصدر أصلي (Unique)</th>
                        <th className="py-2.5 px-3">كمصدر إثراء</th>
                        <th className="py-2.5 px-3">التكرارات</th>
                        <th className="py-2.5 px-3">نسبة الشراء (Claim Rate)</th>
                        <th className="py-2.5 px-3">نسبة الفوز (Win Rate)</th>
                        <th className="py-2.5 px-3">غير الصالح</th>
                        <th className="py-2.5 px-3">الإيراد المسند (ج.م)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line font-semibold">
                      {sourcesData.allSourcesSummary?.map((s: any) => (
                        <tr key={s.sourceName}>
                          <td className="py-2.5 px-3 font-mono font-bold text-fg-primary">
                            {s.sourceName}
                          </td>
                          <td className="py-2.5 px-3 text-fg-muted">{s.sourceType}</td>
                          <td className="py-2.5 px-3 font-bold">{s.uniqueLeads}</td>
                          <td className="py-2.5 px-3 text-fg-muted">
                            {s.attribution?.enrichmentLeadsCount ??
                              s.provenance?.enrichmentContributions ??
                              0}
                          </td>
                          <td className="py-2.5 px-3 text-amber-700">{s.duplicates}</td>
                          <td className="py-2.5 px-3">
                            {s.claimRate?.displayValue} ({s.claimRate?.numerator}/
                            {s.claimRate?.denominator})
                          </td>
                          <td className="py-2.5 px-3 text-brand">
                            {s.winRate?.displayValue} ({s.winRate?.numerator}/
                            {s.winRate?.denominator})
                          </td>
                          <td className="py-2.5 px-3 text-danger">{s.invalidLeads}</td>
                          <td className="py-2.5 px-3 font-bold">
                            {s.attributedRevenueEgp?.toLocaleString()} ج.م
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Niches, Locations & Services */}
            <div className="grid gap-6 lg:grid-cols-3">
              <div className="rounded-2xl border border-line bg-surface p-5 shadow-sm">
                <h3 className="text-sm font-extrabold text-fg-primary">
                  أداء القطاعات (Niches / Categories)
                </h3>
                <div className="mt-3 space-y-2">
                  {nichesData?.allNichesSummary?.map((n: any) => (
                    <div
                      key={n.niche}
                      className="flex items-center justify-between rounded-xl border border-line bg-canvas p-3 text-xs"
                    >
                      <div>
                        <span className="font-extrabold text-fg-primary">
                          {n.labelAr || n.niche}
                        </span>
                        <span className="block text-[11px] text-fg-muted">
                          {n.leads} فرصة | {n.claims} مشتراة
                        </span>
                      </div>
                      <div className="text-left">
                        <span className="block font-bold text-brand">
                          فوز: {n.winRate?.displayValue}
                        </span>
                        <span className="block text-[11px] text-fg-muted">
                          {n.revenueEgp?.toLocaleString()} ج.م
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-2xl border border-line bg-surface p-5 shadow-sm">
                <h3 className="text-sm font-extrabold text-fg-primary">
                  أداء المدن والمحافظات (Locations)
                </h3>
                <div className="mt-3 space-y-2">
                  {locationsData?.cities?.map((loc: any) => (
                    <div
                      key={`${loc.governorate}-${loc.city}`}
                      className="flex items-center justify-between rounded-xl border border-line bg-canvas p-3 text-xs"
                    >
                      <div>
                        <span className="font-extrabold text-fg-primary">{loc.city}</span>
                        <span className="block text-[11px] text-fg-muted">
                          {loc.totalLeads} فرصة | {loc.claims} مشتراة
                        </span>
                      </div>
                      <div className="text-left">
                        <span className="block font-bold text-brand">
                          فوز: {loc.winRate?.displayValue}
                        </span>
                        <span className="block text-[11px] text-fg-muted">
                          شراء: {loc.claimRate?.displayValue}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-2xl border border-line bg-surface p-5 shadow-sm">
                <h3 className="text-sm font-extrabold text-fg-primary">
                  أداء الخدمات المطلوبة (Required Services)
                </h3>
                <div className="mt-3 space-y-2">
                  {servicesData?.allServicesSummary?.map((srv: any) => (
                    <div
                      key={srv.service}
                      className="flex items-center justify-between rounded-xl border border-line bg-canvas p-3 text-xs"
                    >
                      <div>
                        <span className="font-extrabold text-fg-primary">
                          {srv.labelAr || srv.service}
                        </span>
                        <span className="block text-[11px] text-fg-muted">
                          {srv.totalLeads} فرصة | {srv.claims} مشتراة
                        </span>
                      </div>
                      <div className="text-left">
                        <span className="block font-bold text-brand">
                          فوز: {srv.winRate?.displayValue}
                        </span>
                        <span className="block text-[11px] text-fg-muted">
                          {srv.revenueEgp?.toLocaleString()} ج.م
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: DEVELOPERS PERFORMANCE */}
        {activeTab === 'developers' && developersData && (
          <div className="rounded-2xl border border-line bg-surface p-6 shadow-sm">
            <h2 className="text-base font-extrabold text-fg-primary">
              لوحة أداء المطورين والمشتركين (Developer Performance & Conversion Table)
            </h2>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-start text-xs">
                <thead>
                  <tr className="border-b border-line text-fg-muted">
                    <th className="py-2.5 px-3">المطور (Developer)</th>
                    <th className="py-2.5 px-3">الباقة</th>
                    <th className="py-2.5 px-3">الـ Leads المشتراة</th>
                    <th className="py-2.5 px-3">معدل التواصل</th>
                    <th className="py-2.5 px-3">معدل الرد</th>
                    <th className="py-2.5 px-3">معدل الاجتماعات</th>
                    <th className="py-2.5 px-3">معدل الفوز (Win Rate)</th>
                    <th className="py-2.5 px-3">النقاط المستهلكة</th>
                    <th className="py-2.5 px-3">قيمة المشاريع المقدرة</th>
                    <th className="py-2.5 px-3">الإيراد المحقق</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line font-semibold">
                  {developersData.developers?.map((dev: any) => (
                    <tr key={dev.developerId}>
                      <td className="py-2.5 px-3">
                        <span className="font-bold text-fg-primary">{dev.name}</span>
                        <span className="block text-[11px] text-fg-muted">{dev.email}</span>
                      </td>
                      <td className="py-2.5 px-3">
                        <span className="rounded bg-brand-soft px-2 py-0.5 text-[11px] font-bold text-brand">
                          {dev.planName}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 font-bold">{dev.leadsClaimed}</td>
                      <td className="py-2.5 px-3">
                        {dev.contactRate?.displayValue} ({dev.contactRate?.numerator}/
                        {dev.contactRate?.denominator})
                      </td>
                      <td className="py-2.5 px-3 text-fg-secondary">
                        {dev.replyRate?.displayValue} ({dev.replyRate?.numerator}/
                        {dev.replyRate?.denominator})
                      </td>
                      <td className="py-2.5 px-3 text-fg-secondary">
                        {dev.meetingRate?.displayValue}
                      </td>
                      <td className="py-2.5 px-3 font-bold text-brand">
                        {dev.winRate?.displayValue} ({dev.winRate?.numerator}/
                        {dev.winRate?.denominator})
                      </td>
                      <td className="py-2.5 px-3 font-mono">{dev.creditsConsumed}</td>
                      <td className="py-2.5 px-3 font-bold text-brand-dark">
                        {dev.estimatedProjectValueEgp?.toLocaleString()} ج.م
                      </td>
                      <td className="py-2.5 px-3">
                        {dev.attributedRevenueEgp?.toLocaleString()} ج.م
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 4: DATA QUALITY DASHBOARD */}
        {activeTab === 'quality' && qualityData && (
          <div className="space-y-6">
            <div className="rounded-2xl border border-line bg-surface p-6 shadow-sm">
              <h2 className="text-base font-extrabold text-fg-primary">
                مؤشرات اكتمال البيانات والتكرارات والحداثة (Data Completeness, Deduplication & Freshness)
              </h2>
              <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <RateCard
                  titleAr="نسبة نقص الهاتف (Missing Phone Rate)"
                  metric={qualityData.summary?.rates?.missingPhoneRate}
                  accent="warning"
                />
                <RateCard
                  titleAr="نسبة نقص البريد (Missing Email Rate)"
                  metric={qualityData.summary?.rates?.missingEmailRate}
                  accent="brand"
                />
                <RateCard
                  titleAr="نسبة الهاتف غير الصالح (Invalid Phone Rate)"
                  metric={qualityData.summary?.rates?.invalidPhoneRate}
                  accent="danger"
                />
                <RateCard
                  titleAr="نسبة التقادم (Stale Lead Rate)"
                  metric={qualityData.summary?.rates?.staleRate}
                  accent="warning"
                />
                <RateCard
                  titleAr="نسبة الحاجة للتحقق (Requires Verification)"
                  metric={qualityData.summary?.rates?.requiresVerificationRate}
                  accent="neutral"
                />
                <RateCard
                  titleAr="نسبة الفرص غير الصالحة (Invalid Lead Rate)"
                  metric={qualityData.summary?.rates?.invalidRate}
                  accent="danger"
                />
              </div>
            </div>

            <div className="rounded-2xl border border-line bg-surface p-6 shadow-sm">
              <h3 className="text-sm font-extrabold text-fg-primary">
                سجل الفرص التي تتطلب معالجة جودة (Problem Leads Queue)
              </h3>
              <div className="mt-3 overflow-x-auto">
                <table className="w-full text-start text-xs">
                  <thead>
                    <tr className="border-b border-line text-fg-muted">
                      <th className="py-2 px-2">اسم النشاط</th>
                      <th className="py-2 px-2">المصدر الأصلي</th>
                      <th className="py-2 px-2">القطاع</th>
                      <th className="py-2 px-2">المدينة</th>
                      <th className="py-2 px-2">درجة الجودة</th>
                      <th className="py-2 px-2">الحداثة</th>
                      <th className="py-2 px-2">المشكلات المرصودة</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line font-semibold">
                    {qualityData.problemLeads?.map((p: any) => (
                      <tr key={p.leadId}>
                        <td className="py-2 px-2 font-bold text-fg-primary">{p.businessName}</td>
                        <td className="py-2 px-2 font-mono">{p.source}</td>
                        <td className="py-2 px-2">{p.niche}</td>
                        <td className="py-2 px-2">{p.city}</td>
                        <td className="py-2 px-2 font-mono">{p.qualityScore}</td>
                        <td className="py-2 px-2">{p.freshness}</td>
                        <td className="py-2 px-2 font-mono text-danger">
                          {p.issues?.join(' | ')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* TAB 5: RULE PERFORMANCE & HUMAN-REVIEWED FLYWHEEL QUEUE */}
        {activeTab === 'flywheel' && (
          <div className="space-y-6">
            {/* Governance Safeguard Callout */}
            <div className="rounded-2xl border border-line-brand bg-brand-soft/40 p-5">
              <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
                <div>
                  <span className="rounded bg-brand-soft px-2 py-0.5 text-[10px] font-extrabold text-brand-dark">
                    HUMAN-IN-THE-LOOP GOVERNANCE
                  </span>
                  <h2 className="mt-1 text-base font-extrabold text-brand-dark">
                    حلقة تحسين القواعد الحتمية وطابور المراجعة البشرية (Deterministic Rule Review Queue)
                  </h2>
                  <p className="mt-0.5 text-xs text-brand">
                    لا يتم تعديل أي أوزان أو قواعد إنتاجية تلقائياً. يقوم المحرك بحساب الفارق الإحصائي (Lift / Delta) مقارنةً بخط الأساس مع اشتراط الحد الأدنى لحجم العينة، ثم يضع المقترحات في طابور المراجعة لاعتمادها أو رفضها من مدير النظام.
                  </p>
                </div>

                <button
                  onClick={handleGenerateRuleCandidates}
                  disabled={actionBusy === 'generate-candidates'}
                  className="shrink-0 rounded-xl bg-brand px-4 py-2.5 text-xs font-extrabold text-white shadow-sm hover:bg-brand-hover"
                >
                  {actionBusy === 'generate-candidates'
                    ? 'جاري الفحص الحتمي...'
                    : 'توليد مقترحات المراجعة من البيانات (Scan & Generate Candidates)'}
                </button>
              </div>
            </div>

            {/* Rule Review Candidates Queue */}
            <div className="rounded-2xl border border-line bg-surface p-6 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h3 className="text-base font-extrabold text-fg-primary">
                  طابور مراجعة القواعد (RuleReviewCandidate Queue)
                </h3>
                <div className="flex items-center gap-2">
                  <select
                    value={reviewStatusFilter}
                    onChange={(e) => setReviewStatusFilter(e.target.value)}
                    className="rounded-xl border border-line bg-canvas px-3 py-1.5 text-xs font-bold"
                  >
                    <option value="">كل الحالات</option>
                    <option value="OPEN">مفتوح (OPEN)</option>
                    <option value="UNDER_REVIEW">قيد المراجعة (UNDER_REVIEW)</option>
                    <option value="APPROVED">معتمد (APPROVED)</option>
                    <option value="REJECTED">مرفوض (REJECTED)</option>
                    <option value="DEFERRED">مؤجل (DEFERRED)</option>
                  </select>

                  <select
                    value={reviewTypeFilter}
                    onChange={(e) => setReviewTypeFilter(e.target.value)}
                    className="rounded-xl border border-line bg-canvas px-3 py-1.5 text-xs font-bold"
                  >
                    <option value="">كل أنواع القواعد</option>
                    <option value="SCORING">التقييم (SCORING)</option>
                    <option value="MATCHING">المطابقة (MATCHING)</option>
                    <option value="QUALITY">الجودة (QUALITY)</option>
                  </select>
                </div>
              </div>

              <div className="mt-4 space-y-3">
                {reviewCandidatesData?.candidates?.length === 0 ? (
                  <p className="py-6 text-center text-xs font-semibold text-fg-muted">
                    لا توجد مقترحات مطابقة للفلاتر الحالية.
                  </p>
                ) : (
                  reviewCandidatesData?.candidates?.map((cand: any) => (
                    <div
                      key={cand.id}
                      className="rounded-xl border border-line bg-canvas/70 p-4 text-xs"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="rounded bg-slate-900 px-2 py-0.5 font-mono text-[10px] font-bold text-white">
                            {cand.ruleType}
                          </span>
                          <span className="font-mono text-sm font-extrabold text-fg-primary">
                            {cand.ruleKey}
                          </span>
                          <span className="rounded bg-slate-200 px-2 py-0.5 font-mono text-[10px] text-fg-secondary">
                            {cand.ruleVersion}
                          </span>
                        </div>
                        <span
                          className={`rounded-full px-2.5 py-0.5 text-[11px] font-extrabold ${
                            cand.status === 'APPROVED'
                              ? 'bg-brand-soft text-brand-dark'
                              : cand.status === 'REJECTED'
                                ? 'bg-red-100 text-red-800'
                                : cand.status === 'DEFERRED'
                                  ? 'bg-amber-100 text-amber-800'
                                  : 'bg-surface-subtle text-fg-secondary'
                          }`}
                        >
                          {cand.status}
                        </span>
                      </div>

                      <p className="mt-2 font-bold text-brand-dark">{cand.recommendation}</p>
                      {cand.decision && (
                        <p className="mt-1 font-semibold text-fg-secondary">
                          قرار المراجع: {cand.decision} {cand.notes ? `— ${cand.notes}` : ''}
                        </p>
                      )}

                      <div className="mt-2 flex flex-wrap items-center gap-4 font-mono text-[11px] text-fg-secondary">
                        <span>
                          حجم العينة: {cand.sampleSize} (الحد الأدنى: {cand.minimumSampleSize})
                        </span>
                        <span>خط الأساس (Baseline): {(cand.baselineValue * 100).toFixed(1)}%</span>
                        <span>المعدل الملاحظ (Observed): {(cand.observedValue * 100).toFixed(1)}%</span>
                        <span
                          className={
                            cand.absoluteDifference >= 0
                              ? 'font-bold text-brand'
                              : 'font-bold text-danger'
                          }
                        >
                          الفارق (Delta): {(cand.absoluteDifference * 100).toFixed(1)}%
                        </span>
                      </div>

                      <div className="mt-3 flex flex-col gap-2 border-t border-line pt-3 sm:flex-row sm:items-center sm:justify-between">
                        <input
                          type="text"
                          placeholder="ملاحظات قرار المراجعة البشرية (Decision Notes)..."
                          value={decisionNotesMap[cand.id] ?? cand.notes ?? ''}
                          onChange={(e) =>
                            setDecisionNotesMap((prev) => ({
                              ...prev,
                              [cand.id]: e.target.value,
                            }))
                          }
                          className="flex-1 rounded-lg border border-line bg-surface px-3 py-1.5 text-xs"
                        />
                        <div className="flex flex-wrap items-center gap-1.5">
                          <button
                            onClick={() => handleCandidateDecision(cand.id, 'APPROVED')}
                            disabled={actionBusy === cand.id}
                            className="rounded-lg bg-brand px-3 py-1.5 text-xs font-bold text-white hover:bg-brand-hover"
                          >
                            اعتماد (Approve)
                          </button>
                          <button
                            onClick={() => handleCandidateDecision(cand.id, 'DEFERRED')}
                            disabled={actionBusy === cand.id}
                            className="rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-bold text-white hover:bg-amber-600"
                          >
                            تأجيل (Defer)
                          </button>
                          <button
                            onClick={() => handleCandidateDecision(cand.id, 'REJECTED')}
                            disabled={actionBusy === cand.id}
                            className="rounded-lg bg-danger px-3 py-1.5 text-xs font-bold text-white hover:bg-red-700"
                          >
                            رفض (Reject)
                          </button>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Scoring, Matching & Quality Rule Performance Table */}
            {rulesData && (
              <div className="rounded-2xl border border-line bg-surface p-6 shadow-sm">
                <h3 className="text-base font-extrabold text-fg-primary">
                  جدول الأداء الإحصائي لقواعد التقييم والمطابقة والجودة (Rule Performance vs Baseline)
                </h3>
                <div className="mt-4 overflow-x-auto">
                  <table className="w-full text-start text-xs">
                    <thead>
                      <tr className="border-b border-line text-fg-muted">
                        <th className="py-2.5 px-3">نوع القاعدة</th>
                        <th className="py-2.5 px-3">مفتاح القاعدة (Rule Key)</th>
                        <th className="py-2.5 px-3">النقاط</th>
                        <th className="py-2.5 px-3">الفرص المتأثرة</th>
                        <th className="py-2.5 px-3">حجم العينة (Sample)</th>
                        <th className="py-2.5 px-3">معدل الفوز مع القاعدة</th>
                        <th className="py-2.5 px-3">معدل الفوز بدونها</th>
                        <th className="py-2.5 px-3">الفارق (Lift)</th>
                        <th className="py-2.5 px-3">الحالة الإحصائية</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line font-semibold">
                      {rulesData.allRules?.map((r: any) => (
                        <tr key={`${r.ruleType}-${r.ruleKey}`}>
                          <td className="py-2.5 px-3 font-mono text-[11px] font-bold text-fg-secondary">
                            {r.ruleType}
                          </td>
                          <td className="py-2.5 px-3">
                            <span className="font-mono font-bold text-fg-primary">{r.ruleKey}</span>
                            <span className="block text-[11px] text-fg-muted">{r.ruleName}</span>
                          </td>
                          <td className="py-2.5 px-3 font-mono">
                            {r.points >= 0 ? `+${r.points}` : r.points}
                          </td>
                          <td className="py-2.5 px-3">{r.leadsAffected}</td>
                          <td className="py-2.5 px-3 font-mono">
                            {r.sampleSize}{' '}
                            {r.sampleStatus === 'INSUFFICIENT_SAMPLE' && (
                              <span className="text-[10px] text-amber-600">
                                (&lt;{r.minimumSampleSize})
                              </span>
                            )}
                          </td>
                          <td className="py-2.5 px-3 text-brand">
                            {r.withRule?.winRate?.displayValue} ({r.withRule?.winRate?.numerator}/
                            {r.withRule?.winRate?.denominator})
                          </td>
                          <td className="py-2.5 px-3 text-fg-secondary">
                            {r.withoutRule?.winRate?.displayValue}
                          </td>
                          <td className="py-2.5 px-3 font-mono">
                            {r.comparison?.winRateLiftAbsolute !== null &&
                            r.comparison?.winRateLiftAbsolute !== undefined ? (
                              <span
                                className={
                                  r.comparison.winRateLiftAbsolute >= 0
                                    ? 'text-brand'
                                    : 'text-danger'
                                }
                              >
                                {(r.comparison.winRateLiftAbsolute * 100).toFixed(1)}%
                              </span>
                            ) : (
                              '—'
                            )}
                          </td>
                          <td className="py-2.5 px-3">
                            <span
                              className={`rounded-full px-2.5 py-0.5 font-mono text-[10px] font-extrabold ${
                                r.comparison?.flaggedForReview
                                  ? 'bg-red-100 text-red-800'
                                  : r.sampleStatus === 'INSUFFICIENT_SAMPLE'
                                    ? 'bg-slate-100 text-fg-secondary'
                                    : 'bg-brand-soft text-brand-dark'
                              }`}
                            >
                              {r.comparison?.flaggedForReview
                                ? 'FLAGGED_FOR_REVIEW'
                                : r.sampleStatus}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </AppShell>
  );
}
