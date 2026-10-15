'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { AppShell } from '@/components/domain/AppShell';
import { PublicNavbar, PublicFooter } from '@/components/domain/PublicNavbar';
import { PageHeader } from '@/components/domain/PageHeader';
import { LeadCard } from '@/components/domain/LeadCard';
import { LeadRow } from '@/components/domain/LeadRow';
import { LeadTemperature } from '@/components/domain/OpportunityBadge';
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
import { Table, TableHeader, TableBody, TableRow, TableHead } from '@/components/ui/Table';
import { Checkbox } from '@/components/ui/Checkbox';
import {
  ALL_CITIES,
  ALL_GOVERNORATES,
  BUSINESS_CATEGORIES,
  EGYPT_LOCATIONS,
} from '@/lib/constants';
import {
  localizeCity,
  localizeCategory,
  localizeQualificationReason,
  localizeService,
  localizeWebsiteStatus,
} from '@/lib/taxonomy';
import { fmtNumber } from '@/lib/format';
import { LayoutGrid, Table as TableIcon, ArrowRight } from 'lucide-react';

export interface LeadItem {
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

export interface LeadDiscoveryClientProps {
  initialSearch?: string;
  isAuthenticated?: boolean;
  initialLeads?: LeadItem[];
}

export default function LeadDiscoveryClient({
  initialSearch = '',
  isAuthenticated = true,
  initialLeads = [],
}: LeadDiscoveryClientProps) {
  const router = useRouter();
  const t = useTranslations('leads');
  const tCommon = useTranslations('common');
  const tGeo = useTranslations('geo');
  const tCat = useTranslations('categories');
  const tServices = useTranslations('services');
  const tEnums = useTranslations('enums');
  const locale = useLocale();

  const [leads, setLeads] = useState<LeadItem[]>(initialLeads);
  const [loading, setLoading] = useState(isAuthenticated);
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');
  const [isFilterDrawerOpen, setIsFilterDrawerOpen] = useState(false);

  // Filters required by Section 5 & Phase 4 Section 27
  const [search, setSearch] = useState(initialSearch);
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
  const [fieldVisitOnly, setFieldVisitOnly] = useState(false);
  const [hasEmail, setHasEmail] = useState(false);
  const [hasSocial, setHasSocial] = useState(false);
  const [matchedOnly, setMatchedOnly] = useState(false);
  const [userCredits, setUserCredits] = useState<number | undefined>(undefined);

  const loadLeads = useCallback(async () => {
    if (!isAuthenticated) {
      let filtered = [...initialLeads];
      if (search.trim()) {
        const q = search.trim().toLowerCase();
        filtered = filtered.filter(
          (l) =>
            l.businessName.toLowerCase().includes(q) ||
            l.category.toLowerCase().includes(q) ||
            l.city.toLowerCase().includes(q)
        );
      }
      if (governorate !== 'ALL') filtered = filtered.filter((l) => l.governorate === governorate);
      if (city !== 'ALL') filtered = filtered.filter((l) => l.city === city);
      if (category !== 'ALL') filtered = filtered.filter((l) => l.category === category);
      if (ownershipType !== 'ALL') filtered = filtered.filter((l) => l.leadType === ownershipType);
      if (hasPhone) filtered = filtered.filter((l) => l.hasPhone);
      setLeads(filtered);
      setLoading(false);
      return;
    }

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
      if (fieldVisitOnly) params.set('fieldVisitOnly', 'true');
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
    fieldVisitOnly,
    isAuthenticated,
    initialLeads,
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
    setFieldVisitOnly(false);
    setHasEmail(false);
    setHasSocial(false);
    setMatchedOnly(false);
    if (!isAuthenticated) {
      setLeads(initialLeads);
    }
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
      fieldVisitOnly ||
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
    fieldVisitOnly,
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
    { id: 'matchedOnly', label: t('matchedOnly'), isActive: matchedOnly },
    { id: 'exclusive', label: t('exclusiveLeads'), isActive: ownershipType === 'EXCLUSIVE' },
    { id: 'hot', label: t('hotLeads'), isActive: temperature === 'HOT' || temperature === 'PREMIUM' },
    { id: 'hasPhone', label: t('phoneAvailable'), isActive: hasPhone },
    { id: 'fieldVisit', label: '📍 زيارة ميدانية (1 نقطة)', isActive: fieldVisitOnly },
  ];

  function handleToggleQuickFilter(id: string) {
    if (id === 'matchedOnly') setMatchedOnly((prev) => !prev);
    else if (id === 'exclusive') {
      setOwnershipType((prev) => (prev === 'EXCLUSIVE' ? 'ALL' : 'EXCLUSIVE'));
    } else if (id === 'hot') {
      setTemperature((prev) => (prev === 'HOT' ? 'ALL' : 'HOT'));
    } else if (id === 'hasPhone') {
      setHasPhone((prev) => {
        const next = !prev;
        if (next) setFieldVisitOnly(false);
        return next;
      });
    } else if (id === 'fieldVisit') {
      setFieldVisitOnly((prev) => {
        const next = !prev;
        if (next) setHasPhone(false);
        return next;
      });
    }
  }

  const viewTabs: TabItem[] = [
    { id: 'grid', label: t('viewCards'), icon: <LayoutGrid className="w-4 h-4" /> },
    { id: 'table', label: t('viewTable'), icon: <TableIcon className="w-4 h-4" /> },
  ];

  const getLocationDisplay = (lead: LeadItem) => {
    const cityStr = localizeCity(lead.city, tGeo as any);
    if (!lead.area) return cityStr;
    const areaStr = localizeCity(lead.area, tGeo as any);
    const sep = locale === 'ar' ? '، ' : ', ';
    return `${cityStr}${sep}${areaStr}`;
  };

  const mainContent = (
    <div className="flex flex-col gap-6">
      {/* Template T3 PageHeader */}
      {isAuthenticated && (
        <PageHeader
          title={t('title')}
          description={t('description')}
          breadcrumbs={[
            { label: t('breadcrumbsDashboard'), href: '/dashboard' },
            { label: t('pageTitle') },
          ]}
          actions={
            <Link href="/my-leads">
              <Button
                variant="secondary"
                size="sm"
                startIcon={<ArrowRight className="w-4 h-4 rtl:-scale-x-100" />}
              >
                {t('tabMyPipeline')}
              </Button>
            </Link>
          }
        />
      )}

        {/* Template T3 FilterBar */}
        <FilterBar
          searchQuery={search}
          onSearchChange={setSearch}
          searchPlaceholder={t('searchPlaceholder')}
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
            {t('totalMatched')}{' '}
            <span className="ltr-iso font-semibold tabular-nums text-fg-brand">
              {fmtNumber(leads.length, locale)}
            </span>{' '}
            {t('businesses', { count: leads.length })}
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
            title={hasActiveFilters ? t('noResults') : (!isAuthenticated ? t('publicPreviewEmptyTitle') : t('noResults'))}
            description={hasActiveFilters ? t('noResultsHint') : (!isAuthenticated ? t('publicPreviewEmptyDesc') : t('noResultsHint'))}
            action={
              hasActiveFilters
                ? {
                    label: t('resetFilters'),
                    onClick: resetFilters,
                  }
                : !isAuthenticated
                ? {
                    label: t('publicPreviewCta'),
                    onClick: () => router.push('/register'),
                  }
                : {
                    label: t('resetFilters'),
                    onClick: resetFilters,
                  }
            }
          />
        ) : viewMode === 'grid' ? (
          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {leads.map((lead) => (
              <LeadCard
                key={lead.id}
                id={lead.id}
                companyName={lead.businessName}
                category={localizeCategory(lead.category, tCat as any)}
                location={getLocationDisplay(lead)}
                temperature={(lead.temperature as LeadTemperature) || 'HOT'}
                score={lead.score}
                ownershipType={
                  (lead.exclusive || lead.leadType === 'EXCLUSIVE'
                    ? 'EXCLUSIVE'
                    : 'SHARED') as OwnershipType
                }
                qualityStatus={mapQualityStatus(lead)}
                qualityTimestamp={lead.lastVerifiedAt}
                price={lead.creditCost ?? (!lead.hasPhone && !lead.phone ? 1 : (lead.exclusive ? 25 : 5))}
                hasPhone={lead.hasPhone}
                isFieldVisit={!lead.hasPhone && !lead.phone}
                signals={(lead.qualificationReasons || []).map((r) =>
                  localizeQualificationReason(r, locale)
                )}
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
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('thBusiness')}</TableHead>
                <TableHead>{t('thScore')}</TableHead>
                <TableHead>{t('thQuality')}</TableHead>
                <TableHead>{t('thOwnership')}</TableHead>
                <TableHead isNumeric>{t('thCost')}</TableHead>
                <TableHead isNumeric>{t('thAction')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {leads.map((lead) => (
                <LeadRow
                  key={lead.id}
                  id={lead.id}
                  companyName={lead.businessName}
                  category={localizeCategory(lead.category, tCat as any)}
                  location={getLocationDisplay(lead)}
                  temperature={(lead.temperature as LeadTemperature) || 'HOT'}
                  score={lead.score}
                  ownershipType={
                    (lead.exclusive || lead.leadType === 'EXCLUSIVE'
                      ? 'EXCLUSIVE'
                      : 'SHARED') as OwnershipType
                  }
                  qualityStatus={mapQualityStatus(lead)}
                  qualityTimestamp={lead.lastVerifiedAt}
                  price={lead.creditCost ?? (!lead.hasPhone && !lead.phone ? 1 : (lead.exclusive ? 25 : 5))}
                  hasPhone={lead.hasPhone}
                  isFieldVisit={!lead.hasPhone && !lead.phone}
                  seatsRemaining={
                    lead.exclusive
                      ? undefined
                      : Math.max(0, (lead.maxPurchasers || 3) - (lead.currentPurchasers || 0))
                  }
                  maxSeats={lead.exclusive ? undefined : lead.maxPurchasers || 3}
                />
              ))}
            </TableBody>
          </Table>
        )}

        {/* Template T3 Advanced Filters Drawer */}
        <Drawer
          isOpen={isFilterDrawerOpen}
          onClose={() => setIsFilterDrawerOpen(false)}
          title={t('filterDrawerTitle')}
          footer={
            <div className="flex items-center justify-between w-full gap-3">
              <Button variant="ghost" size="sm" onClick={resetFilters}>
                {t('resetFilters')}
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={() => setIsFilterDrawerOpen(false)}
              >
                {t('applyFilters')}
              </Button>
            </div>
          }
        >
          <div className="flex flex-col gap-4 py-2 overflow-y-auto">
            {/* Search */}
            <Input
              label={t('searchPlaceholder')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('searchPlaceholder')}
            />

            {/* Governorate */}
            <Select
              label={t('governorateLabel')}
              value={governorate}
              onChange={(e) => {
                setGovernorate(e.target.value);
                setCity('ALL');
              }}
              options={[
                { value: 'ALL', label: t('allGovernorates') },
                ...ALL_GOVERNORATES.map((g) => ({
                  value: g,
                  label: localizeCity(g, tGeo as any),
                })),
              ]}
            />

            {/* City */}
            <Select
              label={t('cityLabel')}
              value={city}
              onChange={(e) => setCity(e.target.value)}
              options={[
                { value: 'ALL', label: t('allCities') },
                ...availableCities.map((c) => ({
                  value: c,
                  label: localizeCity(c, tGeo as any),
                })),
              ]}
            />

            {/* Area */}
            <Input
              label={t('areaLabel')}
              value={area}
              onChange={(e) => setArea(e.target.value)}
              placeholder={t('areaPlaceholder')}
            />

            {/* Category */}
            <Select
              label={t('categoryLabel')}
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              options={[
                { value: 'ALL', label: t('allCategories') },
                ...BUSINESS_CATEGORIES.map((c) => ({
                  value: c.value,
                  label: localizeCategory(c.value, tCat as any),
                })),
              ]}
            />

            {/* Service */}
            <Select
              label={t('serviceLabel')}
              value={service}
              onChange={(e) => setService(e.target.value)}
              options={[
                { value: 'ALL', label: t('allServices') },
                ...[
                  'WEBSITE_DEVELOPMENT',
                  'WEBSITE_REDESIGN',
                  'ECOMMERCE',
                  'LANDING_PAGE',
                  'BOOKING_SYSTEM',
                  'CUSTOM_SOFTWARE',
                  'SEO',
                ].map((srvKey) => ({
                  value: srvKey,
                  label: localizeService(srvKey, tServices as any),
                })),
              ]}
            />

            {/* Website Status */}
            <Select
              label={t('websiteStatusLabel')}
              value={websiteStatus}
              onChange={(e) => setWebsiteStatus(e.target.value)}
              options={[
                { value: 'ALL', label: t('allStatuses') },
                ...['NO_WEBSITE', 'POOR_WEBSITE', 'HAS_WEBSITE', 'UNKNOWN'].map((ws) => ({
                  value: ws,
                  label: localizeWebsiteStatus(ws, (k) => tEnums(k)),
                })),
              ]}
            />

            {/* Score Range */}
            <Select
              label={t('scoreRangeLabel')}
              value={scoreRange}
              onChange={(e) => setScoreRange(e.target.value)}
              options={[
                { value: '', label: t('allScores') },
                { value: '85-100', label: t('scoreRange85_100') },
                { value: '70-84', label: t('scoreRange70_84') },
                { value: '50-69', label: t('scoreRange50_69') },
                { value: '0-49', label: t('scoreRange0_49') },
              ]}
            />

            {/* Min Match Strength */}
            <Select
              label={t('matchStrengthLabel')}
              value={minMatchStrength}
              onChange={(e) => setMinMatchStrength(e.target.value)}
              options={[
                { value: '', label: t('allMatch') },
                { value: '85', label: t('matchExcellent') },
                { value: '70', label: t('matchStrong') },
                { value: '50', label: t('matchAcceptable') },
              ]}
            />

            {/* Min Quality Score */}
            <Select
              label={t('qualityScoreLabel')}
              value={minQualityScore}
              onChange={(e) => setMinQualityScore(e.target.value)}
              options={[
                { value: '', label: t('allQuality') },
                { value: '85', label: t('qualityExcellent') },
                { value: '70', label: t('qualityHigh') },
                { value: '50', label: t('qualityMedium') },
              ]}
            />

            {/* Freshness Status */}
            <Select
              label={t('freshnessLabel')}
              value={freshnessStatus}
              onChange={(e) => setFreshnessStatus(e.target.value)}
              options={[
                { value: 'ALL', label: t('allFreshness') },
                { value: 'FRESH', label: t('freshVery') },
                { value: 'RECENT', label: t('freshRecent') },
              ]}
            />

            {/* Sort Order */}
            <Select
              label={t('sortByLabel')}
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              options={[
                { value: 'MATCH_STRENGTH', label: t('sortMatch') },
                { value: 'SCORE_DESC', label: t('sortScore') },
                { value: 'QUALITY_DESC', label: t('sortQuality') },
                { value: 'NEWEST', label: t('sortNewest') },
              ]}
            />

            {/* Temperature */}
            <Select
              label={t('temperatureLabel')}
              value={temperature}
              onChange={(e) => setTemperature(e.target.value)}
              options={[
                { value: 'ALL', label: t('allTemperatures') },
                { value: 'PREMIUM', label: t('tempPremium') },
                { value: 'HOT', label: t('tempHot') },
                { value: 'WARM', label: t('tempWarm') },
                { value: 'COLD', label: t('tempCold') },
              ]}
            />

            {/* Ownership Type */}
            <div className="flex flex-col gap-1.5 pt-1">
              <label className="text-label text-fg-primary">{t('ownershipLabel')}</label>
              <div className="grid grid-cols-3 gap-2">
                <Button
                  type="button"
                  variant={ownershipType === 'ALL' ? 'primary' : 'secondary'}
                  size="sm"
                  onClick={() => setOwnershipType('ALL')}
                >
                  {tCommon('all')}
                </Button>
                <Button
                  type="button"
                  variant={ownershipType === 'EXCLUSIVE' ? 'primary' : 'secondary'}
                  size="sm"
                  onClick={() => setOwnershipType('EXCLUSIVE')}
                >
                  {t('exclusive')}
                </Button>
                <Button
                  type="button"
                  variant={ownershipType === 'SHARED' ? 'primary' : 'secondary'}
                  size="sm"
                  onClick={() => setOwnershipType('SHARED')}
                >
                  {t('shared')}
                </Button>
              </div>
            </div>

            {/* Checkboxes */}
            <div className="flex flex-col gap-2.5 pt-2 border-t border-line">
              <Checkbox
                label={t('phoneAvailable')}
                checked={hasPhone}
                onChange={(e) => setHasPhone(e.target.checked)}
              />
              <Checkbox
                label={t('emailAvailable')}
                checked={hasEmail}
                onChange={(e) => setHasEmail(e.target.checked)}
              />
              <Checkbox
                label={t('socialAvailable')}
                checked={hasSocial}
                onChange={(e) => setHasSocial(e.target.checked)}
              />
            </div>
          </div>
        </Drawer>
    </div>
  );

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-page flex flex-col">
        <PublicNavbar />
        <main className="flex-1">
          {/* Public Preview Banner */}
          <section className="bg-subtle border-b border-line py-8">
            <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
              <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
                <div className="max-w-3xl">
                  <div className="inline-flex items-center gap-2 px-2.5 py-0.5 rounded-full bg-brand-soft text-fg-brand text-caption font-semibold mb-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-brand shrink-0" aria-hidden="true" />
                    <span>{t('publicPreviewBadge')}</span>
                  </div>
                  <h1 className="text-h1 font-bold text-fg-primary">
                    {t('publicPreviewBannerTitle')}
                  </h1>
                  <p className="mt-2 text-body-sm text-fg-secondary leading-relaxed">
                    {t('publicPreviewBannerDesc')}
                  </p>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <Link href="/register">
                    <Button variant="primary">
                      {t('publicPreviewCta')}
                    </Button>
                  </Link>
                  <Link href="/login">
                    <Button variant="secondary">
                      {t('publicPreviewLoginCta')}
                    </Button>
                  </Link>
                </div>
              </div>
            </div>
          </section>

          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
            {mainContent}
          </div>
        </main>
        <PublicFooter />
      </div>
    );
  }

  return (
    <AppShell
      density="compact"
      pageTitle={t('pageTitle')}
      userCredits={userCredits}
    >
      {mainContent}
    </AppShell>
  );
}
