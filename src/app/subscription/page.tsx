'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { AppShell } from '@/components/AppShell';
import { CheckCircle2, Coins, CreditCard, ShieldCheck } from 'lucide-react';

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
  const [loading, setLoading] = useState(true);
  const [confirmPlan, setConfirmPlan] = useState<PlanItem | null>(null);
  const [processing, setProcessing] = useState(false);
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/subscription');
      if (res.ok) {
        const data = await res.json();
        setSubscription(data.subscription);
        setPlans(data.plans || []);
        setPayments(data.payments || []);
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
        setMsg({ type: 'error', text: data.error || 'تعذر تفعيل الباقة.' });
      } else {
        setMsg({
          type: 'success',
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
    <AppShell>
      {loading ? (
        <div className="h-96 animate-pulse rounded-2xl border border-slate-200 bg-white p-6" />
      ) : (
        <div className="space-y-6">
          {msg && (
            <div
              className={`rounded-xl border p-4 text-xs font-bold ${
                msg.type === 'success'
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                  : 'border-rose-200 bg-rose-50 text-rose-800'
              }`}
            >
              {msg.text}
            </div>
          )}

          {/* Current Subscription Card */}
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
              <div>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-3 py-1 text-xs font-extrabold text-emerald-800">
                  <ShieldCheck className="h-4 w-4" />
                  اشتراك نشط ({subscription?.plan?.nameEn || 'Free'})
                </span>
                <h1 className="mt-2 text-2xl font-extrabold text-slate-900">
                  {subscription?.plan?.name || 'الباقة المجانية'}
                </h1>
                <p className="text-xs text-slate-500">
                  تاريخ التجديد القادم:{' '}
                  {subscription?.currentPeriodEnd
                    ? new Date(subscription.currentPeriodEnd).toLocaleDateString('ar-EG')
                    : '—'}
                </p>
              </div>

              <div className="rounded-2xl bg-slate-900 p-5 text-white sm:w-72">
                <div className="flex items-center justify-between text-xs text-slate-300">
                  <span className="flex items-center gap-1.5 font-bold">
                    <Coins className="h-4 w-4 text-amber-400" />
                    الرصيد المتبقي
                  </span>
                  <span>المستخدم: {subscription?.creditsUsed ?? 0}</span>
                </div>
                <div className="mt-2 flex items-baseline gap-1">
                  <span className="text-3xl font-extrabold text-emerald-400">
                    {subscription?.credits ?? 0}
                  </span>
                  <span className="text-xs text-slate-300">
                    / {subscription?.totalCreditsGranted ?? 3} نقطة (Lead Credits)
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Available Plans */}
          <div>
            <h2 className="text-lg font-extrabold text-slate-900">
              الباقات المتاحة للترقية أو التجديد
            </h2>
            <div className="mt-4 grid gap-5 md:grid-cols-2 lg:grid-cols-4">
              {plans.map((plan) => {
                const isCurrent = subscription?.plan?.id === plan.id;
                return (
                  <div
                    key={plan.id}
                    className={`flex flex-col justify-between rounded-2xl border bg-white p-5 shadow-sm ${
                      isCurrent ? 'border-2 border-emerald-600' : 'border-slate-200'
                    }`}
                  >
                    <div>
                      <h3 className="text-base font-extrabold text-slate-900">{plan.name}</h3>
                      <div className="mt-2 flex items-baseline gap-1">
                        <span className="text-2xl font-extrabold text-slate-900">
                          {plan.priceEgp}
                        </span>
                        <span className="text-xs font-bold text-slate-500">ج.م / شهريًا</span>
                      </div>
                      <p className="mt-2 rounded-lg bg-emerald-50 px-2.5 py-1.5 text-xs font-extrabold text-emerald-800">
                        {plan.monthlyCredits} نقطة رصيد شهريًا
                      </p>
                      <ul className="mt-4 space-y-2 text-xs text-slate-600">
                        {plan.features.map((f, i) => (
                          <li key={i} className="flex items-start gap-1.5">
                            <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-600 mt-0.5" />
                            <span>{f}</span>
                          </li>
                        ))}
                      </ul>
                    </div>

                    <button
                      onClick={() => setConfirmPlan(plan)}
                      className={`mt-5 w-full rounded-xl py-2.5 text-xs font-extrabold ${
                        isCurrent
                          ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200'
                          : 'bg-slate-900 text-white hover:bg-emerald-600'
                      }`}
                    >
                      {isCurrent ? 'تجديد الباقة وإعادة شحن النقاط' : `الترقية إلى ${plan.nameEn}`}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Payment History */}
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="flex items-center gap-2 text-base font-extrabold text-slate-900">
              <CreditCard className="h-5 w-5 text-emerald-600" />
              سجل المدفوعات والاشتراكات (Payment History)
            </h2>

            {payments.length === 0 ? (
              <p className="py-6 text-center text-xs text-slate-500">
                لا توجد معاملات مدفوعة مسجلة بعد.
              </p>
            ) : (
              <div className="mt-4 overflow-x-auto">
                <table className="w-full text-right text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 text-slate-500">
                      <th className="py-2.5 px-3">رقم المرجع</th>
                      <th className="py-2.5 px-3">الباقة</th>
                      <th className="py-2.5 px-3">المبلغ</th>
                      <th className="py-2.5 px-3">النقاط المضافة</th>
                      <th className="py-2.5 px-3">الحالة</th>
                      <th className="py-2.5 px-3">التاريخ</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-semibold">
                    {payments.map((p) => (
                      <tr key={p.id}>
                        <td className="py-3 px-3 font-mono text-slate-700">{p.providerRef}</td>
                        <td className="py-3 px-3">{p.plan?.name}</td>
                        <td className="py-3 px-3">{p.amountEgp} ج.م</td>
                        <td className="py-3 px-3 text-emerald-700">+{p.creditsGranted} نقطة</td>
                        <td className="py-3 px-3">
                          <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-[11px] font-bold text-emerald-800">
                            {p.status}
                          </span>
                        </td>
                        <td className="py-3 px-3 text-slate-500">
                          {new Date(p.createdAt).toLocaleDateString('ar-EG')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Upgrade Confirmation Dialog */}
          {confirmPlan && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
              <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
                <h3 className="text-lg font-extrabold text-slate-900">
                  تأكيد الاشتراك في {confirmPlan.name}
                </h3>
                <p className="mt-2 text-xs leading-relaxed text-slate-600">
                  سيتم تفعيل <strong>{confirmPlan.name}</strong> بتكلفة{' '}
                  <strong>{confirmPlan.priceEgp} ج.م/شهريًا</strong> عبر مزود الدفع المحلي (Sandbox
                  PaymentProvider) وضبط رصيد حسابك إلى{' '}
                  <strong>{confirmPlan.monthlyCredits} نقطة</strong>.
                </p>
                <div className="mt-5 flex justify-end gap-2">
                  <button
                    onClick={() => setConfirmPlan(null)}
                    className="rounded-xl border border-slate-300 px-4 py-2 text-xs font-bold text-slate-700"
                  >
                    إلغاء
                  </button>
                  <button
                    onClick={handleConfirmUpgrade}
                    disabled={processing}
                    className="rounded-xl bg-emerald-600 px-5 py-2 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
                  >
                    {processing ? 'جاري التفعيل...' : 'تأكيد وتفعيل الباقة'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </AppShell>
  );
}
