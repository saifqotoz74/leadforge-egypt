'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { AppShell } from '@/components/domain/AppShell';
import { PageHeader } from '@/components/domain/PageHeader';
import { StatTile } from '@/components/domain/StatTile';
import { PackageCard } from '@/components/domain/PackageCard';
import { LedgerTable, LedgerEntry } from '@/components/domain/LedgerTable';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import { Dialog } from '@/components/ui/Dialog';
import { Button } from '@/components/ui/Button';
import { Banner } from '@/components/ui/Banner';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import Link from 'next/link';
import { fmtDate, fmtNumber } from '@/lib/format';
import { CreditCard, ArrowRight } from 'lucide-react';

interface PlanItem {
  id: string;
  slug: string;
  name: string;
  nameEn: string;
  priceEgp: number;
  monthlyCredits: number;
  allowsExclusive: boolean;
  features: string[];
}

interface SubscriptionInfo {
  id: string;
  status: string;
  credits: number;
  totalCreditsGranted: number;
  creditsUsed: number;
  currentPeriodStart: string;
  currentPeriodEnd: string;
  plan: PlanItem;
}

interface PaymentRecord {
  id: string;
  amountEgp: number;
  creditsGranted: number;
  provider: string;
  providerRef: string;
  status: string;
  createdAt: string;
  plan: { name: string };
}

