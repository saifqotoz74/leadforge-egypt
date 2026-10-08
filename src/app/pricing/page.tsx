'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { PublicNavbar } from '@/components/PublicNavbar';
import { CheckCircle2, Coins, ShieldCheck } from 'lucide-react';
import { DEFAULT_PLANS } from '@/lib/constants';

interface PlanItem {
  id?: string;
  slug: string;
  name: string;
  nameEn: string;
  priceEgp: number;
  monthlyCredits: number;
  allowsExclusive: boolean;
  features: string[];
}

export default function PricingPage() {
  const router = useRouter();
  const [plans, setPlans] = useState<PlanItem[]>(DEFAULT_PLANS);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [currentPlanSlug, setCurrentPlanSlug] = useState<string | null>(null);
  const [subscribingId, setSubscribingId] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    async function loadSubscriptionState() {
      try {
        const res = await fetch('/api/subscription');
        if (res.ok) {
          const data = await res.json();
          if (data.plans && data.plans.length > 0) {
            setPlans(data.plans);
          }
          setIsLoggedIn(true);
          setCurrentPlanSlug(data.subscription?.plan?.slug || null);
        }
      } catch {
        // Public visitor
      }
    }
    loadSubscriptionState();
  }, []);

  async function handleSelectPlan(plan: PlanItem) {
    if (!isLoggedIn || !plan.id) {
      router.push('/register');
      return;
    }

    setSubscribingId(plan.id);
    setMessage(null);
    try {
      const res = await fetch('/api/subscription', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planId: plan.id }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage({ type: 'error', text: data.error || 'تعذر الاشتراك في الباقة.' });
      } else {
        setCurrentPlanSlug(plan.slug);
        setMessage({
          type: 'success',
          text: `تم تفعيل ${plan.name} بنجاح وإضافة ${plan.monthlyCredits} نقطة رصيد!`,
        });
      }
    } catch {
      setMessage({ type: 'error', text: 'حدث خطأ أثناء الاتصال بالخادم.' });
    } finally {
      setSubscribingId(null);
    }
  }

  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      <PublicNavbar />

      <main className="mx-auto max-w-7xl flex-1 px-4 py-14 sm:px-6 lg:px-8">
        <div className="text-center max-w-3xl mx-auto">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-3.5 py-1 text-xs font-bold text-emerald-800">
            <Coins className="h-4 w-4" />
            نظام نقاط مرن وواضح (1 Credit = 1 Qualified Lead)
          </span>
          <h1 className="mt-3 text-3xl font-extrabold text-slate-900 sm:text-4xl">
            خطط أسعار مصممة للمستقلين وشركات البرمجة في مصر
          </h1>
          <p className="mt-3 text-sm text-slate-600 sm:text-base">
            ابدأ مجانًا بـ 3 فرص مؤهلة، وقم بالترقية في أي وقت للحصول على فرص أكثر وإمكانية اقتناص
            الفرص الحصرية (Exclusive Leads).
          </p>
        </div>

        {message && (
          <div
            className={`mx-auto mt-6 max-w-xl rounded-xl border p-4 text-center text-sm font-bold ${
              message.type === 'success'
                ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                : 'border-rose-200 bg-rose-50 text-rose-800'
            }`}
          >
            {message.text}{' '}
            {message.type === 'success' && (
              <Link href="/leads" className="underline mr-2">
                انتقل لاكتشاف العملاء ←
              </Link>
            )}
          </div>
        )}

        <div className="mt-12 grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          {plans.map((plan) => {
            const isPopular = plan.slug === 'pro';
            const isCurrent = currentPlanSlug === plan.slug;

            return (
              <div
                key={plan.slug}
                className={`relative flex flex-col justify-between rounded-2xl border bg-white p-6 shadow-sm ${
                  isPopular
                    ? 'border-2 border-emerald-600 ring-4 ring-emerald-50'
                    : 'border-slate-200'
                }`}
              >
                {isPopular && (
                  <span className="absolute -top-3 right-6 rounded-full bg-emerald-600 px-3 py-0.5 text-[11px] font-extrabold text-white">
                    الأكثر اختيارًا (Pro)
                  </span>
                )}

                <div>
                  <div className="flex items-center justify-between">
                    <h2 className="text-lg font-extrabold text-slate-900">{plan.name}</h2>
                    <span className="rounded bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-600">
                      {plan.nameEn}
                    </span>
                  </div>

                  <div className="mt-4 flex items-baseline gap-1">
                    <span className="text-3xl font-extrabold text-slate-900">
                      {plan.priceEgp}
                    </span>
                    <span className="text-sm font-bold text-slate-600">ج.م / شهريًا</span>
                  </div>

                  <div className="mt-3 rounded-xl bg-emerald-50 px-3 py-2 text-xs font-extrabold text-emerald-800">
                    {plan.monthlyCredits} عميل مؤهل شهريًا ({plan.monthlyCredits} Credits)
                  </div>

                  <ul className="mt-5 space-y-2.5 text-xs font-semibold text-slate-600">
                    {plan.features.map((feat, idx) => (
                      <li key={idx} className="flex items-start gap-2">
                        <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600 mt-0.5" />
                        <span>{feat}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="mt-6 pt-4 border-t border-slate-100">
                  {isCurrent ? (
                    <button
                      disabled
                      className="w-full rounded-xl bg-slate-100 py-3 text-xs font-extrabold text-slate-500"
                    >
                      باقتك الحالية المفعلة
                    </button>
                  ) : (
                    <button
                      onClick={() => handleSelectPlan(plan)}
                      disabled={subscribingId === plan.id}
                      className={`w-full rounded-xl py-3 text-xs font-extrabold transition ${
                        isPopular
                          ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                          : 'bg-slate-900 text-white hover:bg-slate-800'
                      }`}
                    >
                      {subscribingId === plan.id
                        ? 'جاري التفعيل...'
                        : isLoggedIn
                        ? `اشترك في ${plan.nameEn}`
                        : 'ابدأ الآن'}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-12 rounded-2xl border border-slate-200 bg-white p-6 text-center">
          <div className="inline-flex items-center gap-2 text-sm font-extrabold text-slate-800">
            <ShieldCheck className="h-5 w-5 text-emerald-600" />
            <span>بوابة دفع معيارية (PaymentProvider Abstraction)</span>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            في بيئة التطوير المحلية (MVP)، تعمل الاشتراكات عبر مزود الدفع التجريبي المدمج (Sandbox
            Payment Provider) لتفعيل الباقات والنقاط فورًا وبأمان تام.
          </p>
        </div>
      </main>
    </div>
  );
}
