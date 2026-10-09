'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { AppShell } from '@/components/domain/AppShell';
import { PageHeader } from '@/components/domain/PageHeader';
import { StatTile } from '@/components/domain/StatTile';
import { QualityIndicator, QualityState } from '@/components/domain/QualityIndicator';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Banner } from '@/components/ui/Banner';
import { Input } from '@/components/ui/Input';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/Table';
import { fmtNumber, fmtDate } from '@/lib/format';
import {
  ShieldCheck,
  RefreshCw,
  ExternalLink,
} from 'lucide-react';

interface QualitySummary {
  totalLeads: number;
  verifiedLeads: number;
  partiallyVerifiedLeads: number;
  unverifiedLeads: number;
  failedVerificationLeads: number;
  staleLeads: number;
  invalidLeads: number;
  closedBusinesses: number;
  duplicateLeads: number;
  leadsNeedingVerification: number;
  saleableLeads: number;
  averageQualityScore: number;
  averageCompletenessScore: number;
}

interface QualityBySourceItem {
  source: string;
  totalLeads: number;
  avgQualityScore: number;
  avgCompletenessScore: number;
  verifiedCount: number;
  saleableCount: number;
  flaggedCount: number;
}

interface QualityOverviewResponse {
  summary: QualitySummary;
  qualityDistribution: Record<string, number>;
  freshnessDistribution: Record<string, number>;
  verificationDistribution: Record<string, number>;
  saleabilityDistribution: Record<string, number>;
  flagCounts: Record<string, number>;
  qualityBySource?: QualityBySourceItem[];
  recentVerifications: {
    id: string;
    leadId: string;
    verificationType: string;
    status: string;
    checkedAt: string;
    lead?: {
      id: string;
      businessName: string;
      city: string;
      category: string;
    };
  }[];
}

interface QueueLeadItem {
  id: string;
  businessName: string;
  category: string;
  city: string;
  phone?: string | null;
  website?: string | null;
  score: number;
  qualityScore: number;
  qualityStatus: string;
  freshnessStatus: string;
  verificationStatus: string;
  saleabilityStatus: string;
  qualityFlags: string[];
  lastVerifiedAt?: string | null;
}

