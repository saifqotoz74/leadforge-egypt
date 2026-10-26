'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { AppShell } from '@/components/domain/AppShell';
import { PageHeader } from '@/components/domain/PageHeader';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { Dialog } from '@/components/ui/Dialog';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/Table';
import { localizePlanName } from '@/lib/taxonomy';
import { getCachedAdminData, setCachedAdminData, invalidateAdminCache } from '@/lib/admin-cache';
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
      slug?: string;
      name: string;
      nameEn: string;
    };
  } | null;
}

interface PlanOption {
  id: string;
  slug?: string;
  name: string;
  nameEn: string;
  monthlyCredits: number;
}

export default function AdminUsersPage() {
  const t = useTranslations('adminUsers');
  const tPlans = useTranslations('plans');
  const locale = useLocale();
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
    const cacheKey = `admin_users_${search.trim()}_${statusFilter}`;
    const cached = getCachedAdminData<{ users: AdminUserItem[]; plans: PlanOption[] }>(cacheKey);
    if (cached) {
      setUsers(cached.users);
      setPlans(cached.plans);
      setLoading(false);
    } else {
      setLoading(true);
    }

    const requestStartedAt = Date.now();
    try {
      const params = new URLSearchParams();
      if (search.trim()) params.set('search', search.trim());
      if (statusFilter !== 'ALL') params.set('status', statusFilter);

      const res = await fetch(`/api/admin/users?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        const freshUsers = data.users || [];
        const freshPlans = data.plans || [];
        setUsers(freshUsers);
        setPlans(freshPlans);
        setCachedAdminData(cacheKey, { users: freshUsers, plans: freshPlans }, { requestStartedAt });
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
      invalidateAdminCache('admin_users');
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
        invalidateAdminCache('admin_users');
        await loadUsers();
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppShell isAdmin={true} density="compact" pageTitle={t('pageTitle')}>
      <div className="space-y-6">
        <PageHeader
          title={t('title')}
          description={t('desc')}
        />

        <Card className="rounded-xl border border-line bg-surface p-4 shadow-xs">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex-1 min-w-56">
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t('searchPlaceholder')}
                startIcon={<Search className="h-4 w-4" />}
              />
            </div>

            <div className="w-48">
              <Select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                options={[
                  { value: 'ALL', label: t('statusAll') },
                  { value: 'ACTIVE', label: t('statusActive') },
                  { value: 'SUSPENDED', label: t('statusSuspended') },
                ]}
              />
            </div>
          </div>
        </Card>

        <Card className="rounded-xl border border-line bg-surface shadow-xs overflow-hidden">
          {loading && users.length === 0 ? (
            <div className="p-6 space-y-4">
              <Skeleton className="h-12 w-full rounded-xl" />
              <Skeleton className="h-48 w-full rounded-xl" />
            </div>
          ) : users.length === 0 ? (
            <div className="p-6">
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
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('colUser')}</TableHead>
                  <TableHead>{t('colRole')}</TableHead>
                  <TableHead>{t('colStatus')}</TableHead>
                  <TableHead>{t('colPlan')}</TableHead>
                  <TableHead>{t('colBalance')}</TableHead>
                  <TableHead>{t('colUsage')}</TableHead>
                  <TableHead>{t('colActions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((u) => (
                  <TableRow key={u.id}>
                    <TableCell>
                      <p className="font-bold text-fg-primary">
                        <bdi dir="auto">{u.name}</bdi>
                      </p>
                      <p className="text-caption text-fg-muted ltr-iso">{u.email}</p>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={u.role === 'ADMIN' ? 'brand' : 'neutral'}
                        className="text-caption"
                      >
                        {u.role}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={u.status === 'ACTIVE' ? 'brand' : 'danger'}
                        className="text-caption"
                      >
                        {u.status === 'ACTIVE' ? t('statusActive') : t('statusSuspended')}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-body-sm">
                      {u.subscription?.plan
                        ? localizePlanName(u.subscription.plan, locale, tPlans)
                        : '-'}
                    </TableCell>
                    <TableCell className="font-extrabold text-brand tabular-nums ltr-iso text-body-sm">
                      {u.subscription ? `${u.subscription.credits} ${t('pointsSuffix')}` : '-'}
                    </TableCell>
                    <TableCell className="tabular-nums text-caption text-fg-secondary">
                      {t('claimsSummary', { claims: u.claimsCount, feedbacks: u.feedbacksCount })}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => {
                            setEditUser(u);
                            setEditPlanId(u.subscription?.plan?.id || plans[0]?.id || '');
                            setEditCredits(u.subscription?.credits ?? 0);
                          }}
                          className="gap-1.5"
                        >
                          <Coins className="h-3.5 w-3.5 text-warning-icon" />
                          <span>{t('btnEditPlan')}</span>
                        </Button>

                        {u.role !== 'ADMIN' && (
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => handleToggleSuspend(u)}
                            className={`gap-1.5 ${
                              u.status === 'ACTIVE'
                                ? 'text-danger-text hover:bg-danger-bg hover:border-danger-border'
                                : 'text-brand hover:bg-brand-soft'
                            }`}
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
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
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
              <Select
                label={t('labelPlan')}
                value={editPlanId}
                onChange={(e) => {
                  const pId = e.target.value;
                  setEditPlanId(pId);
                  const found = plans.find((p) => p.id === pId);
                  if (found) setEditCredits(found.monthlyCredits);
                }}
                options={plans.map((p) => ({
                  value: p.id,
                  label: `${localizePlanName(p, locale, tPlans)} (${p.monthlyCredits} ${t('pointsSuffix')})`,
                }))}
              />

              <Input
                label={t('labelCredits')}
                type="number"
                min={0}
                value={editCredits}
                onChange={(e) => setEditCredits(Number(e.target.value))}
                className="font-bold tabular-nums ltr-iso"
              />

              <div className="flex justify-end gap-2 pt-2">
                <Button
                  variant="ghost"
                  type="button"
                  onClick={() => setEditUser(null)}
                >
                  {t('btnCancel')}
                </Button>
                <Button
                  variant="primary"
                  type="submit"
                  disabled={saving}
                  className="gap-1.5"
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
