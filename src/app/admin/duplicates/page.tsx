'use client';

import React, { useEffect, useState } from 'react';
import { AppShell } from '@/components/AppShell';
import {
  ShieldAlert,
  CheckCircle2,
  XCircle,
  RotateCcw,
  Phone,
  Globe,
  Mail,
  MapPin,
  Database,
  Layers,
  AlertTriangle,
  History,
} from 'lucide-react';

interface DedupSignal {
  signal: string;
  strength: 'STRONG' | 'MODERATE' | 'WEAK' | 'CONFLICT';
  level?: number | null;
  value?: string | null;
  candidateValue?: string | null;
  description?: string;
}

interface FieldConflict {
  field: string;
  existingValue: string | null;
  incomingValue: string | null;
  existingSource: string;
  incomingSource: string;
  resolution: string;
}

interface CandidateItem {
  id: string;
  decision: 'POSSIBLE_DUPLICATE' | 'CONFLICT' | 'DUPLICATE_CONFIRMED';
  status: 'PENDING' | 'CONFIRMED_MERGED' | 'KEPT_SEPARATE' | 'MARKED_INVALID' | 'RESOLVED';
  confidenceLevel: string;
  matchedLead: {
    id: string;
    businessName: string;
    city: string;
    address: string | null;
    phone: string | null;
    email: string | null;
    website: string | null;
    facebook: string | null;
    instagram: string | null;
    score: number;
    source: string;
    sourceList: string[];
  };
  candidateLead?: {
    id: string;
    businessName: string;
    city: string;
    address: string | null;
    phone: string | null;
    email: string | null;
    website: string | null;
    facebook: string | null;
    instagram: string | null;
    score: number;
    source: string;
  } | null;
  sourceRecord?: {
    id: string;
    sourceName: string;
    sourceType: string;
    externalId: string | null;
    normalizedData: Record<string, unknown>;
  } | null;
  signals: DedupSignal[];
  conflicts: FieldConflict[];
  evidence: {
    duplicateEvidence: string[];
    conflictingEvidence: string[];
  };
  createdAt: string;
}

interface MergeHistoryItem {
  id: string;
  targetLeadId: string;
  sourceLeadId: string | null;
  sourceRecordId: string | null;
  mergeType: string;
  reason: string;
  decision: string;
  performedBy: string;
  performedAt: string;
  isReverted: boolean;
  revertedAt: string | null;
  targetLead: {
    id: string;
    businessName: string;
    city: string;
    phone: string | null;
    website: string | null;
    score: number;
  };
  fieldChanges: {
    enrichedFields?: string[];
    conflictedFields?: FieldConflict[];
  };
}

