'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { PublicNavbar, PublicFooter, PackageCard } from '@/components/domain';
import { trackFunnelEvent } from '@/lib/analytics/funnel-client';
import { Banner } from '@/components/ui/Banner';
import { EmptyState } from '@/components/ui/EmptyState';
import { DEFAULT_PLANS } from '@/lib/constants';
import { localizePlanName } from '@/lib/taxonomy';
import { fmtNumber } from '@/lib/format';
import {
  CreditCard,
  Lock,
  Compass,
  RotateCcw,
  FileText,
  Coins,
  ShieldCheck,
  ChevronDown,
  ArrowRight,
} from 'lucide-react';
import { useTranslations, useLocale } from 'next-intl';
import { TransferPaymentModal } from '@/components/domain/TransferPaymentModal';

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
  const [modalPlan, setModalPlan] = useState<PlanItem | null>(null);
  const [subscribingId, setSubscribingId] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const richTags = {
    iso: (chunks: React.ReactNode) => <span className="ltr-iso">{chunks}</span>,
    pct: (chunks: React.ReactNode) => <span className="ltr-iso tabular-nums">{chunks}</span>,
  };

  const faqItems = [
    { q: tPricing('faqQ1'), a: tPricing.rich('faqA1', richTags) },
    { q: tPricing('faqQ2'), a: tPricing.rich('faqA2', richTags) },
    { q: tPricing('faqQ3'), a: tPricing.rich('faqA3', richTags) },
    { q: tPricing('faqQ4'), a: tPricing.rich('faqA4', richTags) },
    { q: tPricing('faqQ5'), a: tPricing.rich('faqA5', richTags) },
    { q: tPricing('faqQ6'), a: tPricing.rich('faqA6', richTags) },
    { q: tPricing('faqQ7'), a: tPricing.rich('faqA7', richTags) },
    { q: tPricing('faqQ8'), a: tPricing.rich('faqA8', richTags) },
    { q: tPricing('faqQ9'), a: tPricing.rich('faqA9', richTags) },
  ];

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

    trackFunnelEvent('plan_upgrade', {
      planSlug: plan.slug,
      priceEgp: plan.priceEgp,
    });

    // For paid plans, open the InstaPay & Cash Wallet transfer modal
    if (plan.priceEgp > 0) {
      setModalPlan(plan);
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

        {/* Pricing Policies & Details */}
        <section className="mt-16 border-t border-line pt-12">
          <div className="text-center max-w-2xl mx-auto mb-10">
            <h2 className="text-h1 font-bold text-fg-primary">
              {tPricing('detailsTitle')}
            </h2>
            <p className="mt-2 text-body text-fg-secondary">
              {tPricing('detailsSubtitle')}
            </p>
          </div>

          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {/* Exclusive leads */}
            <div className="rounded-xl border border-line bg-surface p-6 shadow-xs flex flex-col gap-3">
              <div className="h-10 w-10 rounded-lg bg-brand-soft text-brand flex items-center justify-center shrink-0">
                <Lock className="h-5 w-5" />
              </div>
              <h3 className="text-h4 font-bold text-fg-primary">
                {tPricing.rich('exclusiveLeadTitle', richTags)}
              </h3>
              <p className="text-body-sm text-fg-secondary leading-relaxed">
                {tPricing.rich('exclusiveLeadDesc', richTags)}
              </p>
            </div>

            {/* Field visit leads */}
            <div className="rounded-xl border border-line bg-surface p-6 shadow-xs flex flex-col gap-3">
              <div className="h-10 w-10 rounded-lg bg-brand-soft text-brand flex items-center justify-center shrink-0">
                <Compass className="h-5 w-5" />
              </div>
              <h3 className="text-h4 font-bold text-fg-primary">
                {tPricing.rich('fieldVisitTitle', richTags)}
              </h3>
              <p className="text-body-sm text-fg-secondary leading-relaxed">
                {tPricing.rich('fieldVisitDesc', richTags)}
              </p>
            </div>

            {/* Refund guarantee */}
            <div className="rounded-xl border border-line bg-surface p-6 shadow-xs flex flex-col gap-3">
              <div className="h-10 w-10 rounded-lg bg-brand-soft text-brand flex items-center justify-center shrink-0">
                <RotateCcw className="h-5 w-5 rtl:-scale-x-100" />
              </div>
              <h3 className="text-h4 font-bold text-fg-primary">
                {tPricing.rich('refundPolicyTitle', richTags)}
              </h3>
              <p className="text-body-sm text-fg-secondary leading-relaxed">
                {tPricing.rich('refundPolicyDesc', richTags)}
              </p>
            </div>

            {/* Payment methods */}
            <div className="rounded-xl border border-line bg-surface p-6 shadow-xs flex flex-col gap-3">
              <div className="h-10 w-10 rounded-lg bg-brand-soft text-brand flex items-center justify-center shrink-0">
                <CreditCard className="h-5 w-5" />
              </div>
              <h3 className="text-h4 font-bold text-fg-primary">
                {tPricing.rich('paymentMethodsTitle', richTags)}
              </h3>
              <p className="text-body-sm text-fg-secondary leading-relaxed">
                {tPricing.rich('paymentMethodsDesc', richTags)}
              </p>
            </div>

            {/* Taxes & Invoicing */}
            <div className="rounded-xl border border-line bg-surface p-6 shadow-xs flex flex-col gap-3">
              <div className="h-10 w-10 rounded-lg bg-brand-soft text-brand flex items-center justify-center shrink-0">
                <FileText className="h-5 w-5" />
              </div>
              <h3 className="text-h4 font-bold text-fg-primary">
                {tPricing.rich('taxPolicyTitle', richTags)}
              </h3>
              <p className="text-body-sm text-fg-secondary leading-relaxed">
                {tPricing.rich('taxPolicyDesc', richTags)}
              </p>
            </div>

            {/* Rollover & Validity */}
            <div className="rounded-xl border border-line bg-surface p-6 shadow-xs flex flex-col gap-3">
              <div className="h-10 w-10 rounded-lg bg-brand-soft text-brand flex items-center justify-center shrink-0">
                <Coins className="h-5 w-5" />
              </div>
              <h3 className="text-h4 font-bold text-fg-primary">
                {tPricing.rich('pointsRolloverTitle', richTags)}
              </h3>
              <p className="text-body-sm text-fg-secondary leading-relaxed">
                {tPricing.rich('pointsRolloverDesc', richTags)}
              </p>
            </div>

            {/* Easy Cancellation */}
            <div className="rounded-xl border border-line bg-surface p-6 shadow-xs flex flex-col gap-3">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-brand-soft text-brand flex items-center justify-center shrink-0">
                  <ShieldCheck className="h-5 w-5" />
                </div>
                <h3 className="text-h4 font-bold text-fg-primary">
                  {tPricing.rich('cancellationPolicyTitle', richTags)}
                </h3>
              </div>
              <p className="text-body-sm text-fg-secondary leading-relaxed">
                {tPricing.rich('cancellationPolicyDesc', richTags)}
              </p>
            </div>

            {/* Data Sources & Privacy Policy */}
            <div className="rounded-xl border border-line bg-surface p-6 shadow-xs flex flex-col justify-between gap-3 sm:col-span-2 lg:col-span-2">
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-lg bg-brand-soft text-brand flex items-center justify-center shrink-0">
                    <FileText className="h-5 w-5" />
                  </div>
                  <h3 className="text-h4 font-bold text-fg-primary">
                    {tPricing('dataSourcesPrivacyTitle')}
                  </h3>
                </div>
                <p className="text-body-sm text-fg-secondary leading-relaxed">
                  {tPricing('dataSourcesPrivacyDesc')}
                </p>
              </div>
              <div className="pt-2">
                <Link
                  href="/privacy"
                  className="inline-flex items-center gap-2 text-body-sm font-semibold text-brand hover:underline"
                >
                  <span>{tPricing('dataSourcesPrivacyLink')}</span>
                  <ArrowRight className="h-4 w-4 rtl:-scale-x-100" />
                </Link>
              </div>
            </div>
          </div>
        </section>

        {/* FAQ Section */}
        <section className="mt-16 border-t border-line pt-12 max-w-4xl mx-auto w-full">
          <div className="text-center mb-10">
            <h2 className="text-h1 font-bold text-fg-primary">
              {tPricing('faqSectionTitle')}
            </h2>
            <p className="mt-2 text-body text-fg-secondary">
              {tPricing('faqSectionSubtitle')}
            </p>
          </div>

          <div className="space-y-4">
            {faqItems.map((item, idx) => (
              <details
                key={idx}
                open
                className="group rounded-xl border border-line bg-surface p-5 shadow-xs transition-colors"
              >
                <summary className="flex cursor-pointer items-center justify-between text-body font-semibold text-fg-primary list-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand rounded-md">
                  <span className="pe-4">{item.q}</span>
                  <span className="shrink-0 text-fg-muted transition-transform group-open:rotate-180">
                    <ChevronDown className="h-5 w-5" />
                  </span>
                </summary>
                <div className="mt-3 pt-3 border-t border-line text-body-sm text-fg-secondary leading-relaxed">
                  {item.a}
                </div>
              </details>
            ))}
          </div>
        </section>

        {/* InstaPay & Mobile Wallet Transfer Modal */}
        {modalPlan && (
          <TransferPaymentModal
            isOpen={modalPlan !== null}
            onClose={() => setModalPlan(null)}
            plan={
              modalPlan.id
                ? {
                    id: modalPlan.id,
                    slug: modalPlan.slug,
                    name: modalPlan.name,
                    priceEgp: modalPlan.priceEgp,
                    monthlyCredits: modalPlan.monthlyCredits,
                  }
                : null
            }
            onSuccess={() => {
              trackFunnelEvent('first_purchase', { planSlug: modalPlan?.slug });
              setMessage({
                type: 'success',
                text: tPricing('transferReceiptSuccess'),
              });
            }}
          />
        )}
      </main>

      <PublicFooter />
    </div>
  );
}
