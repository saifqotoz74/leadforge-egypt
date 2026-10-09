'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { AppShell } from '@/components/domain/AppShell';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { Dialog } from '@/components/ui/Dialog';
import { Button } from '@/components/ui/Button';
import { Card, CardContent } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Search, ShieldBan, CheckCircle, Coins, ArrowRight } from 'lucide-react';

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
  const t = useTranslations('adminUsers');
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
    <AppShell isAdmin={true} density="compact" pageTitle={t('pageTitle')}>
      <div className="space-y-6">
        <Card className="rounded-xl border border-line bg-surface p-6 shadow-xs">
          <h1 className="text-xl font-extrabold text-fg-primary">
            {t('title')}
          </h1>
          <p className="mt-1 text-xs text-fg-muted">
            {t('desc')}
          </p>

          <div className="mt-4 flex flex-wrap gap-3">
            <div className="relative flex-1 min-w-56">
              <Search className="absolute start-3 top-2.5 h-4 w-4 text-fg-muted" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t('searchPlaceholder')}
                className="w-full rounded-xl border border-line bg-surface py-2 ps-9 pe-3 text-xs font-semibold text-fg-primary placeholder:text-fg-muted focus:border-brand"
              />
            </div>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="rounded-xl border border-line bg-surface px-4 py-2 text-xs font-bold text-fg-primary"
            >
              <option value="ALL">{t('statusAll')}</option>
              <option value="ACTIVE">{t('statusActive')}</option>
              <option value="SUSPENDED">{t('statusSuspended')}</option>
            </select>
          </div>
        </Card>

        <Card className="rounded-xl border border-line bg-surface p-6 shadow-xs overflow-x-auto">
          {loading ? (
            <div className="space-y-4">
              <Skeleton className="h-12 w-full rounded-xl" />
              <Skeleton className="h-48 w-full rounded-xl" />
            </div>
          ) : users.length === 0 ? (
            <EmptyState
              title={t('emptyTitle')}
              description={t('emptyDesc')}
              action={{
                label: t('statusAll'),
                onClick: () => {
                  setSearch('');
                  setStatusFilter('ALL');
                },
              }}
            />
          ) : (
            <table className="w-full text-start text-xs">
              <thead>
                <tr className="border-b border-line text-fg-muted">
                  <th className="py-3 px-3 text-start">{t('colUser')}</th>
                  <th className="py-3 px-3 text-start">{t('colRole')}</th>
                  <th className="py-3 px-3 text-start">{t('colStatus')}</th>
                  <th className="py-3 px-3 text-start">{t('colPlan')}</th>
                  <th className="py-3 px-3 text-start">{t('colBalance')}</th>
                  <th className="py-3 px-3 text-start">{t('colUsage')}</th>
                  <th className="py-3 px-3 text-start">{t('colActions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line font-semibold">
                {users.map((u) => (
                  <tr key={u.id} className="hover:bg-subtle/50 transition-colors">
                    <td className="py-3.5 px-3">
                      <p className="font-bold text-fg-primary">{u.name}</p>
                      <p className="text-xs text-fg-muted font-mono">{u.email}</p>
                    </td>
                    <td className="py-3.5 px-3">
                      <Badge
                        variant={u.role === 'ADMIN' ? 'brand' : 'neutral'}
                        className="text-xs"
                      >
                        {u.role}
                      </Badge>
                    </td>
                    <td className="py-3.5 px-3">
                      <Badge
                        variant={u.status === 'ACTIVE' ? 'brand' : 'danger'}
                        className="text-xs"
                      >
                        {u.status === 'ACTIVE' ? t('statusActive') : t('statusSuspended')}
                      </Badge>
                    </td>
                    <td className="py-3.5 px-3">
                      {u.subscription?.plan?.name || '—'}
                    </td>
                    <td className="py-3.5 px-3 font-extrabold text-brand tabular-nums ltr-iso">
                      {u.subscription ? `${u.subscription.credits} ${t('pointsSuffix')}` : '—'}
                    </td>
                    <td className="py-3.5 px-3 font-mono tabular-nums">
                      {t('claimsSummary', { claims: u.claimsCount, feedbacks: u.feedbacksCount })}
                    </td>
                    <td className="py-3.5 px-3">
                      <div className="flex items-center gap-2">
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => {
                            setEditUser(u);
                            setEditPlanId(u.subscription?.plan?.id || plans[0]?.id || '');
                            setEditCredits(u.subscription?.credits ?? 0);
                          }}
                          className="gap-1 text-xs"
                        >
                          <Coins className="h-3.5 w-3.5 text-warning-icon" />
                          <span>{t('btnEditPlan')}</span>
                        </Button>

                        {u.role !== 'ADMIN' && (
                          <Button
                            variant={u.status === 'ACTIVE' ? 'danger' : 'secondary'}
                            size="sm"
                            onClick={() => handleToggleSuspend(u)}
                            className="gap-1 text-xs"
                          >
                            {u.status === 'ACTIVE' ? (
                              <>
                                <ShieldBan className="h-3.5 w-3.5" />
                                <span>{t('btnSuspend')}</span>
                              </>
                            ) : (
                              <>
                                <CheckCircle className="h-3.5 w-3.5" />
                                <span>{t('btnActivate')}</span>
                              </>
                            )}
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>

        {/* Edit Subscription & Credits Dialog */}
        <Dialog
          isOpen={!!editUser}
          onClose={() => setEditUser(null)}
          title={editUser ? t('dialogTitle', { name: editUser.name }) : ''}
          size="md"
        >
          {editUser && (
            <form onSubmit={handleSaveSubscription} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-fg-secondary">{t('labelPlan')}</label>
                <select
                  value={editPlanId}
                  onChange={(e) => {
                    const pId = e.target.value;
                    setEditPlanId(pId);
                    const found = plans.find((p) => p.id === pId);
                    if (found) setEditCredits(found.monthlyCredits);
                  }}
                  className="mt-1 w-full rounded-xl border border-line bg-surface px-3 py-2 text-xs font-bold text-fg-primary"
                >
                  {plans.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.monthlyCredits} {t('pointsSuffix')})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-fg-secondary">
                  {t('labelCredits')}
                </label>
                <input
                  type="number"
                  min={0}
                  value={editCredits}
                  onChange={(e) => setEditCredits(Number(e.target.value))}
                  className="mt-1 w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm font-bold text-fg-primary tabular-nums ltr-iso"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button
                  variant="ghost"
                  type="button"
                  onClick={() => setEditUser(null)}
                  className="text-xs"
                >
                  {t('btnCancel')}
                </Button>
                <Button
                  variant="primary"
                  type="submit"
                  disabled={saving}
                  className="gap-1.5 text-xs"
                >
                  <ArrowRight className="h-3.5 w-3.5 rtl:-scale-x-100" />
                  <span>{saving ? t('saving') : t('btnSave')}</span>
                </Button>
              </div>
            </form>
          )}
        </Dialog>
      </div>
    </AppShell>
  );
}
