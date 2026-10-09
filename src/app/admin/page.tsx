'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { AppShell } from '@/components/domain/AppShell';
import { PageHeader } from '@/components/domain/PageHeader';
import { StatTile } from '@/components/domain/StatTile';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
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
    <AppShell isAdmin={true} density="compact" pageTitle="نظرة عامة على المنظومة">
      {loading || !data ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4, 5, 6, 7].map((i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          <PageHeader
            title="نظرة عامة على المنظومة والعمليات"
            description="متابعة مؤشرات الأداء اللحظية، محركات الفحص، وسلامة دفاتر الرصيد"
            actions={
              <Button
                variant="secondary"
                size="sm"
                onClick={runIntegrityScan}
                isLoading={scanningIntegrity}
                className="gap-1.5"
              >
                <Activity className="h-4 w-4" />
                <span>فحص سلامة الرصيد والبيانات</span>
              </Button>
            }
          />

          {/* Slim Overview Metrics Row with StatTiles per Template T11 */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
            <StatTile
              label="إجمالي المطورين"
              value={fmtNumber(data.overview.totalUsers)}
              statusText="الحسابات المسجلة"
            />

            <StatTile
              label="المشتركون النشطون"
              value={fmtNumber(data.overview.activeSubscribers)}
              statusText="اشتراكات فعالة"
            />

            <StatTile
              label="إجمالي الفرص"
              value={fmtNumber(data.overview.totalLeads)}
              statusText="بقاعدة البيانات"
            />

            <StatTile
              label="الفرص الساخنة"
              value={fmtNumber(data.overview.hotLeads)}
              statusText="HOT & PREMIUM"
            />

            <StatTile
              label="الفرص المشتراة"
              value={fmtNumber(data.overview.leadsClaimed)}
              statusText="تم شراؤها"
            />

            <StatTile
              label="الصفقات الناجحة"
              value={fmtNumber(data.overview.leadsWon)}
              statusText="صفقات مغلقة"
            />

            <StatTile
              label="إجمالي الإيرادات"
              value={formatEGP(data.overview.revenueEgp)}
              statusText="عبر الباقات"
            />
          </div>

          {/* Quality & Funnel Rates + Navigation Modules */}
          <div className="grid gap-6 lg:grid-cols-12">
            <Card className="lg:col-span-7">
              <CardHeader>
                <CardTitle>مؤشرات جودة الفرص ومعدلات التحويل</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  <div className="rounded-xl bg-subtle p-3.5 text-center border border-line">
                    <span className="text-caption font-medium text-fg-secondary">
                      نسبة نجاح الفرص
                    </span>
                    <p className="mt-1 text-h2 font-bold font-mono tabular-nums text-brand">
                      {fmtNumber(data.rates.leadSuccessRate)}%
                    </p>
                  </div>

                  <div className="rounded-xl bg-subtle p-3.5 text-center border border-line">
                    <span className="text-caption font-medium text-fg-secondary">
                      نسبة غير الصالح
                    </span>
                    <p className="mt-1 text-h2 font-bold font-mono tabular-nums text-warning-text">
                      {fmtNumber(data.rates.invalidRate)}%
                    </p>
                  </div>

                  <div className="rounded-xl bg-subtle p-3.5 text-center border border-line">
                    <span className="text-caption font-medium text-fg-secondary">
                      معدل التواصل
                    </span>
                    <p className="mt-1 text-h2 font-bold font-mono tabular-nums text-fg-primary">
                      {fmtNumber(data.rates.contactRate)}%
                    </p>
                  </div>

                  <div className="rounded-xl bg-subtle p-3.5 text-center border border-line">
                    <span className="text-caption font-medium text-fg-secondary">
                      معدل الرد
                    </span>
                    <p className="mt-1 text-h2 font-bold font-mono tabular-nums text-fg-primary">
                      {fmtNumber(data.rates.replyRate)}%
                    </p>
                  </div>

                  <div className="rounded-xl bg-subtle p-3.5 text-center border border-line">
                    <span className="text-caption font-medium text-fg-secondary">
                      معدل الاجتماعات
                    </span>
                    <p className="mt-1 text-h2 font-bold font-mono tabular-nums text-fg-primary">
                      {fmtNumber(data.rates.meetingRate)}%
                    </p>
                  </div>

                  <div className="rounded-xl bg-subtle p-3.5 text-center border border-line">
                    <span className="text-caption font-medium text-fg-secondary">
                      معدل الفوز
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
                <CardTitle>وحدات الإدارة والمحركات</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-3 text-body-sm font-medium">
                  <Link
                    href="/admin/leads"
                    className="flex items-center gap-2 rounded-xl border border-line p-3 text-fg-primary hover:border-line-brand hover:bg-subtle transition-colors"
                  >
                    <Briefcase className="h-4 w-4 text-brand" />
                    <span>سجل الفرص</span>
                  </Link>

                  <Link
                    href="/admin/quality"
                    className="flex items-center gap-2 rounded-xl border border-line p-3 text-fg-primary hover:border-line-brand hover:bg-subtle transition-colors"
                  >
                    <CheckCircle2 className="h-4 w-4 text-brand" />
                    <span>جودة البيانات</span>
                  </Link>

                  <Link
                    href="/admin/users"
                    className="flex items-center gap-2 rounded-xl border border-line p-3 text-fg-primary hover:border-line-brand hover:bg-subtle transition-colors"
                  >
                    <Users className="h-4 w-4 text-brand" />
                    <span>المستخدمون</span>
                  </Link>

                  <Link
                    href="/admin/rules"
                    className="flex items-center gap-2 rounded-xl border border-line p-3 text-fg-primary hover:border-line-brand hover:bg-subtle transition-colors"
                  >
                    <Sliders className="h-4 w-4 text-brand" />
                    <span>قواعد التقييم</span>
                  </Link>

                  <Link
                    href="/admin/sources"
                    className="flex items-center gap-2 rounded-xl border border-line p-3 text-fg-primary hover:border-line-brand hover:bg-subtle transition-colors"
                  >
                    <Database className="h-4 w-4 text-brand" />
                    <span>مصادر البيانات</span>
                  </Link>

                  <Link
                    href="/admin/plans"
                    className="flex items-center gap-2 rounded-xl border border-line p-3 text-fg-primary hover:border-line-brand hover:bg-subtle transition-colors"
                  >
                    <Layers className="h-4 w-4 text-brand" />
                    <span>إعدادات الباقات</span>
                  </Link>

                  <Link
                    href="/admin/reports"
                    className="flex items-center gap-2 rounded-xl border border-line p-3 text-fg-primary hover:border-line-brand hover:bg-subtle transition-colors"
                  >
                    <BarChart3 className="h-4 w-4 text-brand" />
                    <span>سجل التدقيق</span>
                  </Link>

                  <Link
                    href="/admin/analytics"
                    className="flex items-center gap-2 rounded-xl border border-line p-3 text-fg-primary hover:border-line-brand hover:bg-subtle transition-colors"
                  >
                    <BarChart3 className="h-4 w-4 text-brand" />
                    <span>تحليلات المنظومة</span>
                  </Link>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Operational Observability and Integrity */}
          {observability && (
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>سلامة المنظومة والمراقبة التشغيلية</CardTitle>
                <span className="text-caption font-mono ltr-iso text-fg-muted">
                  Uptime: {fmtNumber(observability.systemHealth.liveness.uptimeSeconds)}s
                </span>
              </CardHeader>
              <CardContent>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <div className="rounded-xl border border-line bg-subtle p-3.5">
                    <span className="text-caption font-medium text-fg-secondary">
                      جاهزية النظام وقاعدة البيانات
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
                      Latency: {fmtNumber(observability.systemHealth.readiness.components.database.latencyMs ?? 1)}ms
                    </span>
                  </div>

                  <div className="rounded-xl border border-line bg-subtle p-3.5">
                    <span className="text-caption font-medium text-fg-secondary">
                      سلامة دفتر الرصيد
                    </span>
                    <p
                      className={`mt-1 text-label font-bold ${
                        observability.dataIntegrity?.healthy
                          ? 'text-brand'
                          : 'text-warning-text'
                      }`}
                    >
                      {observability.dataIntegrity?.healthy
                        ? 'سليم 100%'
                        : `تنبيه (${fmtNumber(observability.dataIntegrity?.totalViolations ?? 0)} تعارض)`}
                    </p>
                    <span className="text-caption text-fg-muted">
                      {observability.dataIntegrity?.totalViolations ?? 0} مخالفات
                    </span>
                  </div>

                  <div className="rounded-xl border border-line bg-subtle p-3.5">
                    <span className="text-caption font-medium text-fg-secondary">
                      كفاءة الذاكرة المؤقتة (Cache)
                    </span>
                    <p className="mt-1 text-label font-bold font-mono tabular-nums text-brand">
                      {fmtNumber(observability.performanceAndQueries.cache.hitRatePct)}% Hit Rate
                    </p>
                    <span className="text-caption text-fg-muted">
                      {fmtNumber(observability.performanceAndQueries.cache.entriesCount)} مدخلات فعالة
                    </span>
                  </div>

                  <div className="rounded-xl border border-line bg-subtle p-3.5">
                    <span className="text-caption font-medium text-fg-secondary">
                      إشارات الحماية وإساءة الاستخدام
                    </span>
                    <p className="mt-1 text-label font-bold font-mono tabular-nums text-fg-primary">
                      {fmtNumber(observability.securityAndAbuse.flaggedAbuseSignalsCount)}
                    </p>
                    <span className="text-caption text-fg-muted">
                      إشارات مشبوهة مرصودة
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Recent Audit Logs Table */}
          <Card>
            <CardHeader>
              <CardTitle>سجل العمليات الإدارية والتدقيق الأمني</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>العملية (Action)</TableHead>
                      <TableHead>الكيان (Entity)</TableHead>
                      <TableHead>المستخدم</TableHead>
                      <TableHead>التوقيت</TableHead>
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
                          {log.user ? `${log.user.name} (${log.user.email})` : 'النظام'}
                        </TableCell>
                        <TableCell className="text-fg-muted font-mono ltr-iso text-caption">
                          {fmtDate(new Date(log.createdAt))}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </AppShell>
  );
}
