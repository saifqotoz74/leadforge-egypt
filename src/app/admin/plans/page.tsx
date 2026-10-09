'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { AppShell } from '@/components/domain/AppShell';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { Button } from '@/components/ui/Button';
import { Card, CardContent } from '@/components/ui/Card';
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
  const t = useTranslations('adminPlans');
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
      setMsg(t('savedSuccess', { name: plan.name }));
      await loadPlans();
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
        </Card>

        {msg && (
          <div className="rounded-xl border border-line-brand bg-brand-soft p-4 text-xs font-bold text-brand">
            ✓ {msg}
          </div>
        )}

        {loading ? (
          <div className="grid gap-5 md:grid-cols-2">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-56 rounded-xl border border-line" />
            ))}
          </div>
        ) : plans.length === 0 ? (
          <EmptyState
            title={t('emptyTitle')}
            description={t('emptyDesc')}
          />
        ) : (
          <div className="grid gap-5 md:grid-cols-2">
            {plans.map((plan, idx) => (
              <Card
                key={plan.id}
                className="rounded-xl border border-line bg-surface p-6 shadow-xs space-y-4"
              >
                <div className="flex items-center justify-between">
                  <span className="rounded bg-subtle px-2.5 py-0.5 text-xs font-bold text-fg-secondary">
                    {plan.nameEn} ({plan.slug})
                  </span>
                  <span className="text-xs font-bold text-brand">
                    <span className="tabular-nums ltr-iso">{plan.subscribersCount}</span>{' '}
                    {t('subscribersCount', { count: plan.subscribersCount })}
                  </span>
                </div>

                <div className="grid gap-3 sm:grid-cols-3 text-xs">
                  <div>
                    <label className="font-bold text-fg-secondary">{t('planNameLabel')}</label>
                    <input
                      type="text"
                      value={plan.name}
                      onChange={(e) => {
                        const next = [...plans];
                        next[idx] = { ...plan, name: e.target.value };
                        setPlans(next);
                      }}
                      className="mt-1 w-full rounded-xl border border-line bg-surface px-3 py-2 font-bold text-fg-primary focus:border-brand"
                    />
                  </div>

                  <div>
                    <label className="font-bold text-fg-secondary">{t('priceLabel')}</label>
                    <input
                      type="number"
                      min={0}
                      value={plan.priceEgp}
                      onChange={(e) => {
                        const next = [...plans];
                        next[idx] = { ...plan, priceEgp: Number(e.target.value) };
                        setPlans(next);
                      }}
                      className="mt-1 w-full rounded-xl border border-line bg-surface px-3 py-2 font-bold text-fg-primary tabular-nums ltr-iso focus:border-brand"
                    />
                  </div>

                  <div>
                    <label className="font-bold text-fg-secondary">{t('creditsLabel')}</label>
                    <input
                      type="number"
                      min={1}
                      value={plan.monthlyCredits}
                      onChange={(e) => {
                        const next = [...plans];
                        next[idx] = { ...plan, monthlyCredits: Number(e.target.value) };
                        setPlans(next);
                      }}
                      className="mt-1 w-full rounded-xl border border-line bg-surface px-3 py-2 font-bold text-fg-primary tabular-nums ltr-iso focus:border-brand"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between border-t border-line pt-3 text-xs">
                  <label className="flex items-center gap-2 font-bold text-fg-secondary cursor-pointer">
                    <input
                      type="checkbox"
                      checked={plan.allowsExclusive}
                      onChange={(e) => {
                        const next = [...plans];
                        next[idx] = { ...plan, allowsExclusive: e.target.checked };
                        setPlans(next);
                      }}
                      className="h-4 w-4 rounded border-line text-brand focus:ring-brand"
                    />
                    <span>{t('exclusiveLabel')}</span>
                  </label>

                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => handleUpdatePlan(plan)}
                    className="gap-1.5 text-xs"
                  >
                    <Save className="h-3.5 w-3.5 rtl:-scale-x-100" />
                    <span>{t('btnSave')}</span>
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