export default function AdminQualityOverviewPage() {
  const [overview, setOverview] = useState<QualityOverviewResponse | null>(null);
  const [queueTab, setQueueTab] = useState<'NEEDS_VERIFICATION' | 'STALE' | 'FLAGS'>(
    'NEEDS_VERIFICATION'
  );
  const [selectedFlag, setSelectedFlag] = useState<string>('');
  const [queueLeads, setQueueLeads] = useState<QueueLeadItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [queueLoading, setQueueLoading] = useState(false);
  const [batchRunning, setBatchRunning] = useState(false);
  const [verifyingId, setVerifyingId] = useState<string | null>(null);
  const [batchSize, setBatchSize] = useState(15);
  const [statusMessage, setStatusMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  const loadOverview = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/quality');
      if (res.ok) {
        setOverview(await res.json());
      }
    } finally {
      setLoading(false);
    }
  }, []);

  const loadQueue = useCallback(async () => {
    setQueueLoading(true);
    try {
      let url = '/api/admin/quality/needs-verification?limit=50';
      if (queueTab === 'STALE') {
        url = '/api/admin/quality/stale?limit=50';
      } else if (queueTab === 'FLAGS') {
        url = `/api/admin/quality/flags${selectedFlag ? `?flag=${encodeURIComponent(selectedFlag)}` : ''}`;
      }
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        setQueueLeads(data.leads || []);
      }
    } finally {
      setQueueLoading(false);
    }
  }, [queueTab, selectedFlag]);

  useEffect(() => {
    loadOverview();
  }, [loadOverview]);

  useEffect(() => {
    loadQueue();
  }, [loadQueue]);

  async function handleRunBatchVerification() {
    setBatchRunning(true);
    setStatusMessage(null);
    try {
      const res = await fetch('/api/admin/quality/verify-batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ batchSize }),
      });
      const data = await res.json();
      if (!res.ok) {
        setStatusMessage({
          type: 'error',
          text: data.error || 'تعذّر تشغيل دفعة التحقق الآلي.',
        });
      } else {
        setStatusMessage({
          type: 'success',
          text: `تم تشغيل التحقق الدفعي بنجاح: تمت معالجة ${data.processedCount} عميل (${data.verifiedCount} موثق، ${data.partiallyVerifiedCount} جزئي، ${data.failedCount} فشل).`,
        });
        await Promise.all([loadOverview(), loadQueue()]);
      }
    } catch {
      setStatusMessage({ type: 'error', text: 'حدث خطأ أثناء الاتصال بالخادم.' });
    } finally {
      setBatchRunning(false);
    }
  }

  async function handleVerifySingleLead(leadId: string) {
    setVerifyingId(leadId);
    setStatusMessage(null);
    try {
      const res = await fetch(`/api/leads/${leadId}/verification`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ force: true }),
      });
      const data = await res.json();
      if (!res.ok) {
        setStatusMessage({
          type: 'error',
          text: data.error || 'تعذّر إعادة التحقق من العميل.',
        });
      } else {
        setStatusMessage({
          type: 'success',
          text: `تم تحديث التحقق والجودة بنجاح (Quality: ${data.qualityScore}/100 — ${data.verificationStatus}).`,
        });
        await Promise.all([loadOverview(), loadQueue()]);
      }
    } catch {
      setStatusMessage({ type: 'error', text: 'حدث خطأ أثناء الاتصال بالخادم.' });
    } finally {
      setVerifyingId(null);
    }
  }

  const s = overview?.summary;

  function toQualityState(rawStatus: string): QualityState {
    if (rawStatus === 'FRESH') return 'FRESH';
    if (rawStatus === 'RECENT') return 'AGING';
    if (rawStatus === 'NEEDS_VERIFICATION' || rawStatus === 'STALE' || rawStatus === 'VERY_STALE') return 'STALE';
    if (rawStatus === 'VERIFIED') return 'VERIFIED';
    return 'UNVERIFIED';
  }

  return (
    <AppShell isAdmin={true} density="compact" pageTitle="جودة البيانات والتحقق">
      <div className="flex flex-col gap-6">
        <PageHeader
          title="محرك جودة البيانات، الحداثة والتحقق"
          description="فصل درجة الفرصة البيعية عن جودة البيانات، وتتبع بوابات صلاحية الشراء والتحقق الدوري"
          actions={
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 rounded-xl border border-line bg-surface px-3 py-1.5 text-caption font-semibold">
                <span className="text-fg-secondary">حجم الدفعة:</span>
                <input
                  type="number"
                  min={1}
                  max={100}
                  value={batchSize}
                  onChange={(e) => setBatchSize(Math.max(1, Math.min(100, Number(e.target.value) || 15)))}
                  className="w-14 rounded border border-line bg-subtle px-1.5 py-0.5 text-center font-mono font-semibold"
                />
              </div>

              <Button
                variant="primary"
                size="sm"
                onClick={handleRunBatchVerification}
                isLoading={batchRunning}
                className="gap-1.5"
              >
                <RefreshCw className="h-4 w-4" />
                <span>تشغيل التحقق الدفعي</span>
              </Button>
            </div>
          }
        />

        {statusMessage && (
          <Banner variant={statusMessage.type === 'success' ? 'info' : 'danger'}>
            {statusMessage.text}
          </Banner>
        )}

        {/* Quality Metrics Row with StatTiles */}
        {s && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <StatTile
              label="متوسط جودة البيانات"
              value={`${fmtNumber(s.averageQualityScore)}/100`}
              statusText="Quality Score"
            />
            <StatTile
              label="فرص صالحة للبيع"
              value={fmtNumber(s.saleableLeads)}
              statusText={`من إجمالي ${fmtNumber(s.totalLeads)}`}
            />
            <StatTile
              label="موثقة بالكامل"
              value={fmtNumber(s.verifiedLeads)}
              statusText="VERIFIED"
            />
            <StatTile
              label="تحتاج إعادة تحقق"
              value={fmtNumber(s.leadsNeedingVerification)}
              statusText="NEEDS_VERIFY"
              isOutOfRange={s.leadsNeedingVerification > 0}
            />
            <StatTile
              label="بيانات متقادمة"
              value={fmtNumber(s.staleLeads)}
              statusText="STALE"
              isOutOfRange={s.staleLeads > 0}
            />
            <StatTile
              label="مكتملية الحقول"
              value={`${fmtNumber(s.averageCompletenessScore)}%`}
              statusText="Completeness"
            />
          </div>
        )}

        {/* Queue Review & Flags Tabs */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>طابور التحقق وفحص الحداثة (Verification Queue)</CardTitle>
            <div className="flex gap-2">
              <Button
                variant={queueTab === 'NEEDS_VERIFICATION' ? 'primary' : 'secondary'}
                size="sm"
                onClick={() => setQueueTab('NEEDS_VERIFICATION')}
              >
                تحتاج تحقق ({s ? fmtNumber(s.leadsNeedingVerification) : 0})
              </Button>
              <Button
                variant={queueTab === 'STALE' ? 'primary' : 'secondary'}
                size="sm"
                onClick={() => setQueueTab('STALE')}
              >
                متقادمة ({s ? fmtNumber(s.staleLeads) : 0})
              </Button>
              <Button
                variant={queueTab === 'FLAGS' ? 'primary' : 'secondary'}
                size="sm"
                onClick={() => setQueueTab('FLAGS')}
              >
                تنبيهات الجودة
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {queueLoading ? (
              <div className="p-8 text-center text-body-sm text-fg-muted">
                جاري تحميل سجلات الطابور...
              </div>
            ) : queueLeads.length === 0 ? (
              <div className="p-8 text-center text-body-sm text-fg-muted">
                لا توجد سجلات في هذا الطابور حالياً.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>النشاط التجاري</TableHead>
                      <TableHead>المدينة والتصنيف</TableHead>
                      <TableHead>درجة الجودة</TableHead>
                      <TableHead>حالة الحداثة</TableHead>
                      <TableHead>صلاحية البيع</TableHead>
                      <TableHead>الإجراء</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {queueLeads.map((lead) => (
                      <TableRow key={lead.id}>
                        <TableCell className="font-semibold text-fg-primary">
                          <Link
                            href={`/leads/${lead.id}`}
                            className="hover:text-brand hover:underline inline-flex items-center gap-1"
                          >
                            <span>{lead.businessName}</span>
                            <ExternalLink className="h-3 w-3 text-fg-muted" />
                          </Link>
                        </TableCell>
                        <TableCell className="text-body-sm text-fg-secondary">
                          {lead.city} • {lead.category}
                        </TableCell>
                        <TableCell>
                          <span className="font-mono font-semibold tabular-nums text-fg-primary">
                            {fmtNumber(lead.qualityScore)}/100
                          </span>
                        </TableCell>
                        <TableCell>
                          <QualityIndicator
                            status={toQualityState(lead.freshnessStatus)}
                            timestamp={lead.lastVerifiedAt}
                          />
                        </TableCell>
                        <TableCell>
                          <span
                            className={`inline-flex px-2 py-0.5 rounded-full text-caption font-semibold ${
                              lead.saleabilityStatus === 'AVAILABLE'
                                ? 'bg-brand-soft text-brand'
                                : 'bg-warning-bg text-warning-text'
                            }`}
                          >
                            {lead.saleabilityStatus}
                          </span>
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="secondary"
                            size="sm"
                            disabled={verifyingId === lead.id}
                            onClick={() => handleVerifySingleLead(lead.id)}
                            className="gap-1"
                          >
                            <RefreshCw className={`h-3.5 w-3.5 ${verifyingId === lead.id ? 'animate-spin' : ''}`} />
                            <span>تحقق فوري</span>
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Quality by Source and Recent Verifications */}
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Quality by Source */}
          <Card>
            <CardHeader>
              <CardTitle>مؤشرات الجودة بحسب المصدر</CardTitle>
            </CardHeader>
            <CardContent>
              {overview?.qualityBySource && overview.qualityBySource.length > 0 ? (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>المصدر</TableHead>
                        <TableHead>إجمالي الفرص</TableHead>
                        <TableHead>متوسط الجودة</TableHead>
                        <TableHead>الصالحة للبيع</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {overview.qualityBySource.map((src) => (
                        <TableRow key={src.source}>
                          <TableCell className="font-semibold text-fg-primary">
                            {src.source}
                          </TableCell>
                          <TableCell className="font-mono tabular-nums">
                            {fmtNumber(src.totalLeads)}
                          </TableCell>
                          <TableCell className="font-mono font-semibold text-brand tabular-nums">
                            {fmtNumber(src.avgQualityScore)}/100
                          </TableCell>
                          <TableCell className="font-mono tabular-nums">
                            {fmtNumber(src.saleableCount)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <p className="text-body-sm text-fg-muted">لا توجد بيانات مصادر كافية.</p>
              )}
            </CardContent>
          </Card>

          {/* Recent Verifications Audit */}
          <Card>
            <CardHeader>
              <CardTitle>سجل عمليات التحقق الأخيرة</CardTitle>
            </CardHeader>
            <CardContent>
              {overview?.recentVerifications && overview.recentVerifications.length > 0 ? (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>الفرصة</TableHead>
                        <TableHead>نوع التحقق</TableHead>
                        <TableHead>النتيجة</TableHead>
                        <TableHead>التاريخ</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {overview.recentVerifications.slice(0, 10).map((v) => (
                        <TableRow key={v.id}>
                          <TableCell className="font-medium text-fg-primary">
                            {v.lead?.businessName || v.leadId}
                          </TableCell>
                          <TableCell className="text-caption font-mono text-fg-secondary">
                            {v.verificationType}
                          </TableCell>
                          <TableCell>
                            <span
                              className={`inline-flex px-2 py-0.5 rounded-full text-caption font-semibold ${
                                v.status === 'VERIFIED'
                                  ? 'bg-brand-soft text-brand'
                                  : 'bg-warning-bg text-warning-text'
                              }`}
                            >
                              {v.status}
                            </span>
                          </TableCell>
                          <TableCell className="font-mono text-caption text-fg-muted ltr-iso">
                            {fmtDate(new Date(v.checkedAt))}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <p className="text-body-sm text-fg-muted">لا توجد عمليات تحقق مسجلة.</p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </AppShell>
  );
}
