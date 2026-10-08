'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { AppShell } from '@/components/AppShell';
import {
  ShieldCheck,
  AlertTriangle,
  Clock,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Filter,
  ExternalLink,
  Activity,
  Award,
  Ban,
  Layers,
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
  categoryMismatches?: number;
  locationMismatches?: number;
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
    details?: Record<string, unknown> | null;
    checkedAt: string;
    expiresAt?: string | null;
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
  websiteStatus: string;
  score: number;
  temperature: string;
  qualityScore: number;
  qualityStatus: string;
  completenessScore: number;
  freshnessStatus: string;
  verificationStatus: string;
  saleabilityStatus: string;
  businessStatus: string;
  qualityFlags: string[];
  lastVerifiedAt?: string | null;
}

const QUALITY_STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  EXCELLENT: { label: 'ممتازة (EXCELLENT)', cls: 'border-emerald-200 bg-emerald-50 text-emerald-800' },
  HIGH: { label: 'مرتفعة (HIGH)', cls: 'border-teal-200 bg-teal-50 text-teal-800' },
  MEDIUM: { label: 'متوسطة (MEDIUM)', cls: 'border-amber-200 bg-amber-50 text-amber-800' },
  LOW: { label: 'منخفضة (LOW)', cls: 'border-orange-200 bg-orange-50 text-orange-800' },
  VERY_LOW: { label: 'ضعيفة جدًا (VERY_LOW)', cls: 'border-rose-200 bg-rose-50 text-rose-800' },
};

const VERIFICATION_STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  VERIFIED: { label: 'موثق بالكامل (VERIFIED)', cls: 'border-emerald-200 bg-emerald-50 text-emerald-800' },
  PARTIALLY_VERIFIED: {
    label: 'موثق جزئيًا (PARTIALLY_VERIFIED)',
    cls: 'border-blue-200 bg-blue-50 text-blue-800',
  },
  UNVERIFIED: { label: 'غير موثق (UNVERIFIED)', cls: 'border-slate-200 bg-slate-100 text-slate-700' },
  FAILED_VERIFICATION: {
    label: 'فشل التحقق (FAILED)',
    cls: 'border-rose-200 bg-rose-50 text-rose-800',
  },
};

const FRESHNESS_STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  FRESH: { label: 'حديثة 0-7ي (FRESH)', cls: 'border-emerald-200 bg-emerald-50 text-emerald-800' },
  RECENT: { label: 'قريبة 8-30ي (RECENT)', cls: 'border-teal-200 bg-teal-50 text-teal-800' },
  NEEDS_VERIFICATION: {
    label: 'تحتاج تحقق 31-90ي (NEEDS_VERIFICATION)',
    cls: 'border-amber-200 bg-amber-50 text-amber-800',
  },
  STALE: { label: 'قديمة 91-180ي (STALE)', cls: 'border-orange-200 bg-orange-50 text-orange-800' },
  VERY_STALE: {
    label: 'قديمة جدًا +181ي (VERY_STALE)',
    cls: 'border-rose-200 bg-rose-50 text-rose-800',
  },
  UNKNOWN: { label: 'غير معروفة (UNKNOWN)', cls: 'border-slate-200 bg-slate-100 text-slate-700' },
};

