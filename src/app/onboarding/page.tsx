'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { PublicNavbar, PublicFooter, Stepper, StepItem } from '@/components/domain';
import { Banner } from '@/components/ui/Banner';
import { Input } from '@/components/ui/Input';
import { Skeleton } from '@/components/ui/Skeleton';
import { Check, AlertCircle } from 'lucide-react';
import {
  ALL_CITIES,
  BUSINESS_CATEGORIES,
  DEVELOPER_SERVICES,
} from '@/lib/constants';
import { localizeCity, localizeCategory, localizeService } from '@/lib/taxonomy';
import { fmtNumber } from '@/lib/format';
import { useLocale, useTranslations } from 'next-intl';

export default function OnboardingPage() {
  const router = useRouter();
  const tOnboard = useTranslations('onboarding');
  const tCommon = useTranslations('common');
  const tGeo = useTranslations('geo');
  const tCat = useTranslations('categories');
  const tServices = useTranslations('services');
  const locale = useLocale();

  const [currentStep, setCurrentStep] = useState(0);
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Email Verification State
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [isEmailVerified, setIsEmailVerified] = useState<boolean>(true);
  const [resendingVerification, setResendingVerification] = useState(false);
  const [resendSent, setResendSent] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);

  // Form State
  const [companyName, setCompanyName] = useState('');
  const [phone, setPhone] = useState('');
  const [services, setServices] = useState<string[]>([
    'Website Development',
    'Landing Pages',
  ]);
  const [locations, setLocations] = useState<string[]>(['القاهرة', 'الجيزة']);
  const [niches, setNiches] = useState<string[]>([
    'Dental',
    'Medical',
    'Restaurant',
  ]);
  const [minBudget, setMinBudget] = useState<number>(5000);
  const [leadType, setLeadType] = useState<'BOTH' | 'EXCLUSIVE' | 'SHARED'>('BOTH');

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const interval = setInterval(() => {
      setResendCooldown((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(interval);
  }, [resendCooldown]);

  const handleResendVerification = async () => {
    setResendingVerification(true);
    try {
      const res = await fetch('/api/auth/verify-email/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await res.json();
      if (res.ok) {
        setResendSent(true);
        setResendCooldown(60);
      } else if (res.status === 429 && data.retryAfterSeconds) {
        setResendCooldown(data.retryAfterSeconds);
      }
    } catch {
      // Offline fallback
    } finally {
      setResendingVerification(false);
    }
  };

  useEffect(() => {
    async function loadCurrentProfile() {
      try {
        const [profRes, meRes] = await Promise.all([
          fetch('/api/developer/profile'),
          fetch('/api/auth/me'),
        ]);

        if (profRes.ok) {
          const data = await profRes.json();
          if (data.profile) {
            if (data.profile.companyName) setCompanyName(data.profile.companyName);
            if (data.profile.phone) setPhone(data.profile.phone);
            if (data.profile.services?.length) setServices(data.profile.services);
            if (data.profile.locations?.length) setLocations(data.profile.locations);
            if (data.profile.niches?.length) setNiches(data.profile.niches);
            if (data.profile.minBudget) setMinBudget(data.profile.minBudget);
            if (data.profile.leadType) setLeadType(data.profile.leadType);
          }
        }

        if (meRes.ok) {
          const meData = await meRes.json();
          if (meData?.user) {
            setUserEmail(meData.user.email);
            setIsEmailVerified(Boolean(meData.user.emailVerified));
          }
        }
      } catch {
        // Fall back to defaults
      } finally {
        setLoading(false);
      }
    }
    loadCurrentProfile();
  }, []);

  function toggleItem(list: string[], item: string, setter: (val: string[]) => void) {
    if (list.includes(item)) {
      if (list.length > 1) setter(list.filter((x) => x !== item));
    } else {
      setter([...list, item]);
    }
  }

  async function handleFinalSubmit() {
    if (services.length === 0 || locations.length === 0) {
      setError(tOnboard('emptySelectionError'));
      return;
    }

    setIsSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/developer/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyName: companyName.trim() || undefined,
          phone: phone.trim() || undefined,
          services,
          locations,
          niches,
          minBudget,
          leadType,
          isActive: true,
          isAcceptingLeads: true,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || tOnboard('saveError'));
        setIsSubmitting(false);
      } else {
        // Spec 7.15: The last step must land on the first real matches
        router.push('/leads');
      }
    } catch {
      setError(tOnboard('networkError'));
      setIsSubmitting(false);
    }
  }

  const steps: StepItem[] = [
    {
      title: tOnboard('step1Title'),
      helper: tOnboard('step1Helper'),
      content: (
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <label className="text-label text-fg-primary">{tOnboard('step1Label')}</label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {DEVELOPER_SERVICES.map((srv) => {
                const selected = services.includes(srv.value);
                return (
                  <button
                    key={srv.value}
                    type="button"
                    onClick={() => toggleItem(services, srv.value, setServices)}
                    className={`flex items-center justify-between p-3 rounded-xl border text-body-sm transition-colors text-start ${
                      selected
                        ? 'border-brand bg-brand-soft text-brand font-semibold shadow-xs'
                        : 'border-line bg-surface text-fg-secondary hover:bg-subtle'
                    }`}
                  >
                    <span>{localizeService(srv.value, tServices as any)}</span>
                    {selected && <Check className="h-4 w-4 text-brand rtl:-scale-x-100" />}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      ),
    },
    {
      title: tOnboard('step2Title'),
      helper: tOnboard('step2Helper'),
      content: (
        <div className="flex flex-col gap-5">
          <div className="flex flex-col gap-2">
            <label className="text-label text-fg-primary">{tOnboard('step2Locations')}</label>
            <div className="flex flex-wrap gap-2">
              {ALL_CITIES.map((city) => {
                const selected = locations.includes(city);
                return (
                  <button
                    key={city}
                    type="button"
                    onClick={() => toggleItem(locations, city, setLocations)}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-caption border transition-colors ${
                      selected
                        ? 'border-brand bg-brand-soft text-brand font-semibold'
                        : 'border-line bg-surface text-fg-secondary hover:bg-subtle'
                    }`}
                  >
                    {selected && <Check className="h-3 w-3 rtl:-scale-x-100" />}
                    <span>{localizeCity(city, tGeo as any)}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-label text-fg-primary">{tOnboard('step2Niches')}</label>
            <div className="flex flex-wrap gap-2">
              {BUSINESS_CATEGORIES.map((cat) => {
                const selected = niches.includes(cat.value);
                return (
                  <button
                    key={cat.value}
                    type="button"
                    onClick={() => toggleItem(niches, cat.value, setNiches)}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-caption border transition-colors ${
                      selected
                        ? 'border-brand bg-brand-soft text-brand font-semibold'
                        : 'border-line bg-surface text-fg-secondary hover:bg-subtle'
                    }`}
                  >
                    {selected && <Check className="h-3 w-3 rtl:-scale-x-100" />}
                    <span>{localizeCategory(cat.value, tCat as any)}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      ),
    },
    {
      title: tOnboard('step3Title'),
      helper: tOnboard('step3Helper'),
      content: (
        <div className="flex flex-col gap-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label={tOnboard('companyLabel')}
              type="text"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              placeholder={tOnboard('companyPlaceholder')}
            />
            <Input
              label={tOnboard('phoneLabel')}
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder={tOnboard('phonePlaceholder')}
              dir="ltr"
              className="text-start"
            />
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-label text-fg-primary">
              {tOnboard('minBudgetLabel')}
            </label>
            <div className="grid grid-cols-3 gap-2">
              {[3000, 5000, 10000].map((b) => (
                <button
                  key={b}
                  type="button"
                  onClick={() => setMinBudget(b)}
                  className={`p-3 rounded-xl border text-center font-semibold tabular-nums text-body-sm transition-colors ${
                    minBudget === b
                      ? 'border-brand bg-brand-soft text-brand shadow-xs'
                      : 'border-line bg-surface text-fg-secondary hover:bg-subtle'
                  }`}
                >
                  <span className="ltr-iso">{fmtNumber(b, locale)}</span> {tOnboard('currencyEg')}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-label text-fg-primary">{tOnboard('leadTypeLabel')}</label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { value: 'BOTH', label: tOnboard('leadTypeBoth') },
                { value: 'SHARED', label: tOnboard('leadTypeShared') },
                { value: 'EXCLUSIVE', label: tOnboard('leadTypeExclusive') },
              ].map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setLeadType(opt.value as 'BOTH' | 'EXCLUSIVE' | 'SHARED')}
                  className={`p-3 rounded-xl border text-center text-caption font-semibold transition-colors ${
                    leadType === opt.value
                      ? 'border-brand bg-brand-soft text-brand shadow-xs'
                      : 'border-line bg-surface text-fg-secondary hover:bg-subtle'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      ),
    },
  ];

  return (
    <div data-density="comfortable" className="min-h-screen flex flex-col bg-page">
      <PublicNavbar />

      <main className="flex flex-1 items-center justify-center p-4 sm:p-6 lg:p-8">
        <div className="w-full max-w-onboarding mx-auto rounded-xl border border-line bg-surface p-6 sm:p-8 shadow-xs">
          {error && (
            <div className="mb-6">
              <Banner variant="danger">{error}</Banner>
            </div>
          )}

          {!loading && userEmail && !isEmailVerified && (
            <div className="mb-6 p-4 rounded-xl border border-warning-border bg-warning-bg text-warning-text flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-body-sm">
              <div className="flex items-start gap-2.5">
                <AlertCircle className="h-5 w-5 text-warning-icon shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold text-fg-primary">
                    {tCommon('verificationReminderTitle')}
                  </p>
                  <p className="text-body-sm text-fg-secondary mt-0.5">
                    {tCommon('verificationReminderDesc', { email: userEmail })}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={handleResendVerification}
                  disabled={resendingVerification || resendCooldown > 0}
                  className="text-caption font-semibold text-brand hover:underline disabled:opacity-60 cursor-pointer"
                >
                  {resendCooldown > 0 ? (
                    <span className="ltr-iso tabular-nums">
                      {tCommon('resendCooldownAction', { seconds: resendCooldown })}
                    </span>
                  ) : resendSent ? (
                    tCommon('resendSuccessAction')
                  ) : (
                    tCommon('resendVerificationAction')
                  )}
                </button>
              </div>
            </div>
          )}

          {loading ? (
            <div className="space-y-6">
              <Skeleton className="h-8 w-48 mx-auto" />
              <Skeleton className="h-12 w-full rounded-xl" />
              <div className="space-y-4 pt-4">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            </div>
          ) : (
            <Stepper
              steps={steps}
              currentStep={currentStep}
              onNext={() => {
                if (currentStep < steps.length - 1) {
                  setCurrentStep((prev) => prev + 1);
                } else {
                  handleFinalSubmit();
                }
              }}
              onPrev={() => {
                if (currentStep > 0) setCurrentStep((prev) => prev - 1);
              }}
              isSubmitting={isSubmitting}
              finalStepLabel={tOnboard('finishButton')}
            />
          )}
        </div>
      </main>

      <PublicFooter />
    </div>
  );
}
