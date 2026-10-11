'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { AppShell } from '@/components/domain/AppShell';
import { PageHeader } from '@/components/domain/PageHeader';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Checkbox } from '@/components/ui/Checkbox';
import { Card } from '@/components/ui/Card';
import { Banner } from '@/components/ui/Banner';
import { localizePlanName } from '@/lib/taxonomy';
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
  const tPlans = useTranslations('plans');
  const locale = useLocale();
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
      setMsg(t('savedSuccess', { name: localizePlanName(plan, locale, tPlans) }));
      await loadPlans();
    }
  }

  return (
    <AppShell isAdmin={true} density="compact" pageTitle={t('pageTitle')}>
      <div className="space-y-6">
        <PageHeader
          title={t('title')}
          description={t('desc')}
        />

        {msg && (
          <Banner variant="info" onClose={() => setMsg(null)}>
            {msg}
          </Banner>
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
                className="rounded-xl border border-line bg-surface p-6 shadow-xs space-y-5"
              >
                <div className="flex items-center justify-between">
                  <span className="rounded-md bg-subtle px-2.5 py-1 text-caption font-bold text-fg-secondary">
                    <bdi dir="auto">{localizePlanName(plan, locale, tPlans)}</bdi> (<span className="ltr-iso">{plan.slug}</span>)
                  </span>
                  <span className="text-caption font-bold text-brand tabular-nums">
                    {t('subscribersCount', { count: plan.subscribersCount })}
                  </span>
                </div>

                <div className="grid gap-3 sm:grid-cols-3">
                  <Input
                    label={t('planNameLabel')}
                    value={plan.name}
                    onChange={(e) => {
                      const next = [...plans];
                      next[idx] = { ...plan, name: e.target.value };
                      setPlans(next);
                    }}
                  />

                  <Input
                    label={t('priceLabel')}
                    type="number"
                    min={0}
                    value={plan.priceEgp}
                    onChange={(e) => {
                      const next = [...plans];
                      next[idx] = { ...plan, priceEgp: Number(e.target.value) };
                      setPlans(next);
                    }}
                    className="tabular-nums ltr-iso font-bold"
                  />

                  <Input
                    label={t('creditsLabel')}
                    type="number"
                    min={1}
                    value={plan.monthlyCredits}
                    onChange={(e) => {
                      const next = [...plans];
                      next[idx] = { ...plan, monthlyCredits: Number(e.target.value) };
                      setPlans(next);
                    }}
                    className="tabular-nums ltr-iso font-bold"
                  />
                </div>

                <div className="flex items-center justify-between border-t border-line pt-3.5">
                  <Checkbox
                    label={t('exclusiveLabel')}
                    checked={plan.allowsExclusive}
                    onChange={(e) => {
                      const next = [...plans];
                      next[idx] = { ...plan, allowsExclusive: e.target.checked };
                      setPlans(next);
                    }}
                  />

                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => handleUpdatePlan(plan)}
                    className="gap-1.5"
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
