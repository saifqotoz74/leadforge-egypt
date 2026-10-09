'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { PublicNavbar, PublicFooter } from '@/components/PublicNavbar';
import { Stepper, StepItem } from '@/components/domain/Stepper';
import { Banner } from '@/components/ui/Banner';
import { Input } from '@/components/ui/Input';
import { Check } from 'lucide-react';
import {
  ALL_CITIES,
  BUSINESS_CATEGORIES,
  DEVELOPER_SERVICES,
} from '@/lib/constants';

export default function OnboardingPage() {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    async function loadCurrentProfile() {
      try {
        const res = await fetch('/api/developer/profile');
        if (res.ok) {
          const data = await res.json();
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
      } catch {
        // Fall back to defaults
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
    setIsSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/developer/profile', {
        method: 'PUT',
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
        setError(data.error || 'تعذّر حفظ التفضيلات. حاول مرة أخرى.');
        setIsSubmitting(false);
      } else {
        // Spec 7.15: The last step must land on the first real matches
        router.push('/leads');
      }
    } catch {
      setError('تعذّر الاتصال بالخادم. تحقق من الإنترنت.');
      setIsSubmitting(false);
    }
  }

  const steps: StepItem[] = [
    {
      title: 'خدمات واستشارات الويب',
      helper: 'اختر نوع الخدمات والحلول البرمجية التي تقدمها لتلقي الفرص الملائمة لمهاراتك.',
      content: (
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <label className="text-label text-fg-primary">الخدمات الأساسية</label>
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
                    <span>{srv.labelAr}</span>
                    {selected && <Check className="h-4 w-4 text-brand" />}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      ),
    },
    {
      title: 'التوزيع الجغرافي والأنشطة المستهدفة',
      helper: 'حدد المدن وقطاعات الأعمال التي ترغب في استهدافها.',
      content: (
        <div className="flex flex-col gap-5">
          <div className="flex flex-col gap-2">
            <label className="text-label text-fg-primary">المدن والمحافظات</label>
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
                    {selected && <Check className="h-3 w-3" />}
                    <span>{city}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-label text-fg-primary">قطاعات وأنشطة العملاء</label>
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
                    {selected && <Check className="h-3 w-3" />}
                    <span>{cat.labelAr}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      ),
    },
    {
      title: 'الميزانية ونوع الفرص البيعية',
      helper: 'اضبط الحد الأدنى للميزانية التقديرية ونوع حقوق الملكية للفرص.',
      content: (
        <div className="flex flex-col gap-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="اسم الشركة / الاستوديو (اختياري)"
              type="text"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              placeholder="مثال: استوديو النيل للحلول البرمجية"
            />
            <Input
              label="رقم الهاتف للتواصل (اختياري)"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="01012345678"
              dir="ltr"
              className="text-start"
            />
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-label text-fg-primary">
              الحد الأدنى لميزانية المشروع (بالجنيه المصري)
            </label>
            <div className="grid grid-cols-3 gap-2">
              {[3000, 5000, 10000].map((b) => (
                <button
                  key={b}
                  type="button"
                  onClick={() => setMinBudget(b)}
                  className={`p-3 rounded-xl border text-center font-mono font-semibold text-body-sm transition-colors ${
                    minBudget === b
                      ? 'border-brand bg-brand-soft text-brand shadow-xs'
                      : 'border-line bg-surface text-fg-secondary hover:bg-subtle'
                  }`}
                >
                  <span className="ltr-iso">{b.toLocaleString()}</span> ج.م
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-label text-fg-primary">نوع تملك الفرص</label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { value: 'BOTH', label: 'كلاهما (موصى به)' },
                { value: 'SHARED', label: 'فرص مشتركة فقط' },
                { value: 'EXCLUSIVE', label: 'فرص حصرية فقط' },
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
        <div className="w-full max-w-onboarding mx-auto rounded-2xl border border-line bg-surface p-6 sm:p-8 shadow-xs">
          {error && (
            <div className="mb-6">
              <Banner variant="danger">{error}</Banner>
            </div>
          )}

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
            finalStepLabel="عرض الفرص المطابقة"
          />
        </div>
      </main>

      <PublicFooter />
    </div>
  );
}
