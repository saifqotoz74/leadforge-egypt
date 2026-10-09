'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { PublicNavbar, PublicFooter } from '@/components/PublicNavbar';
import { PackageCard } from '@/components/domain/PackageCard';
import { Banner } from '@/components/ui/Banner';
import { DEFAULT_PLANS } from '@/lib/constants';
import { ShieldCheck } from 'lucide-react';

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
  const [, setSubscribingId] = useState<string | null>(null);
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

  async function handleSelectPlan(planId: string) {
    const plan = plans.find((p) => (p.id || p.slug) === planId);
    if (!plan) return;

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
        setMessage({ type: 'error', text: data.error || 'تعذّر الاشتراك في الباقة. حاول مرة أخرى.' });
      } else {
        setCurrentPlanSlug(plan.slug);
        setMessage({
          type: 'success',
          text: `تم تفعيل ${plan.name} بنجاح وإضافة ${plan.monthlyCredits} نقطة رصيد إلى حسابك.`,
        });
      }
    } catch {
      setMessage({ type: 'error', text: 'تعذّر الاتصال بالخادم. تحقق من الإنترنت ثم أعد المحاولة.' });
    } finally {
      setSubscribingId(null);
    }
  }

  return (
    <div data-density="comfortable" className="min-h-screen flex flex-col bg-page">
      <PublicNavbar />

      <main className="mx-auto max-w-7xl flex-1 px-4 py-12 sm:px-6 lg:px-8 w-full">
        <div className="text-center max-w-3xl mx-auto mb-10">
          <div className="inline-flex items-center gap-2 rounded-full border border-line bg-subtle px-3.5 py-1.5 text-caption font-semibold text-fg-secondary mb-4">
            <ShieldCheck className="h-4 w-4 text-brand" />
            <span>تسعير واضح وشفاف • 1 نقطة رصيد = فرصة بيعية مؤهلة واحدة</span>
          </div>

          <h1 className="text-display font-bold text-fg-primary">
            خطط اشتراك مصممة لمطوري الويب في مصر
          </h1>
          <p className="mt-3 text-body-lg text-fg-secondary">
            ابدأ باقتناص الفرص المؤهلة، وقم بالترقية في أي وقت للحصول على نقاط إضافية وإمكانية شراء الفرص الحصرية.
          </p>
        </div>

        {message && (
          <div className="mx-auto mb-8 max-w-xl">
            <Banner
              variant={message.type === 'success' ? 'info' : 'danger'}
              action={
                message.type === 'success'
                  ? { label: 'استعراض الفرص الآن', href: '/leads' }
                  : undefined
              }
            >
              {message.text}
            </Banner>
          </div>
        )}

        {/* Hostinger-calibrated package cards grid per Spec 7.12 */}
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4 items-stretch">
          {plans.map((plan) => {
            const isRecommended = plan.slug === 'pro';
            const isCurrent = currentPlanSlug === plan.slug;

            return (
              <PackageCard
                key={plan.slug}
                id={plan.id || plan.slug}
                name={plan.name}
                points={plan.monthlyCredits}
                priceEGP={plan.priceEgp}
                features={plan.features}
                isRecommended={isRecommended}
                recommendedReason={isRecommended ? 'الخيار الأنسب للشركات والمستقلين النشطين' : undefined}
                reassuranceText={
                  isCurrent
                    ? 'هذه باقتك المفعلة حالياً'
                    : plan.priceEgp === 0
                    ? 'بدون بطاقة ائتمان، تفعيل فوري'
                    : 'تُضاف النقاط فوراً إلى حسابك بعد الدفع'
                }
                onSelectPackage={handleSelectPlan}
              />
            );
          })}
        </div>
      </main>

      <PublicFooter />
    </div>
  );
}
