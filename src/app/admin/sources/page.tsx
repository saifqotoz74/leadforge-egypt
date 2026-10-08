'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { AppShell } from '@/components/AppShell';
import { Database, RefreshCw, CheckCircle2 } from 'lucide-react';

interface SourceItem {
  id: string;
  name: string;
  type: string;
  description?: string | null;
  isActive: boolean;
  lastSyncAt?: string | null;
  recordsCount: number;
}

interface ImportJobItem {
  id: string;
  sourceName: string;
  fileName?: string | null;
  status: string;
  totalRows: number;
  validCount: number;
  duplicateCount: number;
  invalidCount: number;
  createdAt: string;
}

export default function AdminSourcesPage() {
  const [sources, setSources] = useState<SourceItem[]>([]);
  const [importJobs, setImportJobs] = useState<ImportJobItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncReport, setSyncReport] = useState<{
    imported: number;
    valid: number;
    duplicates: number;
    invalid: number;
  } | null>(null);

  const loadSources = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/sources');
      if (res.ok) {
        const data = await res.json();
        setSources(data.sources || []);
        setImportJobs(data.importJobs || []);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSources();
  }, [loadSources]);

  async function toggleSourceActive(src: SourceItem) {
    const res = await fetch('/api/admin/sources', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sourceId: src.id,
        isActive: !src.isActive,
      }),
    });
    if (res.ok) {
      await loadSources();
    }
  }

  async function handleRunOpenDataSync() {
    setSyncing(true);
    setSyncReport(null);
    try {
      const res = await fetch('/api/admin/sources', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'SYNC_OPEN_DATA' }),
      });
      const data = await res.json();
      if (res.ok && data.report) {
        setSyncReport(data.report);
        await loadSources();
      }
    } finally {
      setSyncing(false);
    }
  }

  return (
    <AppShell isAdminView>
      <div className="space-y-6">
        <div className="flex flex-col justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:flex-row sm:items-center">
          <div>
            <h1 className="text-xl font-extrabold text-slate-900">
              إدارة مصادر البيانات والمجمّعات (Data Sources & Collectors)
            </h1>
            <p className="mt-1 text-xs text-slate-500">
              معمارية معيارية: Raw Data → Collector → Normalizer → Validator → Deduplicator →
              Website Checker → Scoring Engine → Database
            </p>
          </div>

          <button
            onClick={handleRunOpenDataSync}
            disabled={syncing}
            className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-extrabold text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${syncing ? 'animate-spin' : ''}`} />
            <span>{syncing ? 'جاري المزامنة...' : 'تشغيل مزامنة OpenDataCollector'}</span>
          </button>
        </div>

        {syncReport && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-xs font-bold text-emerald-900">
            <span className="flex items-center gap-1.5">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              اكتملت مزامنة البيانات المفتوحة — الإجمالي: {syncReport.imported} | جديد:{' '}
              {syncReport.valid} | مكرر وتم دمجه: {syncReport.duplicates} | غير صالح:{' '}
              {syncReport.invalid}
            </span>
          </div>
        )}

        {/* Sources Grid */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {loading
            ? [1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="h-40 animate-pulse rounded-2xl border border-slate-200 bg-white p-5"
                />
              ))
            : sources.map((src) => (
                <div
                  key={src.id}
                  className="flex flex-col justify-between rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
                >
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="rounded bg-slate-100 px-2.5 py-0.5 text-[11px] font-bold text-slate-700">
                        {src.type}
                      </span>
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
                          src.isActive
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-slate-100 text-slate-500'
                        }`}
                      >
                        {src.isActive ? 'نشط (Active)' : 'متوقف (Inactive)'}
                      </span>
                    </div>

                    <h2 className="mt-3 flex items-center gap-2 text-base font-extrabold text-slate-900">
                      <Database className="h-4 w-4 text-emerald-600" />
                      {src.name}
                    </h2>
                    <p className="mt-1 text-xs text-slate-500">{src.description}</p>
                  </div>

                  <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3 text-xs">
                    <div>
                      <span className="block font-bold text-slate-800">
                        {src.recordsCount} سجل مرتبط
                      </span>
                      <span className="text-[11px] text-slate-400">
                        آخر مزامنة:{' '}
                        {src.lastSyncAt
                          ? new Date(src.lastSyncAt).toLocaleDateString('ar-EG')
                          : '—'}
                      </span>
                    </div>

                    <button
                      onClick={() => toggleSourceActive(src)}
                      className="rounded-lg border border-slate-300 px-3 py-1.5 font-bold text-slate-700 hover:bg-slate-50"
                    >
                      {src.isActive ? 'إيقاف المصدر' : 'تفعيل المصدر'}
                    </button>
                  </div>
                </div>
              ))}
        </div>

        {/* Import Jobs History */}
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm overflow-x-auto">
          <h2 className="text-base font-extrabold text-slate-900">
            سجل عمليات الاستيراد والمزامنة (Import Jobs History)
          </h2>
          <table className="mt-4 w-full text-right text-xs">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500">
                <th className="py-2.5 px-3">المصدر</th>
                <th className="py-2.5 px-3">الملف</th>
                <th className="py-2.5 px-3">الإجمالي (Imported)</th>
                <th className="py-2.5 px-3">صالح (Valid)</th>
                <th className="py-2.5 px-3">مكرر مدمج (Duplicates)</th>
                <th className="py-2.5 px-3">غير صالح (Invalid)</th>
                <th className="py-2.5 px-3">التاريخ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-semibold">
              {importJobs.map((job) => (
                <tr key={job.id}>
                  <td className="py-3 px-3 font-bold text-slate-900">{job.sourceName}</td>
                  <td className="py-3 px-3 font-mono text-slate-600">{job.fileName || '—'}</td>
                  <td className="py-3 px-3">{job.totalRows}</td>
                  <td className="py-3 px-3 text-emerald-700">{job.validCount}</td>
                  <td className="py-3 px-3 text-amber-700">{job.duplicateCount}</td>
                  <td className="py-3 px-3 text-rose-700">{job.invalidCount}</td>
                  <td className="py-3 px-3 text-slate-500">
                    {new Date(job.createdAt).toLocaleString('ar-EG')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </AppShell>
  );
}
