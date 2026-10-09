'use client';

import React, { useCallback, useEffect, useState } from 'react';
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
import { fmtDate, fmtNumber } from '@/lib/format';
import { CreditCard, CheckCircle2 } from 'lucide-react';

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
        setMsg({ type: 'danger', text: data.error || 'تعذر تفعيل الباقة.' });
      } else {
        setMsg({
          type: 'info',
          text: `تم تفعيل ${confirmPlan.name} بنجاح! رصيدك الحالي: ${data.subscription.credits} نقطة.`,
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
      pageTitle="الرصيد والباقات"
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
            title="الرصيد والباقات"
            description="إدارة رصيد النقاط، باقات الاشتراك، وسجل الحركات والمدفوعات."
            breadcrumbs={[
              { label: 'لوحة القيادة', href: '/dashboard' },
              { label: 'الرصيد والباقات' },
            ]}
          />

          {/* Feedback Message Banner */}
          {msg && <Banner variant={msg.type}>{msg.text}</Banner>}

          {/* Active Balance and Subscription Summary (StatTiles per Spec 7.11) */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatTile
              label="الرصيد المتبقي"
              value={subscription?.credits ?? 0}
              unit="نقطة"
              statusText="رصيد جاهز للاستخدام"
            />
            <StatTile
              label="الرصيد الممنوح"
              value={subscription?.totalCreditsGranted ?? 0}
              unit="نقطة شهرياً"
              statusText={`باقة ${subscription?.plan?.name || 'المجانية'}`}
            />
            <StatTile
              label="المستهلك هذا الشهر"
              value={subscription?.creditsUsed ?? 0}
              unit="نقطة"
              statusText="عمليات شراء واقتناص"
            />
            <StatTile
              label="تاريخ التجديد القادم"
              value={
                subscription?.currentPeriodEnd
                  ? fmtDate(new Date(subscription.currentPeriodEnd))
                  : '—'
              }
              statusText="تجديد تلقائي"
            />
          </div>

          {/* Template T6 Top-up: Package Cards (Spec 7.12 Hostinger Pricing Pattern) */}
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1">
              <h2 className="text-h2 font-semibold text-fg-primary">
                باقات شحن وتجديد الرصيد
              </h2>
              <p className="text-body-sm text-fg-secondary">
                اختر الباقة المناسبة لفريقك، تُضاف النقاط فورياً بعد الدفع.
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
                        ? 'باقتك الحالية النشطة'
                        : plan.slug === 'pro'
                        ? 'الأكثر طلباً للشركات والمستقلين'
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
                كشف حساب النقاط (Credit Ledger)
              </h2>
              <p className="text-body-sm text-fg-secondary">
                سجل تدقيق غير قابل للتعديل يوثق جميع عمليات الشحن والاستهلاك والاسترداد.
              </p>
            </div>

            <LedgerTable entries={ledgerEntries} />
          </div>

          {/* Payment Invoices & History */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <CreditCard className="w-5 h-5 text-fg-brand" />
                <CardTitle>سجل المعاملات المدفوعة (Payment History)</CardTitle>
              </div>
            </CardHeader>

            {payments.length === 0 ? (
              <p className="py-6 text-center text-body-sm text-fg-secondary">
                لا توجد معاملات مدفوعة مسجلة بعد.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-start border-collapse text-body-sm">
                  <thead>
                    <tr className="border-b border-line bg-subtle text-caption font-semibold text-fg-secondary h-11">
                      <th className="py-2.5 px-4 text-start">رقم المرجع</th>
                      <th className="py-2.5 px-4 text-start">الباقة</th>
                      <th className="py-2.5 px-4 text-start">المبلغ المدفوع</th>
                      <th className="py-2.5 px-4 text-start">النقاط المضافة</th>
                      <th className="py-2.5 px-4 text-start">الحالة</th>
                      <th className="py-2.5 px-4 text-end">التاريخ</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {payments.map((p) => (
                      <tr key={p.id} className="h-12 hover:bg-brand-soft/30 transition-colors">
                        <td className="py-2.5 px-4 font-mono text-fg-primary">{p.providerRef}</td>
                        <td className="py-2.5 px-4 font-medium text-fg-primary">{p.plan?.name}</td>
                        <td className="py-2.5 px-4 ltr-iso font-mono tabular-nums text-fg-primary">
                          {fmtNumber(p.amountEgp)} ج.م
                        </td>
                        <td className="py-2.5 px-4 ltr-iso font-mono font-semibold tabular-nums text-fg-brand">
                          +{fmtNumber(p.creditsGranted)} نقطة
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
            title={confirmPlan ? `تأكيد الاشتراك في ${confirmPlan.name}` : ''}
            footer={
              <div className="flex items-center justify-end gap-3 w-full">
                <Button
                  variant="ghost"
                  onClick={() => setConfirmPlan(null)}
                  disabled={processing}
                >
                  إلغاء
                </Button>
                <Button
                  variant="primary"
                  onClick={handleConfirmUpgrade}
                  isLoading={processing}
                >
                  تأكيد وتفعيل الباقة
                </Button>
              </div>
            }
          >
            {confirmPlan && (
              <div className="flex flex-col gap-3 py-2 text-body">
                <p className="text-fg-primary leading-relaxed">
                  سيتم تفعيل باقة <strong>{confirmPlan.name}</strong> بتكلفة{' '}
                  <strong className="ltr-iso font-mono">{fmtNumber(confirmPlan.priceEgp)} ج.م</strong> شهرياً،
                  وضبط رصيدك إلى{' '}
                  <strong className="ltr-iso font-mono text-fg-brand">{fmtNumber(confirmPlan.monthlyCredits)} نقطة</strong>.
                </p>
                <div className="p-3 rounded-lg bg-subtle border border-line text-body-sm text-fg-secondary">
                  تُضاف النقاط فورياً بعد تأكيد العملية عبر مزود الدفع المحلي المعتمد.
                </div>
              </div>
            )}
          </Dialog>
        </div>
      )}
    </AppShell>
  );
}
