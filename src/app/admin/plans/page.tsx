'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { AppShell } from '@/components/AppShell';
import { Save } from 'lucide-react';

interface AdminPlanItem {
  id: string;
  slug: string;
  name: string;
  nameEn: string;
  priceEgp: number;
  monthlyCredits: number;
  allowsExclusive: boolean;
  isActive: boolean;
  subscribersCount: number;
}

export default function AdminPlansPage() {
  const [plans, setPlans] = useState<AdminPlanItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);

  const loadPlans = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/plans');
      if (res.ok) {
        const data = await res.json();
        setPlans(data.plans || []);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPlans();
  }, [loadPlans]);

  async function handleUpdatePlan(plan: AdminPlanItem) {
    setMsg(null);
    const res = await fetch('/api/admin/plans', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        planId: plan.id,
        name: plan.name,
        priceEgp: Number(plan.priceEgp),
        monthlyCredits: Number(plan.monthlyCredits),
        allowsExclusive: plan.allowsExclusive,
        isActive: plan.isActive,
      }),
    });
    if (res.ok) {
      setMsg(`تم حفظ تعديلات "${plan.name}" بنجاح.`);
      await loadPlans();
    }
  }

  return (
    <AppShell isAdminView>
      <div className="space-y-6">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h1 className="text-xl font-extrabold text-slate-900">
            إدارة باقات الاشتراك والأسعار والحدود (Plans & Pricing)
          </h1>
          <p className="mt-1 text-xs text-slate-500">
            تعديل أسعار الباقات بالجنيه المصري وعدد نقاط الـ Leads الشهرية وصلاحية الفرص الحصرية.
          </p>
        </div>

        {msg && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-xs font-bold text-emerald-800">
            {msg}
          </div>
        )}

        <div className="grid gap-5 md:grid-cols-2">
          {loading
            ? [1, 2, 3, 4].map((i) => (
                <div
                  key={i}
                  className="h-56 animate-pulse rounded-2xl border border-slate-200 bg-white p-6"
                />
              ))
            : plans.map((plan, idx) => (
                <div
                  key={plan.id}
                  className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-4"
                >
                  <div className="flex items-center justify-between">
                    <span className="rounded bg-slate-100 px-2.5 py-0.5 text-xs font-bold text-slate-700">
                      {plan.nameEn} ({plan.slug})
                    </span>
                    <span className="text-xs font-bold text-emerald-700">
                      {plan.subscribersCount} مشترك حالي
                    </span>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-3 text-xs">
                    <div>
                      <label className="font-bold text-slate-700">اسم الباقة</label>
                      <input
                        type="text"
                        value={plan.name}
                        onChange={(e) => {
                          const next = [...plans];
                          next[idx] = { ...plan, name: e.target.value };
                          setPlans(next);
                        }}
                        className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 font-bold"
                      />
                    </div>

                    <div>
                      <label className="font-bold text-slate-700">السعر الشهري (ج.م)</label>
                      <input
                        type="number"
                        min={0}
                        value={plan.priceEgp}
                        onChange={(e) => {
                          const next = [...plans];
                          next[idx] = { ...plan, priceEgp: Number(e.target.value) };
                          setPlans(next);
                        }}
                        className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 font-bold"
                      />
                    </div>

                    <div>
                      <label className="font-bold text-slate-700">عدد النقاط (Credits)</label>
                      <input
                        type="number"
                        min={1}
                        value={plan.monthlyCredits}
                        onChange={(e) => {
                          const next = [...plans];
                          next[idx] = { ...plan, monthlyCredits: Number(e.target.value) };
                          setPlans(next);
                        }}
                        className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 font-bold"
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-between border-t border-slate-100 pt-3 text-xs">
                    <label className="flex items-center gap-2 font-bold text-slate-700 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={plan.allowsExclusive}
                        onChange={(e) => {
                          const next = [...plans];
                          next[idx] = { ...plan, allowsExclusive: e.target.checked };
                          setPlans(next);
                        }}
                        className="h-4 w-4 rounded border-slate-300 text-emerald-600"
                      />
                      <span>تسمح بالفرص الحصرية (Exclusive Leads)</span>
                    </label>

                    <button
                      onClick={() => handleUpdatePlan(plan)}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 font-extrabold text-white hover:bg-emerald-700"
                    >
                      <Save className="h-3.5 w-3.5" />
                      <span>حفظ التغييرات</span>
                    </button>
                  </div>
                </div>
              ))}
        </div>
      </div>
    </AppShell>
  );
}