export default function SubscriptionPage() {
  const t = useTranslations('credits');
  const [subscription, setSubscription] = useState<SubscriptionInfo | null>(null);
  const [plans, setPlans] = useState<PlanItem[]>([]);
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [ledgerEntries, setLedgerEntries] = useState<LedgerEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [confirmPlan, setConfirmPlan] = useState<PlanItem | null>(null);
  const [processing, setProcessing] = useState(false);
  const [msg, setMsg] = useState<{ type: 'info' | 'danger'; text: string } | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [subRes, creditsRes] = await Promise.all([
        fetch('/api/subscription'),
        fetch('/api/developer/credits'),
      ]);

      if (subRes.ok) {
        const data = await subRes.json();
        setSubscription(data.subscription);
        setPlans(data.plans || []);
        setPayments(data.payments || []);
      }

      if (creditsRes.ok) {
        const creditsData = await creditsRes.json();
        if (creditsData.transactions && Array.isArray(creditsData.transactions)) {
          setLedgerEntries(creditsData.transactions);
        }
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  async function handleConfirmUpgrade() {
    if (!confirmPlan) return;
    setProcessing(true);
    setMsg(null);
    try {
      const res = await fetch('/api/subscription', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planId: confirmPlan.id }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMsg({ type: 'danger', text: data.error || t('activateError') });
      } else {
        setMsg({
          type: 'info',
          text: t('activateSuccess', { name: confirmPlan.name, credits: fmtNumber(data.subscription?.credits ?? 0) }),
        });
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('leadforge:user-updated'));
        }
        setConfirmPlan(null);
        await loadData();
      }
    } finally {
      setProcessing(false);
    }
  }

  return (
    <AppShell
      density="comfortable"
      pageTitle={t('title')}
      userCredits={subscription?.credits}
    >
      {loading ? (
        <div className="flex flex-col gap-6">
          <Skeleton className="h-10 w-48 rounded" />
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-28 w-full rounded-xl" />
            ))}
          </div>
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-96 w-full rounded-xl" />
            ))}
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-8">
          {/* Template T6 PageHeader */}
          <PageHeader
            title={t('title')}
            description={t('desc')}
            breadcrumbs={[
              { label: t('bcDashboard'), href: '/dashboard' },
              { label: t('bcCredits') },
            ]}
            actions={
              <Link href="/leads">
                <Button
                  variant="secondary"
                  size="sm"
                  startIcon={<ArrowRight className="w-4 h-4 rtl:-scale-x-100" />}
                >
                  {t('bcDashboard')}
                </Button>
              </Link>
            }
          />

          {/* Feedback Message Banner */}
          {msg && <Banner variant={msg.type}>{msg.text}</Banner>}

          {/* Active Balance and Subscription Summary (StatTiles per Spec 7.11) */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatTile
              label={t('remainingBalance')}
              value={subscription?.credits ?? 0}
              unit={t('pointsUnit')}
              statusText={t('readyToUse')}
            />
            <StatTile
              label={t('grantedBalance')}
              value={subscription?.totalCreditsGranted ?? 0}
              unit={t('pointsMonthly')}
              statusText={t('planPrefix', { name: subscription?.plan?.name || t('freePlan') })}
            />
            <StatTile
              label={t('consumedThisMonth')}
              value={subscription?.creditsUsed ?? 0}
              unit={t('pointsUnit')}
              statusText={t('consumedDesc')}
            />
            <StatTile
              label={t('nextRenewalDate')}
              value={
                subscription?.currentPeriodEnd
                  ? fmtDate(new Date(subscription.currentPeriodEnd))
                  : '—'
              }
              statusText={t('autoRenewal')}
            />
          </div>

          {/* Template T6 Top-up: Package Cards (Spec 7.12 Hostinger Pricing Pattern) */}
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1">
              <h2 className="text-h2 font-semibold text-fg-primary">
                {t('plansTitle')}
              </h2>
              <p className="text-body-sm text-fg-secondary">
                {t('plansDesc')}
              </p>
            </div>

            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
              {plans.map((plan) => {
                const isCurrent = subscription?.plan?.id === plan.id;
                return (
                  <PackageCard
                    key={plan.id}
                    id={plan.id}
                    name={plan.name}
                    points={plan.monthlyCredits}
                    priceEGP={plan.priceEgp}
                    features={plan.features}
                    isRecommended={isCurrent || plan.slug === 'pro'}
                    recommendedReason={
                      isCurrent
                        ? t('currentActivePlan')
                        : plan.slug === 'pro'
                        ? t('mostPopular')
                        : undefined
                    }
                    onSelectPackage={() => setConfirmPlan(plan)}
                  />
                );
              })}
            </div>
          </div>

          {/* Template T7 Ledger: Credit Transaction History */}
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1">
              <h2 className="text-h2 font-semibold text-fg-primary">
                {t('ledgerTitle')}
              </h2>
              <p className="text-body-sm text-fg-secondary">
                {t('ledgerDesc')}
              </p>
            </div>

            <LedgerTable entries={ledgerEntries} />
          </div>

          {/* Payment Invoices & History */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <CreditCard className="w-5 h-5 text-fg-brand" />
                <CardTitle>{t('paymentsTitle')}</CardTitle>
              </div>
            </CardHeader>

            {payments.length === 0 ? (
              <div className="py-6">
                <EmptyState
                  title={t('noPayments')}
                  description={t('ledgerDesc')}
                />
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-start border-collapse text-body-sm">
                  <thead>
                    <tr className="border-b border-line bg-subtle text-caption font-semibold text-fg-secondary h-11">
                      <th className="py-2.5 px-4 text-start">{t('colRef')}</th>
                      <th className="py-2.5 px-4 text-start">{t('colPlan')}</th>
                      <th className="py-2.5 px-4 text-start">{t('colAmount')}</th>
                      <th className="py-2.5 px-4 text-start">{t('colCredits')}</th>
                      <th className="py-2.5 px-4 text-start">{t('colStatus')}</th>
                      <th className="py-2.5 px-4 text-end">{t('colDate')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {payments.map((p) => (
                      <tr key={p.id} className="h-12 hover:bg-brand-soft/30 transition-colors">
                        <td className="py-2.5 px-4 font-mono text-fg-primary">{p.providerRef}</td>
                        <td className="py-2.5 px-4 font-medium text-fg-primary">{p.plan?.name}</td>
                        <td className="py-2.5 px-4 ltr-iso font-mono tabular-nums text-fg-primary">
                          {fmtNumber(p.amountEgp)} {t('egp')}
                        </td>
                        <td className="py-2.5 px-4 ltr-iso font-mono font-semibold tabular-nums text-fg-brand">
                          +{fmtNumber(p.creditsGranted)} {t('pointsUnit')}
                        </td>
                        <td className="py-2.5 px-4">
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-brand-soft text-fg-brand text-caption font-semibold">
                            {p.status}
                          </span>
                        </td>
                        <td className="py-2.5 px-4 text-end text-fg-secondary">
                          {fmtDate(new Date(p.createdAt))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          {/* Upgrade Confirmation Dialog */}
          <Dialog
            isOpen={confirmPlan !== null}
            onClose={() => setConfirmPlan(null)}
            title={confirmPlan ? t('confirmTitle', { name: confirmPlan.name }) : ''}
            footer={
              <div className="flex items-center justify-end gap-3 w-full">
                <Button
                  variant="ghost"
                  onClick={() => setConfirmPlan(null)}
                  disabled={processing}
                >
                  {t('cancel')}
                </Button>
                <Button
                  variant="primary"
                  onClick={handleConfirmUpgrade}
                  isLoading={processing}
                >
                  {t('confirmBtn')}
                </Button>
              </div>
            }
          >
            {confirmPlan && (
              <div className="flex flex-col gap-3 py-2 text-body">
                <p className="text-fg-primary leading-relaxed">
                  {t('confirmBody', {
                    name: confirmPlan.name,
                    price: fmtNumber(confirmPlan.priceEgp),
                    credits: fmtNumber(confirmPlan.monthlyCredits),
                  })}
                </p>
                <div className="p-3 rounded-lg bg-subtle border border-line text-body-sm text-fg-secondary">
                  {t('instantNote')}
                </div>
              </div>
            )}
          </Dialog>
        </div>
      )}
    </AppShell>
  );
}
