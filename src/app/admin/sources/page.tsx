'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { AppShell } from '@/components/domain/AppShell';
import { PageHeader } from '@/components/domain/PageHeader';
import { StatTile } from '@/components/domain/StatTile';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { Dialog } from '@/components/ui/Dialog';
import { Button } from '@/components/ui/Button';
import { Banner } from '@/components/ui/Banner';
import { Tabs, TabItem } from '@/components/ui/Tabs';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Select } from '@/components/ui/Select';
import { Input } from '@/components/ui/Input';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/Table';
import { fmtNumber } from '@/lib/format';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Database,
  Eye,
  Play,
  Plus,
  RefreshCw,
  RotateCcw,
  Settings,
  ShieldAlert,
  TrendingUp,
  XCircle,
} from 'lucide-react';

interface SourceCostMetric {
  value: number | null;
  currency: 'EGP';
  status: 'OK' | 'INSUFFICIENT_DATA';
}

interface SourceItem {
  id: string;
  name: string;
  type: string;
  description?: string | null;
  isActive: boolean;
  enabled: boolean;
  collectorKey: string;
  collectorVersion: string;
  contractVersion: string;
  configurationStatus: 'CONFIGURED' | 'NOT_CONFIGURED' | 'INVALID';
  healthStatus: 'HEALTHY' | 'DEGRADED' | 'FAILING' | 'DISABLED' | 'NOT_CONFIGURED';
  circuitState: 'CLOSED' | 'OPEN' | 'HALF_OPEN';
  consecutiveFailures: number;
  totalSuccessCount: number;
  totalFailureCount: number;
  averageDurationMs: number;
  scheduleCron?: string | null;
  scheduleIntervalMinutes?: number | null;
  nextRunAt?: string | null;
  lastRunAt?: string | null;
  lastSuccessAt?: string | null;
  lastFailureAt?: string | null;
  priority: number;
  unresolvedDeadLettersCount: number;
  quotas?: {
    maxRecordsPerRun: number;
    batchSize: number;
    requestsPerMinute: number;
    timeoutMs: number;
    maxRetries: number;
  };
  funnelStats?: {
    discovered: number;
    fetched: number;
    normalized: number;
    accepted: number;
    inserted: number;
    updated: number;
    duplicate: number;
    possibleDuplicate: number;
    conflict: number;
    invalid: number;
    failed: number;
    skipped: number;
    saleable: number;
    deadLetter: number;
  };
  rates?: {
    successRate: number;
    duplicateRate: number;
    invalidRate: number;
    conflictRate: number;
    saleableRate: number;
  };
  economics?: {
    hasCostData: boolean;
    totalAcquisitionCostEgp: number | null;
    costPerCollectedRecord: SourceCostMetric;
    costPerUniqueLead: SourceCostMetric;
    costPerSaleableLead: SourceCostMetric;
    costPerClaimedLead: SourceCostMetric;
    costPerWonLead: SourceCostMetric;
  };
}

interface IngestionJobItem {
  id: string;
  sourceId?: string | null;
  sourceName: string;
  fileName?: string | null;
  collectorVersion?: string | null;
  triggerType: string;
  status: string;
  discoveredCount: number;
  fetchedCount: number;
  normalizedCount: number;
  totalRecords: number;
  validCount: number;
  insertedCount: number;
  updatedCount: number;
  duplicateCount: number;
  possibleDuplicateCount: number;
  conflictCount: number;
  invalidCount: number;
  failedCount: number;
  skippedCount: number;
  saleableCount: number;
  deadLetterCount: number;
  retryCount: number;
  durationMs?: number | null;
  errorCode?: string | null;
  errorSummary?: string | null;
  createdAt: string;
  completedAt?: string | null;
}

interface DeadLetterItem {
  id: string;
  sourceId?: string | null;
  sourceName: string;
  sourceType: string;
  importJobId?: string | null;
  externalId?: string | null;
  collectorVersion: string;
  failureStage: string;
  errorCode: string;
  errorMessage: string;
  retryCount: number;
  maxRetries: number;
  status: string;
  rawPayload: Record<string, unknown>;
  firstFailedAt: string;
  lastFailedAt: string;
}

interface OperationalAlertItem {
  code: string;
  severity: 'WARNING' | 'CRITICAL';
  sourceId?: string | null;
  sourceName: string;
  message: string;
  observedValue: number | string;
  thresholdValue: number | string;
  detectedAt: string;
}

interface ReplenishmentDecisionItem {
  ruleId: string;
  category: string;
  city: string | null;
  governorate: string | null;
  requiredService: string | null;
  minRequired: number;
  currentAvailable: number;
  deficit: number;
  needsReplenishment: boolean;
  selectedSources: {
    sourceId: string;
    sourceName: string;
    sourceType: string;
    priority: number;
    healthStatus: string;
    selectionReason: string;
  }[];
  triggeredJobIds: string[];
}

