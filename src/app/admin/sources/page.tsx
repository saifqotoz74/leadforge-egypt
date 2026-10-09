'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { AppShell } from '@/components/domain/AppShell';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { Dialog } from '@/components/ui/Dialog';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
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

  return (
    <AppShell isAdmin={true} density="compact" pageTitle={t('pageTitle')}>
      <div className="space-y-6">
        {/* Header */}
        <Card className="rounded-xl border border-line bg-surface p-6 shadow-xs">
          <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
            <div>
              <h1 className="text-xl font-extrabold text-fg-primary">
                {t('title')}
              </h1>
              <p className="mt-1 text-xs text-fg-secondary">
                {t('desc')}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setShowCreateModal(true)}
                className="gap-1.5 text-xs"
              >
                <Plus className="h-4 w-4 text-brand rtl:-scale-x-100" />
                <span>{t('btnAddSource')}</span>
              </Button>

              <Button
                variant="primary"
                size="sm"
                onClick={handleTriggerReplenishment}
                disabled={actionLoading === 'trigger-replenishment'}
                className="gap-1.5 text-xs"
              >
                <TrendingUp className="h-4 w-4 rtl:-scale-x-100" />
                <span>
                  {actionLoading === 'trigger-replenishment'
                    ? t('btnReplenishing')
                    : t('btnReplenish')}
                </span>
              </Button>

              <Button
                variant="ghost"
                size="sm"
                onClick={loadAllData}
                disabled={loading}
                className="gap-1.5 text-xs"
              >
                <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                <span>{t('btnRefresh')}</span>
              </Button>
            </div>
          </div>
        </Card>

        {/* KPI Summary Cards */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <Card className="rounded-xl border border-line bg-surface p-4 shadow-xs">
            <span className="text-xs font-bold text-fg-secondary">{t('kpiHealthy')}</span>
            <p className="mt-1 text-xl font-extrabold text-brand font-mono tabular-nums">
              {summary.healthySources ?? 0} / {summary.totalSources ?? sources.length}
            </p>
          </Card>
          <Card className="rounded-xl border border-line bg-surface p-4 shadow-xs">
            <span className="text-xs font-bold text-fg-secondary">{t('kpiNotConfigured')}</span>
            <p className="mt-1 text-xl font-extrabold text-brand font-mono tabular-nums">
              {summary.notConfiguredSources ?? 0}
            </p>
          </Card>
          <Card className="rounded-xl border border-line bg-surface p-4 shadow-xs">
            <span className="text-xs font-bold text-fg-secondary">{t('kpiTotalJobs')}</span>
            <p className="mt-1 text-xl font-extrabold text-fg-primary font-mono tabular-nums">
              {summary.totalJobs ?? jobs.length}
            </p>
          </Card>
          <Card className="rounded-xl border border-line bg-surface p-4 shadow-xs">
            <span className="text-xs font-bold text-fg-secondary">{t('kpiCompletedJobs')}</span>
            <p className="mt-1 text-xl font-extrabold text-brand font-mono tabular-nums">
              {summary.completedJobs ?? 0}
            </p>
          </Card>
          <Card className="rounded-xl border border-line bg-surface p-4 shadow-xs">
            <span className="text-xs font-bold text-fg-secondary">{t('kpiDeadLetter')}</span>
            <p className="mt-1 text-xl font-extrabold text-warning-text font-mono tabular-nums">
              {summary.unresolvedDeadLetters ?? deadLetters.length}
            </p>
          </Card>
          <Card className="rounded-xl border border-line bg-surface p-4 shadow-xs">
            <span className="text-xs font-bold text-fg-secondary">{t('kpiActiveAlerts')}</span>
            <p className="mt-1 text-xl font-extrabold text-danger-text font-mono tabular-nums">
              {summary.activeAlertsCount ?? alerts.length}
            </p>
          </Card>
        </div>

        {bannerMessage && (
          <div
            className={`rounded-xl border p-4 text-xs font-bold ${
              bannerMessage.type === 'success'
                ? 'border-line-brand bg-brand-soft text-brand'
                : 'border-danger-border bg-danger-bg text-danger-text'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2">
                {bannerMessage.type === 'success' ? (
                  <CheckCircle2 className="h-4 w-4 text-brand" />
                ) : (
                  <AlertTriangle className="h-4 w-4 text-danger-text" />
                )}
                {bannerMessage.text}
              </span>
              <button
                onClick={() => setBannerMessage(null)}
                className="text-fg-secondary hover:text-fg-primary"
              >
                ✕
              </button>
            </div>
          </div>
        )}

        {/* Navigation Tabs */}
        <div className="flex flex-wrap gap-2 border-b border-line pb-3">
          <button
            onClick={() => setActiveTab('sources')}
            className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-extrabold transition ${
              activeTab === 'sources'
                ? 'bg-brand text-fg-inverted shadow-xs'
                : 'border border-line bg-surface text-fg-secondary hover:bg-subtle'
            }`}
          >
            <Database className="h-4 w-4" />
            <span>{t('tabSources')} ({sources.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('jobs')}
            className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-extrabold transition ${
              activeTab === 'jobs'
                ? 'bg-brand text-fg-inverted shadow-xs'
                : 'border border-line bg-surface text-fg-secondary hover:bg-subtle'
            }`}
          >
            <Clock className="h-4 w-4" />
            <span>{t('tabJobs')} ({jobs.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('deadletter')}
            className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-extrabold transition ${
              activeTab === 'deadletter'
                ? 'bg-brand text-fg-inverted shadow-xs'
                : 'border border-line bg-surface text-fg-secondary hover:bg-subtle'
            }`}
          >
            <ShieldAlert className="h-4 w-4" />
            <span>{t('tabDeadletter')} ({deadLetters.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('supply')}
            className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-extrabold transition ${
              activeTab === 'supply'
                ? 'bg-brand text-fg-inverted shadow-xs'
                : 'border border-line bg-surface text-fg-secondary hover:bg-subtle'
            }`}
          >
            <Activity className="h-4 w-4" />
            <span>{t('tabSupply')} ({alerts.length})</span>
          </button>
        </div>

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
                        <span className="rounded bg-subtle px-2.5 py-0.5 font-mono text-xs font-bold text-fg-primary">
                          {src.collectorVersion || src.type}
                        </span>
                        <span className="rounded bg-brand-soft px-2 py-0.5 text-xs font-bold text-brand font-mono tabular-nums">
                          {t('priorityPrefix', { priority: src.priority })}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        {renderHealthBadge(src.healthStatus)}
                        {src.circuitState !== 'CLOSED' && (
                          <span className="rounded-full bg-danger-fill px-2 py-0.5 text-xs font-extrabold text-fg-inverted">
                            Circuit: {src.circuitState}
                          </span>
                        )}
                      </div>
                    </div>

                    <h2 className="mt-3 flex items-center gap-2 text-base font-extrabold text-fg-primary">
                      <Database className="h-4 w-4 text-brand" />
                      <span>{src.name}</span>
                    </h2>
                    <p className="mt-1 text-xs text-fg-secondary">{src.description}</p>

                    {/* Funnel & Quality Metrics */}
                    {src.funnelStats && (
                      <div className="mt-4 grid grid-cols-4 gap-2 rounded-xl bg-subtle p-3 text-center text-xs">
                        <div>
                          <span className="block text-fg-muted">{t('metricFetched')}</span>
                          <span className="font-extrabold text-fg-primary font-mono tabular-nums">
                            {src.funnelStats.fetched}
                          </span>
                        </div>
                        <div>
                          <span className="block text-fg-muted">{t('metricAccepted')}</span>
                          <span className="font-extrabold text-brand font-mono tabular-nums">
                            {src.funnelStats.accepted}
                          </span>
                        </div>
                        <div>
                          <span className="block text-fg-muted">{t('metricDuplicate', { rate: src.rates?.duplicateRate ?? 0 })}</span>
                          <span className="font-extrabold text-warning-text font-mono tabular-nums">
                            {src.funnelStats.duplicate}
                          </span>
                        </div>
                        <div>
                          <span className="block text-fg-muted">{t('metricSaleable')}</span>
                          <span className="font-extrabold text-brand font-mono tabular-nums">
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
                        <strong className="text-fg-primary font-mono tabular-nums">
                          {src.economics?.costPerSaleableLead.status === 'OK' &&
                          src.economics.costPerSaleableLead.value !== null
                            ? `${src.economics.costPerSaleableLead.value} EGP`
                            : 'INSUFFICIENT_DATA'}
                        </strong>
                      </span>
                    </div>
                  </div>

                  <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3 text-xs">
                    <div className="text-xs text-fg-muted font-mono tabular-nums">
                      {t('lastSuccessLabel')}{' '}
                      {src.lastSuccessAt
                        ? new Date(src.lastSuccessAt).toLocaleDateString()
                        : '—'}{' '}
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
                <select
                  value={jobStatusFilter}
                  onChange={(e) => setJobStatusFilter(e.target.value)}
                  className="rounded-lg border border-line bg-surface px-3 py-1.5 font-bold text-fg-primary"
                >
                  <option value="">كل الحالات</option>
                  <option value="COMPLETED">COMPLETED</option>
                  <option value="PARTIALLY_COMPLETED">PARTIALLY_COMPLETED</option>
                  <option value="FAILED">FAILED</option>
                  <option value="RUNNING">RUNNING</option>
                  <option value="CANCELLED">CANCELLED</option>
                </select>

                <select
                  value={jobSourceFilter}
                  onChange={(e) => setJobSourceFilter(e.target.value)}
                  className="rounded-lg border border-line bg-surface px-3 py-1.5 font-bold text-fg-primary"
                >
                  <option value="">كل المصادر</option>
                  {sources.map((s) => (
                    <option key={s.id} value={s.name}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-start text-xs">
                <thead>
                  <tr className="border-b border-line text-fg-secondary">
                    <th className="py-2.5 px-3 text-start">{t('thSourceVersion')}</th>
                    <th className="py-2.5 px-3 text-start">{t('thType')}</th>
                    <th className="py-2.5 px-3 text-start">{t('thStatus')}</th>
                    <th className="py-2.5 px-3 text-start">{t('thDiscovered')}</th>
                    <th className="py-2.5 px-3 text-start">{t('thNewUpdated')}</th>
                    <th className="py-2.5 px-3 text-start">{t('thDuplicate')}</th>
                    <th className="py-2.5 px-3 text-start">{t('thInvalid')}</th>
                    <th className="py-2.5 px-3 text-start">{t('thSaleable')}</th>
                    <th className="py-2.5 px-3 text-start">{t('thDuration')}</th>
                    <th className="py-2.5 px-3 text-start">{t('thDate')}</th>
                    <th className="py-2.5 px-3 text-start">{t('thActions')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line font-semibold">
                  {jobs.map((job) => (
                    <tr key={job.id} className="hover:bg-subtle">
                      <td className="py-3 px-3">
                        <span className="block font-bold text-fg-primary">{job.sourceName}</span>
                        <span className="font-mono text-xs text-fg-muted">
                          {job.collectorVersion || 'v1'}
                        </span>
                      </td>
                      <td className="py-3 px-3 font-mono text-xs text-fg-secondary">
                        {job.triggerType || 'MANUAL'}
                      </td>
                      <td className="py-3 px-3">{renderJobStatusBadge(job.status)}</td>
                      <td className="py-3 px-3 font-mono tabular-nums">
                        {job.discoveredCount || job.totalRecords} /{' '}
                        {job.fetchedCount || job.totalRecords}
                      </td>
                      <td className="py-3 px-3 text-brand font-mono tabular-nums">
                        {job.validCount}
                      </td>
                      <td className="py-3 px-3 text-warning-text font-mono tabular-nums">
                        {job.duplicateCount} / {job.conflictCount || 0}
                      </td>
                      <td className="py-3 px-3 text-danger-text font-mono tabular-nums">
                        {job.invalidCount} / {job.failedCount || 0}
                      </td>
                      <td className="py-3 px-3 font-bold text-brand font-mono tabular-nums">
                        {job.saleableCount || 0}
                      </td>
                      <td className="py-3 px-3 font-mono text-fg-secondary">
                        {job.durationMs ? `${job.durationMs}ms` : '—'}
                      </td>
                      <td className="py-3 px-3 text-fg-secondary font-mono tabular-nums">
                        {new Date(job.createdAt).toLocaleDateString()}
                      </td>
                      <td className="py-3 px-3">
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
                            <button
                              onClick={() => handleCancelJob(job.id)}
                              className="inline-flex items-center gap-1 rounded-lg bg-danger-bg px-2.5 py-1 text-xs font-bold text-danger-text hover:opacity-90"
                            >
                              <XCircle className="h-3 w-3" />
                              <span>إلغاء</span>
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
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

              <select
                value={dlStatusFilter}
                onChange={(e) => setDlStatusFilter(e.target.value)}
                className="rounded-lg border border-line bg-surface px-3 py-1.5 text-xs font-bold text-fg-primary"
              >
                <option value="">كل الحالات</option>
                <option value="DEAD_LETTER">معلق (DEAD_LETTER)</option>
                <option value="RETRIED_RESOLVED">تمت إعادة المحاولة والحل (RETRIED_RESOLVED)</option>
                <option value="RETRIED_FAILED">فشلت إعادة المحاولة (RETRIED_FAILED)</option>
                <option value="PERMANENTLY_INVALID">غير صالح نهائياً (PERMANENTLY_INVALID)</option>
              </select>
            </div>

            {deadLetters.length === 0 ? (
              <div className="rounded-xl border border-line bg-subtle p-8 text-center text-xs font-bold text-fg-secondary">
                لا توجد سجلات معلقة في طابور Dead-Letter حالياً.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-start text-xs">
                  <thead>
                    <tr className="border-b border-line text-fg-secondary">
                      <th className="py-2.5 px-3 text-start">المصدر</th>
                      <th className="py-2.5 px-3 text-start">المرحلة / رمز الخطأ</th>
                      <th className="py-2.5 px-3 text-start">سبب الفشل</th>
                      <th className="py-2.5 px-3 text-start">المحاولات</th>
                      <th className="py-2.5 px-3 text-start">الحالة</th>
                      <th className="py-2.5 px-3 text-start">آخر فشل</th>
                      <th className="py-2.5 px-3 text-start">الإجراءات</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line font-semibold">
                    {deadLetters.map((dl) => (
                      <tr key={dl.id} className="hover:bg-subtle">
                        <td className="py-3 px-3">
                          <span className="block font-bold text-fg-primary">{dl.sourceName}</span>
                          <span className="font-mono text-xs text-fg-muted">
                            {dl.externalId || dl.collectorVersion}
                          </span>
                        </td>
                        <td className="py-3 px-3 font-mono text-xs text-danger-text">
                          {dl.failureStage} / {dl.errorCode}
                        </td>
                        <td className="py-3 px-3 text-fg-primary">{dl.errorMessage}</td>
                        <td className="py-3 px-3 font-mono tabular-nums">
                          {dl.retryCount} / {dl.maxRetries}
                        </td>
                        <td className="py-3 px-3">
                          <span
                            className={`rounded px-2 py-0.5 text-xs font-bold ${
                              dl.status === 'DEAD_LETTER'
                                ? 'bg-warning-bg text-warning-text'
                                : dl.status === 'RETRIED_RESOLVED' || dl.status === 'RESOLVED' || dl.status === 'RETRIED'
                                  ? 'bg-brand-soft text-brand'
                                  : dl.status === 'RETRIED_FAILED'
                                    ? 'bg-danger-bg text-danger-text'
                                    : 'bg-subtle text-fg-primary'
                            }`}
                          >
                            {dl.status}
                          </span>
                        </td>
                        <td className="py-3 px-3 text-fg-secondary font-mono tabular-nums">
                          {new Date(dl.lastFailedAt).toLocaleString('ar-EG')}
                        </td>
                        <td className="py-3 px-3">
                          {dl.status === 'DEAD_LETTER' && (
                            <div className="flex items-center gap-1.5">
                              <button
                                onClick={() => handleDeadLetterAction(dl.id, 'RETRY')}
                                disabled={actionLoading === `dl-${dl.id}-RETRY`}
                                className="rounded-lg bg-brand px-2.5 py-1 text-xs font-bold text-fg-inverted hover:bg-brand-hover"
                              >
                                إعادة المحاولة
                              </button>
                              <button
                                onClick={() => handleDeadLetterAction(dl.id, 'MARK_INVALID')}
                                disabled={actionLoading === `dl-${dl.id}-MARK_INVALID`}
                                className="rounded-lg border border-line px-2.5 py-1 text-xs font-bold text-fg-primary hover:bg-subtle"
                              >
                                غير صالح
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
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
                        <span className="font-mono text-xs font-extrabold uppercase">
                          [{alert.severity}] {alert.code}
                        </span>
                        <p className="mt-0.5 font-bold">{alert.message}</p>
                      </div>
                      <span className="font-mono text-xs tabular-nums">
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

              <div className="mt-4 overflow-x-auto">
                <table className="w-full text-start text-xs">
                  <thead>
                    <tr className="border-b border-line text-fg-secondary">
                      <th className="py-2.5 px-3 text-start">القطاع</th>
                      <th className="py-2.5 px-3 text-start">المدينة / المحافظة</th>
                      <th className="py-2.5 px-3 text-start">الخدمة المطلوبة</th>
                      <th className="py-2.5 px-3 text-start">الحد الأدنى المطلوب</th>
                      <th className="py-2.5 px-3 text-start">المتوفر حالياً</th>
                      <th className="py-2.5 px-3 text-start">العجز</th>
                      <th className="py-2.5 px-3 text-start">المصادر المرشحة للإمداد</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line font-semibold">
                    {replenishmentDecisions.map((d) => (
                      <tr key={d.ruleId}>
                        <td className="py-3 px-3 font-bold text-fg-primary">{d.category}</td>
                        <td className="py-3 px-3">{d.city || d.governorate || 'كل المدن'}</td>
                        <td className="py-3 px-3 font-mono text-xs">
                          {d.requiredService || 'الكل'}
                        </td>
                        <td className="py-3 px-3 font-mono tabular-nums">{d.minRequired}</td>
                        <td className="py-3 px-3 text-brand font-mono tabular-nums">{d.currentAvailable}</td>
                        <td className="py-3 px-3">
                          {d.needsReplenishment ? (
                            <span className="rounded bg-danger-bg px-2 py-0.5 font-bold text-danger-text font-mono tabular-nums">
                              عجز -{d.deficit}
                            </span>
                          ) : (
                            <span className="rounded bg-brand-soft px-2 py-0.5 font-bold text-brand">
                              مكتمل
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-3 text-xs text-fg-secondary">
                          {d.selectedSources.length > 0
                            ? d.selectedSources.map((s) => s.sourceName).join(' ، ')
                            : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
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
              <label className="block text-xs font-bold text-fg-primary">{t('collectorTypeLabel')}</label>
              <select
                value={newSourceForm.type}
                onChange={(e) => setNewSourceForm({ ...newSourceForm, type: e.target.value })}
                className="mt-1 w-full rounded-lg border border-line bg-surface px-3 py-2 text-xs text-fg-primary"
              >
                <option value="OPEN_DATA">OPEN_DATA</option>
                <option value="DIRECTORY">DIRECTORY</option>
                <option value="CSV_IMPORT">CSV_IMPORT</option>
                <option value="WEBSITE">WEBSITE</option>
                <option value="GOOGLE_MAPS">GOOGLE_MAPS</option>
                <option value="MANUAL">MANUAL</option>
              </select>
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
                  className="mt-1 w-full rounded-lg border border-line bg-surface px-3 py-2 text-xs font-mono tabular-nums text-fg-primary"
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
                  className="mt-1 w-full rounded-lg border border-line bg-surface px-3 py-2 text-xs font-mono tabular-nums text-fg-primary"
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
                  className="mt-1 w-full rounded-lg border border-line bg-surface px-3 py-2 text-xs font-mono tabular-nums text-fg-primary"
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
                  className="mt-1 w-full rounded-lg border border-line bg-surface px-3 py-2 text-xs font-mono tabular-nums text-fg-primary"
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
                  className="mt-1 w-full rounded-lg border border-line bg-surface px-3 py-2 text-xs font-mono tabular-nums text-fg-primary"
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
                  className="mt-1 w-full rounded-lg border border-line bg-surface px-3 py-2 text-xs font-mono tabular-nums text-fg-primary"
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
                  <p className="mt-1 font-mono font-bold text-fg-primary">
                    {String(selectedJobDetail.id)}
                  </p>
                </div>
                <div className="rounded-lg bg-subtle p-3">
                  <span className="text-fg-muted">نسخة المجمّع والعقد</span>
                  <p className="mt-1 font-mono font-bold text-fg-primary">
                    {String(selectedJobDetail.collectorVersion || 'v1')} /{' '}
                    {String(selectedJobDetail.contractVersion || 'INGESTION_CONTRACT_V1')}
                  </p>
                </div>
                <div className="rounded-lg bg-subtle p-3">
                  <span className="text-fg-muted">نقطة الاستئناف</span>
                  <p className="mt-1 font-mono font-bold text-fg-primary">
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
                <div className="max-h-60 overflow-y-auto rounded-xl border border-line">
                  <table className="w-full text-start text-xs">
                    <thead className="bg-subtle text-fg-secondary">
                      <tr>
                        <th className="py-2 px-3 text-start">#</th>
                        <th className="py-2 px-3 text-start">المعرف الخارجي</th>
                        <th className="py-2 px-3 text-start">المرحلة</th>
                        <th className="py-2 px-3 text-start">الحالة</th>
                        <th className="py-2 px-3 text-start">ملاحظات</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line">
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
                          <tr key={rec.id}>
                            <td className="py-2 px-3 font-mono">{rec.rowNumber}</td>
                            <td className="py-2 px-3 font-mono">{rec.externalId || '—'}</td>
                            <td className="py-2 px-3 font-mono">
                              {rec.lifecycleStage || rec.status}
                            </td>
                            <td className="py-2 px-3 font-bold">{rec.status}</td>
                            <td className="py-2 px-3 text-fg-secondary">
                              {rec.errorMessage || '—'}
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </Dialog>
      </div>
    </AppShell>
  );
}
