'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { AppShell } from '@/components/domain/AppShell';
import { PageHeader } from '@/components/domain/PageHeader';
import { StatTile } from '@/components/domain/StatTile';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/Card';
import { BarList } from '@/components/ui/BarList';
import { Select } from '@/components/ui/Select';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/Table';
import { Banner } from '@/components/ui/Banner';
import { Tabs } from '@/components/ui/Tabs';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
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
  const isOutOfRange = metric.status !== 'VALID' || accent === 'danger';
  const displayVal =
    metric.status === 'INSUFFICIENT_DATA'
      ? '—'
      : metric.percentage !== null
        ? `${metric.percentage}%`
        : metric.displayValue;

  const desc = `${metric.nameAr || metric.name || metric.label || ''} (${metric.numerator}/${metric.denominator})${
    metric.status !== 'VALID' ? ` • ${metric.status}` : ''
  }`;

  return (
    <StatTile
      label={titleAr}
      value={displayVal}
      statusText={desc}
      isOutOfRange={isOutOfRange}
    />
  );
}

function StatCard({
  titleAr,
  subtitleEn,
  value,
  unit = '',
}: {
  titleAr: string;
  subtitleEn?: string;
  value: number | string | null | undefined;
  unit?: string;
}) {
  const isNull = value === null || value === undefined;

  return (
    <StatTile
      label={titleAr}
      value={isNull ? '—' : value}
      unit={unit}
      statusText={subtitleEn}
    />
  );
}

