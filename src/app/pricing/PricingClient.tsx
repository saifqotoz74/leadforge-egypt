'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { PublicNavbar, PublicFooter, PackageCard } from '@/components/domain';
import { Banner } from '@/components/ui/Banner';
import { EmptyState } from '@/components/ui/EmptyState';
import { DEFAULT_PLANS } from '@/lib/constants';
import { localizePlanName } from '@/lib/taxonomy';
import { fmtNumber } from '@/lib/format';
import { CreditCard } from 'lucide-react';
import { useTranslations, useLocale } from 'next-intl';

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

export interface PricingClientProps {
  initialIsLoggedIn: boolean;
}

export function PricingClient({ initialIsLoggedIn }: PricingClientProps) {
  const router = useRouter();
  const locale = useLocale();
  const tPricing = useTranslations('pricing');
  const tPlans = useTranslations('plans');
  const [plans, setPlans] = useState<PlanItem[]>(DEFAULT_PLANS);
  const [isLoggedIn, setIsLoggedIn] = useState(initialIsLoggedIn);
  const [currentPlanSlug, setCurrentPlanSlug] = useState<string | null>(null);
  const [, setSubscribingId] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    // Only query /api/subscription if the visitor is authenticated
    if (!initialIsLoggedIn) {
      return;
    }

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
        // Fallback plans already rendered
      }
    }
    loadSubscriptionState();
  }, [initialIsLoggedIn]);

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
        setMessage({ type: 'error', text: data.error || tPricing('subscriptionError') });
      } else {
        setCurrentPlanSlug(plan.slug);
        setMessage({
          type: 'success',
          text: tPricing('subscriptionSuccess', {
            plan: localizePlanName(plan, tPlans as any),
            credits: fmtNumber(plan.monthlyCredits, locale),
          }),
        });
      }
    } catch {
      setMessage({ type: 'error', text: tPricing('networkError') });
    } finally {
      setSubscribingId(null);
    }
  }

  return (
    <div data-density="comfortable" className="min-h-screen flex flex-col bg-page">
      <PublicNavbar />

      <main className="mx-auto max-w-7xl flex-1 px-4 py-12 sm:px-6 lg:px-8 w-full">
        <div className="text-center max-w-3xl mx-auto mb-10">
          <h1 className="text-display font-bold text-fg-primary">
            {tPricing('title')}
          </h1>
          <p className="mt-3 text-body-lg text-fg-secondary">
            {tPricing('subtitle')}
          </p>
        </div>

        {message && (
          <div className="mx-auto mb-8 max-w-xl">
            <Banner
              variant={message.type === 'success' ? 'info' : 'danger'}
              action={
                message.type === 'success'
                  ? { label: tPricing('exploreLeadsAction'), href: '/leads' }
                  : undefined
              }
            >
              {message.text}
            </Banner>
          </div>
        )}

        {plans.length === 0 ? (
          <EmptyState
            icon={<CreditCard className="w-12 h-12 text-brand stroke-[1.5]" />}
            title={tPricing('emptyPlansTitle')}
            description={tPricing('emptyPlansSubtitle')}
          />
        ) : (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4 items-stretch">
            {plans.map((plan) => {
              const isRecommended = plan.slug === 'pro';
              const isCurrent = currentPlanSlug === plan.slug;

              return (
                <PackageCard
                  key={plan.slug}
                  id={plan.id || plan.slug}
                  slug={plan.slug}
                  name={plan.name}
                  points={plan.monthlyCredits}
                  priceEGP={plan.priceEgp}
                  allowsExclusive={plan.allowsExclusive}
                  features={plan.features}
                  isRecommended={isRecommended}
                  isCurrent={isCurrent}
                  recommendedReason={isRecommended ? tPricing('recommendedReason') : undefined}
                  reassuranceText={
                    isCurrent
                      ? tPricing('currentPlanNotice')
                      : plan.priceEgp === 0
                      ? tPricing('freePlanNotice')
                      : tPricing('paidPlanNotice')
                  }
                  onSelectPackage={handleSelectPlan}
                />
              );
            })}
          </div>
        )}
      </main>

      <PublicFooter />
    </div>
  );
}
