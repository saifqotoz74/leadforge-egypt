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

export default function AdminOverviewPage() {
  const [data, setData] = useState<AdminOverviewData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch('/api/admin/reports');
        if (res.ok) {
          setData(await res.json());
        }
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

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
              </div>
            </div>
          </div>

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
