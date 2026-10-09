'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { PublicNavbar, PublicFooter, LeadCard, PackageCard } from '@/components/domain';
import { ScoreLab } from '@/features/landing/ScoreLab';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { DEFAULT_PLANS } from '@/lib/constants';
import { fmtNumber } from '@/lib/format';
import {
  ShieldCheck,
  Check,
  X,
  Sliders,
  ArrowLeft,
  ChevronDown,
  Layers,
  PhoneCall,
  Globe,
  Coins,
  Lock,
  Users,
  Compass,
} from 'lucide-react';
import { useTranslations } from 'next-intl';

export default function LandingPage() {
  const tLanding = useTranslations('landing');
  const [activeStep, setActiveStep] = useState(0);
  const [ownershipMode, setOwnershipMode] = useState<'EXCLUSIVE' | 'SHARED'>('SHARED');
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  function toggleFaq(index: number) {
    setOpenFaq((prev) => (prev === index ? null : index));
  }

  const faqItems = [
    { q: tLanding('faqQ1'), a: tLanding('faqA1') },
    { q: tLanding('faqQ2'), a: tLanding('faqA2') },
    { q: tLanding('faqQ3'), a: tLanding('faqA3') },
    { q: tLanding('faqQ4'), a: tLanding('faqA4') },
    { q: tLanding('faqQ5'), a: tLanding('faqA5') },
    { q: tLanding('faqQ6'), a: tLanding('faqA6') },
    { q: tLanding('faqQ7'), a: tLanding('faqA7') },
  ];

  return (
    <div data-density="comfortable" className="min-h-screen flex flex-col bg-page">
      {/* 1. Navbar */}
      <PublicNavbar />

      <main className="flex-1 flex flex-col">
        {/* 2. Hero Section */}
        <section className="bg-surface border-b border-line py-16 sm:py-24">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="grid items-center gap-12 lg:grid-cols-12">
              <div className="lg:col-span-7 flex flex-col gap-6">
                <div className="inline-flex items-center gap-2 rounded-full border border-line bg-subtle px-3.5 py-1.5 text-caption font-semibold text-fg-secondary w-fit">
                  <ShieldCheck className="h-4 w-4 text-brand rtl:-scale-x-100" />
                  <span>{tLanding('heroBadge')}</span>
                </div>

                <h1 className="text-display font-bold text-fg-primary max-w-reading">
                  {tLanding('heroHeadline')}
                </h1>

                <p className="text-body-lg text-fg-secondary max-w-reading">
                  {tLanding('heroSubtitle')}
                </p>

                <div className="flex flex-wrap items-center gap-4 pt-2">
                  <Link href="/register">
                    <Button variant="primary" size="lg" className="gap-2">
                      <span>{tLanding('heroCtaPrimary')}</span>
                      <ArrowLeft className="h-4 w-4 rtl:-scale-x-100" />
                    </Button>
                  </Link>
                  <a href="#score-lab">
                    <Button variant="secondary" size="lg" className="gap-2">
                      <Sliders className="h-4 w-4" />
                      <span>{tLanding('heroCtaSecondary')}</span>
                    </Button>
                  </a>
                </div>

                {/* Plain Facts Row */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 border-t border-line pt-6 text-body-sm text-fg-secondary">
                  <div className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-brand shrink-0 rtl:-scale-x-100" />
                    <span>{tLanding('heroFactRules')}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-brand shrink-0 rtl:-scale-x-100" />
                    <span>{tLanding('heroFactDuplicates')}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-brand shrink-0 rtl:-scale-x-100" />
                    <span>{tLanding('heroFactLedger')}</span>
                  </div>
                </div>
              </div>

              {/* Hero Live LeadCard Demo Frame */}
              <div className="lg:col-span-5">
                <div className="relative rounded-xl border border-line bg-surface p-2 shadow-lg">
                  <div className="mb-2 px-3 pt-2 flex items-center justify-between text-caption font-semibold text-fg-muted">
                    <span className="inline-flex items-center gap-1">
                      <Compass className="h-3.5 w-3.5 text-brand" />
                      <span>{tLanding('illustrativeExample')}</span>
                    </span>
                    <span className="font-mono text-caption text-brand">100% شفاف</span>
                  </div>
                  <LeadCard
                    id="hero-lead-sample"
                    companyName="عيادة النيل التخصصية للأسنان"
                    category="عيادات ومراكز طبية"
                    location="القاهرة الجديدة، القاهرة"
                    temperature="HOT"
                    score={88}
                    ownershipType="SHARED"
                    qualityStatus="FRESH"
                    price={1}
                    seatsRemaining={2}
                    maxSeats={3}
                    signals={['بدون موقع إلكتروني', 'هاتف موثق', 'نشاط جغرافي مؤكد']}
                  />
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* 3. Problem Strip */}
        <section className="bg-subtle/50 border-b border-line py-16 sm:py-20">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="text-center max-w-3xl mx-auto mb-12">
              <h2 className="text-h1 font-bold text-fg-primary">
                {tLanding('problemStripTitle')}
              </h2>
              <p className="mt-3 text-body-lg text-fg-secondary">
                {tLanding('problemStripSubtitle')}
              </p>
            </div>

            <div className="grid gap-6 md:grid-cols-3">
              {/* Col 1 */}
              <Card className="p-6 flex flex-col justify-between">
                <div className="space-y-3">
                  <div className="h-10 w-10 rounded-xl bg-warning-bg text-warning-icon flex items-center justify-center">
                    <Layers className="h-5 w-5" />
                  </div>
                  <h3 className="text-h4 font-bold text-fg-primary">
                    {tLanding('problemCol1Title')}
                  </h3>
                  <p className="text-body-sm text-fg-secondary">
                    {tLanding('problemCol1Text')}
                  </p>
                </div>
                <div className="mt-4 pt-4 border-t border-line text-caption font-medium text-brand">
                  {tLanding('problemCol1Solution')}
                </div>
              </Card>

              {/* Col 2 */}
              <Card className="p-6 flex flex-col justify-between">
                <div className="space-y-3">
                  <div className="h-10 w-10 rounded-xl bg-danger-bg text-danger-icon flex items-center justify-center">
                    <PhoneCall className="h-5 w-5" />
                  </div>
                  <h3 className="text-h4 font-bold text-fg-primary">
                    {tLanding('problemCol2Title')}
                  </h3>
                  <p className="text-body-sm text-fg-secondary">
                    {tLanding('problemCol2Text')}
                  </p>
                </div>
                <div className="mt-4 pt-4 border-t border-line text-caption font-medium text-brand">
                  {tLanding('problemCol2Solution')}
                </div>
              </Card>

              {/* Col 3 */}
              <Card className="p-6 flex flex-col justify-between">
                <div className="space-y-3">
                  <div className="h-10 w-10 rounded-xl bg-info-bg text-info-icon flex items-center justify-center">
                    <Globe className="h-5 w-5" />
                  </div>
                  <h3 className="text-h4 font-bold text-fg-primary">
                    {tLanding('problemCol3Title')}
                  </h3>
                  <p className="text-body-sm text-fg-secondary">
                    {tLanding('problemCol3Text')}
                  </p>
                </div>
                <div className="mt-4 pt-4 border-t border-line text-caption font-medium text-brand">
                  {tLanding('problemCol3Solution')}
                </div>
              </Card>
            </div>
          </div>
        </section>

        {/* 4. How It Works (Storytelling) */}
        <section className="bg-surface border-b border-line py-16 sm:py-24">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="text-center max-w-3xl mx-auto mb-16">
              <h2 className="text-h1 font-bold text-fg-primary">
                {tLanding('howItWorksTitle')}
              </h2>
              <p className="mt-3 text-body-lg text-fg-secondary">
                {tLanding('howItWorksSubtitle')}
              </p>
            </div>

            <div className="grid gap-10 lg:grid-cols-12 items-start">
              {/* Steps Sequence List */}
              <div className="lg:col-span-5 space-y-4">
                {[
                  {
                    num: tLanding('howStep1Num'),
                    title: tLanding('howStep1Title'),
                    desc: tLanding('howStep1Desc'),
                  },
                  {
                    num: tLanding('howStep2Num'),
                    title: tLanding('howStep2Title'),
                    desc: tLanding('howStep2Desc'),
                  },
                  {
                    num: tLanding('howStep3Num'),
                    title: tLanding('howStep3Title'),
                    desc: tLanding('howStep3Desc'),
                  },
                  {
                    num: tLanding('howStep4Num'),
                    title: tLanding('howStep4Title'),
                    desc: tLanding('howStep4Desc'),
                  },
                ].map((step, idx) => {
                  const isActive = activeStep === idx;
                  return (
                    <button
                      key={step.num}
                      type="button"
                      onClick={() => setActiveStep(idx)}
                      className={`w-full text-start p-5 rounded-xl border transition-all ${
                        isActive
                          ? 'border-brand bg-brand-soft shadow-xs'
                          : 'border-line bg-surface hover:bg-subtle'
                      }`}
                    >
                      <div className="flex items-center gap-3 mb-2">
                        <span
                          className={`flex h-7 w-7 items-center justify-center rounded-full font-mono text-caption font-bold ${
                            isActive
                              ? 'bg-brand text-fg-on-brand'
                              : 'bg-subtle text-fg-muted'
                          }`}
                        >
                          {step.num}
                        </span>
                        <h3 className="text-h4 font-bold text-fg-primary">
                          {step.title}
                        </h3>
                      </div>
                      <p className="text-body-sm text-fg-secondary ps-10">
                        {step.desc}
                      </p>
                    </button>
                  );
                })}
              </div>

              {/* Dynamic Frame for Selected Step */}
              <div className="lg:col-span-7 rounded-xl border border-line bg-subtle p-6 shadow-sm min-h-96 flex flex-col justify-center">
                {activeStep === 0 && (
                  <div className="space-y-4">
                    <span className="text-caption font-bold text-brand block">
                      المطابقة والدمج الكياني (Entity Resolution):
                    </span>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="p-4 rounded-xl border border-line bg-surface text-body-sm space-y-2">
                        <div className="text-caption text-fg-muted">سجل من مصدر أ:</div>
                        <div className="font-bold text-fg-primary">مختبرات الدلتا الطبية</div>
                        <div className="text-fg-secondary font-mono">01009876543</div>
                        <div className="text-caption text-fg-muted">مدينة نصر، القاهرة</div>
                      </div>
                      <div className="p-4 rounded-xl border border-line bg-surface text-body-sm space-y-2">
                        <div className="text-caption text-fg-muted">سجل من مصدر ب:</div>
                        <div className="font-bold text-fg-primary">معامل الدلتا للتحاليل</div>
                        <div className="text-fg-secondary font-mono">01009876543</div>
                        <div className="text-caption text-fg-muted">شارع عباس العقاد، القاهرة</div>
                      </div>
                    </div>
                    <div className="p-3 rounded-lg bg-brand-soft border border-brand/20 text-caption text-brand font-semibold flex items-center gap-2">
                      <Check className="h-4 w-4 rtl:-scale-x-100" />
                      <span>تم التعرف التلقائي على تطابق الهوية ودمجهما في سجل موحد بنسبة ثقة 100%.</span>
                    </div>
                  </div>
                )}

                {activeStep === 1 && (
                  <div className="space-y-4">
                    <span className="text-caption font-bold text-brand block">
                      التقييم الفني المزدوج (Dual Scoring):
                    </span>
                    <div className="p-4 rounded-xl border border-line bg-surface space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-fg-primary">درجة فرصة البيع (Opportunity Score):</span>
                        <span className="font-mono font-bold text-h3 text-brand">85 / 100</span>
                      </div>
                      <div className="flex items-center justify-between border-t border-line pt-2">
                        <span className="font-bold text-fg-primary">درجة جودة البيانات (Quality Score):</span>
                        <span className="font-mono font-bold text-h3 text-fg-primary">92 / 100</span>
                      </div>
                    </div>
                    <p className="text-caption text-fg-secondary">
                      كل درجة تعتمد على بنود محددة يمكن مراجعتها والتأكد من أسبابها بالكامل.
                    </p>
                  </div>
                )}

                {activeStep === 2 && (
                  <div className="space-y-4">
                    <span className="text-caption font-bold text-brand block">
                      بوابات الأهلية القطعية (Deterministic Gates):
                    </span>
                    <div className="space-y-2">
                      <div className="p-3 rounded-lg border border-line bg-surface flex items-center justify-between text-body-sm">
                        <span className="text-fg-primary">بوابة المدينة الجغرافية (القاهرة والجيزة):</span>
                        <span className="font-semibold text-brand flex items-center gap-1">
                          <Check className="h-4 w-4" /> اجتازت
                        </span>
                      </div>
                      <div className="p-3 rounded-lg border border-line bg-surface flex items-center justify-between text-body-sm">
                        <span className="text-fg-primary">بوابة نوع الخدمة (تطوير مواقع الويب):</span>
                        <span className="font-semibold text-brand flex items-center gap-1">
                          <Check className="h-4 w-4" /> اجتازت
                        </span>
                      </div>
                      <div className="p-3 rounded-lg border border-line bg-surface flex items-center justify-between text-body-sm">
                        <span className="text-fg-primary">بوابة حداثة البيانات (أقل من 30 يوماً):</span>
                        <span className="font-semibold text-brand flex items-center gap-1">
                          <Check className="h-4 w-4" /> اجتازت
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                {activeStep === 3 && (
                  <div className="space-y-4">
                    <span className="text-caption font-bold text-brand block">
                      حيازة الفرصة وإدارتها (Purchase & Pipeline):
                    </span>
                    <div className="p-4 rounded-xl border border-line bg-surface space-y-3">
                      <div className="flex items-center justify-between text-body-sm">
                        <span className="text-fg-secondary">حالة الحيازة:</span>
                        <span className="font-bold text-brand">تم الشراء بنجاح (نقطة واحدة)</span>
                      </div>
                      <div className="flex items-center justify-between text-body-sm border-t border-line pt-2">
                        <span className="text-fg-secondary">مرحلة المتابعة:</span>
                        <span className="font-bold text-fg-primary">اجتماع مجدول مع صاحب العمل</span>
                      </div>
                    </div>
                    <div className="text-caption text-fg-muted font-mono">
                      تسجيل كافة تحديثات العروض والنتائج في سجل مبيعات متكامل.
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* 5. Score Lab (Dark Section) */}
        <ScoreLab />

        {/* 6. Matching Section */}
        <section className="bg-surface border-b border-line py-16 sm:py-24">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="text-center max-w-3xl mx-auto mb-16">
              <h2 className="text-h1 font-bold text-fg-primary">
                {tLanding('matchingTitle')}
              </h2>
              <p className="mt-3 text-body-lg text-fg-secondary">
                {tLanding('matchingSubtitle')}
              </p>
            </div>

            <div className="grid gap-8 lg:grid-cols-12 items-start">
              {/* Developer Profile Card */}
              <div className="lg:col-span-4 rounded-xl border border-line bg-subtle p-6 space-y-4">
                <h3 className="text-h3 font-bold text-fg-primary border-b border-line pb-3">
                  {tLanding('matchingDevProfile')}
                </h3>
                <div className="space-y-2 text-body-sm">
                  <div className="flex justify-between">
                    <span className="text-fg-muted">{tLanding('matchingCity')}</span>
                    <span className="font-semibold text-fg-primary">القاهرة والجيزة</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-fg-muted">{tLanding('matchingServices')}</span>
                    <span className="font-semibold text-fg-primary">تطوير وتصميم المواقع</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-fg-muted">{tLanding('matchingMinBudget')}</span>
                    <span className="font-mono font-semibold text-fg-primary ltr-iso">5,000 ج.م</span>
                  </div>
                </div>
                <div className="pt-2 border-t border-line text-caption text-brand font-semibold">
                  تُقاس كل فرصة فورياً أمام هذه المعايير.
                </div>
              </div>

              {/* 3 Lead Results matching this profile */}
              <div className="lg:col-span-8 space-y-4">
                {/* Lead 1: Pass */}
                <div className="p-4 rounded-xl border border-line bg-surface flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-fg-primary">مركز الأمل للعلاج الطبيعي</span>
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-caption bg-brand-soft text-brand font-semibold">
                        {tLanding('matchingGatePassed')}
                      </span>
                    </div>
                    <p className="text-caption text-fg-secondary mt-1">
                      مدينة نصر، القاهرة • بدون موقع إلكتروني • ميزانية 8,000 ج.م
                    </p>
                  </div>
                  <div className="text-end shrink-0">
                    <span className="text-caption text-fg-muted block">{tLanding('matchingScoreLabel')}</span>
                    <span className="font-mono font-bold text-h3 text-brand">94%</span>
                  </div>
                </div>

                {/* Lead 2: Pass */}
                <div className="p-4 rounded-xl border border-line bg-surface flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-fg-primary">مجموعة الفرسان للتجارة</span>
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-caption bg-brand-soft text-brand font-semibold">
                        {tLanding('matchingGatePassed')}
                      </span>
                    </div>
                    <p className="text-caption text-fg-secondary mt-1">
                      الدقي، الجيزة • موقع بحاجة لإعادة تصميم • ميزانية 12,000 ج.م
                    </p>
                  </div>
                  <div className="text-end shrink-0">
                    <span className="text-caption text-fg-muted block">{tLanding('matchingScoreLabel')}</span>
                    <span className="font-mono font-bold text-h3 text-brand">86%</span>
                  </div>
                </div>

                {/* Lead 3: Fail Gate */}
                <div className="p-4 rounded-xl border border-line bg-subtle/60 flex flex-col sm:flex-row sm:items-center justify-between gap-4 opacity-75">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-fg-muted">مصنع الإسكندرية للتعبئة</span>
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-caption bg-danger-bg text-danger-text font-semibold">
                        {tLanding('matchingGateFailed')}
                      </span>
                    </div>
                    <p className="text-caption text-fg-muted mt-1">
                      الإسكندرية (خارج النطاق الجغرافي المحدد للمطور)
                    </p>
                  </div>
                  <div className="text-end shrink-0">
                    <span className="text-caption text-fg-muted block">{tLanding('matchingScoreLabel')}</span>
                    <span className="font-mono font-bold text-body text-fg-muted">—</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* 7. Ownership & Points */}
        <section className="bg-subtle/30 border-b border-line py-16 sm:py-24">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="text-center max-w-3xl mx-auto mb-12">
              <h2 className="text-h1 font-bold text-fg-primary">
                {tLanding('ownershipTitle')}
              </h2>
              <p className="mt-3 text-body-lg text-fg-secondary">
                {tLanding('ownershipSubtitle')}
              </p>

              {/* Segmented control */}
              <div className="mt-8 inline-flex p-1 rounded-full border border-line bg-surface">
                <button
                  type="button"
                  onClick={() => setOwnershipMode('SHARED')}
                  className={`px-5 py-2 rounded-full text-body-sm font-semibold transition-all ${
                    ownershipMode === 'SHARED'
                      ? 'bg-brand text-fg-on-brand shadow-xs'
                      : 'text-fg-secondary hover:text-fg-primary'
                  }`}
                >
                  <Users className="h-4 w-4 inline me-1.5" />
                  <span>{tLanding('ownershipSharedTab')}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setOwnershipMode('EXCLUSIVE')}
                  className={`px-5 py-2 rounded-full text-body-sm font-semibold transition-all ${
                    ownershipMode === 'EXCLUSIVE'
                      ? 'bg-brand text-fg-on-brand shadow-xs'
                      : 'text-fg-secondary hover:text-fg-primary'
                  }`}
                >
                  <Lock className="h-4 w-4 inline me-1.5" />
                  <span>{tLanding('ownershipExclusiveTab')}</span>
                </button>
              </div>
            </div>

            <div className="max-w-2xl mx-auto rounded-xl border border-line bg-surface p-8 shadow-sm space-y-6">
              <div className="flex items-center justify-between border-b border-line pb-4">
                <div>
                  <h3 className="text-h3 font-bold text-fg-primary">
                    {ownershipMode === 'EXCLUSIVE'
                      ? tLanding('ownershipExclusiveTab')
                      : tLanding('ownershipSharedTab')}
                  </h3>
                  <p className="text-body-sm text-fg-secondary mt-1">
                    {ownershipMode === 'EXCLUSIVE'
                      ? tLanding('ownershipExclusiveDesc')
                      : tLanding('ownershipSharedDesc')}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 text-body-sm">
                <div className="p-4 rounded-xl bg-subtle">
                  <span className="text-caption text-fg-muted block">{tLanding('ownershipCost')}</span>
                  <span className="font-mono font-bold text-h2 text-brand">
                    {ownershipMode === 'EXCLUSIVE' ? '5' : '1'} نقاط
                  </span>
                </div>
                <div className="p-4 rounded-xl bg-subtle">
                  <span className="text-caption text-fg-muted block">{tLanding('ownershipSeats')}</span>
                  <span className="font-mono font-bold text-h2 text-fg-primary">
                    {ownershipMode === 'EXCLUSIVE' ? '1 فقط' : '3 مطورين كحد أقصى'}
                  </span>
                </div>
              </div>

              <div className="text-caption text-fg-muted text-center pt-2">
                {tLanding('ownershipBalanceNotice')}
              </div>
            </div>
          </div>
        </section>

        {/* 8. Pricing Section */}
        <section className="bg-surface border-b border-line py-16 sm:py-24">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="text-center max-w-3xl mx-auto mb-16">
              <h2 className="text-h1 font-bold text-fg-primary">
                {tLanding('pricingTitle')}
              </h2>
              <p className="mt-3 text-body-lg text-fg-secondary">
                {tLanding('pricingSubtitle')}
              </p>
            </div>

            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4 items-stretch">
              {DEFAULT_PLANS.map((plan) => {
                const isRecommended = plan.slug === 'pro';
                return (
                  <PackageCard
                    key={plan.slug}
                    id={plan.slug}
                    name={plan.name}
                    points={plan.monthlyCredits}
                    priceEGP={plan.priceEgp}
                    features={plan.features}
                    isRecommended={isRecommended}
                    recommendedReason={isRecommended ? 'الخيار الأنسب للشركات والمستقلين النشطين' : undefined}
                  />
                );
              })}
            </div>
          </div>
        </section>

        {/* 9. Commitments Section */}
        <section className="bg-subtle/40 border-b border-line py-16 sm:py-24">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="text-center max-w-3xl mx-auto mb-16">
              <h2 className="text-h1 font-bold text-fg-primary">
                {tLanding('commitmentsTitle')}
              </h2>
              <p className="mt-3 text-body-lg text-fg-secondary">
                {tLanding('commitmentsSubtitle')}
              </p>
            </div>

            <div className="grid gap-8 md:grid-cols-2">
              {/* We Do */}
              <Card className="p-8 space-y-6">
                <CardHeader className="p-0">
                  <CardTitle className="text-h3 font-bold text-brand flex items-center gap-2">
                    <Check className="h-5 w-5 rtl:-scale-x-100" />
                    <span>{tLanding('weDoTitle')}</span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0 space-y-4">
                  <div className="flex items-start gap-3 text-body-sm text-fg-secondary">
                    <Check className="h-4 w-4 text-brand shrink-0 mt-1 rtl:-scale-x-100" />
                    <span>{tLanding('weDo1')}</span>
                  </div>
                  <div className="flex items-start gap-3 text-body-sm text-fg-secondary">
                    <Check className="h-4 w-4 text-brand shrink-0 mt-1 rtl:-scale-x-100" />
                    <span>{tLanding('weDo2')}</span>
                  </div>
                  <div className="flex items-start gap-3 text-body-sm text-fg-secondary">
                    <Check className="h-4 w-4 text-brand shrink-0 mt-1 rtl:-scale-x-100" />
                    <span>{tLanding('weDo3')}</span>
                  </div>
                  <div className="flex items-start gap-3 text-body-sm text-fg-secondary">
                    <Check className="h-4 w-4 text-brand shrink-0 mt-1 rtl:-scale-x-100" />
                    <span>{tLanding('weDo4')}</span>
                  </div>
                </CardContent>
              </Card>

              {/* We Don't */}
              <Card className="p-8 space-y-6">
                <CardHeader className="p-0">
                  <CardTitle className="text-h3 font-bold text-danger-text flex items-center gap-2">
                    <X className="h-5 w-5" />
                    <span>{tLanding('weDontTitle')}</span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0 space-y-4">
                  <div className="flex items-start gap-3 text-body-sm text-fg-secondary">
                    <X className="h-4 w-4 text-danger-text shrink-0 mt-1" />
                    <span>{tLanding('weDont1')}</span>
                  </div>
                  <div className="flex items-start gap-3 text-body-sm text-fg-secondary">
                    <X className="h-4 w-4 text-danger-text shrink-0 mt-1" />
                    <span>{tLanding('weDont2')}</span>
                  </div>
                  <div className="flex items-start gap-3 text-body-sm text-fg-secondary">
                    <X className="h-4 w-4 text-danger-text shrink-0 mt-1" />
                    <span>{tLanding('weDont3')}</span>
                  </div>
                  <div className="flex items-start gap-3 text-body-sm text-fg-secondary">
                    <X className="h-4 w-4 text-danger-text shrink-0 mt-1" />
                    <span>{tLanding('weDont4')}</span>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </section>

        {/* 10. FAQ Accordions */}
        <section className="bg-surface border-b border-line py-16 sm:py-24">
          <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-16">
              <h2 className="text-h1 font-bold text-fg-primary">
                {tLanding('faqTitle')}
              </h2>
              <p className="mt-3 text-body-lg text-fg-secondary">
                {tLanding('faqSubtitle')}
              </p>
            </div>

            <div className="space-y-3">
              {faqItems.map((item, idx) => {
                const isOpen = openFaq === idx;
                return (
                  <div
                    key={idx}
                    className="rounded-xl border border-line bg-surface transition-colors"
                  >
                    <button
                      type="button"
                      onClick={() => toggleFaq(idx)}
                      className="w-full p-5 text-start font-semibold text-fg-primary flex items-center justify-between gap-4"
                      aria-expanded={isOpen}
                    >
                      <span>{item.q}</span>
                      <ChevronDown
                        className={`h-4 w-4 shrink-0 text-fg-muted transition-transform duration-200 ${
                          isOpen ? 'rotate-180' : ''
                        }`}
                      />
                    </button>
                    {isOpen && (
                      <div className="px-5 pb-5 pt-1 text-body-sm text-fg-secondary leading-relaxed border-t border-line/40">
                        {item.a}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* 11. Final CTA Band */}
        <section className="bg-brand-soft border-b border-line py-16 sm:py-20">
          <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 text-center flex flex-col items-center gap-6">
            <h2 className="text-h1 font-bold text-fg-primary">
              {tLanding('finalCtaTitle')}
            </h2>
            <p className="text-body-lg text-fg-secondary max-w-reading">
              {tLanding('finalCtaSubtitle')}
            </p>
            <div className="flex flex-wrap items-center justify-center gap-4">
              <Link href="/register">
                <Button variant="primary" size="lg" className="gap-2">
                  <span>{tLanding('finalCtaBtnRegister')}</span>
                  <ArrowLeft className="h-4 w-4 rtl:-scale-x-100" />
                </Button>
              </Link>
              <Link href="/pricing">
                <Button variant="secondary" size="lg">
                  <span>{tLanding('finalCtaBtnPricing')}</span>
                </Button>
              </Link>
            </div>
          </div>
        </section>
      </main>

      {/* 12. Footer */}
      <PublicFooter />
    </div>
  );
}
