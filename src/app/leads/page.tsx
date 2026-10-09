'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AppShell } from '@/components/domain/AppShell';
import { PageHeader } from '@/components/domain/PageHeader';
import { LeadCard } from '@/components/domain/LeadCard';
import { LeadRow } from '@/components/domain/LeadRow';
import { OpportunityBadge, LeadTemperature } from '@/components/domain/OpportunityBadge';
import { OwnershipType } from '@/components/domain/OwnershipTag';
import { QualityState } from '@/components/domain/QualityIndicator';
import { FilterBar, QuickFilter } from '@/components/ui/FilterBar';
import { Drawer } from '@/components/ui/Drawer';
import { Tabs, TabItem } from '@/components/ui/Tabs';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Checkbox } from '@/components/ui/Checkbox';
import {
  ALL_CITIES,
  ALL_GOVERNORATES,
  BUSINESS_CATEGORIES,
  CATEGORY_LABELS_AR,
  EGYPT_LOCATIONS,
  SCORE_RANGES,
} from '@/lib/constants';
import { fmtNumber } from '@/lib/format';
import { LayoutGrid, Table as TableIcon } from 'lucide-react';

interface LeadItem {
  id: string;
  businessName: string;
  category: string;
  governorate: string;
  city: string;
  area?: string | null;
  address?: string | null;
  phone?: string | null;
  hasPhone: boolean;
  email?: string | null;
  hasEmail: boolean;
  website?: string | null;
  websiteStatus: 'NO_WEBSITE' | 'HAS_WEBSITE' | 'POOR_WEBSITE' | 'UNKNOWN';
  facebook?: string | null;
  hasFacebook: boolean;
  instagram?: string | null;
  hasInstagram: boolean;
  rating?: number | null;
  reviewCount: number;
  branchCount: number;
  estimatedBudget: number;
  score: number;
  temperature: 'COLD' | 'WARM' | 'HOT' | 'PREMIUM';
  classification?: 'COLD' | 'WARM' | 'HOT' | 'PREMIUM';
  qualityScore?: number;
  qualityStatus?: string;
  freshnessStatus?: string;
  verificationStatus?: string;
  isVerified?: boolean;
  qualificationReasons: string[];
  leadType: 'SHARED' | 'EXCLUSIVE';
  exclusive: boolean;
  maxPurchasers: number;
  currentPurchasers: number;
  creditCost?: number;
  lastVerifiedAt: string;
  freshness?: {
    status: string;
    labelAr: string;
    daysSinceVerified: number;
    badgeClass: string;
  };
  matchEvaluation?: {
    isMatch: boolean;
    matchPercentage: number;
    matchStrength?: number;
  };
}

function mapQualityStatus(lead: LeadItem): QualityState {
  if (lead.isVerified || lead.verificationStatus === 'VERIFIED') return 'VERIFIED';
  if (lead.freshnessStatus === 'FRESH' || lead.freshness?.status === 'FRESH') return 'FRESH';
  if (lead.freshnessStatus === 'AGING' || lead.freshnessStatus === 'RECENT') return 'AGING';
  if (lead.freshnessStatus === 'STALE' || lead.freshnessStatus === 'VERY_STALE') return 'STALE';
  if (lead.verificationStatus === 'UNVERIFIED' || !lead.isVerified) return 'UNVERIFIED';
  return 'FRESH';
}

