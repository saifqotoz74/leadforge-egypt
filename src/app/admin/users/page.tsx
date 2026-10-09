'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { AppShell } from '@/components/AppShell';
import { Search, ShieldBan, CheckCircle, Coins } from 'lucide-react';

interface AdminUserItem {
  id: string;
  name: string;
  email: string;
  role: 'DEVELOPER' | 'ADMIN';
  status: 'ACTIVE' | 'SUSPENDED';
  createdAt: string;
  claimsCount: number;
  feedbacksCount: number;
  subscription?: {
    id: string;
    credits: number;
    totalCreditsGranted: number;
    creditsUsed: number;
    plan: {
      id: string;
      name: string;
      nameEn: string;
    };
  } | null;
}

interface PlanOption {
  id: string;
  name: string;
  nameEn: string;
  monthlyCredits: number;
}

export default function AdminUsersPage() {
  const [users, setUsers] = useState<AdminUserItem[]>([]);
  const [plans, setPlans] = useState<PlanOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [editUser, setEditUser] = useState<AdminUserItem | null>(null);
  const [editPlanId, setEditPlanId] = useState('');
  const [editCredits, setEditCredits] = useState(0);
  const [saving, setSaving] = useState(false);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search.trim()) params.set('search', search.trim());
      if (statusFilter !== 'ALL') params.set('status', statusFilter);

      const res = await fetch(`/api/admin/users?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setUsers(data.users || []);
        setPlans(data.plans || []);
      }
    } finally {
      setLoading(false);
    }
  }, [search, statusFilter]);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  async function handleToggleSuspend(u: AdminUserItem) {
    const nextStatus = u.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE';
    const res = await fetch('/api/admin/users', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: u.id, status: nextStatus }),
    });
    if (res.ok) {
      await loadUsers();
    }
  }

  async function handleSaveSubscription(e: React.FormEvent) {
    e.preventDefault();
    if (!editUser) return;
    setSaving(true);
    try {
      const res = await fetch('/api/admin/users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: editUser.id,
          planId: editPlanId,
          credits: Number(editCredits),
        }),
      });
      if (res.ok) {
        setEditUser(null);
        await loadUsers();
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppShell isAdminView>
      <div className="space-y-6">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h1 className="text-xl font-extrabold text-slate-900">
            إدارة المستخدمين والمشتركين (Users Management)
          </h1>
          <p className="mt-1 text-xs text-slate-500">
            بحث وتصفية المطورين، إيقاف أو تفعيل الحسابات، وتعديل الباقات ورصيد النقاط.
          </p>

          <div className="mt-4 flex flex-wrap gap-3">
            <div className="relative flex-1 min-w-[220px]">
              <Search className="absolute right-3 top-2.5 h-4 w-4 text-slate-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="ابحث بالاسم أو البريد الإلكتروني..."
                className="w-full rounded-xl border border-slate-300 py-2 pr-9 pl-3 text-xs font-semibold"
              />
            </div>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-bold"
            >
              <option value="ALL">جميع الحالات</option>
              <option value="ACTIVE">نشط (ACTIVE)</option>
              <option value="SUSPENDED">موقوف (SUSPENDED)</option>
            </select>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm overflow-x-auto">
          {loading ? (
            <div className="h-48 animate-pulse bg-slate-100 rounded-xl" />
          ) : (
            <table className="w-full text-right text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500">
                  <th className="py-3 px-3">المستخدم</th>
                  <th className="py-3 px-3">الصلاحية</th>
                  <th className="py-3 px-3">الحالة</th>
                  <th className="py-3 px-3">الباقة الحالية</th>
                  <th className="py-3 px-3">الرصيد المتبقي</th>
                  <th className="py-3 px-3">الاستخدام (Claims)</th>
                  <th className="py-3 px-3">إجراءات الإدارة</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-semibold">
                {users.map((u) => (
                  <tr key={u.id}>
                    <td className="py-3.5 px-3">
                      <p className="font-bold text-slate-900">{u.name}</p>
                      <p className="text-[11px] text-slate-500">{u.email}</p>
                    </td>
                    <td className="py-3.5 px-3">
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
                          u.role === 'ADMIN'
                            ? 'bg-purple-100 text-purple-800'
                            : 'bg-slate-100 text-slate-700'
                        }`}
                      >
                        {u.role}
                      </span>
                    </td>
                    <td className="py-3.5 px-3">
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
                          u.status === 'ACTIVE'
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-rose-100 text-rose-800'
                        }`}
                      >
                        {u.status === 'ACTIVE' ? 'نشط' : 'موقوف'}
                      </span>
                    </td>
                    <td className="py-3.5 px-3">
                      {u.subscription?.plan?.name || '—'}
                    </td>
                    <td className="py-3.5 px-3 font-extrabold text-emerald-700">
                      {u.subscription ? `${u.subscription.credits} نقطة` : '—'}
                    </td>
                    <td className="py-3.5 px-3">
                      {u.claimsCount} عميل ({u.feedbacksCount} تقييم)
                    </td>
                    <td className="py-3.5 px-3">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => {
                            setEditUser(u);
                            setEditPlanId(u.subscription?.plan?.id || plans[0]?.id || '');
                            setEditCredits(u.subscription?.credits ?? 0);
                          }}
                          className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-[11px] font-bold text-slate-700 hover:bg-slate-50"
                        >
                          <Coins className="h-3.5 w-3.5 text-amber-500" />
                          الباقة والرصيد
                        </button>

                        {u.role !== 'ADMIN' && (
                          <button
                            onClick={() => handleToggleSuspend(u)}
                            className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[11px] font-bold ${
                              u.status === 'ACTIVE'
                                ? 'bg-rose-50 text-rose-700 hover:bg-rose-100'
                                : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                            }`}
                          >
                            {u.status === 'ACTIVE' ? (
                              <>
                                <ShieldBan className="h-3.5 w-3.5" />
                                إيقاف
                              </>
                            ) : (
                              <>
                                <CheckCircle className="h-3.5 w-3.5" />
                                تفعيل
                              </>
                            )}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Edit Subscription & Credits Modal */}
        {editUser && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
            <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
              <h3 className="text-base font-extrabold text-slate-900">
                تعديل باقة ورصيد: {editUser.name}
              </h3>
              <form onSubmit={handleSaveSubscription} className="mt-4 space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700">الباقة:</label>
                  <select
                    value={editPlanId}
                    onChange={(e) => {
                      const pId = e.target.value;
                      setEditPlanId(pId);
                      const found = plans.find((p) => p.id === pId);
                      if (found) setEditCredits(found.monthlyCredits);
                    }}
                    className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-bold"
                  >
                    {plans.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} ({p.monthlyCredits} نقطة)
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700">
                    رصيد النقاط المتاح (Credits):
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={editCredits}
                    onChange={(e) => setEditCredits(Number(e.target.value))}
                    className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm font-bold"
                  />
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setEditUser(null)}
                    className="rounded-xl border border-slate-300 px-4 py-2 text-xs font-bold text-slate-700"
                  >
                    إلغاء
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white"
                  >
                    {saving ? 'جاري الحفظ...' : 'حفظ التعديلات'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