export default function AdminDuplicatesPage() {
  const [candidates, setCandidates] = useState<CandidateItem[]>([]);
  const [mergeHistory, setMergeHistory] = useState<MergeHistoryItem[]>([]);
  const [stats, setStats] = useState({
    pendingCandidates: 0,
    pendingConflicts: 0,
    totalActiveMerges: 0,
    totalSourceRecords: 0,
  });
  const [statusFilter, setStatusFilter] = useState<'PENDING' | 'ALL'>('PENDING');
  const [activeTab, setActiveTab] = useState<'CANDIDATES' | 'HISTORY'>('CANDIDATES');
  const [loading, setLoading] = useState(true);
  const [actionMsg, setActionMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(
    null
  );
  const [processingId, setProcessingId] = useState<string | null>(null);

  async function loadData(currentStatus = statusFilter) {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/duplicates?status=${currentStatus}&includeHistory=true`);
      if (res.ok) {
        const data = await res.json();
        setCandidates(data.candidates || []);
        setMergeHistory(data.mergeHistory || []);
        if (data.stats) setStats(data.stats);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData(statusFilter);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter]);

  async function handleConfirmMerge(candidateId: string, overrideWebsite = false) {
    setProcessingId(candidateId);
    setActionMsg(null);
    try {
      const res = await fetch(`/api/admin/duplicates/${candidateId}/merge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          preferredFields: overrideWebsite ? { website: 'INCOMING' } : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setActionMsg({ type: 'error', text: data.error || 'تعذر تأكيد الدمج.' });
      } else {
        setActionMsg({
          type: 'success',
          text: 'تم تأكيد دمج السجلين وتحديث تقييم الفرصة (Phase 1 Score) بنجاح.',
        });
        await loadData();
      }
    } catch {
      setActionMsg({ type: 'error', text: 'حدث خطأ أثناء تنفيذ عملية الدمج.' });
    } finally {
      setProcessingId(null);
    }
  }

  async function handleRejectCandidate(
    candidateId: string,
    action: 'KEEP_SEPARATE' | 'MARK_INVALID'
  ) {
    setProcessingId(candidateId);
    setActionMsg(null);
    try {
      const res = await fetch(`/api/admin/duplicates/${candidateId}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (!res.ok) {
        setActionMsg({ type: 'error', text: data.error || 'تعذر تنفيذ الإجراء.' });
      } else {
        setActionMsg({
          type: 'success',
          text:
            action === 'KEEP_SEPARATE'
              ? 'تم فصل السجلين واعتماد السجل الجديد كفرصة مستقلة (Canonical Lead).'
              : 'تم تعليم السجل المرشح كغير صالح (INVALID).',
        });
        await loadData();
      }
    } catch {
      setActionMsg({ type: 'error', text: 'حدث خطأ أثناء تنفيذ الإجراء.' });
    } finally {
      setProcessingId(null);
    }
  }

  async function handleUnmerge(mergeId: string) {
    setProcessingId(mergeId);
    setActionMsg(null);
    try {
      const res = await fetch('/api/admin/duplicates/unmerge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mergeId,
          reason: 'التراجع اليدوي عن الدمج بواسطة مدير النظام',
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setActionMsg({ type: 'error', text: data.error || 'تعذر التراجع عن الدمج.' });
      } else {
        setActionMsg({
          type: 'success',
          text: 'تم التراجع عن الدمج واستعادة حالة السجلات الأصلية وإعادة حساب التقييم بنجاح.',
        });
        await loadData();
      }
    } catch {
      setActionMsg({ type: 'error', text: 'حدث خطأ أثناء التراجع عن الدمج.' });
    } finally {
      setProcessingId(null);
    }
  }

  return (
    <AppShell isAdminView>
      <div className="space-y-6">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">
              مراجعة التكرارات وحل التعارضات (Entity Resolution)
            </h1>
            <p className="mt-1 text-sm text-slate-600">
              مراجعة السجلات المشبوهة بالتكرار، مقارنة الأدلة الحتمية جنبًا إلى جنب، وسجل عمليات الدمج والتراجع.
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setActiveTab('CANDIDATES')}
              className={`rounded-xl px-4 py-2 text-sm font-bold transition ${
                activeTab === 'CANDIDATES'
                  ? 'bg-emerald-600 text-white'
                  : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
              }`}
            >
              طلبات المراجعة ({stats.pendingCandidates})
            </button>
            <button
              onClick={() => setActiveTab('HISTORY')}
              className={`flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-bold transition ${
                activeTab === 'HISTORY'
                  ? 'bg-emerald-600 text-white'
                  : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
              }`}
            >
              <History className="h-4 w-4" />
              سجل الدمج والتراجع ({stats.totalActiveMerges})
            </button>
          </div>
        </div>

        {/* Summary KPI Cards */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="card p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-500">بانتظار المراجعة</span>
              <ShieldAlert className="h-5 w-5 text-amber-500" />
            </div>
            <p className="mt-2 text-2xl font-black text-slate-900">{stats.pendingCandidates}</p>
          </div>
          <div className="card p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-500">تعارضات بيانات (Conflicts)</span>
              <AlertTriangle className="h-5 w-5 text-rose-500" />
            </div>
            <p className="mt-2 text-2xl font-black text-rose-600">{stats.pendingConflicts}</p>
          </div>
          <div className="card p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-500">عمليات دمج نشطة</span>
              <Layers className="h-5 w-5 text-emerald-600" />
            </div>
            <p className="mt-2 text-2xl font-black text-emerald-700">{stats.totalActiveMerges}</p>
          </div>
          <div className="card p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-500">سجلات المصادر (SourceRecords)</span>
              <Database className="h-5 w-5 text-sky-600" />
            </div>
            <p className="mt-2 text-2xl font-black text-slate-900">{stats.totalSourceRecords}</p>
          </div>
        </div>

        {actionMsg && (
          <div
            className={`rounded-xl border p-4 text-sm font-semibold ${
              actionMsg.type === 'success'
                ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                : 'border-rose-200 bg-rose-50 text-rose-800'
            }`}
          >
            {actionMsg.text}
          </div>
        )}

        {activeTab === 'CANDIDATES' ? (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex gap-2">
                <button
                  onClick={() => setStatusFilter('PENDING')}
                  className={`rounded-lg px-3 py-1.5 text-xs font-bold ${
                    statusFilter === 'PENDING'
                      ? 'bg-slate-900 text-white'
                      : 'bg-slate-100 text-slate-700'
                  }`}
                >
                  المعلقة فقط (PENDING)
                </button>
                <button
                  onClick={() => setStatusFilter('ALL')}
                  className={`rounded-lg px-3 py-1.5 text-xs font-bold ${
                    statusFilter === 'ALL'
                      ? 'bg-slate-900 text-white'
                      : 'bg-slate-100 text-slate-700'
                  }`}
                >
                  جميع الطلبات
                </button>
              </div>
            </div>

            {loading ? (
              <div className="card p-8 text-center text-sm text-slate-500">
                جاري تحميل طلبات المراجعة وأدلة التكرار...
              </div>
            ) : candidates.length === 0 ? (
              <div className="card p-10 text-center">
                <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-500" />
                <p className="mt-3 font-bold text-slate-800">
                  لا توجد تكرارات معلقة أو تعارضات بحاجة للمراجعة حاليًا
                </p>
              </div>
            ) : (
              candidates.map((cand) => {
                const normB =
                  cand.candidateLead ||
                  (cand.sourceRecord?.normalizedData as Record<string, unknown>) ||
                  {};
                return (
                  <div key={cand.id} className="card overflow-hidden border border-slate-200">
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 bg-slate-50 px-5 py-3">
                      <div className="flex items-center gap-2">
                        <span
                          className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${
                            cand.decision === 'CONFLICT'
                              ? 'bg-rose-100 text-rose-800'
                              : 'bg-amber-100 text-amber-800'
                          }`}
                        >
                          {cand.decision === 'CONFLICT'
                            ? 'تعارض بيانات (CONFLICT)'
                            : 'تكرار محتمل (POSSIBLE_DUPLICATE)'}
                        </span>
                        <span className="text-xs text-slate-500">
                          الحالة: <strong>{cand.status}</strong>
                        </span>
                      </div>

                      {cand.status === 'PENDING' && (
                        <div className="flex flex-wrap gap-2">
                          <button
                            disabled={processingId === cand.id}
                            onClick={() => handleConfirmMerge(cand.id, false)}
                            className="flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
                          >
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            تأكيد الدمج (Confirm Merge)
                          </button>
                          {cand.decision === 'CONFLICT' && Boolean(normB.website) && (
                            <button
                              disabled={processingId === cand.id}
                              onClick={() => handleConfirmMerge(cand.id, true)}
                              className="flex items-center gap-1 rounded-lg bg-sky-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-sky-700 disabled:opacity-50"
                            >
                              <Globe className="h-3.5 w-3.5" />
                              دمج واعتماد موقع B
                            </button>
                          )}
                          <button
                            disabled={processingId === cand.id}
                            onClick={() => handleRejectCandidate(cand.id, 'KEEP_SEPARATE')}
                            className="flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                          >
                            فصل كفرصة مستقلة (Keep Separate)
                          </button>
                          <button
                            disabled={processingId === cand.id}
                            onClick={() => handleRejectCandidate(cand.id, 'MARK_INVALID')}
                            className="flex items-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-bold text-rose-700 hover:bg-rose-100 disabled:opacity-50"
                          >
                            <XCircle className="h-3.5 w-3.5" />
                            تعليم كغير صالح (Invalid)
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Side-by-Side Comparison: Business A vs Business B */}
                    <div className="grid grid-cols-1 divide-y divide-slate-100 md:grid-cols-2 md:divide-x md:divide-x-reverse md:divide-y-0">
                      <div className="p-5">
                        <div className="mb-2 flex items-center justify-between">
                          <span className="rounded bg-emerald-50 px-2 py-0.5 text-xs font-bold text-emerald-700">
                            الفرصة الأساسية الحالية (Business A - Canonical)
                          </span>
                          <span className="text-xs font-bold text-slate-600">
                            التقييم: {cand.matchedLead.score}/100
                          </span>
                        </div>
                        <h3 className="text-base font-bold text-slate-900">
                          {cand.matchedLead.businessName}
                        </h3>
                        <div className="mt-3 space-y-1.5 text-xs text-slate-600">
                          <p className="flex items-center gap-1.5">
                            <MapPin className="h-3.5 w-3.5 text-slate-400" />
                            {cand.matchedLead.city} — {cand.matchedLead.address || 'بدون عنوان تفصيلي'}
                          </p>
                          <p className="flex items-center gap-1.5" dir="ltr">
                            <Phone className="h-3.5 w-3.5 text-slate-400" />
                            {cand.matchedLead.phone || '—'}
                          </p>
                          <p className="flex items-center gap-1.5" dir="ltr">
                            <Globe className="h-3.5 w-3.5 text-slate-400" />
                            {cand.matchedLead.website || '—'}
                          </p>
                          <p className="flex items-center gap-1.5" dir="ltr">
                            <Mail className="h-3.5 w-3.5 text-slate-400" />
                            {cand.matchedLead.email || '—'}
                          </p>
                          <p className="text-[11px] text-slate-400">
                            المصادر: {(cand.matchedLead.sourceList || [cand.matchedLead.source]).join(' ، ')}
                          </p>
                        </div>
                      </div>

                      <div className="p-5">
                        <div className="mb-2 flex items-center justify-between">
                          <span className="rounded bg-sky-50 px-2 py-0.5 text-xs font-bold text-sky-700">
                            السجل الوارد للمقارنة (Business B - Source Record)
                          </span>
                          <span className="text-xs text-slate-500">
                            المصدر: {cand.sourceRecord?.sourceName || String(normB.source || '—')}
                          </span>
                        </div>
                        <h3 className="text-base font-bold text-slate-900">
                          {String(normB.businessName || '—')}
                        </h3>
                        <div className="mt-3 space-y-1.5 text-xs text-slate-600">
                          <p className="flex items-center gap-1.5">
                            <MapPin className="h-3.5 w-3.5 text-slate-400" />
                            {String(normB.city || '—')} — {String(normB.address || 'بدون عنوان تفصيلي')}
                          </p>
                          <p className="flex items-center gap-1.5" dir="ltr">
                            <Phone className="h-3.5 w-3.5 text-slate-400" />
                            {String(normB.phone || '—')}
                          </p>
                          <p className="flex items-center gap-1.5" dir="ltr">
                            <Globe className="h-3.5 w-3.5 text-slate-400" />
                            {String(normB.website || '—')}
                          </p>
                          <p className="flex items-center gap-1.5" dir="ltr">
                            <Mail className="h-3.5 w-3.5 text-slate-400" />
                            {String(normB.email || '—')}
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Explainable Signals & Conflicts Footer */}
                    <div className="border-t border-slate-100 bg-slate-50/60 px-5 py-3">
                      <div className="flex flex-wrap gap-2">
                        {cand.evidence?.duplicateEvidence?.map((ev, idx) => (
                          <span
                            key={idx}
                            className="rounded-md bg-emerald-100/80 px-2.5 py-1 text-xs font-semibold text-emerald-900"
                          >
                            {ev}
                          </span>
                        ))}
                        {cand.evidence?.conflictingEvidence?.map((ce, idx) => (
                          <span
                            key={idx}
                            className="rounded-md bg-rose-100 px-2.5 py-1 text-xs font-semibold text-rose-900"
                          >
                            {ce}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        ) : (
          /* Merge History & Unmerge Recovery Tab */
          <div className="card overflow-hidden">
            <div className="border-b border-slate-100 px-5 py-4">
              <h2 className="text-base font-bold text-slate-900">
                سجل عمليات الدمج والتراجع (LeadMergeHistory)
              </h2>
            </div>
            {mergeHistory.length === 0 ? (
              <div className="p-8 text-center text-sm text-slate-500">
                لا توجد عمليات دمج مسجلة حتى الآن.
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {mergeHistory.map((item) => (
                  <div
                    key={item.id}
                    className="flex flex-col justify-between gap-4 p-5 sm:flex-row sm:items-center"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-900">
                          {item.targetLead?.businessName || item.targetLeadId}
                        </span>
                        <span className="rounded bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700">
                          {item.reason}
                        </span>
                        {item.isReverted && (
                          <span className="rounded bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-800">
                            تم التراجع (UNMERGED)
                          </span>
                        )}
                      </div>
                      <p className="mt-1 text-xs text-slate-500">
                        بواسطة: {item.performedBy} • النوع: {item.mergeType} • الحقول المثرية:{' '}
                        {(item.fieldChanges?.enrichedFields || []).join(', ') || 'لا يوجد'}
                      </p>
                    </div>
                    {!item.isReverted && (
                      <button
                        disabled={processingId === item.id}
                        onClick={() => handleUnmerge(item.id)}
                        className="flex items-center gap-1.5 rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-bold text-amber-900 hover:bg-amber-100 disabled:opacity-50"
                      >
                        <RotateCcw className="h-3.5 w-3.5" />
                        فك الدمج واستعادة السجلات (Unmerge)
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </AppShell>
  );
}
