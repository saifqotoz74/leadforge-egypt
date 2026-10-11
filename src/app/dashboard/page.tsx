'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { AppShell } from '@/components/domain/AppShell';
import { PageHeader } from '@/components/domain/PageHeader';
import { StatTile } from '@/components/domain/StatTile';
import { MatchRow, MatchedLeadData } from '@/components/domain/MatchRow';
import { PlanSummary } from '@/components/domain/PlanSummary';
import { StageBadge, PipelineStage } from '@/components/domain/StageBadge';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { MetaList } from '@/components/ui/MetaList';
import { BarList } from '@/components/ui/BarList';
import { localizeCity, localizeCategory } from '@/lib/taxonomy';
import { DASHBOARD_FIXTURES } from '@/lib/fixtures/dashboard-fixtures';
import {
  TrendingUp,
  Compass,
  Briefcase,
  ChevronRight,
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
    creditsUsed?: number;
    currentPeriodEnd?: string;
    plan?: {
      slug?: string;
      name: string;
      nameEn?: string;
      priceEgp?: number;
    };
  };
  profile?: {
    services: string[];
    locations: string[];
    niches: string[];
    minBudget: number;
    leadType: string;
  };
  topMatchedLeads: MatchedLeadData[];
  recentClaims: {
    id: string;
    leadId: string;
    pipelineStatus: string;
    claimedAt: string;
    lead: {
      businessName: string;
      city: string;
      category: string;
      phone?: string;
    };
  }[];
}