export default function LeadDiscoveryPage() {
  const [leads, setLeads] = useState<LeadItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');
  const [isFilterDrawerOpen, setIsFilterDrawerOpen] = useState(false);

  // Filters required by Section 5 & Phase 4 Section 27
  const [search, setSearch] = useState('');
  const [governorate, setGovernorate] = useState('ALL');
  const [city, setCity] = useState('ALL');
  const [area, setArea] = useState('');
  const [category, setCategory] = useState('ALL');
  const [service, setService] = useState('ALL');
  const [websiteStatus, setWebsiteStatus] = useState('ALL');
  const [scoreRange, setScoreRange] = useState('');
  const [minMatchStrength, setMinMatchStrength] = useState('');
  const [minQualityScore, setMinQualityScore] = useState('');
  const [freshnessStatus, setFreshnessStatus] = useState('ALL');
  const [sortBy, setSortBy] = useState('MATCH_STRENGTH');
  const [temperature, setTemperature] = useState('ALL');
  const [ownershipType, setOwnershipType] = useState('ALL');
  const [hasPhone, setHasPhone] = useState(false);
  const [hasEmail, setHasEmail] = useState(false);
  const [hasSocial, setHasSocial] = useState(false);
  const [matchedOnly, setMatchedOnly] = useState(false);
  const [userCredits, setUserCredits] = useState<number | undefined>(undefined);

  const loadLeads = useCallback(async () => {
    setLoading(true);
    try {
      fetch('/api/developer/credits')
        .then((r) => r.ok && r.json())
        .then((d) => {
          if (typeof d?.balance === 'number') setUserCredits(d.balance);
        })
        .catch(() => {});

      const params = new URLSearchParams();
      if (search.trim()) params.set('search', search.trim());
      if (governorate !== 'ALL') params.set('governorate', governorate);
      if (city !== 'ALL') params.set('city', city);
      if (area.trim()) params.set('area', area.trim());
      if (category !== 'ALL') params.set('category', category);
      if (service !== 'ALL') params.set('service', service);
      if (websiteStatus !== 'ALL') params.set('websiteStatus', websiteStatus);
      if (scoreRange) params.set('scoreRange', scoreRange);
      if (minMatchStrength) params.set('minMatchStrength', minMatchStrength);
      if (minQualityScore) params.set('minQualityScore', minQualityScore);
      if (freshnessStatus !== 'ALL') params.set('freshnessStatus', freshnessStatus);
      if (sortBy) params.set('sortBy', sortBy);
      if (temperature !== 'ALL') params.set('temperature', temperature);
      if (ownershipType !== 'ALL') params.set('ownershipType', ownershipType);
      if (hasPhone) params.set('hasPhone', 'true');
      if (hasEmail) params.set('hasEmail', 'true');
      if (hasSocial) params.set('hasSocial', 'true');
      if (matchedOnly) params.set('matchedOnly', 'true');

      const res = await fetch(`/api/leads?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setLeads(data.leads || []);
      }
    } finally {
      setLoading(false);
    }
  }, [
    search,
    governorate,
    city,
    area,
    category,
    service,
    websiteStatus,
    scoreRange,
    minMatchStrength,
    minQualityScore,
    freshnessStatus,
    sortBy,
    temperature,
    ownershipType,
    hasPhone,
    hasEmail,
    hasSocial,
    matchedOnly,
  ]);

  useEffect(() => {
    loadLeads();
  }, [loadLeads]);

  function resetFilters() {
    setSearch('');
    setGovernorate('ALL');
    setCity('ALL');
    setArea('');
    setCategory('ALL');
    setService('ALL');
    setWebsiteStatus('ALL');
    setScoreRange('');
    setMinMatchStrength('');
    setMinQualityScore('');
    setFreshnessStatus('ALL');
    setSortBy('MATCH_STRENGTH');
    setTemperature('ALL');
    setOwnershipType('ALL');
    setHasPhone(false);
    setHasEmail(false);
    setHasSocial(false);
    setMatchedOnly(false);
  }

  const hasActiveFilters = useMemo(() => {
    return (
      Boolean(search.trim()) ||
      governorate !== 'ALL' ||
      city !== 'ALL' ||
      Boolean(area.trim()) ||
      category !== 'ALL' ||
      service !== 'ALL' ||
      websiteStatus !== 'ALL' ||
      Boolean(scoreRange) ||
      Boolean(minMatchStrength) ||
      Boolean(minQualityScore) ||
      freshnessStatus !== 'ALL' ||
      sortBy !== 'MATCH_STRENGTH' ||
      temperature !== 'ALL' ||
      ownershipType !== 'ALL' ||
      hasPhone ||
      hasEmail ||
      hasSocial ||
      matchedOnly
    );
  }, [
    search,
    governorate,
    city,
    area,
    category,
    service,
    websiteStatus,
    scoreRange,
    minMatchStrength,
    minQualityScore,
    freshnessStatus,
    sortBy,
    temperature,
    ownershipType,
    hasPhone,
    hasEmail,
    hasSocial,
    matchedOnly,
  ]);

  const availableCities =
    governorate === 'ALL'
      ? ALL_CITIES
      : EGYPT_LOCATIONS.find((g) => g.governorate === governorate)?.cities.map((c) => c.name) ||
        ALL_CITIES;

  const quickFilters: QuickFilter[] = [
    { id: 'matchedOnly', label: 'مطابقة لملفي', isActive: matchedOnly },
    { id: 'exclusive', label: 'فرص حصرية', isActive: ownershipType === 'EXCLUSIVE' },
    { id: 'hot', label: 'فرص ساخنة', isActive: temperature === 'HOT' || temperature === 'PREMIUM' },
    { id: 'hasPhone', label: 'هاتف متوفر', isActive: hasPhone },
  ];

  function handleToggleQuickFilter(id: string) {
    if (id === 'matchedOnly') setMatchedOnly((prev) => !prev);
    else if (id === 'exclusive') {
      setOwnershipType((prev) => (prev === 'EXCLUSIVE' ? 'ALL' : 'EXCLUSIVE'));
    } else if (id === 'hot') {
      setTemperature((prev) => (prev === 'HOT' ? 'ALL' : 'HOT'));
    } else if (id === 'hasPhone') {
      setHasPhone((prev) => !prev);
    }
  }

  const viewTabs: TabItem[] = [
    { id: 'grid', label: 'شبكة', icon: <LayoutGrid className="w-4 h-4" /> },
    { id: 'table', label: 'جدول', icon: <TableIcon className="w-4 h-4" /> },
  ];

  return (
    <AppShell
      density="compact"
      pageTitle="استعراض الفرص"
      userCredits={userCredits}
    >
      <div className="flex flex-col gap-6">
        {/* Template T3 PageHeader */}
        <PageHeader
          title="استعراض الفرص"
          description="تصفح الأنشطة التجارية المؤهلة في مصر وافتح بيانات التواصل مع العملاء المناسبين لخدماتك."
          breadcrumbs={[
            { label: 'لوحة القيادة', href: '/dashboard' },
            { label: 'استعراض الفرص' },
          ]}
        />

        {/* Template T3 FilterBar */}
        <FilterBar
          searchQuery={search}
          onSearchChange={setSearch}
          searchPlaceholder="بحث باسم النشاط أو المنطقة..."
          quickFilters={quickFilters}
          onToggleQuickFilter={handleToggleQuickFilter}
          onOpenAdvancedFilters={() => setIsFilterDrawerOpen(true)}
          hasActiveFilters={hasActiveFilters}
          onClearAllFilters={resetFilters}
          totalResults={leads.length}
        />

        {/* Results Header: Count + Segmented View Tabs */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2">
          <p className="text-body-sm text-fg-secondary">
            إجمالي الفرص المطابقة:{' '}
            <span className="ltr-iso font-mono font-semibold tabular-nums text-fg-brand">
              {fmtNumber(leads.length)}
            </span>{' '}
            نشاط تجاري
          </p>

          <Tabs
            variant="segmented"
            tabs={viewTabs}
            activeTab={viewMode}
            onChange={(id) => setViewMode(id as 'grid' | 'table')}
          />
        </div>

        {/* Results View */}
        {loading ? (
          viewMode === 'grid' ? (
            <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
              {[1, 2, 3, 4, 5, 6].map((n) => (
                <div
                  key={n}
                  className="rounded-lg border border-line bg-surface p-5 flex flex-col gap-4"
                >
                  <div className="flex items-center justify-between">
                    <Skeleton className="h-6 w-24 rounded-full" />
                    <Skeleton className="h-6 w-20 rounded-full" />
                  </div>
                  <Skeleton className="h-5 w-3/4 rounded" />
                  <Skeleton className="h-4 w-1/2 rounded" />
                  <div className="flex gap-2">
                    <Skeleton className="h-6 w-16 rounded-full" />
                    <Skeleton className="h-6 w-16 rounded-full" />
                  </div>
                  <div className="pt-4 border-t border-line flex items-center justify-between">
                    <Skeleton className="h-6 w-20 rounded" />
                    <Skeleton className="h-8 w-24 rounded-md" />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-line bg-surface p-4 flex flex-col gap-3">
              {[1, 2, 3, 4, 5].map((n) => (
                <Skeleton key={n} className="h-14 w-full rounded-md" />
              ))}
            </div>
          )
        ) : leads.length === 0 ? (
          <EmptyState
            variant="no-results"
            title="لا توجد فرص مطابقة الآن"
            description="عدّل المدن أو التخصصات أو فلاتر البحث لتظهر فرص أكثر."
            action={{
              label: 'مسح الفلاتر',
              onClick: resetFilters,
            }}
          />
        ) : viewMode === 'grid' ? (
          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {leads.map((lead) => (
              <LeadCard
                key={lead.id}
                id={lead.id}
                companyName={lead.businessName}
                category={CATEGORY_LABELS_AR[lead.category] || lead.category}
                location={`${lead.city}${lead.area ? `، ${lead.area}` : ''}`}
                temperature={(lead.temperature as LeadTemperature) || 'HOT'}
                score={lead.score}
                ownershipType={
                  (lead.exclusive || lead.leadType === 'EXCLUSIVE'
                    ? 'EXCLUSIVE'
                    : 'SHARED') as OwnershipType
                }
                qualityStatus={mapQualityStatus(lead)}
                qualityTimestamp={lead.lastVerifiedAt}
                price={lead.creditCost || (lead.exclusive ? 5 : 1)}
                signals={lead.qualificationReasons || []}
                seatsRemaining={
                  lead.exclusive
                    ? undefined
                    : Math.max(0, (lead.maxPurchasers || 3) - (lead.currentPurchasers || 0))
                }
                maxSeats={lead.exclusive ? undefined : lead.maxPurchasers || 3}
              />
            ))}
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-line bg-surface shadow-xs">
            <table className="w-full text-start border-collapse text-body-sm">
              <thead>
                <tr className="border-b border-line bg-subtle text-caption font-semibold text-fg-secondary h-11">
                  <th className="py-2.5 px-4 text-start">النشاط التجاري</th>
                  <th className="py-2.5 px-4 text-start">تقييم الفرصة</th>
                  <th className="py-2.5 px-4 text-start">جودة البيانات</th>
                  <th className="py-2.5 px-4 text-start">نوع التوزيع</th>
                  <th className="py-2.5 px-4 text-end">التكلفة</th>
                  <th className="py-2.5 px-4 text-end">الإجراء</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {leads.map((lead) => (
                  <LeadRow
                    key={lead.id}
                    id={lead.id}
                    companyName={lead.businessName}
                    category={CATEGORY_LABELS_AR[lead.category] || lead.category}
                    location={`${lead.city}${lead.area ? `، ${lead.area}` : ''}`}
                    temperature={(lead.temperature as LeadTemperature) || 'HOT'}
                    score={lead.score}
                    ownershipType={
                      (lead.exclusive || lead.leadType === 'EXCLUSIVE'
                        ? 'EXCLUSIVE'
                        : 'SHARED') as OwnershipType
                    }
                    qualityStatus={mapQualityStatus(lead)}
                    qualityTimestamp={lead.lastVerifiedAt}
                    price={lead.creditCost || (lead.exclusive ? 5 : 1)}
                    seatsRemaining={
                      lead.exclusive
                        ? undefined
                        : Math.max(0, (lead.maxPurchasers || 3) - (lead.currentPurchasers || 0))
                    }
                    maxSeats={lead.exclusive ? undefined : lead.maxPurchasers || 3}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Template T3 Advanced Filters Drawer */}
        <Drawer
          isOpen={isFilterDrawerOpen}
          onClose={() => setIsFilterDrawerOpen(false)}
          title="فلاتر متقدمة"
          footer={
            <div className="flex items-center justify-between w-full gap-3">
              <Button variant="ghost" size="sm" onClick={resetFilters}>
                إعادة ضبط
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={() => setIsFilterDrawerOpen(false)}
              >
                تطبيق الفلاتر
              </Button>
            </div>
          }
        >
          <div className="flex flex-col gap-4 py-2 overflow-y-auto">
            {/* Search */}
            <Input
              label="بحث باسم النشاط أو المنطقة"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="مثال: عيادة، مطعم..."
            />

            {/* Governorate */}
            <Select
              label="المحافظة"
              value={governorate}
              onChange={(e) => {
                setGovernorate(e.target.value);
                setCity('ALL');
              }}
              options={[
                { value: 'ALL', label: 'جميع المحافظات' },
                ...ALL_GOVERNORATES.map((g) => ({ value: g, label: g })),
              ]}
            />

            {/* City */}
            <Select
              label="المدينة"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              options={[
                { value: 'ALL', label: 'جميع المدن' },
                ...availableCities.map((c) => ({ value: c, label: c })),
              ]}
            />

            {/* Area */}
            <Input
              label="المنطقة أو الحي"
              value={area}
              onChange={(e) => setArea(e.target.value)}
              placeholder="مثال: مدينة نصر، سموحة..."
            />

            {/* Category */}
            <Select
              label="نوع النشاط التجاري"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              options={[
                { value: 'ALL', label: 'جميع الأنشطة' },
                ...BUSINESS_CATEGORIES.map((c) => ({
                  value: c.value,
                  label: `${c.labelAr} (${c.value})`,
                })),
              ]}
            />

            {/* Service */}
            <Select
              label="الخدمة المطلوبة"
              value={service}
              onChange={(e) => setService(e.target.value)}
              options={[
                { value: 'ALL', label: 'جميع الخدمات' },
                { value: 'WEBSITE_DEVELOPMENT', label: 'تطوير موقع إلكتروني' },
                { value: 'WEBSITE_REDESIGN', label: 'إعادة تصميم وتطوير موقع' },
                { value: 'ECOMMERCE', label: 'متجر إلكتروني' },
                { value: 'LANDING_PAGE', label: 'صفحة هبوط' },
                { value: 'BOOKING_SYSTEM', label: 'نظام حجز مواعيد' },
                { value: 'CUSTOM_SOFTWARE', label: 'أنظمة مخصصة وتطبيقات ويب' },
                { value: 'SEO', label: 'تحسين محركات البحث' },
              ]}
            />

            {/* Website Status */}
            <Select
              label="حالة الموقع الإلكتروني"
              value={websiteStatus}
              onChange={(e) => setWebsiteStatus(e.target.value)}
              options={[
                { value: 'ALL', label: 'الكل' },
                { value: 'NO_WEBSITE', label: 'بدون موقع إلكتروني' },
                { value: 'POOR_WEBSITE', label: 'موقع قديم أو ضعيف' },
                { value: 'HAS_WEBSITE', label: 'يمتلك موقعاً' },
                { value: 'UNKNOWN', label: 'غير معروف' },
              ]}
            />

            {/* Score Range */}
            <Select
              label="نطاق تقييم الفرصة"
              value={scoreRange}
              onChange={(e) => setScoreRange(e.target.value)}
              options={[
                { value: '', label: 'جميع الدرجات (0 – 100)' },
                ...SCORE_RANGES.map((sr) => ({ value: sr.value, label: sr.labelAr })),
              ]}
            />

            {/* Min Match Strength */}
            <Select
              label="الحد الأدنى لقوة التطابق"
              value={minMatchStrength}
              onChange={(e) => setMinMatchStrength(e.target.value)}
              options={[
                { value: '', label: 'الكل (0% – 100%)' },
                { value: '85', label: 'تطابق ممتاز (85%+)' },
                { value: '70', label: 'تطابق قوي (70%+)' },
                { value: '50', label: 'تطابق مقبول (50%+)' },
              ]}
            />

            {/* Min Quality Score */}
            <Select
              label="مستوى جودة البيانات"
              value={minQualityScore}
              onChange={(e) => setMinQualityScore(e.target.value)}
              options={[
                { value: '', label: 'كل مستويات الجودة' },
                { value: '85', label: 'ممتازة (85+)' },
                { value: '70', label: 'عالية (70+)' },
                { value: '50', label: 'متوسطة (50+)' },
              ]}
            />

            {/* Freshness Status */}
            <Select
              label="حالة الحداثة والتحقق"
              value={freshnessStatus}
              onChange={(e) => setFreshnessStatus(e.target.value)}
              options={[
                { value: 'ALL', label: 'كل الحالات' },
                { value: 'FRESH', label: 'حديثة جداً' },
                { value: 'RECENT', label: 'محدثة قريباً' },
              ]}
            />

            {/* Sort Order */}
            <Select
              label="الترتيب حسب"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              options={[
                { value: 'MATCH_STRENGTH', label: 'الأعلى تطابقاً ثم الجودة' },
                { value: 'SCORE_DESC', label: 'الأعلى فرصة بيعية' },
                { value: 'QUALITY_DESC', label: 'الأعلى جودة بيانات' },
                { value: 'NEWEST', label: 'الأحدث إضافة' },
              ]}
            />

            {/* Temperature */}
            <Select
              label="تصنيف الفرصة"
              value={temperature}
              onChange={(e) => setTemperature(e.target.value)}
              options={[
                { value: 'ALL', label: 'جميع التصنيفات' },
                { value: 'PREMIUM', label: 'فرصة مميزة' },
                { value: 'HOT', label: 'فرصة ساخنة' },
                { value: 'WARM', label: 'فرصة دافئة' },
                { value: 'COLD', label: 'فرصة باردة' },
              ]}
            />

            {/* Ownership Type */}
            <div className="flex flex-col gap-1.5 pt-1">
              <label className="text-label text-fg-primary">نوع الملكية والتوزيع</label>
              <div className="grid grid-cols-3 gap-2">
                <Button
                  type="button"
                  variant={ownershipType === 'ALL' ? 'primary' : 'secondary'}
                  size="sm"
                  onClick={() => setOwnershipType('ALL')}
                >
                  الكل
                </Button>
                <Button
                  type="button"
                  variant={ownershipType === 'EXCLUSIVE' ? 'primary' : 'secondary'}
                  size="sm"
                  onClick={() => setOwnershipType('EXCLUSIVE')}
                >
                  حصري
                </Button>
                <Button
                  type="button"
                  variant={ownershipType === 'SHARED' ? 'primary' : 'secondary'}
                  size="sm"
                  onClick={() => setOwnershipType('SHARED')}
                >
                  مشترك
                </Button>
              </div>
            </div>

            {/* Checkboxes */}
            <div className="flex flex-col gap-2.5 pt-2 border-t border-line">
              <Checkbox
                label="هاتف متاح"
                checked={hasPhone}
                onChange={(e) => setHasPhone(e.target.checked)}
              />
              <Checkbox
                label="بريد إلكتروني متاح"
                checked={hasEmail}
                onChange={(e) => setHasEmail(e.target.checked)}
              />
              <Checkbox
                label="حساب تواصل اجتماعي متاح"
                checked={hasSocial}
                onChange={(e) => setHasSocial(e.target.checked)}
              />
            </div>
          </div>
        </Drawer>
      </div>
    </AppShell>
  );
}
