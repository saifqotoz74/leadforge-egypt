'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { AppShell } from '@/components/domain/AppShell';
import { PageHeader } from '@/components/domain/PageHeader';
import { StatTile } from '@/components/domain/StatTile';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/Table';
import { Skeleton } from '@/components/ui/Skeleton';
import { fmtNumber, formatEGP, fmtDate } from '@/lib/format';
import {
  Briefcase,
  CheckCircle2,
  Sliders,
  Database,
  Layers,
  BarChart3,
  Users,
  Activity,
  ChevronLeft,
} from 'lucide-react';

interface AdminOverviewData {
  overview: {
    totalUsers: number;
    activeSubscribers: number;
    totalLeads: number;
    hotLeads: number;
    warmLeads: number;
    coldLeads: number;
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
  recentAuditLogs: {
    id: string;
    action: string;
    entityType: string;
    createdAt: string;
    user?: { name: string; email: string } | null;
  }[];
}

interface ObservabilitySnapshot {
  systemHealth: {
    liveness: {
      status: 'ALIVE' | 'SHUTTING_DOWN';
      alive: boolean;
      uptimeSeconds: number;
      activeOperations: number;
    };
    readiness: {
      status: 'READY' | 'NOT_READY';
      ready: boolean;
      components: {
        database: { status: string; latencyMs?: number };
      };
    };
  };
  dataIntegrity: {
    healthy: boolean;
    totalViolations: number;
    checkedAt: string;
  } | null;
  performanceAndQueries: {
    cache: {
      entriesCount: number;
      hitRatePct: number;
    };
  };
  securityAndAbuse: {
    flaggedAbuseSignalsCount: number;
  };
}

export default function AdminOverviewPage() {
  const t = useTranslations('admin');
  const [data, setData] = useState<AdminOverviewData | null>(null);
  const [observability, setObservability] = useState<ObservabilitySnapshot | null>(null);
  const [scanningIntegrity, setScanningIntegrity] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const [reportsRes, obsRes] = await Promise.all([
          fetch('/api/admin/reports'),
          fetch('/api/admin/observability'),
        ]);
        if (reportsRes.ok) {
          setData(await reportsRes.json());
        }
        if (obsRes.ok) {
          setObservability(await obsRes.json());
        }
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  async function runIntegrityScan() {
    setScanningIntegrity(true);
    try {
      const res = await fetch('/api/admin/observability', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'RUN_INTEGRITY_CHECKS' }),
      });
      if (res.ok) {
        const result = await res.json();
        if (result.report && observability) {
          setObservability({
            ...observability,
            dataIntegrity: result.report,
          });
        }
      }
    } finally {
      setScanningIntegrity(false);
    }
  }

  return (
    <AppShell isAdmin={true} density="compact" pageTitle={t('pageTitle')}>
      {loading || !data ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4, 5, 6, 7].map((i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          <PageHeader
            title={t('title')}
            description={t('desc')}
            actions={
              <Button
                variant="secondary"
                size="sm"
                onClick={runIntegrityScan}
                isLoading={scanningIntegrity}
                className="gap-1.5"
              >
                <Activity className="h-4 w-4" />
                <span>{t('runIntegrityCheck')}</span>
              </Button>
            }
          />

          {/* Slim Overview Metrics Row with StatTiles per Template T11 */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
            <StatTile
              label={t('totalDevelopers')}
              value={fmtNumber(data.overview.totalUsers)}
              statusText={t('registeredAccounts')}
            />

            <StatTile
              label={t('activeSubscribers')}
              value={fmtNumber(data.overview.activeSubscribers)}
              statusText={t('activeSubsDesc')}
            />

            <StatTile
              label={t('totalLeads')}
              value={fmtNumber(data.overview.totalLeads)}
              statusText={t('inDb')}
            />

            <StatTile
              label={t('hotLeads')}
              value={fmtNumber(data.overview.hotLeads)}
              statusText={t('hotDesc')}
            />

            <StatTile
              label={t('claimedLeads')}
              value={fmtNumber(data.overview.leadsClaimed)}
              statusText={t('claimedDesc')}
            />

            <StatTile
              label={t('wonDeals')}
              value={fmtNumber(data.overview.leadsWon)}
              statusText={t('wonDesc')}
            />

            <StatTile
              label={t('totalRevenue')}
              value={formatEGP(data.overview.revenueEgp)}
              statusText={t('packagesRevenue')}
            />
          </div>

          {/* Quality & Funnel Rates + Navigation Modules */}
          <div className="grid gap-6 lg:grid-cols-12">
            <Card className="lg:col-span-7">
              <CardHeader>
                <CardTitle>{t('qualityTitle')}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  <div className="rounded-xl bg-subtle p-3.5 text-center border border-line">
                    <span className="text-caption font-medium text-fg-secondary">
                      {t('successRate')}
                    </span>
                    <p className="mt-1 text-h2 font-bold font-mono tabular-nums text-brand">
                      {fmtNumber(data.rates.leadSuccessRate)}%
                    </p>
                  </div>

                  <div className="rounded-xl bg-subtle p-3.5 text-center border border-line">
                    <span className="text-caption font-medium text-fg-secondary">
                      {t('invalidRate')}
                    </span>
                    <p className="mt-1 text-h2 font-bold font-mono tabular-nums text-warning-text">
                      {fmtNumber(data.rates.invalidRate)}%
                    </p>
                  </div>

                  <div className="rounded-xl bg-subtle p-3.5 text-center border border-line">
                    <span className="text-caption font-medium text-fg-secondary">
                      {t('contactRate')}
                    </span>
                    <p className="mt-1 text-h2 font-bold font-mono tabular-nums text-fg-primary">
                      {fmtNumber(data.rates.contactRate)}%
                    </p>
                  </div>

                  <div className="rounded-xl bg-subtle p-3.5 text-center border border-line">
                    <span className="text-caption font-medium text-fg-secondary">
                      {t('replyRate')}
                    </span>
                    <p className="mt-1 text-h2 font-bold font-mono tabular-nums text-fg-primary">
                      {fmtNumber(data.rates.replyRate)}%
                    </p>
                  </div>

                  <div className="rounded-xl bg-subtle p-3.5 text-center border border-line">
                    <span className="text-caption font-medium text-fg-secondary">
                      {t('meetingRate')}
                    </span>
                    <p className="mt-1 text-h2 font-bold font-mono tabular-nums text-fg-primary">
                      {fmtNumber(data.rates.meetingRate)}%
                    </p>
                  </div>

                  <div className="rounded-xl bg-subtle p-3.5 text-center border border-line">
                    <span className="text-caption font-medium text-fg-secondary">
                      {t('wonRate')}
                    </span>
                    <p className="mt-1 text-h2 font-bold font-mono tabular-nums text-brand">
                      {fmtNumber(data.rates.wonRate)}%
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="lg:col-span-5">
              <CardHeader>
                <CardTitle>{t('modulesTitle')}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-3 text-body-sm font-medium">
                  <Link
                    href="/admin/leads"
                    className="flex items-center gap-2 rounded-xl border border-line p-3 text-fg-primary hover:border-line-brand hover:bg-subtle transition-colors"
                  >
                    <Briefcase className="h-4 w-4 text-brand" />
                    <span>{t('navLeads')}</span>
                    <ChevronLeft className="h-3.5 w-3.5 ms-auto rtl:-scale-x-100 text-fg-muted" />
                  </Link>

                  <Link
                    href="/admin/quality"
                    className="flex items-center gap-2 rounded-xl border border-line p-3 text-fg-primary hover:border-line-brand hover:bg-subtle transition-colors"
                  >
                    <CheckCircle2 className="h-4 w-4 text-brand" />
                    <span>{t('navQuality')}</span>
                    <ChevronLeft className="h-3.5 w-3.5 ms-auto rtl:-scale-x-100 text-fg-muted" />
                  </Link>

                  <Link
                    href="/admin/users"
                    className="flex items-center gap-2 rounded-xl border border-line p-3 text-fg-primary hover:border-line-brand hover:bg-subtle transition-colors"
                  >
                    <Users className="h-4 w-4 text-brand" />
                    <span>{t('navUsers')}</span>
                    <ChevronLeft className="h-3.5 w-3.5 ms-auto rtl:-scale-x-100 text-fg-muted" />
                  </Link>

                  <Link
                    href="/admin/rules"
                    className="flex items-center gap-2 rounded-xl border border-line p-3 text-fg-primary hover:border-line-brand hover:bg-subtle transition-colors"
                  >
                    <Sliders className="h-4 w-4 text-brand" />
                    <span>{t('navRules')}</span>
                    <ChevronLeft className="h-3.5 w-3.5 ms-auto rtl:-scale-x-100 text-fg-muted" />
                  </Link>

                  <Link
                    href="/admin/sources"
                    className="flex items-center gap-2 rounded-xl border border-line p-3 text-fg-primary hover:border-line-brand hover:bg-subtle transition-colors"
                  >
                    <Database className="h-4 w-4 text-brand" />
                    <span>{t('navSources')}</span>
                    <ChevronLeft className="h-3.5 w-3.5 ms-auto rtl:-scale-x-100 text-fg-muted" />
                  </Link>

                  <Link
                    href="/admin/plans"
                    className="flex items-center gap-2 rounded-xl border border-line p-3 text-fg-primary hover:border-line-brand hover:bg-subtle transition-colors"
                  >
                    <Layers className="h-4 w-4 text-brand" />
                    <span>{t('navPlans')}</span>
                    <ChevronLeft className="h-3.5 w-3.5 ms-auto rtl:-scale-x-100 text-fg-muted" />
                  </Link>

                  <Link
                    href="/admin/reports"
                    className="flex items-center gap-2 rounded-xl border border-line p-3 text-fg-primary hover:border-line-brand hover:bg-subtle transition-colors"
                  >
                    <BarChart3 className="h-4 w-4 text-brand" />
                    <span>{t('navReports')}</span>
                    <ChevronLeft className="h-3.5 w-3.5 ms-auto rtl:-scale-x-100 text-fg-muted" />
                  </Link>

                  <Link
                    href="/admin/analytics"
                    className="flex items-center gap-2 rounded-xl border border-line p-3 text-fg-primary hover:border-line-brand hover:bg-subtle transition-colors"
                  >
                    <BarChart3 className="h-4 w-4 text-brand" />
                    <span>{t('navAnalytics')}</span>
                    <ChevronLeft className="h-3.5 w-3.5 ms-auto rtl:-scale-x-100 text-fg-muted" />
                  </Link>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Operational Observability and Integrity */}
          {observability && (
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>{t('obsTitle')}</CardTitle>
                <span className="text-caption font-mono ltr-iso text-fg-muted">
                  {t('uptime', { sec: fmtNumber(observability.systemHealth.liveness.uptimeSeconds) })}
                </span>
              </CardHeader>
              <CardContent>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <div className="rounded-xl border border-line bg-subtle p-3.5">
                    <span className="text-caption font-medium text-fg-secondary">
                      {t('dbReadiness')}
                    </span>
                    <p
                      className={`mt-1 text-label font-bold ${
                        observability.systemHealth.readiness.ready
                          ? 'text-brand'
                          : 'text-danger-text'
                      }`}
                    >
                      {observability.systemHealth.readiness.status}
                    </p>
                    <span className="text-caption text-fg-muted font-mono ltr-iso">
                      {t('latency', { ms: fmtNumber(observability.systemHealth.readiness.components.database.latencyMs ?? 1) })}
                    </span>
                  </div>

                  <div className="rounded-xl border border-line bg-subtle p-3.5">
                    <span className="text-caption font-medium text-fg-secondary">
                      {t('ledgerIntegrity')}
                    </span>
                    <p
                      className={`mt-1 text-label font-bold ${
                        observability.dataIntegrity?.healthy
                          ? 'text-brand'
                          : 'text-warning-text'
                      }`}
                    >
                      {observability.dataIntegrity?.healthy
                        ? t('healthy100')
                        : t('conflictWarning', { count: fmtNumber(observability.dataIntegrity?.totalViolations ?? 0) })}
                    </p>
                    <span className="text-caption text-fg-muted">
                      {t('violationsCount', { count: observability.dataIntegrity?.totalViolations ?? 0 })}
                    </span>
                  </div>

                  <div className="rounded-xl border border-line bg-subtle p-3.5">
                    <span className="text-caption font-medium text-fg-secondary">
                      {t('cacheEfficiency')}
                    </span>
                    <p className="mt-1 text-label font-bold font-mono tabular-nums text-brand">
                      {t('hitRate', { pct: fmtNumber(observability.performanceAndQueries.cache.hitRatePct) })}
                    </p>
                    <span className="text-caption text-fg-muted">
                      {t('activeEntries', { count: fmtNumber(observability.performanceAndQueries.cache.entriesCount) })}
                    </span>
                  </div>

                  <div className="rounded-xl border border-line bg-subtle p-3.5">
                    <span className="text-caption font-medium text-fg-secondary">
                      {t('abuseSignals')}
                    </span>
                    <p className="mt-1 text-label font-bold font-mono tabular-nums text-fg-primary">
                      {fmtNumber(observability.securityAndAbuse.flaggedAbuseSignalsCount)}
                    </p>
                    <span className="text-caption text-fg-muted">
                      {t('suspiciousSignals')}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Recent Audit Logs Table */}
          <Card>
            <CardHeader>
              <CardTitle>{t('auditTitle')}</CardTitle>
            </CardHeader>
            <CardContent>
              {data.recentAuditLogs.length === 0 ? (
                <div className="py-6">
                  <EmptyState
                    title={t('noAuditLogs')}
                    description={t('noAuditLogsDesc')}
                  />
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t('colAction')}</TableHead>
                        <TableHead>{t('colEntity')}</TableHead>
                        <TableHead>{t('colUser')}</TableHead>
                        <TableHead>{t('colTime')}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.recentAuditLogs.map((log) => (
                        <TableRow key={log.id}>
                          <TableCell className="font-mono text-caption text-brand">
                            {log.action}
                          </TableCell>
                          <TableCell>{log.entityType}</TableCell>
                          <TableCell>
                            {log.user ? `${log.user.name} (${log.user.email})` : t('systemUser')}
                          </TableCell>
                          <TableCell className="text-fg-muted font-mono ltr-iso text-caption">
                            {fmtDate(new Date(log.createdAt))}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </AppShell>
  );
}
