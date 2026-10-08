'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { AppShell } from '@/components/AppShell';
import {
  Users,
  UserCheck,
  Briefcase,
  Flame,
  CheckCircle2,
  Trophy,
  Banknote,
  Sliders,
  Database,
  Layers,
  BarChart3,
  ShieldCheck,
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
    <AppShell isAdminView>
      {loading || !data ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4, 5, 6, 7].map((i) => (
            <div
              key={i}
              className="h-28 animate-pulse rounded-2xl border border-slate-200 bg-white p-5"
            />
          ))}
        </div>
      ) : (
        <div className="space-y-6">
          {/* Overview Metrics (Section 17) */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between text-xs font-bold text-slate-500">
                <span>إجمالي المطورين</span>
                <Users className="h-4 w-4 text-blue-600" />
              </div>
              <p className="mt-2 text-2xl font-extrabold text-slate-900">
                {data.overview.totalUsers}
              </p>
              <span className="text-[11px] text-slate-400">Total Users</span>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between text-xs font-bold text-slate-500">
                <span>المشتركون النشطون</span>
                <UserCheck className="h-4 w-4 text-emerald-600" />
              </div>
              <p className="mt-2 text-2xl font-extrabold text-emerald-700">
                {data.overview.activeSubscribers}
              </p>
              <span className="text-[11px] text-slate-400">Active Subscribers</span>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between text-xs font-bold text-slate-500">
                <span>إجمالي الـ Leads</span>
                <Briefcase className="h-4 w-4 text-indigo-600" />
              </div>
              <p className="mt-2 text-2xl font-extrabold text-slate-900">
                {data.overview.totalLeads}
              </p>
              <span className="text-[11px] text-slate-400">Total Leads</span>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between text-xs font-bold text-slate-500">
                <span>الفرص الساخنة</span>
                <Flame className="h-4 w-4 text-rose-600" />
              </div>
              <p className="mt-2 text-2xl font-extrabold text-rose-700">
                {data.overview.hotLeads}
              </p>
              <span className="text-[11px] text-slate-400">Hot & Premium Leads</span>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between text-xs font-bold text-slate-500">
                <span>الـ Leads المشتراة</span>
                <CheckCircle2 className="h-4 w-4 text-teal-600" />
              </div>
              <p className="mt-2 text-2xl font-extrabold text-slate-900">
                {data.overview.leadsClaimed}
              </p>
              <span className="text-[11px] text-slate-400">Leads Claimed</span>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between text-xs font-bold text-slate-500">
                <span>الصفقات الناجحة</span>
                <Trophy className="h-4 w-4 text-amber-500" />
              </div>
              <p className="mt-2 text-2xl font-extrabold text-emerald-700">
                {data.overview.leadsWon}
              </p>
              <span className="text-[11px] text-slate-400">Leads Won</span>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between text-xs font-bold text-slate-500">
                <span>إجمالي الإيرادات</span>
                <Banknote className="h-4 w-4 text-emerald-600" />
              </div>
              <p className="mt-2 text-2xl font-extrabold text-slate-900">
                {data.overview.revenueEgp.toLocaleString()}{' '}
                <span className="text-xs font-bold">ج.م</span>
              </p>
              <span className="text-[11px] text-slate-400">Total Revenue</span>
            </div>
          </div>

          {/* Quality & Funnel Summary + Quick Links */}
          <div className="grid gap-6 lg:grid-cols-12">
            <div className="lg:col-span-7 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="text-base font-extrabold text-slate-900">
                مؤشرات جودة الفرص ومعدلات التحويل (Feedback & Funnel Rates)
              </h2>
              <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
                <div className="rounded-xl bg-emerald-50 p-3.5 text-center">
                  <span className="text-xs font-bold text-emerald-800">
                    نسبة نجاح الفرص (Success Rate)
                  </span>
                  <p className="mt-1 text-2xl font-extrabold text-emerald-700">
                    {data.rates.leadSuccessRate}%
                  </p>
                </div>
                <div className="rounded-xl bg-rose-50 p-3.5 text-center">
                  <span className="text-xs font-bold text-rose-800">
                    نسبة غير الصالح (Invalid Rate)
                  </span>
                  <p className="mt-1 text-2xl font-extrabold text-rose-700">
                    {data.rates.invalidRate}%
                  </p>
                </div>
                <div className="rounded-xl bg-slate-50 p-3.5 text-center">
                  <span className="text-xs font-bold text-slate-700">
                    معدل التواصل (Contact Rate)
                  </span>
                  <p className="mt-1 text-2xl font-extrabold text-slate-900">
                    {data.rates.contactRate}%
                  </p>
                </div>
                <div className="rounded-xl bg-slate-50 p-3.5 text-center">
                  <span className="text-xs font-bold text-slate-700">
                    معدل الرد (Reply Rate)
                  </span>
                  <p className="mt-1 text-2xl font-extrabold text-blue-700">
                    {data.rates.replyRate}%
                  </p>
                </div>
                <div className="rounded-xl bg-slate-50 p-3.5 text-center">
                  <span className="text-xs font-bold text-slate-700">
                    معدل الاجتماعات (Meeting Rate)
                  </span>
                  <p className="mt-1 text-2xl font-extrabold text-purple-700">
                    {data.rates.meetingRate}%
                  </p>
                </div>
                <div className="rounded-xl bg-emerald-50 p-3.5 text-center">
                  <span className="text-xs font-bold text-emerald-800">
                    معدل الفوز (Won Rate)
                  </span>
                  <p className="mt-1 text-2xl font-extrabold text-emerald-700">
                    {data.rates.wonRate}%
                  </p>
                </div>
              </div>
            </div>

            <div className="lg:col-span-5 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="text-base font-extrabold text-slate-900">
                وحدات التحكم الإدارية السريعة
              </h2>
              <div className="mt-4 grid grid-cols-2 gap-3 text-xs font-bold">
                <Link
                  href="/admin/leads"
                  className="flex items-center gap-2 rounded-xl border border-slate-200 p-3.5 text-slate-800 hover:border-emerald-500 hover:bg-emerald-50/40"
                >
                  <Briefcase className="h-4 w-4 text-emerald-600" />
                  <span>إدارة الـ Leads + CSV</span>
                </Link>
                <Link
                  href="/admin/quality"
                  className="flex items-center gap-2 rounded-xl border border-slate-200 p-3.5 text-slate-800 hover:border-emerald-500 hover:bg-emerald-50/40"
                >
                  <CheckCircle2 className="h-4 w-4 text-teal-600" />
                  <span>جودة البيانات والتحقق</span>
                </Link>
                <Link
                  href="/admin/users"
                  className="flex items-center gap-2 rounded-xl border border-slate-200 p-3.5 text-slate-800 hover:border-emerald-500 hover:bg-emerald-50/40"
                >
                  <Users className="h-4 w-4 text-blue-600" />
                  <span>إدارة المستخدمين</span>
                </Link>
                <Link
                  href="/admin/rules"
                  className="flex items-center gap-2 rounded-xl border border-slate-200 p-3.5 text-slate-800 hover:border-emerald-500 hover:bg-emerald-50/40"
                >
                  <Sliders className="h-4 w-4 text-purple-600" />
                  <span>قواعد التقييم (Rules)</span>
                </Link>
                <Link
                  href="/admin/sources"
                  className="flex items-center gap-2 rounded-xl border border-slate-200 p-3.5 text-slate-800 hover:border-emerald-500 hover:bg-emerald-50/40"
                >
                  <Database className="h-4 w-4 text-amber-600" />
                  <span>مصادر البيانات</span>
                </Link>
                <Link
                  href="/admin/plans"
                  className="flex items-center gap-2 rounded-xl border border-slate-200 p-3.5 text-slate-800 hover:border-emerald-500 hover:bg-emerald-50/40"
                >
                  <Layers className="h-4 w-4 text-indigo-600" />
                  <span>الباقات والأسعار</span>
                </Link>
                <Link
                  href="/admin/reports"
                  className="flex items-center gap-2 rounded-xl border border-slate-200 p-3.5 text-slate-800 hover:border-emerald-500 hover:bg-emerald-50/40"
                >
                  <BarChart3 className="h-4 w-4 text-rose-600" />
                  <span>التقارير التفصيلية</span>
                </Link>
                <Link
                  href="/admin/analytics"
                  className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50/50 p-3.5 text-emerald-900 hover:border-emerald-500 hover:bg-emerald-50"
                >
                  <BarChart3 className="h-4 w-4 text-emerald-600" />
                  <span>التحليلات وحلقة البيانات (Phase 7)</span>
                </Link>
              </div>
            </div>
          </div>

          {/* Phase 9 Operational Observability, Security & Integrity Hardening */}
          {observability && (
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="h-5 w-5 text-emerald-600" />
                  <h2 className="text-base font-extrabold text-slate-900">
                    المراقبة التشغيلية وأمان المنصة وسلامة البيانات (Phase 9 Security &amp; Reliability)
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={runIntegrityScan}
                  disabled={scanningIntegrity}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-3.5 py-2 text-xs font-bold text-white hover:bg-slate-800 disabled:opacity-50"
                >
                  <Activity className="h-3.5 w-3.5" />
                  <span>
                    {scanningIntegrity
                      ? 'جاري فحص سلامة البيانات...'
                      : 'فحص سلامة الرصيد والبيانات (Integrity Scan)'}
                  </span>
                </button>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-xl border border-slate-100 bg-slate-50 p-3.5">
                  <span className="text-xs font-bold text-slate-600">
                    جاهزية النظام (Readiness &amp; DB)
                  </span>
                  <p
                    className={`mt-1 text-lg font-extrabold ${
                      observability.systemHealth.readiness.ready ? 'text-emerald-700' : 'text-rose-700'
                    }`}
                  >
                    {observability.systemHealth.readiness.status}
                  </p>
                  <span className="text-[11px] text-slate-500">
                    DB Latency: {observability.systemHealth.readiness.components.database.latencyMs ?? 1}ms
                  </span>
                </div>

                <div className="rounded-xl border border-slate-100 bg-slate-50 p-3.5">
                  <span className="text-xs font-bold text-slate-600">
                    سلامة دفتر الرصيد والـ Claims (Integrity)
                  </span>
                  <p
                    className={`mt-1 text-lg font-extrabold ${
                      observability.dataIntegrity?.healthy
                        ? 'text-emerald-700'
                        : 'text-rose-700'
                    }`}
                  >
                    {observability.dataIntegrity?.healthy
                      ? 'سليم 100% (ALL_HEALTHY)'
                      : `تنبيه (${observability.dataIntegrity?.totalViolations ?? 0} تعارض)`}
                  </p>
                  <span className="text-[11px] text-slate-500">
                    Violations: {observability.dataIntegrity?.totalViolations ?? 0}
                  </span>
                </div>

                <div className="rounded-xl border border-slate-100 bg-slate-50 p-3.5">
                  <span className="text-xs font-bold text-slate-600">
                    أداء الذاكرة المؤقتة (Tenant Cache)
                  </span>
                  <p className="mt-1 text-lg font-extrabold text-indigo-700">
                    {observability.performanceAndQueries.cache.hitRatePct}% Hit Rate
                  </p>
                  <span className="text-[11px] text-slate-500">
                    Active Entries: {observability.performanceAndQueries.cache.entriesCount}
                  </span>
                </div>

                <div className="rounded-xl border border-slate-100 bg-slate-50 p-3.5">
                  <span className="text-xs font-bold text-slate-600">
                    تنبيهات الحماية وإساءة الاستخدام (Abuse Alerts)
                  </span>
                  <p className="mt-1 text-lg font-extrabold text-slate-900">
                    {observability.securityAndAbuse.flaggedAbuseSignalsCount}
                  </p>
                  <span className="text-[11px] text-slate-500">
                    Uptime: {observability.systemHealth.liveness.uptimeSeconds}s
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Audit Logs */}
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-base font-extrabold text-slate-900">
              سجل العمليات الأمنية والإدارية (Recent Audit Logs)
            </h2>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-right text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500">
                    <th className="py-2 px-3">العملية (Action)</th>
                    <th className="py-2 px-3">الكيان (Entity)</th>
                    <th className="py-2 px-3">المستخدم</th>
                    <th className="py-2 px-3">التوقيت</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-semibold">
                  {data.recentAuditLogs.map((log) => (
                    <tr key={log.id}>
                      <td className="py-2.5 px-3 font-mono text-emerald-700">{log.action}</td>
                      <td className="py-2.5 px-3">{log.entityType}</td>
                      <td className="py-2.5 px-3">
                        {log.user ? `${log.user.name} (${log.user.email})` : 'System'}
                      </td>
                      <td className="py-2.5 px-3 text-slate-500">
                        {new Date(log.createdAt).toLocaleString('ar-EG')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