export default function AdminAnalyticsHubPage() {
  const t = useTranslations('adminAnalytics');
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
          `تم حفظ لقطة المؤشرات اليومية (${data.dateKey}) بنجاح - عدد المؤشرات المسجلة: ${data.snapshotsCount}`
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
          `تم فحص الأداء التراكمي للقواعد حتمياً - تم توليد/تحديث ${
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
    <AppShell isAdmin={true} density="compact" pageTitle={t('pageTitle')}>
      <div className="space-y-6">
        <PageHeader
          title={t('title')}
          description={t('desc')}
          actions={
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={loadAnalytics}
                disabled={loading}
                className="gap-1.5"
              >
                <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                <span>{t('btnRefresh')}</span>
              </Button>

              <a
                href={`/api/admin/analytics/export?report=${exportReportType}&${buildQueryString()}`}
                className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-3.5 py-1.5 text-caption font-semibold text-fg-on-brand shadow-xs hover:bg-brand-hover transition-colors"
              >
                <Download className="h-4 w-4 rtl:-scale-x-100" />
                <span>{t('btnExport')}</span>
              </a>
            </div>
          }
        />

        {/* Global Filter Bar */}
        <Card className="p-4">
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-fg-secondary">
              <Filter className="h-4 w-4 text-brand" />
              <span>تصفية الأتراب (Cohort Filters):</span>
            </div>

            <div className="w-48">
              <Select
                value={preset}
                onChange={(e) => setPreset(e.target.value)}
                options={[
                  { value: 'all_time', label: 'كل الفترات (All Time)' },
                  { value: 'today', label: 'اليوم (Today)' },
                  { value: 'yesterday', label: 'أمس (Yesterday)' },
                  { value: 'last_7_days', label: 'آخر 7 أيام (Last 7 Days)' },
                  { value: 'last_30_days', label: 'آخر 30 يومًا (Last 30 Days)' },
                  { value: 'last_90_days', label: 'آخر 90 يومًا (Last 90 Days)' },
                  { value: 'month_to_date', label: 'الشهر الحالي (MTD)' },
                  { value: 'previous_month', label: 'الشهر السابق (Previous Month)' },
                  { value: 'custom', label: 'فترة مخصصة (Custom Range)' },
                ]}
              />
            </div>

            {preset === 'custom' && (
              <>
                <div className="w-36">
                  <Input
                    type="date"
                    value={fromDate}
                    onChange={(e) => setFromDate(e.target.value)}
                  />
                </div>
                <div className="w-36">
                  <Input
                    type="date"
                    value={toDate}
                    onChange={(e) => setToDate(e.target.value)}
                  />
                </div>
              </>
            )}

            <div className="w-36">
              <Input
                type="text"
                placeholder="المصدر (Source)"
                value={sourceFilter}
                onChange={(e) => setSourceFilter(e.target.value)}
              />
            </div>

            <div className="w-32">
              <Input
                type="text"
                placeholder="القطاع (Niche)"
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
              />
            </div>

            <div className="w-32">
              <Input
                type="text"
                placeholder="المدينة (City)"
                value={cityFilter}
                onChange={(e) => setCityFilter(e.target.value)}
              />
            </div>

            <div className="w-36">
              <Input
                type="text"
                placeholder="الخدمة (Service)"
                value={serviceFilter}
                onChange={(e) => setServiceFilter(e.target.value)}
              />
            </div>

            <div className="w-44">
              <Select
                value={scoreBandFilter}
                onChange={(e) => setScoreBandFilter(e.target.value)}
                options={[
                  { value: '', label: 'كل درجات الفرص (Score Band)' },
                  { value: 'PREMIUM', label: 'PREMIUM' },
                  { value: 'HOT', label: 'HOT' },
                  { value: 'WARM', label: 'WARM' },
                  { value: 'COLD', label: 'COLD' },
                ]}
              />
            </div>

            <div className="w-44">
              <Select
                value={qualityBandFilter}
                onChange={(e) => setQualityBandFilter(e.target.value)}
                options={[
                  { value: '', label: 'كل فئات الجودة (Quality Band)' },
                  { value: 'EXCELLENT', label: 'EXCELLENT' },
                  { value: 'HIGH', label: 'HIGH' },
                  { value: 'MEDIUM', label: 'MEDIUM' },
                  { value: 'LOW', label: 'LOW' },
                  { value: 'VERY_LOW', label: 'VERY_LOW' },
                ]}
              />
            </div>

            <div className="w-44">
              <Select
                value={freshnessFilter}
                onChange={(e) => setFreshnessFilter(e.target.value)}
                options={[
                  { value: '', label: 'كل حالات الحداثة (Freshness)' },
                  { value: 'FRESH', label: 'FRESH' },
                  { value: 'RECENT', label: 'RECENT' },
                  { value: 'NEEDS_VERIFICATION', label: 'NEEDS_VERIFICATION' },
                  { value: 'STALE', label: 'STALE' },
                  { value: 'VERY_STALE', label: 'VERY_STALE' },
                ]}
              />
            </div>

            <div className="w-44">
              <Select
                value={claimModeFilter}
                onChange={(e) => setClaimModeFilter(e.target.value)}
                options={[
                  { value: '', label: 'كل أنماط الشراء (Access Type)' },
                  { value: 'SHARED', label: 'مشترك (SHARED)' },
                  { value: 'EXCLUSIVE', label: 'حصري (EXCLUSIVE)' },
                ]}
              />
            </div>

            <div className="w-40">
              <Input
                type="text"
                placeholder="معرف المطور (Developer ID)"
                value={developerFilter}
                onChange={(e) => setDeveloperFilter(e.target.value)}
              />
            </div>

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
              <Button
                variant="ghost"
                size="sm"
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
                className="text-danger-text hover:text-danger-text hover:bg-danger-bg"
              >
                إعادة ضبط الفلاتر
              </Button>
            )}
          </div>
        </Card>

        {/* 5 Dashboard Navigation Tabs */}
        <Tabs
          tabs={[
            {
              id: 'executive',
              label: t('tabExecutive'),
              icon: <BarChart3 className="h-4 w-4" />,
            },
            {
              id: 'leads',
              label: t('tabLeads'),
              icon: <TrendingUp className="h-4 w-4" />,
            },
            {
              id: 'developers',
              label: t('tabDevelopers'),
              icon: <Users className="h-4 w-4" />,
            },
            {
              id: 'quality',
              label: t('tabQuality'),
              icon: <Database className="h-4 w-4" />,
            },
            {
              id: 'flywheel',
              label: t('tabFlywheel'),
              icon: <Sliders className="h-4 w-4" />,
            },
          ]}
          activeTab={activeTab}
          onChange={(id) => setActiveTab(id as DashboardTab)}
          variant="segmented"
        />

        {bannerMessage && (
          <Banner variant="info" onClose={() => setBannerMessage(null)}>
            {bannerMessage}
          </Banner>
        )}

        {loading && (
          <div className="space-y-4">
            <Skeleton className="h-20 w-full rounded-xl" />
            <Skeleton className="h-96 w-full rounded-xl" />
          </div>
        )}

        {!loading && !overviewData && (
          <EmptyState
            title={t('emptyTitle')}
            description={t('emptyDesc')}
          />
        )}

        {/* TAB 1: EXECUTIVE DASHBOARD */}
        {activeTab === 'executive' && overviewData && (
          <div className="space-y-6">
            {/* Layer 1 & Layer 2 Summary */}
            <Card>
              <CardHeader>
                <div className="flex flex-wrap items-center justify-between gap-2 w-full">
                  <CardTitle>
                    الطبقة 1 و 2: مخزون الفرص وجودة البيانات (Inventory & Quality Metrics)
                  </CardTitle>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={handleMaterializeSnapshot}
                    disabled={actionBusy === 'snapshot'}
                  >
                    {actionBusy === 'snapshot'
                      ? 'جاري حفظ اللقطة...'
                      : 'حفظ لقطة المؤشرات اليومية (Materialize Daily Snapshot)'}
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
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
              </CardContent>
            </Card>

            {/* Layer 4 & 5: Matching & Sales Funnel */}
            <Card>
              <CardHeader>
                <CardTitle>
                  الطبقة 4 و 5: محرك المطابقة وقمع المبيعات (Matching & Sales Funnel Rates)
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
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
              </CardContent>
            </Card>

            {/* Layer 6: Economics & Revenue */}
            <Card>
              <CardHeader>
                <CardTitle>
                  الطبقة 6: الاقتصاديات والإيرادات المحققة (Economics & Realized Revenue)
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
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
              </CardContent>
            </Card>

            {/* Deterministic Operational Anomaly Flags */}
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-warning-icon" />
                  <CardTitle>
                    التنبيهات التشخيصية الحتمية (Deterministic Operational Anomaly Flags)
                  </CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-2.5">
                  {overviewData.anomalyFlags?.length === 0 ? (
                    <p className="text-caption text-fg-muted">
                      لا توجد انحرافات تشغيلية تتجاوز العتبات الحتمية في هذه الفترة.
                    </p>
                  ) : (
                    overviewData.anomalyFlags?.map((anom: any, idx: number) => (
                      <div
                        key={`${anom.code}-${idx}`}
                        className={`flex flex-col justify-between gap-2 rounded-xl border p-3.5 text-caption sm:flex-row sm:items-center ${
                          anom.severity === 'CRITICAL'
                            ? 'border-danger-border bg-danger-bg text-danger-text'
                            : anom.severity === 'WARNING'
                              ? 'border-warning-border bg-warning-bg text-warning-text'
                              : 'border-line bg-surface text-fg-primary'
                        }`}
                      >
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="rounded bg-surface px-2 py-0.5 text-caption font-bold">
                              {anom.code}
                            </span>
                            <span className="font-semibold">
                              [{anom.entityType}: {anom.entityKey}]
                            </span>
                          </div>
                          <p className="mt-1 font-medium">
                            {anom.explanationAr || anom.explanation}
                          </p>
                        </div>
                        <div className="shrink-0 text-caption font-semibold tabular-nums">
                          Observed: {anom.observedValue} | Threshold: {anom.thresholdValue} |{' '}
                          {anom.numerator}/{anom.denominator}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* TAB 2: LEAD, SOURCE, NICHE, LOCATION, SERVICE & FUNNEL PERFORMANCE */}
        {activeTab === 'leads' && (
          <div className="space-y-6">
            {/* Funnel & Reasons */}
            {funnelData && (
              <Card>
                <CardHeader>
                  <CardTitle>
                    تفصيل قمع المبيعات، المقامات، وأسباب الخسارة وعدم الصلاحية (Funnel & Reason Analysis)
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <BarList
                    items={funnelData.funnel?.stages?.map((st: any) => ({
                      label: `${st.stage} (${st.conversionFromClaimed?.displayValue || ''} من المشتراة)`,
                      value: st.count,
                    })) || []}
                  />

                  {/* Lost & Invalid Reasons */}
                  <div className="mt-6 grid gap-6 lg:grid-cols-2 pt-6 border-t border-line">
                    <div>
                      <h3 className="text-body-sm font-semibold text-fg-secondary mb-3">
                        توزيع أسباب خسارة الصفقات (Lost Deal Reasons)
                      </h3>
                      {funnelData.lostReasonAnalysis?.reasons?.length > 0 ? (
                        <BarList
                          items={funnelData.lostReasonAnalysis.reasons.map((r: any) => ({
                            label: r.reasonCode,
                            value: r.count,
                            secondaryText: r.rate?.displayValue,
                          }))}
                        />
                      ) : (
                        <p className="text-caption text-fg-muted">لا توجد حالات مسجلة</p>
                      )}
                    </div>
                    <div>
                      <h3 className="text-body-sm font-semibold text-fg-secondary mb-3">
                        توزيع أسباب عدم الصلاحية والاسترداد (Invalid Lead Reasons)
                      </h3>
                      {funnelData.invalidReasonAnalysis?.reasons?.length > 0 ? (
                        <BarList
                          items={funnelData.invalidReasonAnalysis.reasons.map((r: any) => ({
                            label: r.reasonCode,
                            value: r.count,
                            secondaryText: r.rate?.displayValue,
                          }))}
                        />
                      ) : (
                        <p className="text-caption text-fg-muted">لا توجد حالات مسجلة</p>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Lead Performance Breakdowns */}
            {leadsData && (
              <Card>
                <CardHeader>
                  <CardTitle>
                    أداء الفرص حسب درجة الفرصة، الجودة، الحداثة، ونمط الشراء (Lead Performance Breakdowns)
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-6 lg:grid-cols-2">
                    <div>
                      <h3 className="text-body-sm font-semibold text-fg-secondary mb-3">
                        حسب فئة درجة الفرصة (Opportunity Score Bands)
                      </h3>
                      <BarList
                        items={leadsData.byScoreBand?.map((b: any) => ({
                          label: `${b.scoreBand} (شراء: ${b.rates?.claimRate?.displayValue || '-'} | فوز: ${b.rates?.winRate?.displayValue || '-'})`,
                          value: b.leadsCount,
                          secondaryText: `${b.claimsCount} شراء`,
                        })) || []}
                      />
                    </div>
                    <div>
                      <h3 className="text-body-sm font-semibold text-fg-secondary mb-3">
                        حسب فئة الجودة والحداثة ونمط الوصول (Quality & Freshness)
                      </h3>
                      <BarList
                        items={leadsData.byQualityBand?.map((q: any) => ({
                          label: `جودة ${q.qualityBand} (فوز: ${q.rates?.winRate?.displayValue || '-'})`,
                          value: q.leadsCount,
                        })) || []}
                      />
                      {leadsData.sharedVsExclusive && (
                        <div className="mt-4 pt-4 border-t border-line space-y-2">
                          {leadsData.sharedVsExclusive.map((acc: any) => (
                            <div
                              key={acc.accessType}
                              className="flex items-center justify-between rounded-lg border border-line-brand bg-brand-soft px-3 py-2 text-caption font-bold"
                            >
                              <span className="text-brand tabular-nums">
                                نمط {acc.accessType} ({acc.leadsCount} فرصة / {acc.claimsCount} شراء)
                              </span>
                              <span className="text-brand tabular-nums">
                                فوز: {acc.rates?.winRate?.displayValue} | إيراد: {acc.attributedRevenueEgp?.toLocaleString('en-US')} ج.م
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Origin Sources Table */}
            {sourcesData && (
              <Card>
                <CardHeader>
                  <div>
                    <CardTitle>
                      أداء المصادر ونسب الإسناد (Primary Origin vs Secondary Enrichment & Verification)
                    </CardTitle>
                    <CardDescription>
                      يتم إسناد حجم الـ Leads والإيرادات للمصدر الأصلي فقط (Origin Source) لمنع الازدواج الحسابي (Zero Double-Counting).
                    </CardDescription>
                  </div>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>المصدر (Source)</TableHead>
                        <TableHead>النوع</TableHead>
                        <TableHead isNumeric>كمصدر أصلي</TableHead>
                        <TableHead isNumeric>كمصدر إثراء</TableHead>
                        <TableHead isNumeric>التكرارات</TableHead>
                        <TableHead isNumeric>نسبة الشراء</TableHead>
                        <TableHead isNumeric>نسبة الفوز</TableHead>
                        <TableHead isNumeric>غير الصالح</TableHead>
                        <TableHead isNumeric>الإيراد المسند (ج.م)</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {sourcesData.allSourcesSummary?.map((s: any) => (
                        <TableRow key={s.sourceName}>
                          <TableCell className="font-bold text-fg-primary">{s.sourceName}</TableCell>
                          <TableCell className="text-fg-secondary">{s.sourceType}</TableCell>
                          <TableCell isNumeric className="font-bold">{s.uniqueLeads}</TableCell>
                          <TableCell isNumeric className="text-fg-secondary">
                            {s.attribution?.enrichmentLeadsCount ??
                              s.provenance?.enrichmentContributions ??
                              0}
                          </TableCell>
                          <TableCell isNumeric className="text-warning-text">{s.duplicates}</TableCell>
                          <TableCell isNumeric>
                            {s.claimRate?.displayValue} ({s.claimRate?.numerator}/
                            {s.claimRate?.denominator})
                          </TableCell>
                          <TableCell isNumeric className="text-brand font-semibold">
                            {s.winRate?.displayValue} ({s.winRate?.numerator}/
                            {s.winRate?.denominator})
                          </TableCell>
                          <TableCell isNumeric className="text-danger-text">{s.invalidLeads}</TableCell>
                          <TableCell isNumeric className="font-bold">
                            {s.attributedRevenueEgp?.toLocaleString('en-US')} ج.م
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            )}

            {/* Niches, Locations & Services */}
            <div className="grid gap-6 lg:grid-cols-3">
              <Card>
                <CardHeader>
                  <CardTitle>أداء القطاعات (Niches / Categories)</CardTitle>
                </CardHeader>
                <CardContent>
                  <BarList
                    items={nichesData?.allNichesSummary?.map((n: any) => ({
                      label: n.labelAr || n.niche,
                      value: n.leads,
                      secondaryText: `فوز: ${n.winRate?.displayValue || '-'} (${n.claims} مشتراة)`,
                    })) || []}
                  />
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>أداء المدن والمحافظات (Locations)</CardTitle>
                </CardHeader>
                <CardContent>
                  <BarList
                    items={locationsData?.cities?.map((loc: any) => ({
                      label: loc.city,
                      value: loc.totalLeads,
                      secondaryText: `فوز: ${loc.winRate?.displayValue || '-'} (${loc.claims} مشتراة)`,
                    })) || []}
                  />
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>أداء الخدمات المطلوبة (Required Services)</CardTitle>
                </CardHeader>
                <CardContent>
                  <BarList
                    items={servicesData?.allServicesSummary?.map((srv: any) => ({
                      label: srv.labelAr || srv.service,
                      value: srv.totalLeads,
                      secondaryText: `فوز: ${srv.winRate?.displayValue || '-'} (${srv.claims} مشتراة)`,
                    })) || []}
                  />
                </CardContent>
              </Card>
            </div>
          </div>
        )}

        {/* TAB 3: DEVELOPERS PERFORMANCE */}
        {activeTab === 'developers' && developersData && (
          <Card>
            <CardHeader>
              <CardTitle>
                لوحة أداء المطورين والمشتركين (Developer Performance & Conversion Table)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>المطور (Developer)</TableHead>
                    <TableHead>الباقة</TableHead>
                    <TableHead isNumeric>الـ Leads المشتراة</TableHead>
                    <TableHead isNumeric>معدل التواصل</TableHead>
                    <TableHead isNumeric>معدل الرد</TableHead>
                    <TableHead isNumeric>معدل الاجتماعات</TableHead>
                    <TableHead isNumeric>معدل الفوز</TableHead>
                    <TableHead isNumeric>النقاط المستهلكة</TableHead>
                    <TableHead isNumeric>قيمة المشاريع المقدرة</TableHead>
                    <TableHead isNumeric>الإيراد المحقق</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {developersData.developers?.map((dev: any) => (
                    <TableRow key={dev.developerId}>
                      <TableCell>
                        <span className="font-bold text-fg-primary block">{dev.name}</span>
                        <span className="text-caption text-fg-secondary block">{dev.email}</span>
                      </TableCell>
                      <TableCell>
                        <Badge variant="brand">{dev.planName}</Badge>
                      </TableCell>
                      <TableCell isNumeric className="font-bold">{dev.leadsClaimed}</TableCell>
                      <TableCell isNumeric>
                        {dev.contactRate?.displayValue} ({dev.contactRate?.numerator}/{dev.contactRate?.denominator})
                      </TableCell>
                      <TableCell isNumeric className="text-fg-secondary">
                        {dev.replyRate?.displayValue} ({dev.replyRate?.numerator}/{dev.replyRate?.denominator})
                      </TableCell>
                      <TableCell isNumeric className="text-fg-secondary">
                        {dev.meetingRate?.displayValue}
                      </TableCell>
                      <TableCell isNumeric className="font-bold text-brand">
                        {dev.winRate?.displayValue} ({dev.winRate?.numerator}/{dev.winRate?.denominator})
                      </TableCell>
                      <TableCell isNumeric>{dev.creditsConsumed}</TableCell>
                      <TableCell isNumeric className="font-bold text-brand">
                        {dev.estimatedProjectValueEgp?.toLocaleString('en-US')} ج.م
                      </TableCell>
                      <TableCell isNumeric>
                        {dev.attributedRevenueEgp?.toLocaleString('en-US')} ج.م
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}

        {/* TAB 4: DATA QUALITY DASHBOARD */}
        {activeTab === 'quality' && qualityData && (
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>
                  مؤشرات اكتمال البيانات والتكرارات والحداثة (Data Completeness, Deduplication & Freshness)
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
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
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>
                  سجل الفرص التي تتطلب معالجة جودة (Problem Leads Queue)
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>اسم النشاط</TableHead>
                      <TableHead>المصدر الأصلي</TableHead>
                      <TableHead>القطاع</TableHead>
                      <TableHead>المدينة</TableHead>
                      <TableHead isNumeric>درجة الجودة</TableHead>
                      <TableHead>الحداثة</TableHead>
                      <TableHead>المشكلات المرصودة</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {qualityData.problemLeads?.map((p: any) => (
                      <TableRow key={p.leadId}>
                        <TableCell className="font-bold text-fg-primary">{p.businessName}</TableCell>
                        <TableCell>{p.source}</TableCell>
                        <TableCell>{p.niche}</TableCell>
                        <TableCell>{p.city}</TableCell>
                        <TableCell isNumeric className="font-bold">{p.qualityScore}</TableCell>
                        <TableCell>{p.freshness}</TableCell>
                        <TableCell className="text-danger-text">
                          {p.issues?.join(' | ')}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>
        )}

        {/* TAB 5: RULE PERFORMANCE & HUMAN-REVIEWED FLYWHEEL QUEUE */}
        {activeTab === 'flywheel' && (
          <div className="space-y-6">
            {/* Governance Safeguard Callout */}
            <Card className="border-line-brand bg-brand-soft">
              <CardContent className="p-5">
                <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
                  <div>
                    <span className="rounded bg-brand-soft px-2 py-0.5 text-caption font-bold text-brand">
                      HUMAN-IN-THE-LOOP GOVERNANCE
                    </span>
                    <h2 className="mt-1 text-base font-bold text-brand">
                      حلقة تحسين القواعد الحتمية وطابور المراجعة البشرية (Deterministic Rule Review Queue)
                    </h2>
                    <p className="mt-0.5 text-caption text-brand">
                      لا يتم تعديل أي أوزان أو قواعد إنتاجية تلقائياً. يقوم المحرك بحساب الفارق الإحصائي (Lift / Delta) مقارنةً بخط الأساس مع اشتراط الحد الأدنى لحجم العينة، ثم يضع المقترحات في طابور المراجعة لاعتمادها أو رفضها من مدير النظام.
                    </p>
                  </div>

                  <Button
                    variant="primary"
                    size="md"
                    onClick={handleGenerateRuleCandidates}
                    disabled={actionBusy === 'generate-candidates'}
                    className="shrink-0"
                  >
                    {actionBusy === 'generate-candidates'
                      ? 'جاري الفحص الحتمي...'
                      : 'توليد مقترحات المراجعة من البيانات (Scan & Generate Candidates)'}
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Rule Review Candidates Queue */}
            <Card>
              <CardHeader>
                <div className="flex flex-wrap items-center justify-between gap-3 w-full">
                  <CardTitle>
                    طابور مراجعة القواعد (RuleReviewCandidate Queue)
                  </CardTitle>
                  <div className="flex items-center gap-2">
                    <div className="w-40">
                      <Select
                        value={reviewStatusFilter}
                        onChange={(e) => setReviewStatusFilter(e.target.value)}
                        options={[
                          { value: '', label: 'كل الحالات' },
                          { value: 'OPEN', label: 'مفتوح (OPEN)' },
                          { value: 'UNDER_REVIEW', label: 'قيد المراجعة (UNDER_REVIEW)' },
                          { value: 'APPROVED', label: 'معتمد (APPROVED)' },
                          { value: 'REJECTED', label: 'مرفوض (REJECTED)' },
                          { value: 'DEFERRED', label: 'مؤجل (DEFERRED)' },
                        ]}
                      />
                    </div>

                    <div className="w-40">
                      <Select
                        value={reviewTypeFilter}
                        onChange={(e) => setReviewTypeFilter(e.target.value)}
                        options={[
                          { value: '', label: 'كل أنواع القواعد' },
                          { value: 'SCORING', label: 'التقييم (SCORING)' },
                          { value: 'MATCHING', label: 'المطابقة (MATCHING)' },
                          { value: 'QUALITY', label: 'الجودة (QUALITY)' },
                        ]}
                      />
                    </div>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {reviewCandidatesData?.candidates?.length === 0 ? (
                    <p className="py-6 text-center text-caption font-semibold text-fg-muted">
                      لا توجد مقترحات مطابقة للفلاتر الحالية.
                    </p>
                  ) : (
                    reviewCandidatesData?.candidates?.map((cand: any) => (
                      <div
                        key={cand.id}
                        className="rounded-xl border border-line bg-subtle p-4 text-caption"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <Badge variant="brand">{cand.ruleType}</Badge>
                            <span className="text-body-sm font-bold text-fg-primary">
                              {cand.ruleKey}
                            </span>
                            <span className="rounded bg-surface px-2 py-0.5 text-caption text-fg-secondary">
                              {cand.ruleVersion}
                            </span>
                          </div>
                          <span
                            className={`rounded-full px-2.5 py-0.5 text-caption font-bold ${
                              cand.status === 'APPROVED'
                                ? 'bg-brand-soft text-brand'
                                : cand.status === 'REJECTED'
                                  ? 'bg-danger-bg text-danger-text'
                                  : cand.status === 'DEFERRED'
                                    ? 'bg-warning-bg text-warning-text'
                                    : 'bg-surface text-fg-secondary'
                            }`}
                          >
                            {cand.status}
                          </span>
                        </div>

                        <p className="mt-2 font-bold text-brand">{cand.recommendation}</p>
                        {cand.decision && (
                          <p className="mt-1 font-semibold text-fg-secondary">
                            قرار المراجع: {cand.decision} {cand.notes ? `- ${cand.notes}` : ''}
                          </p>
                        )}

                        <div className="mt-2 flex flex-wrap items-center gap-4 text-caption text-fg-secondary tabular-nums">
                          <span>
                            حجم العينة: {cand.sampleSize} (الحد الأدنى: {cand.minimumSampleSize})
                          </span>
                          <span>خط الأساس (Baseline): {(cand.baselineValue * 100).toFixed(1)}%</span>
                          <span>المعدل الملاحظ (Observed): {(cand.observedValue * 100).toFixed(1)}%</span>
                          <span
                            className={
                              cand.absoluteDifference >= 0
                                ? 'font-bold text-brand'
                                : 'font-bold text-danger-text'
                            }
                          >
                            الفارق (Delta): {(cand.absoluteDifference * 100).toFixed(1)}%
                          </span>
                        </div>

                        <div className="mt-3 flex flex-col gap-2 border-t border-line pt-3 sm:flex-row sm:items-center sm:justify-between">
                          <div className="flex-1">
                            <Input
                              type="text"
                              placeholder="ملاحظات قرار المراجعة البشرية (Decision Notes)..."
                              value={decisionNotesMap[cand.id] ?? cand.notes ?? ''}
                              onChange={(e) =>
                                setDecisionNotesMap((prev) => ({
                                  ...prev,
                                  [cand.id]: e.target.value,
                                }))
                              }
                            />
                          </div>
                          <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                            <Button
                              variant="primary"
                              size="sm"
                              onClick={() => handleCandidateDecision(cand.id, 'APPROVED')}
                              disabled={actionBusy === cand.id}
                            >
                              اعتماد (Approve)
                            </Button>
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => handleCandidateDecision(cand.id, 'DEFERRED')}
                              disabled={actionBusy === cand.id}
                            >
                              تأجيل (Defer)
                            </Button>
                            <Button
                              variant="danger"
                              size="sm"
                              onClick={() => handleCandidateDecision(cand.id, 'REJECTED')}
                              disabled={actionBusy === cand.id}
                            >
                              رفض (Reject)
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Scoring, Matching & Quality Rule Performance Table */}
            {rulesData && (
              <Card>
                <CardHeader>
                  <CardTitle>
                    جدول الأداء الإحصائي لقواعد التقييم والمطابقة والجودة (Rule Performance vs Baseline)
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>نوع القاعدة</TableHead>
                        <TableHead>مفتاح القاعدة (Rule Key)</TableHead>
                        <TableHead isNumeric>النقاط</TableHead>
                        <TableHead isNumeric>الفرص المتأثرة</TableHead>
                        <TableHead isNumeric>حجم العينة (Sample)</TableHead>
                        <TableHead isNumeric>معدل الفوز مع القاعدة</TableHead>
                        <TableHead isNumeric>معدل الفوز بدونها</TableHead>
                        <TableHead isNumeric>الفارق (Lift)</TableHead>
                        <TableHead>الحالة الإحصائية</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rulesData.allRules?.map((r: any) => (
                        <TableRow key={`${r.ruleType}-${r.ruleKey}`}>
                          <TableCell className="font-semibold text-fg-secondary">
                            {r.ruleType}
                          </TableCell>
                          <TableCell>
                            <span className="font-bold text-fg-primary block">{r.ruleKey}</span>
                            <span className="block text-caption text-fg-muted">{r.ruleName}</span>
                          </TableCell>
                          <TableCell isNumeric className="ltr-iso">
                            {r.points >= 0 ? `+${r.points}` : r.points}
                          </TableCell>
                          <TableCell isNumeric>{r.leadsAffected}</TableCell>
                          <TableCell isNumeric>
                            {r.sampleSize}{' '}
                            {r.sampleStatus === 'INSUFFICIENT_SAMPLE' && (
                              <span className="text-caption text-warning-icon">
                                (&lt;{r.minimumSampleSize})
                              </span>
                            )}
                          </TableCell>
                          <TableCell isNumeric className="text-brand font-semibold">
                            {r.withRule?.winRate?.displayValue} ({r.withRule?.winRate?.numerator}/
                            {r.withRule?.winRate?.denominator})
                          </TableCell>
                          <TableCell isNumeric className="text-fg-secondary">
                            {r.withoutRule?.winRate?.displayValue}
                          </TableCell>
                          <TableCell isNumeric>
                            {r.comparison?.winRateLiftAbsolute !== null &&
                            r.comparison?.winRateLiftAbsolute !== undefined ? (
                              <span
                                className={
                                  r.comparison.winRateLiftAbsolute >= 0
                                    ? 'text-brand font-semibold'
                                    : 'text-danger-text font-semibold'
                                }
                              >
                                {(r.comparison.winRateLiftAbsolute * 100).toFixed(1)}%
                              </span>
                            ) : (
                              '-'
                            )}
                          </TableCell>
                          <TableCell>
                            <span
                              className={`rounded-full px-2.5 py-0.5 text-caption font-bold ${
                                r.comparison?.flaggedForReview
                                  ? 'bg-danger-bg text-danger-text'
                                  : r.sampleStatus === 'INSUFFICIENT_SAMPLE'
                                    ? 'bg-subtle text-fg-secondary'
                                    : 'bg-brand-soft text-brand'
                              }`}
                            >
                              {r.comparison?.flaggedForReview
                                ? 'FLAGGED_FOR_REVIEW'
                                : r.sampleStatus}
                            </span>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            )}
          </div>
        )}
      </div>
    </AppShell>
  );
}