export default function AdminSourcesPage() {
  const t = useTranslations('adminSources');
  const [activeTab, setActiveTab] = useState<'sources' | 'jobs' | 'deadletter' | 'supply'>('sources');
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [bannerMessage, setBannerMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  const [sources, setSources] = useState<SourceItem[]>([]);
  const [summary, setSummary] = useState<Record<string, number>>({});
  const [alerts, setAlerts] = useState<OperationalAlertItem[]>([]);
  const [replenishmentDecisions, setReplenishmentDecisions] = useState<ReplenishmentDecisionItem[]>([]);

  // Jobs state
  const [jobs, setJobs] = useState<IngestionJobItem[]>([]);
  const [jobStatusFilter, setJobStatusFilter] = useState('');
  const [jobSourceFilter, setJobSourceFilter] = useState('');
  const [selectedJobDetail, setSelectedJobDetail] = useState<Record<string, unknown> | null>(null);

  // Dead-letter state
  const [deadLetters, setDeadLetters] = useState<DeadLetterItem[]>([]);
  const [dlStatusFilter, setDlStatusFilter] = useState('DEAD_LETTER');

  // Create/Edit source modals
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newSourceForm, setNewSourceForm] = useState({
    name: '',
    type: 'OPEN_DATA',
    description: '',
    priority: 25,
    scheduleIntervalMinutes: 360,
    maxRecordsPerRun: 500,
    batchSize: 50,
    acquisitionCostPerRunEgp: '',
  });

  const [editingSource, setEditingSource] = useState<SourceItem | null>(null);
  const [editForm, setEditForm] = useState({
    priority: 25,
    scheduleIntervalMinutes: '',
    scheduleCron: '',
    maxRecordsPerRun: 500,
    batchSize: 50,
    acquisitionCostPerRunEgp: '',
  });

  const loadAllData = useCallback(async () => {
    setLoading(true);
    try {
      const jobQuery = new URLSearchParams();
      if (jobStatusFilter) jobQuery.set('status', jobStatusFilter);
      if (jobSourceFilter) jobSourceFilter && jobQuery.set('sourceName', jobSourceFilter);
      jobQuery.set('pageSize', '30');

      const dlQuery = new URLSearchParams();
      if (dlStatusFilter) dlQuery.set('status', dlStatusFilter);
      dlQuery.set('pageSize', '40');

      const [healthRes, jobsRes, dlRes] = await Promise.all([
        fetch('/api/admin/ingestion/health'),
        fetch(`/api/admin/ingestion/jobs?${jobQuery.toString()}`),
        fetch(`/api/admin/ingestion/dead-letter?${dlQuery.toString()}`),
      ]);

      if (healthRes.ok) {
        const hData = await healthRes.json();
        setSources(hData.sources || []);
        setSummary(hData.summary || {});
        setAlerts(hData.alerts || []);
        setReplenishmentDecisions(hData.replenishment?.decisions || []);
      }

      if (jobsRes.ok) {
        const jData = await jobsRes.json();
        setJobs(jData.jobs || []);
      }

      if (dlRes.ok) {
        const dData = await dlRes.json();
        setDeadLetters(dData.items || []);
      }
    } finally {
      setLoading(false);
    }
  }, [jobStatusFilter, jobSourceFilter, dlStatusFilter]);

  useEffect(() => {
    loadAllData();
  }, [loadAllData]);

  async function handleRunSource(source: SourceItem) {
    setActionLoading(`run-${source.id}`);
    setBannerMessage(null);
    try {
      const res = await fetch(`/api/admin/ingestion/sources/${source.id}/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ triggerType: 'MANUAL' }),
      });
      const data = await res.json();
      if (res.ok && data.report) {
        const r = data.report;
        setBannerMessage({
          type: 'success',
          text: `اكتمل تشغيل "${source.name}" (${r.collectorVersion}) — مكتشف: ${r.discovered ?? r.imported} | مقبول جديد: ${r.valid} | مكرر: ${r.duplicates} | غير صالح: ${r.invalid} | قابل للبيع: ${r.saleable ?? 0}`,
        });
        await loadAllData();
      } else {
        setBannerMessage({
          type: 'error',
          text: data.error || 'تعذر تشغيل جامع البيانات.',
        });
      }
    } finally {
      setActionLoading(null);
    }
  }

  async function handleToggleSource(source: SourceItem) {
    setActionLoading(`toggle-${source.id}`);
    try {
      const res = await fetch(`/api/admin/ingestion/sources/${source.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: !source.enabled }),
      });
      if (res.ok) {
        await loadAllData();
      }
    } finally {
      setActionLoading(null);
    }
  }

  async function handleResetCircuit(source: SourceItem) {
    setActionLoading(`reset-${source.id}`);
    try {
      const res = await fetch(`/api/admin/ingestion/sources/${source.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resetCircuit: true }),
      });
      if (res.ok) {
        setBannerMessage({
          type: 'success',
          text: `تمت إعادة ضبط قاطع الدائرة للمصدر "${source.name}".`,
        });
        await loadAllData();
      }
    } finally {
      setActionLoading(null);
    }
  }

  async function handleCreateSource(e: React.FormEvent) {
    e.preventDefault();
    setActionLoading('create-source');
    try {
      const res = await fetch('/api/admin/ingestion/sources', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newSourceForm.name,
          type: newSourceForm.type,
          description: newSourceForm.description,
          priority: Number(newSourceForm.priority),
          scheduleIntervalMinutes: Number(newSourceForm.scheduleIntervalMinutes) || null,
          maxRecordsPerRun: Number(newSourceForm.maxRecordsPerRun),
          batchSize: Number(newSourceForm.batchSize),
          acquisitionCostPerRunEgp: newSourceForm.acquisitionCostPerRunEgp
            ? Number(newSourceForm.acquisitionCostPerRunEgp)
            : null,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setShowCreateModal(false);
        setNewSourceForm({
          name: '',
          type: 'OPEN_DATA',
          description: '',
          priority: 25,
          scheduleIntervalMinutes: 360,
          maxRecordsPerRun: 500,
          batchSize: 50,
          acquisitionCostPerRunEgp: '',
        });
        setBannerMessage({
          type: 'success',
          text: `تمت إضافة المصدر "${data.source?.name}" بنجاح.`,
        });
        await loadAllData();
      } else {
        setBannerMessage({
          type: 'error',
          text: data.error || 'تعذر إنشاء المصدر.',
        });
      }
    } finally {
      setActionLoading(null);
    }
  }

  async function handleSaveEditSource(e: React.FormEvent) {
    e.preventDefault();
    if (!editingSource) return;
    setActionLoading(`edit-${editingSource.id}`);
    try {
      const res = await fetch(`/api/admin/ingestion/sources/${editingSource.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          priority: Number(editForm.priority),
          scheduleIntervalMinutes: editForm.scheduleIntervalMinutes
            ? Number(editForm.scheduleIntervalMinutes)
            : null,
          scheduleCron: editForm.scheduleCron || null,
          maxRecordsPerRun: Number(editForm.maxRecordsPerRun),
          batchSize: Number(editForm.batchSize),
          acquisitionCostPerRunEgp: editForm.acquisitionCostPerRunEgp
            ? Number(editForm.acquisitionCostPerRunEgp)
            : null,
        }),
      });
      if (res.ok) {
        setEditingSource(null);
        setBannerMessage({
          type: 'success',
          text: 'تم تحديث إعدادات الجدولة والحصص بنجاح.',
        });
        await loadAllData();
      }
    } finally {
      setActionLoading(null);
    }
  }

  async function handleInspectJob(jobId: string) {
    setActionLoading(`job-${jobId}`);
    try {
      const res = await fetch(`/api/admin/ingestion/jobs/${jobId}`);
      if (res.ok) {
        const data = await res.json();
        setSelectedJobDetail(data.job);
      }
    } finally {
      setActionLoading(null);
    }
  }

  async function handleCancelJob(jobId: string) {
    setActionLoading(`cancel-${jobId}`);
    try {
      const res = await fetch(`/api/admin/ingestion/jobs/${jobId}/cancel`, {
        method: 'POST',
      });
      if (res.ok) {
        setBannerMessage({ type: 'success', text: 'تم إرسال طلب إلغاء المهمة بنجاح.' });
        await loadAllData();
      }
    } finally {
      setActionLoading(null);
    }
  }

  async function handleDeadLetterAction(
    id: string,
    action: 'RETRY' | 'MARK_INVALID' | 'RESOLVE'
  ) {
    setActionLoading(`dl-${id}-${action}`);
    try {
      const res = await fetch(`/api/admin/ingestion/dead-letter/${id}/retry`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (res.ok) {
        setBannerMessage({
          type: 'success',
          text:
            action === 'RETRY'
              ? 'تمت إعادة معالجة السجل المعلق بنجاح.'
              : action === 'MARK_INVALID'
                ? 'تم تصنيف السجل كغير صالح نهائياً.'
                : 'تم إغلاق السجل المعلق.',
        });
        await loadAllData();
      } else {
        setBannerMessage({
          type: 'error',
          text: data.error || 'تعذر تنفيذ الإجراء على السجل المعلق.',
        });
      }
    } finally {
      setActionLoading(null);
    }
  }

  async function handleTriggerReplenishment() {
    setActionLoading('trigger-replenishment');
    setBannerMessage(null);
    try {
      const res = await fetch('/api/admin/ingestion/health', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'EVALUATE_REPLENISHMENT',
          autoTrigger: true,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setReplenishmentDecisions(data.replenishment?.decisions || []);
        setBannerMessage({
          type: 'success',
          text: `تم فحص مخزون الفرص القابلة للبيع وتشغيل ${data.replenishment?.triggeredJobsCount ?? 0} مهمة إمداد تلقائية.`,
        });
        await loadAllData();
      }
    } finally {
      setActionLoading(null);
    }
  }

  async function handleBulkCrawl() {
    setActionLoading('bulk-crawl');
    setBannerMessage(null);
    try {
      const res = await fetch('/api/admin/ingestion/crawl-bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetCount: 30 }),
      });
      const data = await res.json();
      if (res.ok) {
        setBannerMessage({
          type: 'success',
          text: data.message || 'تم سحب وإدراج الفرص الحية بنجاح!',
        });
        await loadAllData();
      } else {
        setBannerMessage({
          type: 'error',
          text: data.error || 'تعذر استكمال سحب الفرص.',
        });
      }
    } catch (err: any) {
      setBannerMessage({
        type: 'error',
        text: err?.message || 'حدث خطأ في الاتصال أثناء سحب الفرص.',
      });
    } finally {
      setActionLoading(null);
    }
  }

  function renderHealthBadge(status: SourceItem['healthStatus']) {
    switch (status) {
      case 'HEALTHY':
        return <Badge variant="brand">{t('healthHealthy')}</Badge>;
      case 'DEGRADED':
        return <Badge variant="warning">{t('healthDegraded')}</Badge>;
      case 'FAILING':
        return <Badge variant="danger">{t('healthFailing')}</Badge>;
      case 'NOT_CONFIGURED':
        return <Badge variant="neutral">{t('healthNotConfigured')}</Badge>;
      default:
        return <Badge variant="neutral">{status}</Badge>;
    }
  }

  function renderJobStatusBadge(status: string) {
    switch (status) {
      case 'COMPLETED':
        return (
          <span className="rounded-full bg-brand-soft px-2.5 py-0.5 text-caption font-semibold text-brand">
            COMPLETED
          </span>
        );
      case 'PARTIALLY_COMPLETED':
        return (
          <span className="rounded-full bg-warning-bg px-2.5 py-0.5 text-caption font-semibold text-warning-text">
            PARTIALLY_COMPLETED
          </span>
        );
      case 'FAILED':
        return (
          <span className="rounded-full bg-danger-bg px-2.5 py-0.5 text-caption font-semibold text-danger-text">
            FAILED
          </span>
        );
      case 'CANCELLED':
        return (
          <span className="rounded-full bg-subtle px-2.5 py-0.5 text-caption font-medium text-fg-muted">
            CANCELLED
          </span>
        );
      default:
        return (
          <span className="rounded-full bg-brand-soft px-2.5 py-0.5 text-caption font-medium text-brand">
            {status}
          </span>
        );
    }
  }

  const sourceTabs: TabItem[] = [
    {
      id: 'sources',
      label: `${t('tabSources')} (${sources.length})`,
      icon: <Database className="h-4 w-4" />,
    },
    {
      id: 'jobs',
      label: `${t('tabJobs')} (${jobs.length})`,
      icon: <Clock className="h-4 w-4" />,
    },
    {
      id: 'deadletter',
      label: `${t('tabDeadletter')} (${deadLetters.length})`,
      icon: <ShieldAlert className="h-4 w-4" />,
    },
    {
      id: 'supply',
      label: `${t('tabSupply')} (${alerts.length})`,
      icon: <Activity className="h-4 w-4" />,
    },
  ];

  return (
    <AppShell isAdmin={true} density="compact" pageTitle={t('pageTitle')}>
      <div className="space-y-6">
        {/* Template Standard PageHeader */}
        <PageHeader
          title={t('title')}
          description={t('desc')}
          breadcrumbs={[
            { label: t('title') },
          ]}
          actions={
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setShowCreateModal(true)}
                startIcon={<Plus className="h-4 w-4 text-brand rtl:-scale-x-100" />}
              >
                {t('btnAddSource')}
              </Button>

              <Button
                variant="primary"
                size="sm"
                onClick={handleBulkCrawl}
                disabled={actionLoading === 'bulk-crawl'}
                startIcon={<Play className={`h-4 w-4 rtl:-scale-x-100 ${actionLoading === 'bulk-crawl' ? 'animate-spin' : ''}`} />}
              >
                {actionLoading === 'bulk-crawl'
                  ? 'جاري سحب الفرص الحية...'
                  : 'سحب دفعة فرص مصرية حية'}
              </Button>

              <Button
                variant="secondary"
                size="sm"
                onClick={handleTriggerReplenishment}
                disabled={actionLoading === 'trigger-replenishment'}
                startIcon={<TrendingUp className="h-4 w-4 rtl:-scale-x-100" />}
              >
                {actionLoading === 'trigger-replenishment'
                  ? t('btnReplenishing')
                  : t('btnReplenish')}
              </Button>

              <Button
                variant="ghost"
                size="sm"
                onClick={loadAllData}
                disabled={loading}
                startIcon={<RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />}
              >
                {t('btnRefresh')}
              </Button>
            </div>
          }
        />

        {/* Standard Design System StatTiles */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <StatTile
            label={t('kpiHealthy')}
            value={`${summary.healthySources ?? 0} / ${summary.totalSources ?? sources.length}`}
          />
          <StatTile
            label={t('kpiNotConfigured')}
            value={summary.notConfiguredSources ?? 0}
          />
          <StatTile
            label={t('kpiTotalJobs')}
            value={summary.totalJobs ?? jobs.length}
          />
          <StatTile
            label={t('kpiCompletedJobs')}
            value={summary.completedJobs ?? 0}
          />
          <StatTile
            label={t('kpiDeadLetter')}
            value={summary.unresolvedDeadLetters ?? deadLetters.length}
            isOutOfRange={(summary.unresolvedDeadLetters ?? deadLetters.length) > 0}
          />
          <StatTile
            label={t('kpiActiveAlerts')}
            value={summary.activeAlertsCount ?? alerts.length}
            isOutOfRange={(summary.activeAlertsCount ?? alerts.length) > 0}
          />
        </div>

        {bannerMessage && (
          <Banner
            variant={bannerMessage.type === 'success' ? 'info' : 'danger'}
            onClose={() => setBannerMessage(null)}
          >
            {bannerMessage.text}
          </Banner>
        )}

        {/* Standard Design System Segmented Tabs */}
        <Tabs
          variant="segmented"
          tabs={sourceTabs}
          activeTab={activeTab}
          onChange={(id) => setActiveTab(id as any)}
        />

        {loading ? (
          <div className="space-y-4">
            <Skeleton className="h-16 w-full rounded-xl" />
            <Skeleton className="h-64 w-full rounded-xl" />
          </div>
        ) : activeTab === 'sources' ? (
          sources.length === 0 ? (
            <EmptyState
              title={t('emptyTitle')}
              description={t('emptyDesc')}
              action={{
                label: t('btnAddSource'),
                onClick: () => setShowCreateModal(true),
              }}
            />
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {sources.map((src) => (
                <Card
                  key={src.id}
                  className="flex flex-col justify-between rounded-xl border border-line bg-surface p-5 shadow-xs"
                >
                  <div>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="rounded bg-subtle px-2.5 py-0.5 text-xs font-bold text-fg-primary">
                          {src.collectorVersion || src.type}
                        </span>
                        <span className="rounded bg-brand-soft px-2 py-0.5 text-xs font-bold text-brand tabular-nums">
                          {t('priorityPrefix', { priority: src.priority })}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        {renderHealthBadge(src.healthStatus)}
                        {src.circuitState !== 'CLOSED' && (
                          <span className="rounded-full border border-danger-border bg-danger-bg px-2 py-0.5 text-xs font-extrabold text-danger-text">
                            Circuit: {src.circuitState}
                          </span>
                        )}
                      </div>
                    </div>

                    <h2 className="mt-3 flex items-center gap-2 text-base font-extrabold text-fg-primary">
                      <Database className="h-4 w-4 text-brand" />
                      <span><bdi dir="auto">{src.name}</bdi></span>
                    </h2>
                    {src.description && (
                      <p className="mt-1 text-xs text-fg-secondary">
                        <bdi dir="auto">{src.description}</bdi>
                      </p>
                    )}

                    {/* Funnel & Quality Metrics */}
                    {src.funnelStats && (
                      <div className="mt-4 grid grid-cols-4 gap-2 rounded-xl bg-subtle p-3 text-center text-xs">
                        <div>
                          <span className="block text-fg-muted">{t('metricFetched')}</span>
                          <span className="font-extrabold text-fg-primary tabular-nums">
                            {src.funnelStats.fetched}
                          </span>
                        </div>
                        <div>
                          <span className="block text-fg-muted">{t('metricAccepted')}</span>
                          <span className="font-extrabold text-brand tabular-nums">
                            {src.funnelStats.accepted}
                          </span>
                        </div>
                        <div>
                          <span className="block text-fg-muted">{t('metricDuplicate', { rate: src.rates?.duplicateRate ?? 0 })}</span>
                          <span className="font-extrabold text-warning-text tabular-nums">
                            {src.funnelStats.duplicate}
                          </span>
                        </div>
                        <div>
                          <span className="block text-fg-muted">{t('metricSaleable')}</span>
                          <span className="font-extrabold text-brand tabular-nums">
                            {src.funnelStats.saleable}
                          </span>
                        </div>
                      </div>
                    )}

                    {/* Cost & Schedule Info */}
                    <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-fg-secondary">
                      <span>
                        {t('scheduleLabel')}{' '}
                        <strong className="text-fg-primary">
                          {src.scheduleIntervalMinutes
                            ? t('everyMinutes', { mins: src.scheduleIntervalMinutes })
                            : src.scheduleCron || t('manualOnly')}
                        </strong>
                      </span>
                      <span>
                        {t('costPerLeadLabel')}{' '}
                        <strong className="text-fg-primary tabular-nums ltr-iso">
                          {src.economics?.costPerSaleableLead.status === 'OK' &&
                          src.economics.costPerSaleableLead.value !== null
                            ? `${src.economics.costPerSaleableLead.value} EGP`
                            : 'INSUFFICIENT_DATA'}
                        </strong>
                      </span>
                    </div>
                  </div>

                  <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3 text-xs">
                    <div className="text-xs text-fg-muted tabular-nums">
                      {t('lastSuccessLabel')}{' '}
                      {src.lastSuccessAt
                        ? new Date(src.lastSuccessAt).toLocaleDateString('en-US')
                        : '-'}{' '}
                      | {t('avgDurationLabel')} {src.averageDurationMs || 0}ms
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5">
                      {src.circuitState !== 'CLOSED' && (
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => handleResetCircuit(src)}
                          isLoading={actionLoading === `reset-${src.id}`}
                          className="gap-1 text-xs"
                        >
                          <RotateCcw className="h-3.5 w-3.5" />
                          <span>{t('btnResetCircuit')}</span>
                        </Button>
                      )}

                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => {
                          setEditingSource(src);
                          setEditForm({
                            priority: src.priority,
                            scheduleIntervalMinutes: src.scheduleIntervalMinutes
                              ? String(src.scheduleIntervalMinutes)
                              : '',
                            scheduleCron: src.scheduleCron || '',
                            maxRecordsPerRun: src.quotas?.maxRecordsPerRun || 500,
                            batchSize: src.quotas?.batchSize || 50,
                            acquisitionCostPerRunEgp: '',
                          });
                        }}
                        className="gap-1 text-xs"
                      >
                        <Settings className="h-3.5 w-3.5" />
                        <span>{t('btnSettings')}</span>
                      </Button>

                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => handleToggleSource(src)}
                        isLoading={actionLoading === `toggle-${src.id}`}
                        className="text-xs"
                      >
                        {src.enabled ? t('btnDisable') : t('btnEnable')}
                      </Button>

                      <Button
                        variant="primary"
                        size="sm"
                        onClick={() => handleRunSource(src)}
                        isLoading={actionLoading === `run-${src.id}`}
                        disabled={
                          !src.enabled ||
                          src.configurationStatus === 'NOT_CONFIGURED'
                        }
                        className="gap-1 text-xs"
                      >
                        <Play className="h-3.5 w-3.5 rtl:-scale-x-100" />
                        <span>{t('btnRunNow')}</span>
                      </Button>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )
        ) : activeTab === 'jobs' ? (
          <Card className="space-y-4 rounded-xl border border-line bg-surface p-6 shadow-xs">
            <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
              <h2 className="text-base font-extrabold text-fg-primary">
                {t('tabJobs')}
              </h2>

              <div className="flex flex-wrap items-center gap-2 text-xs">
                <div className="w-36">
                  <Select
                    value={jobStatusFilter}
                    onChange={(e) => setJobStatusFilter(e.target.value)}
                  >
                    <option value="">كل الحالات</option>
                    <option value="COMPLETED">COMPLETED</option>
                    <option value="PARTIALLY_COMPLETED">PARTIALLY_COMPLETED</option>
                    <option value="FAILED">FAILED</option>
                    <option value="RUNNING">RUNNING</option>
                    <option value="CANCELLED">CANCELLED</option>
                  </Select>
                </div>

                <div className="w-36">
                  <Select
                    value={jobSourceFilter}
                    onChange={(e) => setJobSourceFilter(e.target.value)}
                  >
                    <option value="">كل المصادر</option>
                    {sources.map((s) => (
                      <option key={s.id} value={s.name}>
                        {s.name}
                      </option>
                    ))}
                  </Select>
                </div>
              </div>
            </div>

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('thSourceVersion')}</TableHead>
                  <TableHead>{t('thType')}</TableHead>
                  <TableHead>{t('thStatus')}</TableHead>
                  <TableHead>{t('thDiscovered')}</TableHead>
                  <TableHead>{t('thNewUpdated')}</TableHead>
                  <TableHead>{t('thDuplicate')}</TableHead>
                  <TableHead>{t('thInvalid')}</TableHead>
                  <TableHead>{t('thSaleable')}</TableHead>
                  <TableHead>{t('thDuration')}</TableHead>
                  <TableHead>{t('thDate')}</TableHead>
                  <TableHead>{t('thActions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {jobs.map((job) => (
                  <TableRow key={job.id}>
                    <TableCell>
                      <span className="block font-bold text-fg-primary">{job.sourceName}</span>
                      <span className="text-xs text-fg-muted">
                        {job.collectorVersion || 'v1'}
                      </span>
                    </TableCell>
                    <TableCell className="text-xs text-fg-secondary">
                      {job.triggerType || 'MANUAL'}
                    </TableCell>
                    <TableCell>{renderJobStatusBadge(job.status)}</TableCell>
                    <TableCell className="tabular-nums">
                      {job.discoveredCount || job.totalRecords} /{' '}
                      {job.fetchedCount || job.totalRecords}
                    </TableCell>
                    <TableCell className="text-brand tabular-nums">
                      {job.validCount}
                    </TableCell>
                    <TableCell className="text-warning-text tabular-nums">
                      {job.duplicateCount} / {job.conflictCount || 0}
                    </TableCell>
                    <TableCell className="text-danger-text tabular-nums">
                      {job.invalidCount} / {job.failedCount || 0}
                    </TableCell>
                    <TableCell className="font-bold text-brand tabular-nums">
                      {job.saleableCount || 0}
                    </TableCell>
                    <TableCell className="text-fg-secondary tabular-nums">
                      {job.durationMs ? `${job.durationMs}ms` : '-'}
                    </TableCell>
                    <TableCell className="text-fg-secondary tabular-nums">
                      {new Date(job.createdAt).toLocaleDateString('en-US')}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => handleInspectJob(job.id)}
                          className="gap-1 text-xs"
                        >
                          <Eye className="h-3 w-3" />
                          <span>{t('btnViewDetails')}</span>
                        </Button>
                        {(job.status === 'RUNNING' || job.status === 'PROCESSING') && (
                          <Button
                            variant="danger"
                            size="sm"
                            onClick={() => handleCancelJob(job.id)}
                            className="gap-1 text-xs"
                          >
                            <XCircle className="h-3 w-3" />
                            <span>إلغاء</span>
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        ) : activeTab === 'deadletter' ? (
          <Card className="space-y-4 rounded-xl border border-line bg-surface p-6 shadow-xs">
            <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
              <div>
                <h2 className="text-base font-extrabold text-fg-primary">
                  {t('tabDeadletter')}
                </h2>
                <p className="text-xs text-fg-secondary">
                  السجلات التي استنفدت محاولات إعادة التشغيل أو واجهت أخطاء معالجة وتحتاج إلى مراجعة
                </p>
              </div>

              <div className="w-40">
                <Select
                  value={dlStatusFilter}
                  onChange={(e) => setDlStatusFilter(e.target.value)}
                >
                  <option value="">كل الحالات</option>
                  <option value="DEAD_LETTER">DEAD_LETTER</option>
                  <option value="RETRIED_RESOLVED">RETRIED_RESOLVED</option>
                  <option value="RETRIED_FAILED">RETRIED_FAILED</option>
                  <option value="PERMANENTLY_INVALID">PERMANENTLY_INVALID</option>
                </Select>
              </div>
            </div>

            {deadLetters.length === 0 ? (
              <div className="rounded-xl border border-line bg-subtle p-8 text-center text-xs font-bold text-fg-secondary">
                لا توجد سجلات معلقة حالياً.
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>المصدر</TableHead>
                    <TableHead>المرحلة / رمز الخطأ</TableHead>
                    <TableHead>سبب الفشل</TableHead>
                    <TableHead>المحاولات</TableHead>
                    <TableHead>الحالة</TableHead>
                    <TableHead>آخر فشل</TableHead>
                    <TableHead>الإجراءات</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {deadLetters.map((dl) => (
                    <TableRow key={dl.id}>
                      <TableCell>
                        <span className="block font-bold text-fg-primary">{dl.sourceName}</span>
                        <span className="text-xs text-fg-muted">
                          {dl.externalId || dl.collectorVersion}
                        </span>
                      </TableCell>
                      <TableCell className="text-xs text-danger-text">
                        {dl.failureStage} / {dl.errorCode}
                      </TableCell>
                      <TableCell className="text-fg-primary">{dl.errorMessage}</TableCell>
                      <TableCell className="tabular-nums">
                        {dl.retryCount} / {dl.maxRetries}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            dl.status === 'DEAD_LETTER'
                              ? 'neutral'
                              : dl.status === 'RETRIED_RESOLVED' || dl.status === 'RESOLVED' || dl.status === 'RETRIED'
                                ? 'brand'
                                : dl.status === 'RETRIED_FAILED'
                                  ? 'danger'
                                  : 'neutral'
                          }
                          className="text-xs"
                        >
                          {dl.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-fg-secondary tabular-nums">
                        {new Date(dl.lastFailedAt).toLocaleString('en-US')}
                      </TableCell>
                      <TableCell>
                        {dl.status === 'DEAD_LETTER' && (
                          <div className="flex items-center gap-1.5">
                            <Button
                              variant="primary"
                              size="sm"
                              onClick={() => handleDeadLetterAction(dl.id, 'RETRY')}
                              disabled={actionLoading === `dl-${dl.id}-RETRY`}
                              className="text-xs"
                            >
                              إعادة المحاولة
                            </Button>
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => handleDeadLetterAction(dl.id, 'MARK_INVALID')}
                              disabled={actionLoading === `dl-${dl.id}-MARK_INVALID`}
                              className="text-xs"
                            >
                              غير صالح
                            </Button>
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </Card>
        ) : (
          /* TAB 4: SUPPLY */
          <div className="space-y-6">
            <Card className="rounded-xl border border-line bg-surface p-6 shadow-xs">
              <h2 className="text-base font-extrabold text-fg-primary">
                التنبيهات التشغيلية الحتمية
              </h2>
              {alerts.length === 0 ? (
                <p className="mt-3 text-xs font-bold text-brand">
                  جميع المصادر تعمل ضمن الحدود الطبيعية دون أي تنبيهات حرجة.
                </p>
              ) : (
                <div className="mt-4 space-y-2.5">
                  {alerts.map((alert, idx) => (
                    <div
                      key={`${alert.code}-${idx}`}
                      className={`flex items-center justify-between rounded-xl border p-3.5 text-xs ${
                        alert.severity === 'CRITICAL'
                          ? 'border-danger-border bg-danger-bg text-danger-text'
                          : 'border-warning-border bg-warning-bg text-warning-text'
                      }`}
                    >
                      <div>
                        <span className="text-xs font-extrabold">
                          [{alert.severity}] {alert.code}
                        </span>
                        <p className="mt-0.5 font-bold">{alert.message}</p>
                      </div>
                      <span className="text-xs tabular-nums">
                        القيمة: {alert.observedValue} (الحد: {alert.thresholdValue})
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </Card>

            <Card className="rounded-xl border border-line bg-surface p-6 shadow-xs">
              <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
                <div>
                  <h2 className="text-base font-extrabold text-fg-primary">
                    قواعد الإمداد المستمر وموازنة المخزون القابل للبيع
                  </h2>
                  <p className="text-xs text-fg-secondary">
                    مراقبة الفرص المتاحة القابلة للبيع حسب القطاع والمدينة والخدمة المطلوبة
                  </p>
                </div>
              </div>

              <div className="mt-4">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>القطاع</TableHead>
                      <TableHead>المدينة / المحافظة</TableHead>
                      <TableHead>الخدمة المطلوبة</TableHead>
                      <TableHead>الحد الأدنى المطلوب</TableHead>
                      <TableHead>المتوفر حالياً</TableHead>
                      <TableHead>العجز</TableHead>
                      <TableHead>المصادر المرشحة للإمداد</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {replenishmentDecisions.map((d) => (
                      <TableRow key={d.ruleId}>
                        <TableCell className="font-bold text-fg-primary">{d.category}</TableCell>
                        <TableCell>{d.city || d.governorate || 'كل المدن'}</TableCell>
                        <TableCell className="text-xs">
                          {d.requiredService || 'الكل'}
                        </TableCell>
                        <TableCell className="tabular-nums">{d.minRequired}</TableCell>
                        <TableCell className="text-brand tabular-nums">{d.currentAvailable}</TableCell>
                        <TableCell>
                          {d.needsReplenishment ? (
                            <Badge variant="neutral" className="bg-danger-bg text-danger-text tabular-nums">
                              عجز -{d.deficit}
                            </Badge>
                          ) : (
                            <Badge variant="brand">
                              مكتمل
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-xs text-fg-secondary">
                          {d.selectedSources.length > 0
                            ? d.selectedSources.map((s) => s.sourceName).join(' ، ')
                            : '-'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </Card>
          </div>
        )}

        {/* Modal: Create Source */}
        <Dialog
          isOpen={showCreateModal}
          onClose={() => setShowCreateModal(false)}
          title={t('dialogCreateTitle')}
          size="md"
        >
          <form onSubmit={handleCreateSource} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-fg-primary">{t('sourceNameLabel')}</label>
              <input
                type="text"
                required
                value={newSourceForm.name}
                onChange={(e) => setNewSourceForm({ ...newSourceForm, name: e.target.value })}
                className="mt-1 w-full rounded-lg border border-line bg-surface px-3 py-2 text-xs text-fg-primary"
                placeholder="مثال: دليل العيادات الطبية بالقاهرة"
              />
            </div>

            <div>
              <Select
                label={t('collectorTypeLabel')}
                value={newSourceForm.type}
                onChange={(e) => setNewSourceForm({ ...newSourceForm, type: e.target.value })}
              >
                <option value="OPEN_DATA">OPEN_DATA</option>
                <option value="DIRECTORY">DIRECTORY</option>
                <option value="CSV_IMPORT">CSV_IMPORT</option>
                <option value="WEBSITE">WEBSITE</option>
                <option value="GOOGLE_MAPS">GOOGLE_MAPS</option>
                <option value="MANUAL">MANUAL</option>
              </Select>
            </div>

            <div>
              <label className="block text-xs font-bold text-fg-primary">{t('descLabel')}</label>
              <input
                type="text"
                value={newSourceForm.description}
                onChange={(e) =>
                  setNewSourceForm({ ...newSourceForm, description: e.target.value })
                }
                className="mt-1 w-full rounded-lg border border-line bg-surface px-3 py-2 text-xs text-fg-primary"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-fg-primary">{t('priorityLabel')}</label>
                <input
                  type="number"
                  value={newSourceForm.priority}
                  onChange={(e) =>
                    setNewSourceForm({ ...newSourceForm, priority: Number(e.target.value) })
                  }
                  className="mt-1 w-full rounded-lg border border-line bg-surface px-3 py-2 text-xs tabular-nums text-fg-primary"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-fg-primary">
                  {t('intervalLabel')}
                </label>
                <input
                  type="number"
                  value={newSourceForm.scheduleIntervalMinutes}
                  onChange={(e) =>
                    setNewSourceForm({
                      ...newSourceForm,
                      scheduleIntervalMinutes: Number(e.target.value),
                    })
                  }
                  className="mt-1 w-full rounded-lg border border-line bg-surface px-3 py-2 text-xs tabular-nums text-fg-primary"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button
                variant="ghost"
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="text-xs"
              >
                {t('btnCancel')}
              </Button>
              <Button
                variant="primary"
                type="submit"
                disabled={actionLoading === 'create-source'}
                className="text-xs"
              >
                {t('btnSave')}
              </Button>
            </div>
          </form>
        </Dialog>

        {/* Modal: Edit Source Settings */}
        <Dialog
          isOpen={!!editingSource}
          onClose={() => setEditingSource(null)}
          title={editingSource ? `${t('dialogEditTitle')}: ${editingSource.name}` : ''}
          size="md"
        >
          <form onSubmit={handleSaveEditSource} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-fg-primary">{t('priorityLabel')}</label>
                <input
                  type="number"
                  value={editForm.priority}
                  onChange={(e) =>
                    setEditForm({ ...editForm, priority: Number(e.target.value) })
                  }
                  className="mt-1 w-full rounded-lg border border-line bg-surface px-3 py-2 text-xs tabular-nums text-fg-primary"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-fg-primary">
                  {t('intervalLabel')}
                </label>
                <input
                  type="number"
                  value={editForm.scheduleIntervalMinutes}
                  onChange={(e) =>
                    setEditForm({ ...editForm, scheduleIntervalMinutes: e.target.value })
                  }
                  className="mt-1 w-full rounded-lg border border-line bg-surface px-3 py-2 text-xs tabular-nums text-fg-primary"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-fg-primary">
                  الحد الأقصى للسجلات / تشغيل
                </label>
                <input
                  type="number"
                  value={editForm.maxRecordsPerRun}
                  onChange={(e) =>
                    setEditForm({ ...editForm, maxRecordsPerRun: Number(e.target.value) })
                  }
                  className="mt-1 w-full rounded-lg border border-line bg-surface px-3 py-2 text-xs tabular-nums text-fg-primary"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-fg-primary">حجم الدفعة</label>
                <input
                  type="number"
                  value={editForm.batchSize}
                  onChange={(e) =>
                    setEditForm({ ...editForm, batchSize: Number(e.target.value) })
                  }
                  className="mt-1 w-full rounded-lg border border-line bg-surface px-3 py-2 text-xs tabular-nums text-fg-primary"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button
                variant="ghost"
                type="button"
                onClick={() => setEditingSource(null)}
                className="text-xs"
              >
                {t('btnCancel')}
              </Button>
              <Button
                variant="primary"
                type="submit"
                className="text-xs"
              >
                {t('btnSaveSettings')}
              </Button>
            </div>
          </form>
        </Dialog>

        {/* Modal: Job Detail Inspection */}
        <Dialog
          isOpen={!!selectedJobDetail}
          onClose={() => setSelectedJobDetail(null)}
          title={selectedJobDetail ? `${t('dialogJobDetailTitle')}: ${String(selectedJobDetail.sourceName || '')}` : ''}
          size="lg"
        >
          {selectedJobDetail && (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-3 text-xs">
                <div className="rounded-lg bg-subtle p-3">
                  <span className="text-fg-muted">معرف المهمة</span>
                  <p className="mt-1 font-bold text-fg-primary">
                    {String(selectedJobDetail.id)}
                  </p>
                </div>
                <div className="rounded-lg bg-subtle p-3">
                  <span className="text-fg-muted">نسخة المجمّع والعقد</span>
                  <p className="mt-1 font-bold text-fg-primary">
                    {String(selectedJobDetail.collectorVersion || 'v1')} /{' '}
                    {String(selectedJobDetail.contractVersion || 'INGESTION_CONTRACT_V1')}
                  </p>
                </div>
                <div className="rounded-lg bg-subtle p-3">
                  <span className="text-fg-muted">نقطة الاستئناف</span>
                  <p className="mt-1 font-bold text-fg-primary">
                    {selectedJobDetail.checkpoint
                      ? `Offset: ${(selectedJobDetail.checkpoint as { offset?: number }).offset ?? 0}`
                      : 'لا يوجد'}
                  </p>
                </div>
              </div>

              {Boolean(selectedJobDetail.errorSummary) && (
                <div className="rounded-xl border border-danger-border bg-danger-bg p-3 text-xs text-danger-text">
                  <strong>ملخص الأخطاء ({String(selectedJobDetail.errorCode || 'ERROR')}):</strong>{' '}
                  {String(selectedJobDetail.errorSummary)}
                </div>
              )}

              <div>
                <h4 className="text-xs font-extrabold text-fg-primary mb-2">
                  السجلات المعالجة داخل المهمة
                </h4>
                <Table containerClassName="max-h-60 overflow-y-auto">
                  <TableHeader>
                    <TableRow>
                      <TableHead>#</TableHead>
                      <TableHead>المعرف الخارجي</TableHead>
                      <TableHead>المرحلة</TableHead>
                      <TableHead>الحالة</TableHead>
                      <TableHead>ملاحظات</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {Array.isArray(selectedJobDetail.records) &&
                      (
                        selectedJobDetail.records as {
                          id: string;
                          rowNumber: number;
                          externalId?: string;
                          lifecycleStage?: string;
                          status: string;
                          errorMessage?: string;
                        }[]
                      ).map((rec) => (
                        <TableRow key={rec.id}>
                          <TableCell className="tabular-nums">{rec.rowNumber}</TableCell>
                          <TableCell>{rec.externalId || '-'}</TableCell>
                          <TableCell>
                            {rec.lifecycleStage || rec.status}
                          </TableCell>
                          <TableCell className="font-bold">{rec.status}</TableCell>
                          <TableCell className="text-fg-secondary">
                            {rec.errorMessage || '-'}
                          </TableCell>
                        </TableRow>
                      ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
        </Dialog>
      </div>
    </AppShell>
  );
}
