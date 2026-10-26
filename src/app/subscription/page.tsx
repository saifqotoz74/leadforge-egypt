'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useTranslations, useLocale } from 'next-intl';
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
import { IdChip } from '@/components/ui/IdChip';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/Table';
import { Badge } from '@/components/ui/Badge';
import { fmtDate, fmtNumber } from '@/lib/format';
import { localizePlanName } from '@/lib/taxonomy';
import { CreditCard, ArrowRight } from 'lucide-react';
import { TransferPaymentModal } from '@/components/domain/TransferPaymentModal';

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
  plan: { name: string; slug?: string };
}

export default function SubscriptionPage() {
  const t = useTranslations('credits');
  const tPlans = useTranslations('plans');
  const tEnums = useTranslations('enums');
  const locale = useLocale();
  const [subscription, setSubscription] = useState<SubscriptionInfo | null>(null);
  const [plans, setPlans] = useState<PlanItem[]>([]);
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [ledgerEntries, setLedgerEntries] = useState<LedgerEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [confirmPlan, setConfirmPlan] = useState<PlanItem | null>(null);
  const [transferModalPlan, setTransferModalPlan] = useState<PlanItem | null>(null);
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
        const localizedName = localizePlanName(confirmPlan, tPlans as any);
        setMsg({
          type: 'info',
          text: t('activateSuccess', {
            name: localizedName,
            credits: fmtNumber(data.subscription?.credits ?? 0, locale),
          }),
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

  const activePlanName = subscription?.plan
    ? localizePlanName(subscription.plan, tPlans as any)
    : t('freePlan');
  const confirmPlanName = confirmPlan
    ? localizePlanName(confirmPlan, tPlans as any)
    : '';

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
              <a href="#plans-section">
                <Button
                  variant="primary"
                  size="sm"
                  endIcon={<ArrowRight className="w-4 h-4 rtl:-scale-x-100" />}
                >
                  {t('plansTitle')}
                </Button>
              </a>
            }
          />

          {/* Feedback Message Banner */}
          {msg && <Banner variant={msg.type}>{msg.text}</Banner>}

          {/* Pending Transfer Review Notice (GAP-02 / UX) */}
          {payments.some((p) => p.status === 'PENDING') && (() => {
            const pendingPayment = payments.find((p) => p.status === 'PENDING')!;
            return (
              <Banner variant="info">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 w-full text-start">
                  <div className="flex flex-col gap-0.5">
                    <span className="font-semibold text-body-sm">
                      {locale === 'en'
                        ? 'Bank Transfer Under Review'
                        : 'طلب التحويل البنكي قيد المراجعة اليدوية'}
                    </span>
                    <span className="text-caption text-fg-secondary">
                      {locale === 'en'
                        ? `Your transfer request (${pendingPayment.providerRef}) for ${fmtNumber(pendingPayment.amountEgp, locale)} EGP is currently under review. Credits will be added once confirmed.`
                        : `طلب التحويل الخاص بك (${pendingPayment.providerRef}) بمبلغ ${fmtNumber(pendingPayment.amountEgp, locale)} ج.م قيد المراجعة حالياً. ستتم إضافة النقاط وتفعيل الباقة فور التأكيد.`}
                    </span>
                  </div>
                  <Badge variant="warning" size="sm" className="shrink-0 self-start sm:self-auto">
                    {locale === 'en' ? 'Under Review' : 'قيد المراجعة'}
                  </Badge>
                </div>
              </Banner>
            );
          })()}

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
              statusText={t('planPrefix', { name: activePlanName })}
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
                  ? fmtDate(new Date(subscription.currentPeriodEnd), locale)
                  : '-'
              }
              statusText={t('autoRenewal')}
            />
          </div>

          {/* Template T6 Top-up: Package Cards (Spec 7.12 Hostinger Pricing Pattern) */}
          <div id="plans-section" className="flex flex-col gap-4 scroll-mt-20">
            <div className="flex flex-col gap-1">
              <h2 className="text-h2 font-semibold text-fg-primary">
                {t('plansTitle')}
              </h2>
              <p className="text-body-sm text-fg-secondary">
                {t('plansDesc')}
              </p>
            </div>

            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4 items-stretch">
              {plans.map((plan) => {
                const isCurrent = subscription?.plan?.id === plan.id;
                const isRecommended = plan.slug === 'pro';
                return (
                  <PackageCard
                    key={plan.id}
                    id={plan.id}
                    slug={plan.slug}
                    name={plan.name}
                    points={plan.monthlyCredits}
                    priceEGP={plan.priceEgp}
                    allowsExclusive={plan.allowsExclusive}
                    features={plan.features}
                    isRecommended={isRecommended}
                    isCurrent={isCurrent}
                    recommendedReason={
                      isCurrent
                        ? t('currentActivePlan')
                        : isRecommended
                        ? t('mostPopular')
                        : undefined
                    }
                    onSelectPackage={() => {
                      if (plan.priceEgp > 0) {
                        setTransferModalPlan(plan);
                      } else {
                        setConfirmPlan(plan);
                      }
                    }}
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

            {payments.some((p) => p.status === 'PENDING') && (
              <div className="px-6 pt-2 pb-0">
                <Banner variant="info">
                  {locale === 'en'
                    ? 'You have a bank transfer / InstaPay request currently under manual verification. Your package and credits will be activated immediately upon review.'
                    : 'يوجد لديك طلب تحويل بنكي / إنستاباي قيد المراجعة والتدقيق اليدوي حالياً. سيتم تفعيل الباقة وإضافة النقاط فور اكتمال التحقق.'}
                </Banner>
              </div>
            )}

            {payments.length === 0 ? (
              <div className="py-6">
                <EmptyState
                  title={t('noPayments')}
                  description={t('ledgerDesc')}
                />
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('colRef')}</TableHead>
                    <TableHead>{t('colPlan')}</TableHead>
                    <TableHead>{t('colAmount')}</TableHead>
                    <TableHead>{t('colCredits')}</TableHead>
                    <TableHead>{t('colStatus')}</TableHead>
                    <TableHead isNumeric>{t('colDate')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {payments.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell>
                        <IdChip id={p.providerRef} />
                      </TableCell>
                      <TableCell className="font-medium">
                        {localizePlanName(p.plan, tPlans as any)}
                      </TableCell>
                      <TableCell className="ltr-iso tabular-nums">
                        {fmtNumber(p.amountEgp, locale)} {t('egp')}
                      </TableCell>
                      <TableCell className="ltr-iso font-semibold tabular-nums text-fg-brand">
                        +{fmtNumber(p.creditsGranted, locale)} {t('pointsUnit')}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            p.status === 'COMPLETED'
                              ? 'brand'
                              : p.status === 'PENDING'
                              ? 'warning'
                              : 'neutral'
                          }
                        >
                          {p.status === 'COMPLETED'
                            ? t('paymentCompleted')
                            : p.status === 'PENDING'
                            ? locale === 'en'
                              ? 'Under Review'
                              : 'قيد المراجعة اليدوية'
                            : tEnums.has(`SubscriptionStatus.${p.status}` as any)
                              ? tEnums(`SubscriptionStatus.${p.status}` as any)
                              : p.status}
                        </Badge>
                      </TableCell>
                      <TableCell isNumeric className="text-fg-secondary">
                        {fmtDate(new Date(p.createdAt), locale)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </Card>

          {/* Upgrade Confirmation Dialog */}
          <Dialog
            isOpen={confirmPlan !== null}
            onClose={() => setConfirmPlan(null)}
            title={confirmPlan ? t('confirmTitle', { name: confirmPlanName }) : ''}
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
                    name: confirmPlanName,
                    price: fmtNumber(confirmPlan.priceEgp, locale),
                    credits: fmtNumber(confirmPlan.monthlyCredits, locale),
                  })}
                </p>
                <div className="p-3 rounded-lg bg-subtle border border-line text-body-sm text-fg-secondary">
                  {t('instantNote')}
                </div>
              </div>
            )}
          </Dialog>

          {/* InstaPay & Cash Wallet Transfer Modal */}
          {transferModalPlan && (
            <TransferPaymentModal
              isOpen={transferModalPlan !== null}
              onClose={() => setTransferModalPlan(null)}
              plan={transferModalPlan}
              onSuccess={() => {
                setMsg({
                  type: 'info',
                  text: 'تم استلام إيصال التحويل بنجاح! جاري مراجعته وتفعيل باقتك فوراً.',
                });
                loadData();
              }}
            />
          )}
        </div>
      )}
    </AppShell>
  );
}