export default function DeveloperDashboardPage() {
  const tDash = useTranslations('dashboard');
  const tNav = useTranslations('nav');
  const tCommon = useTranslations('common');
  const tGeo = useTranslations('geo');
  const tCat = useTranslations('categories');
  const searchParams = useSearchParams();

  const isFixturesMode = searchParams.get('fixtures') === 'true';

  const [data, setData] = useState<DashboardData | null>(
    isFixturesMode ? DASHBOARD_FIXTURES : null
  );
  const [loading, setLoading] = useState(!isFixturesMode);

  useEffect(() => {
    if (isFixturesMode) {
      setData(DASHBOARD_FIXTURES);
      setLoading(false);
      return;
    }

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
  }, [isFixturesMode]);

  // Helper to translate cities
  const getCityLabel = (city: string) => {
    return localizeCity(city, tGeo as any);
  };

  // Helper to translate categories
  const getCategoryLabel = (category: string) => {
    return localizeCategory(category, tCat as any);
  };

  if (loading || !data) {
    return (
      <AppShell density="compact" isTopLevel={true}>
        <div className="flex flex-col gap-6">
          <Skeleton className="h-10 w-48 rounded" />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Skeleton className="h-28 w-full rounded-lg" />
            <Skeleton className="h-28 w-full rounded-lg" />
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-8">
              <Skeleton className="h-80 w-full rounded-xl" />
            </div>
            <div className="lg:col-span-4">
              <Skeleton className="h-80 w-full rounded-xl" />
            </div>
          </div>
        </div>
      </AppShell>
    );
  }

  // Pre-generate city and niche translation dictionaries for PlanSummary
  const cityLabelsDict: Record<string, string> = {};
  if (data.profile?.locations) {
    data.profile.locations.forEach((loc) => {
      cityLabelsDict[loc] = getCityLabel(loc);
    });
  }

  const nicheLabelsDict: Record<string, string> = {};
  if (data.profile?.niches) {
    data.profile.niches.forEach((n) => {
      nicheLabelsDict[n] = getCategoryLabel(n);
    });
  }

  return (
    <AppShell
      density="compact"
      isTopLevel={true}
      userCredits={data.stats.remainingCredits}
    >
      <div className="flex flex-col gap-6">
        {/* Template T11 PageHeader */}
        <PageHeader
          title={tDash('title')}
          description={tDash('description')}
          actions={
            <Link href="/leads">
              <Button variant="primary" size="sm">
                {tDash('exploreLeads')}
              </Button>
            </Link>
          }
        />

        {/* StatTiles: Two groups of three with small group captions (Item 3 & 6: 24px gap between groups, 16px inside) */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Group 1: Your account */}
          <div className="flex flex-col gap-2">
            <span className="text-caption font-semibold text-fg-secondary px-0.5">
              {tDash('statGroupAccount')}
            </span>
            <div className="grid grid-cols-3 gap-4">
              <StatTile
                label={tDash('matchedLeads')}
                value={data.stats.newMatchedLeadsCount}
                unit={tCommon('leadUnit', { count: data.stats.newMatchedLeadsCount })}
                statusText={tDash('matchedLeadsDesc')}
              />
              <StatTile
                label={tDash('usedLeads')}
                value={data.stats.usedLeadsCount}
                unit={tCommon('leadUnit', { count: data.stats.usedLeadsCount })}
                statusText={tDash('usedLeadsDesc')}
              />
              <StatTile
                label={tDash('remainingCredits')}
                value={data.stats.remainingCredits}
                unit={tCommon('pointUnit', { count: data.stats.remainingCredits })}
                statusText={tDash('remainingCreditsDesc')}
              />
            </div>
          </div>

          {/* Group 2: Across the platform */}
          <div className="flex flex-col gap-2">
            <span className="text-caption font-semibold text-fg-secondary px-0.5">
              {tDash('statGroupPlatform')}
            </span>
            <div className="grid grid-cols-3 gap-4">
              <StatTile
                label={tDash('hotLeads')}
                value={data.stats.hotLeadsCount}
                unit={tCommon('leadUnit', { count: data.stats.hotLeadsCount })}
                statusText={tDash('hotLeadsDesc')}
              />
              <StatTile
                label={tDash('warmLeads')}
                value={data.stats.warmLeadsCount}
                unit={tCommon('leadUnit', { count: data.stats.warmLeadsCount })}
                statusText={tDash('warmLeadsDesc')}
              />
              <StatTile
                label={tDash('leadsThisWeek')}
                value={data.stats.leadsThisWeekCount}
                unit={tCommon('leadUnit', { count: data.stats.leadsThisWeekCount })}
                statusText={tDash('leadsThisWeekDesc')}
              />
            </div>
          </div>
        </div>

        {/* Unified 12-column Grid: Two independent vertical stacks on desktop (Item 2). Main 8 cols, Side 4 cols. Zero empty gap */}
        {/* On mobile, columns have 'contents' so children order as: 1 (tiles above), 2 (matches), 3 (plan), 4 (purchases), 5 (conversion) */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Main Column (8 cols): Top matched leads, then Conversion */}
          <div className="contents lg:flex lg:flex-col lg:gap-6 lg:col-span-8">
            {/* 1. Top Matched Leads (Order 2 on mobile) */}
            <div className="order-2 lg:order-none">
              <Card>
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <Compass className="w-5 h-5 text-fg-brand" />
                    <CardTitle>{tDash('topMatchedTitle')}</CardTitle>
                  </div>
                  <Link
                    href="/leads"
                    className="inline-flex items-center gap-1 text-caption font-semibold text-fg-brand hover:underline"
                  >
                    <span>{tDash('viewAll')}</span>
                    <ChevronRight className="w-3.5 h-3.5 rtl:-scale-x-100" />
                  </Link>
                </CardHeader>

                <div className="divide-y divide-line">
                  {data.topMatchedLeads.length === 0 ? (
                    <div className="py-6">
                      <EmptyState
                        title={tDash('noMatchedLeads')}
                        description={tDash('quickActionsDesc')}
                      />
                    </div>
                  ) : (
                    data.topMatchedLeads.slice(0, 5).map((lead) => (
                      <MatchRow
                        key={lead.id}
                        lead={lead}
                        cityLabel={getCityLabel(lead.city)}
                        categoryLabel={getCategoryLabel(lead.category)}
                      />
                    ))
                  )}
                </div>
              </Card>
            </div>

            {/* 2. Conversion: Funnel only (Order 5 on mobile) */}
            <div className="order-5 lg:order-none">
              <Card>
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <TrendingUp className="w-5 h-5 text-fg-brand" />
                    <CardTitle>{tDash('conversionTitle')}</CardTitle>
                  </div>
                  <Link
                    href="/my-leads"
                    className="inline-flex items-center gap-1 text-caption font-semibold text-fg-brand hover:underline"
                  >
                    <span>{tNav('pipeline')}</span>
                    <ChevronRight className="w-3.5 h-3.5 rtl:-scale-x-100" />
                  </Link>
                </CardHeader>

                {/* Real Funnel using BarList */}
                <div className="py-2">
                  <BarList
                    items={[
                      {
                        label: tDash('funnelPurchased'),
                        value: data.conversion.totalClaimed,
                        percentage: 100,
                      },
                      {
                        label: tDash('funnelContacted'),
                        value: data.conversion.contactedCount,
                        percentage: data.conversion.totalClaimed > 0
                          ? Math.round((data.conversion.contactedCount / data.conversion.totalClaimed) * 100)
                          : 0,
                      },
                      {
                        label: tDash('funnelReplied'),
                        value: data.conversion.repliedCount,
                        percentage: data.conversion.totalClaimed > 0
                          ? Math.round((data.conversion.repliedCount / data.conversion.totalClaimed) * 100)
                          : 0,
                      },
                      {
                        label: tDash('funnelMeeting'),
                        value: data.conversion.meetingCount,
                        percentage: data.conversion.totalClaimed > 0
                          ? Math.round((data.conversion.meetingCount / data.conversion.totalClaimed) * 100)
                          : 0,
                      },
                      {
                        label: tDash('funnelWon'),
                        value: data.conversion.wonCount,
                        percentage: data.conversion.totalClaimed > 0
                          ? Math.round((data.conversion.wonCount / data.conversion.totalClaimed) * 100)
                          : 0,
                      },
                    ]}
                    maxValue={Math.max(data.conversion.totalClaimed, 1)}
                  />
                </div>
              </Card>
            </div>
          </div>

          {/* Aside Column (4 cols): Plan & balance, then Recent purchases */}
          <div className="contents lg:flex lg:flex-col lg:gap-6 lg:col-span-4">
            {/* 3. Plan & Balance (Order 3 on mobile) */}
            <div className="order-3 lg:order-none">
              <PlanSummary
                subscription={data.subscription}
                profile={data.profile}
                cityLabels={cityLabelsDict}
                nicheLabels={nicheLabelsDict}
              />
            </div>

            {/* 4. Recent Purchases (Order 4 on mobile) */}
            <div className="order-4 lg:order-none">
              <Card>
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <Briefcase className="w-5 h-5 text-fg-brand" />
                    <CardTitle>{tDash('recentClaimsTitle')}</CardTitle>
                  </div>
                  <Link
                    href="/my-leads"
                    className="inline-flex items-center gap-1 text-caption font-semibold text-fg-brand hover:underline"
                  >
                    <span>{tDash('viewAll')}</span>
                    <ChevronRight className="w-3.5 h-3.5 rtl:-scale-x-100" />
                  </Link>
                </CardHeader>

                <div className="divide-y divide-line">
                  {data.recentClaims.length === 0 ? (
                    <div className="py-6">
                      <EmptyState
                        title={tDash('noRecentClaims')}
                        description={tDash('noRecentClaimsDesc')}
                      />
                    </div>
                  ) : (
                    data.recentClaims.slice(0, 5).map((claim) => (
                      <div
                        key={claim.id}
                        className="py-3 flex flex-wrap items-start justify-between gap-2"
                      >
                        <div className="flex flex-col gap-1 min-w-0 flex-1 basis-48">
                          {/* Business name with line-clamp-2 (Item 3 & 11) */}
                          <Link
                            href={`/leads/${claim.leadId}`}
                            className="text-body-sm font-semibold text-fg-primary hover:text-fg-brand line-clamp-2 block"
                          >
                            <bdi dir="auto">{claim.lead.businessName}</bdi>
                          </Link>
                          <MetaList
                            items={[
                              <bdi key="city" dir="auto">{getCityLabel(claim.lead.city)}</bdi>,
                              claim.lead.phone ? (
                                <span key="phone" className="ltr-iso tabular-nums">
                                  {claim.lead.phone}
                                </span>
                              ) : (
                                <span key="no-phone">{tDash('noPhone')}</span>
                              ),
                            ]}
                          />
                        </div>

                        {/* Status pill: never wrap, moves under meta line if width is tight (Item 3) */}
                        <div className="shrink-0 self-start sm:self-center">
                          <StageBadge
                            stage={(claim.pipelineStatus as PipelineStage) || 'NEW'}
                            size="sm"
                          />
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </Card>
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