const FLAG_LABELS: Record<string, string> = {
  INVALID_PHONE: 'رقم هاتف غير صالح (INVALID_PHONE)',
  INVALID_EMAIL: 'بريد إلكتروني غير صالح (INVALID_EMAIL)',
  INVALID_WEBSITE: 'نطاق موقع غير صالح (INVALID_WEBSITE)',
  STALE_DATA: 'بيانات قديمة متقادمة (STALE_DATA)',
  CATEGORY_MISMATCH: 'تعارض التصنيف (CATEGORY_MISMATCH)',
  LOCATION_MISMATCH: 'تعارض المحافظة/المدينة (LOCATION_MISMATCH)',
  POSSIBLE_DUPLICATE: 'احتمال تكرار (POSSIBLE_DUPLICATE)',
  CLOSED_BUSINESS: 'نشاط مغلق (CLOSED_BUSINESS)',
  MISSING_REQUIRED_DATA: 'نقص بيانات أساسية (MISSING_REQUIRED_DATA)',
  CONFLICTING_SOURCE_DATA: 'تعارض مصادر (CONFLICTING_SOURCE_DATA)',
};

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
          text: data.error || 'تعذر تشغيل دفعة التحقق الآلي.',
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
          text: data.error || 'تعذر إعادة التحقق من العميل.',
        });
      } else {
        setStatusMessage({
          type: 'success',
          text: `تم تحديث التحقق والجودة للعميل بنجاح (Quality: ${data.qualityScore}/100 — ${data.verificationStatus}).`,
        });
        await Promise.all([loadOverview(), loadQueue()]);
      }
    } catch {
      setStatusMessage({ type: 'error', text: 'حدث خطأ أثناء الاتصال بالخادم.' });
    } finally {
      setVerifyingId(null);
    }
  }

  return (
    <AppShell isAdminView>
      <div className="space-y-6">
        {/* Page Header + Batch Verification Control */}
        <div className="flex flex-col justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm lg:flex-row lg:items-center">
          <div>
            <h1 className="flex items-center gap-2 text-xl font-extrabold text-slate-900">
              <ShieldCheck className="h-6 w-6 text-emerald-600" />
              <span>محرك جودة البيانات، الحداثة والتحقق (Phase 3 Quality & Verification Engine)</span>
            </h1>
            <p className="mt-1 text-xs font-semibold text-slate-500">
              يفصل هذا المحرك بين درجة الفرصة البيعية (Opportunity Score) ودرجة جودة البيانات وموثوقيتها (Quality Score) مع بوابات صلاحية البيع.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-700">
              <span>حجم الدفعة (Batch Size):</span>
              <input
                type="number"
                min={1}
                max={100}
                value={batchSize}
                onChange={(e) => setBatchSize(Math.max(1, Math.min(100, Number(e.target.value) || 15)))}
                className="w-16 rounded-lg border border-slate-300 bg-white px-2 py-1 text-center font-extrabold"
              />
            </div>

            <button
              onClick={handleRunBatchVerification}
              disabled={batchRunning}
              className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-extrabold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50"
            >
              <RefreshCw className={`h-4 w-4 ${batchRunning ? 'animate-spin' : ''}`} />
              <span>
                {batchRunning
                  ? 'جاري التحقق الدفعي...'
                  : 'تشغيل التحقق الدفعي حسب الأولوية (Run Batch Verification)'}
              </span>
            </button>
          </div>
        </div>

        {statusMessage && (
          <div
            className={`rounded-xl border p-4 text-xs font-bold ${
              statusMessage.type === 'success'
                ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                : 'border-rose-200 bg-rose-50 text-rose-800'
            }`}
          >
            {statusMessage.text}
          </div>
        )}

        {loading || !overview ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
              <div
                key={i}
                className="h-28 animate-pulse rounded-2xl border border-slate-200 bg-white p-5"
              />
            ))}
          </div>
        ) : (
          <>
            {/* Top Summary Metrics */}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex items-center justify-between text-xs font-bold text-slate-500">
                  <span>إجمالي العملاء</span>
                  <Layers className="h-4 w-4 text-slate-600" />
                </div>
                <p className="mt-2 text-2xl font-extrabold text-slate-900">
                  {overview.summary.totalLeads}
                </p>
                <span className="text-[11px] text-slate-400">
                  متوسط الجودة: {overview.summary.averageQualityScore}/100
                </span>
              </div>

              <div className="rounded-2xl border border-emerald-200 bg-emerald-50/40 p-4 shadow-sm">
                <div className="flex items-center justify-between text-xs font-bold text-emerald-800">
                  <span>موثق (Verified)</span>
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                </div>
                <p className="mt-2 text-2xl font-extrabold text-emerald-700">
                  {overview.summary.verifiedLeads}
                </p>
                <span className="text-[11px] text-emerald-700">
                  جزئي: {overview.summary.partiallyVerifiedLeads}
                </span>
              </div>

              <div className="rounded-2xl border border-amber-200 bg-amber-50/40 p-4 shadow-sm">
                <div className="flex items-center justify-between text-xs font-bold text-amber-800">
                  <span>تحتاج تحقق</span>
                  <Clock className="h-4 w-4 text-amber-600" />
                </div>
                <p className="mt-2 text-2xl font-extrabold text-amber-700">
                  {overview.summary.leadsNeedingVerification}
                </p>
                <span className="text-[11px] text-amber-700">Needs Verification</span>
              </div>

              <div className="rounded-2xl border border-orange-200 bg-orange-50/40 p-4 shadow-sm">
                <div className="flex items-center justify-between text-xs font-bold text-orange-800">
                  <span>بيانات قديمة (Stale)</span>
                  <AlertTriangle className="h-4 w-4 text-orange-600" />
                </div>
                <p className="mt-2 text-2xl font-extrabold text-orange-700">
                  {overview.summary.staleLeads}
                </p>
                <span className="text-[11px] text-orange-700">Stale & Very Stale</span>
              </div>

              <div className="rounded-2xl border border-rose-200 bg-rose-50/40 p-4 shadow-sm">
                <div className="flex items-center justify-between text-xs font-bold text-rose-800">
                  <span>بيانات غير صالحة</span>
                  <XCircle className="h-4 w-4 text-rose-600" />
                </div>
                <p className="mt-2 text-2xl font-extrabold text-rose-700">
                  {overview.summary.invalidLeads}
                </p>
                <span className="text-[11px] text-rose-700">Invalid Leads</span>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex items-center justify-between text-xs font-bold text-slate-600">
                  <span>أنشطة مغلقة</span>
                  <Ban className="h-4 w-4 text-rose-600" />
                </div>
                <p className="mt-2 text-2xl font-extrabold text-slate-900">
                  {overview.summary.closedBusinesses}
                </p>
                <span className="text-[11px] text-slate-400">Closed Businesses</span>
              </div>

              <div className="rounded-2xl border border-purple-200 bg-purple-50/40 p-4 shadow-sm">
                <div className="flex items-center justify-between text-xs font-bold text-purple-800">
                  <span>تكرارات وتعارضات</span>
                  <Activity className="h-4 w-4 text-purple-600" />
                </div>
                <p className="mt-2 text-2xl font-extrabold text-purple-700">
                  {overview.summary.duplicateLeads}
                </p>
                <span className="text-[11px] text-purple-700">
                  تعارض تصنيف: {overview.summary.categoryMismatches ?? 0} • موقع: {overview.summary.locationMismatches ?? 0}
                </span>
              </div>
            </div>

            {/* Quality by Source Breakdown */}
            {Array.isArray(overview.qualityBySource) && overview.qualityBySource.length > 0 && (
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <h2 className="flex items-center gap-2 text-sm font-extrabold text-slate-900">
                  <Layers className="h-4 w-4 text-teal-600" />
                  <span>جودة البيانات حسب المصدر (Quality by Source)</span>
                </h2>
                <div className="mt-3 overflow-x-auto">
                  <table className="w-full text-right text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 text-slate-500">
                        <th className="py-2 px-3">المصدر (Source)</th>
                        <th className="py-2 px-3">إجمالي السجلات</th>
                        <th className="py-2 px-3">متوسط الجودة</th>
                        <th className="py-2 px-3">متوسط الاكتمال</th>
                        <th className="py-2 px-3">موثق بالكامل</th>
                        <th className="py-2 px-3">صالح للبيع</th>
                        <th className="py-2 px-3">يحتوي تنبيهات</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-semibold">
                      {overview.qualityBySource.map((src) => (
                        <tr key={src.source} className="hover:bg-slate-50">
                          <td className="py-2.5 px-3 font-mono font-bold text-slate-800">{src.source}</td>
                          <td className="py-2.5 px-3 font-mono">{src.totalLeads}</td>
                          <td className="py-2.5 px-3 font-mono font-extrabold text-teal-700">
                            {src.avgQualityScore}/100
                          </td>
                          <td className="py-2.5 px-3 font-mono text-slate-700">
                            {src.avgCompletenessScore}%
                          </td>
                          <td className="py-2.5 px-3 font-mono text-emerald-700">
                            {src.verifiedCount}
                          </td>
                          <td className="py-2.5 px-3 font-mono text-emerald-700">
                            {src.saleableCount}
                          </td>
                          <td className="py-2.5 px-3 font-mono text-rose-700">
                            {src.flaggedCount}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Distributions Row */}
            <div className="grid gap-6 lg:grid-cols-3">
              {/* Quality Distribution */}
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <h2 className="flex items-center gap-2 text-sm font-extrabold text-slate-900">
                  <Award className="h-4 w-4 text-emerald-600" />
                  <span>توزيع درجات الجودة (Quality Status Distribution)</span>
                </h2>
                <div className="mt-4 space-y-2.5 text-xs">
                  {(['EXCELLENT', 'HIGH', 'MEDIUM', 'LOW', 'VERY_LOW'] as const).map((key) => {
                    const count = overview.qualityDistribution[key] || 0;
                    const badge = QUALITY_STATUS_BADGE[key];
                    return (
                      <div key={key} className="flex items-center justify-between">
                        <span className={`rounded-full border px-2.5 py-0.5 font-bold ${badge.cls}`}>
                          {badge.label}
                        </span>
                        <span className="font-mono text-sm font-extrabold text-slate-800">
                          {count}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Freshness Distribution */}
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <h2 className="flex items-center gap-2 text-sm font-extrabold text-slate-900">
                  <Clock className="h-4 w-4 text-amber-600" />
                  <span>توزيع الحداثة (Freshness Distribution)</span>
                </h2>
                <div className="mt-4 space-y-2.5 text-xs">
                  {(
                    [
                      'FRESH',
                      'RECENT',
                      'NEEDS_VERIFICATION',
                      'STALE',
                      'VERY_STALE',
                      'UNKNOWN',
                    ] as const
                  ).map((key) => {
                    const count = overview.freshnessDistribution[key] || 0;
                    const badge = FRESHNESS_STATUS_BADGE[key];
                    return (
                      <div key={key} className="flex items-center justify-between">
                        <span className={`rounded-full border px-2.5 py-0.5 font-bold ${badge.cls}`}>
                          {badge.label}
                        </span>
                        <span className="font-mono text-sm font-extrabold text-slate-800">
                          {count}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Saleability & Verification Distribution */}
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <h2 className="flex items-center gap-2 text-sm font-extrabold text-slate-900">
                  <ShieldCheck className="h-4 w-4 text-blue-600" />
                  <span>بوابات البيع والتحقق (Saleability & Verification)</span>
                </h2>
                <div className="mt-4 space-y-2 text-xs">
                  {Object.entries(overview.saleabilityDistribution).map(([status, count]) => (
                    <div
                      key={status}
                      className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-1.5 font-bold text-slate-700"
                    >
                      <span className="font-mono">{status}</span>
                      <span className="font-mono text-sm font-extrabold text-slate-900">
                        {count}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Quality Flags Filter Bar */}
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <h2 className="flex items-center gap-2 text-sm font-extrabold text-slate-900">
                  <Filter className="h-4 w-4 text-rose-600" />
                  <span>مؤشرات وأعلام الجودة (Machine-Readable Quality Flags)</span>
                </h2>
                {selectedFlag && (
                  <button
                    onClick={() => setSelectedFlag('')}
                    className="text-xs font-bold text-emerald-600 hover:underline"
                  >
                    إعادة تعيين الفلتر
                  </button>
                )}
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {Object.entries(FLAG_LABELS).map(([flag, label]) => {
                  const count = overview.flagCounts[flag] || 0;
                  const active = queueTab === 'FLAGS' && selectedFlag === flag;
                  return (
                    <button
                      key={flag}
                      onClick={() => {
                        setQueueTab('FLAGS');
                        setSelectedFlag(active ? '' : flag);
                      }}
                      className={`inline-flex items-center gap-2 rounded-xl border px-3 py-1.5 text-xs font-bold transition ${
                        active
                          ? 'border-rose-600 bg-rose-600 text-white'
                          : 'border-slate-200 bg-slate-50 text-slate-700 hover:border-rose-300 hover:bg-rose-50/50'
                      }`}
                    >
                      <span>{label}</span>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-extrabold ${
                          active ? 'bg-white text-rose-700' : 'bg-slate-200 text-slate-800'
                        }`}
                      >
                        {count}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Actionable Queues Table */}
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 pb-4">
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => setQueueTab('NEEDS_VERIFICATION')}
                    className={`rounded-xl px-4 py-2 text-xs font-extrabold transition ${
                      queueTab === 'NEEDS_VERIFICATION'
                        ? 'bg-emerald-600 text-white'
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                    }`}
                  >
                    طابور أولوية التحقق (Needs Verification Queue)
                  </button>
                  <button
                    onClick={() => setQueueTab('STALE')}
                    className={`rounded-xl px-4 py-2 text-xs font-extrabold transition ${
                      queueTab === 'STALE'
                        ? 'bg-emerald-600 text-white'
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                    }`}
                  >
                    البيانات القديمة والمتقادمة (Stale Leads)
                  </button>
                  <button
                    onClick={() => setQueueTab('FLAGS')}
                    className={`rounded-xl px-4 py-2 text-xs font-extrabold transition ${
                      queueTab === 'FLAGS'
                        ? 'bg-emerald-600 text-white'
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                    }`}
                  >
                    العملاء ذوو التنبيهات (Flagged Leads)
                  </button>
                </div>

                <span className="text-xs font-bold text-slate-500">
                  عدد السجلات المعروضة: {queueLeads.length}
                </span>
              </div>

              {queueLoading ? (
                <div className="py-12 text-center text-xs font-bold text-slate-500">
                  جاري تحميل قائمة الفحص والتحقق...
                </div>
              ) : queueLeads.length === 0 ? (
                <div className="py-12 text-center text-xs font-bold text-slate-500">
                  لا توجد سجلات مطابقة في هذا الطابور حاليًا.
                </div>
              ) : (
                <div className="mt-4 overflow-x-auto">
                  <table className="w-full text-right text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 text-slate-500">
                        <th className="py-2.5 px-3">النشاط التجاري</th>
                        <th className="py-2.5 px-3">الفرصة (Opportunity)</th>
                        <th className="py-2.5 px-3">الجودة (Quality)</th>
                        <th className="py-2.5 px-3">الاكتمال</th>
                        <th className="py-2.5 px-3">الحداثة (Freshness)</th>
                        <th className="py-2.5 px-3">التحقق (Verification)</th>
                        <th className="py-2.5 px-3">صلاحية البيع</th>
                        <th className="py-2.5 px-3">التنبيهات (Flags)</th>
                        <th className="py-2.5 px-3">إجراءات</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-semibold">
                      {queueLeads.map((lead) => {
                        const qBadge =
                          QUALITY_STATUS_BADGE[lead.qualityStatus] || QUALITY_STATUS_BADGE.MEDIUM;
                        const fBadge =
                          FRESHNESS_STATUS_BADGE[lead.freshnessStatus] ||
                          FRESHNESS_STATUS_BADGE.UNKNOWN;
                        const vBadge =
                          VERIFICATION_STATUS_BADGE[lead.verificationStatus] ||
                          VERIFICATION_STATUS_BADGE.UNVERIFIED;

                        return (
                          <tr key={lead.id} className="hover:bg-slate-50/80">
                            <td className="py-3 px-3">
                              <div className="font-extrabold text-slate-900">
                                {lead.businessName}
                              </div>
                              <div className="text-[11px] text-slate-500">
                                {lead.category} • {lead.city}
                              </div>
                            </td>
                            <td className="py-3 px-3 font-mono font-bold text-slate-800">
                              {lead.score}/100 ({lead.temperature})
                            </td>
                            <td className="py-3 px-3">
                              <span
                                className={`inline-block rounded-full border px-2.5 py-0.5 text-[11px] font-bold ${qBadge.cls}`}
                              >
                                {lead.qualityScore}/100 • {lead.qualityStatus}
                              </span>
                            </td>
                            <td className="py-3 px-3 font-mono font-bold text-slate-700">
                              {lead.completenessScore}%
                            </td>
                            <td className="py-3 px-3">
                              <span
                                className={`inline-block rounded-full border px-2 py-0.5 text-[11px] font-bold ${fBadge.cls}`}
                              >
                                {lead.freshnessStatus}
                              </span>
                            </td>
                            <td className="py-3 px-3">
                              <span
                                className={`inline-block rounded-full border px-2 py-0.5 text-[11px] font-bold ${vBadge.cls}`}
                              >
                                {lead.verificationStatus}
                              </span>
                            </td>
                            <td className="py-3 px-3">
                              <span
                                className={`inline-block rounded-md px-2 py-0.5 font-mono text-[11px] font-extrabold ${
                                  lead.saleabilityStatus === 'AVAILABLE'
                                    ? 'bg-emerald-100 text-emerald-800'
                                    : 'bg-rose-100 text-rose-800'
                                }`}
                              >
                                {lead.saleabilityStatus}
                              </span>
                            </td>
                            <td className="py-3 px-3">
                              <div className="flex flex-wrap gap-1">
                                {(lead.qualityFlags || []).length === 0 ? (
                                  <span className="text-[11px] text-emerald-600">سليم ✓</span>
                                ) : (
                                  lead.qualityFlags.map((fl) => (
                                    <span
                                      key={fl}
                                      className="rounded border border-rose-200 bg-rose-50 px-1.5 py-0.5 font-mono text-[10px] font-bold text-rose-700"
                                    >
                                      {fl}
                                    </span>
                                  ))
                                )}
                              </div>
                            </td>
                            <td className="py-3 px-3">
                              <div className="flex items-center gap-2">
                                <button
                                  onClick={() => handleVerifySingleLead(lead.id)}
                                  disabled={verifyingId === lead.id}
                                  className="inline-flex items-center gap-1 rounded-lg bg-slate-900 px-2.5 py-1.5 text-[11px] font-bold text-white hover:bg-emerald-600 disabled:opacity-50"
                                >
                                  <RefreshCw
                                    className={`h-3 w-3 ${
                                      verifyingId === lead.id ? 'animate-spin' : ''
                                    }`}
                                  />
                                  <span>فحص الآن</span>
                                </button>
                                <Link
                                  href={`/leads/${lead.id}`}
                                  className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-[11px] font-bold text-slate-700 hover:bg-slate-50"
                                >
                                  <ExternalLink className="h-3 w-3" />
                                </Link>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}
