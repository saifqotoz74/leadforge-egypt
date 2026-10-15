'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import {
  PublicNavbar,
  PublicFooter,
  PackageCard,
  ScorePair,
  StageBadge,
  OpportunityBadge,
} from '@/components/domain';
import { ScoreLab } from '@/features/landing/ScoreLab';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { LockedField } from '@/components/ui/LockedField';
import { DEFAULT_PLANS } from '@/lib/constants';
import { localizePlanCatalog } from '@/lib/taxonomy';
import {
  Check,
  X,
  Sliders,
  ArrowRight,
  ChevronDown,
  Layers,
  PhoneCall,
  Globe,
  Lock,
  Users,
  Compass,
  Coins,
} from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { PlatformStats } from '@/lib/stats';
import { fmtNumber, fmtDate } from '@/lib/format';

export interface LandingClientProps {
  stats?: PlatformStats;
}

export default function LandingPage({ stats }: LandingClientProps = {}) {
  const locale = useLocale();
  const tLanding = useTranslations('landing');
  const tPlans = useTranslations('plans');
  const tPricing = useTranslations('pricing');
  const [activeStep, setActiveStep] = useState(0);
  const [ownershipMode, setOwnershipMode] = useState<'EXCLUSIVE' | 'SHARED'>('SHARED');
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [highlightedField, setHighlightedField] = useState<'website' | 'reviews' | 'branches' | 'quality' | null>(null);

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
    { q: tLanding('faqQ8'), a: tLanding('faqA8') },
    { q: tLanding('faqQ9'), a: tLanding('faqA9') },
  ];

  return (
    <div data-density="comfortable" className="min-h-screen flex flex-col bg-page">
      {/* 1. Navbar */}
      <PublicNavbar />

      <main className="flex-1 flex flex-col">
        {/* 2. Hero Section (First fold refinement: single card hero object, SVG dot-grid, hover highlight) */}
        <section className="relative bg-page border-b border-line py-8 sm:py-10 lg:py-10 overflow-hidden">
          {/* Quiet SVG dot-grid pattern behind hero only (Spec: --n-100 on --bg-page, no CSS gradient) */}
          <svg
            className="absolute inset-0 h-full w-full pointer-events-none"
            xmlns="http://www.w3.org/2000/svg"
            width="100%"
            height="100%"
            aria-hidden="true"
          >
            <defs>
              <pattern id="hero-dot-grid" width="24" height="24" patternUnits="userSpaceOnUse">
                <circle cx="2" cy="2" r="1.25" fill="var(--n-100)" />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#hero-dot-grid)" />
          </svg>

          <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="grid items-start gap-8 lg:gap-12 lg:grid-cols-12">
              {/* Left Column (Headline, Subtitle, CTAs, Caption) */}
              <div className="lg:col-span-6 flex flex-col gap-5 pt-1">
                <h1
                  style={{ fontSize: 'clamp(2.125rem, 4.6vw, 4.5rem)', lineHeight: 1.15, fontWeight: 700 }} /* design-allow: clamp-display */
                  className="font-bold tracking-tight text-fg-primary max-w-[18ch]"
                >
                  {tLanding('heroHeadline')}
                </h1>

                <p className="text-body-lg text-fg-secondary max-w-[44ch] leading-relaxed">
                  {tLanding('heroSubtitle')}
                </p>

                <div className="flex flex-col gap-3 pt-1">
                  <div className="flex flex-wrap items-center gap-3">
                    <Link href="/register">
                      <Button variant="primary" size="lg" className="gap-2">
                        <span>{tLanding('heroCtaPrimary')}</span>
                        <ArrowRight className="h-4 w-4 shrink-0 rtl:-scale-x-100" />
                      </Button>
                    </Link>
                    <a href="#how-it-works">
                      <Button variant="secondary" size="lg" className="gap-2">
                        <Sliders className="h-4 w-4 shrink-0" />
                        <span>{tLanding('heroCtaSecondary')}</span>
                      </Button>
                    </a>
                  </div>
                  <p className="text-caption text-fg-muted">
                    {tLanding('heroCaption')}
                  </p>
                </div>
              </div>

              {/* Right Column: Hero Lead Card Object (480-520px at 1440, padding 24, no nested boxes) */}
              <div className="lg:col-span-6 w-full flex justify-center lg:justify-end">
                <div
                  className="w-full max-w-lg rounded-xl border border-line bg-surface p-6 shadow-sm flex flex-col gap-4"
                  aria-label={tLanding('illustrativeExample')}
                >
                  {/* Top Bar: Illustrative Example Label & Opportunity Badge */}
                  <div className="flex items-center justify-between text-caption text-fg-muted pb-1">
                    <span className="inline-flex items-center gap-1.5 font-medium">
                      <Compass className="h-3.5 w-3.5 text-brand shrink-0" aria-hidden="true" />
                      <span>{tLanding('illustrativeExample')}</span>
                    </span>

                    <OpportunityBadge temperature="HOT" showScore={false} size="sm" />
                  </div>

                  {/* Identity Row: Name, Meta & Opportunity Score */}
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex flex-col gap-0.5 min-w-0">
                      <h2
                        title={tLanding('heroCardName')}
                        className="text-h3 font-bold text-fg-primary leading-snug truncate" /* design-allow: truncate */
                      >
                        {tLanding('heroCardName')}
                      </h2>
                      <p className="text-body-sm text-fg-secondary">
                        {tLanding('heroCardMeta')}
                      </p>
                    </div>

                    <div className="shrink-0 flex flex-col items-end gap-0.5 text-end">
                      <div className="flex items-baseline justify-end gap-1">
                        <span className="ltr-iso text-h2 font-bold tabular-nums leading-none text-fg-primary">
                          85
                        </span>
                        <span className="ltr-iso text-caption tabular-nums text-fg-muted">/ 100</span>
                      </div>
                      <p className="text-caption text-fg-muted mt-0.5">
                        {tLanding('heroCardScoreCaption')}
                      </p>
                    </div>
                  </div>

                  {/* Field Rows: Website, Google reviews, Branches, Phone, Quality */}
                  <div className="space-y-1.5 py-3 border-y border-line text-body-sm">
                    <div
                      id="hero-field-website"
                      className={`flex items-center justify-between px-2.5 py-1.5 rounded-md transition-colors duration-150 motion-reduce:transition-none ${
                        highlightedField === 'website'
                          ? 'bg-brand-soft'
                          : 'bg-transparent'
                      }`}
                    >
                      <span className="text-fg-secondary">{tLanding('heroFieldWebsiteLabel')}</span>
                      <span className="font-medium text-fg-primary">{tLanding('heroFieldWebsiteVal')}</span>
                    </div>

                    <div
                      id="hero-field-reviews"
                      className={`flex items-center justify-between px-2.5 py-1.5 rounded-md transition-colors duration-150 motion-reduce:transition-none ${
                        highlightedField === 'reviews'
                          ? 'bg-brand-soft'
                          : 'bg-transparent'
                      }`}
                    >
                      <span className="text-fg-secondary">{tLanding('heroFieldReviewsLabel')}</span>
                      <span className="ltr-iso font-medium tabular-nums text-fg-primary">
                        {tLanding('heroFieldReviewsVal')}
                      </span>
                    </div>

                    <div
                      id="hero-field-branches"
                      className={`flex items-center justify-between px-2.5 py-1.5 rounded-md transition-colors duration-150 motion-reduce:transition-none ${
                        highlightedField === 'branches'
                          ? 'bg-brand-soft'
                          : 'bg-transparent'
                      }`}
                    >
                      <span className="text-fg-secondary">{tLanding('heroFieldBranchesLabel')}</span>
                      <span className="ltr-iso font-medium tabular-nums text-fg-primary">
                        {tLanding('heroFieldBranchesVal')}
                      </span>
                    </div>

                    <div
                      id="hero-field-phone"
                      className="flex items-center justify-between px-2.5 py-1.5 rounded-md bg-transparent"
                    >
                      <span className="text-fg-secondary">{tLanding('heroFieldPhoneLabel')}</span>
                      <LockedField type="phone" />
                    </div>

                    <div
                      id="hero-field-quality"
                      className={`flex items-center justify-between px-2.5 py-1.5 rounded-md text-caption transition-colors duration-150 motion-reduce:transition-none ${
                        highlightedField === 'quality'
                          ? 'bg-brand-soft'
                          : 'bg-transparent'
                      }`}
                    >
                      <span className="text-fg-muted font-normal">{tLanding('heroCardQuality')}</span>
                      <span className="inline-flex items-center gap-1.5 text-brand font-medium">
                        <span className="h-1.5 w-1.5 rounded-full bg-brand-accent shrink-0" aria-hidden="true" />
                        <span>{tLanding('heroCardTier')}</span>
                      </span>
                    </div>
                  </div>

                  {/* Score Reasons: Why 85? With hover/focus highlighting */}
                  <div className="space-y-1.5">
                    <h3 className="text-label font-semibold text-fg-primary">
                      {tLanding('heroWhyHeading')}
                    </h3>

                    <div className="flex flex-col gap-1" role="group" aria-label={tLanding('heroWhyHeading')}>
                      {/* Reason 1: No website +45 */}
                      <button
                        type="button"
                        id="hero-reason-website"
                        aria-describedby="hero-field-website"
                        onMouseEnter={() => setHighlightedField('website')}
                        onMouseLeave={() => setHighlightedField(null)}
                        onFocus={() => setHighlightedField('website')}
                        onBlur={() => setHighlightedField(null)}
                        className="w-full text-start flex items-center justify-between px-2.5 py-1.5 rounded-md text-body-sm cursor-pointer transition-colors duration-150 motion-reduce:transition-none hover:bg-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                      >
                        <span className="text-fg-secondary">{tLanding('heroReason1Label')}</span>
                        <span className="ltr-iso font-semibold tabular-nums text-fg-brand">+45</span>
                      </button>

                      {/* Reason 2: 120 Google reviews +21 */}
                      <button
                        type="button"
                        id="hero-reason-reviews"
                        aria-describedby="hero-field-reviews"
                        onMouseEnter={() => setHighlightedField('reviews')}
                        onMouseLeave={() => setHighlightedField(null)}
                        onFocus={() => setHighlightedField('reviews')}
                        onBlur={() => setHighlightedField(null)}
                        className="w-full text-start flex items-center justify-between px-2.5 py-1.5 rounded-md text-body-sm cursor-pointer transition-colors duration-150 motion-reduce:transition-none hover:bg-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                      >
                        <span className="text-fg-secondary">{tLanding('heroReason2Label')}</span>
                        <span className="ltr-iso font-semibold tabular-nums text-fg-brand">+21</span>
                      </button>

                      {/* Reason 3: 3 branches +14 */}
                      <button
                        type="button"
                        id="hero-reason-branches"
                        aria-describedby="hero-field-branches"
                        onMouseEnter={() => setHighlightedField('branches')}
                        onMouseLeave={() => setHighlightedField(null)}
                        onFocus={() => setHighlightedField('branches')}
                        onBlur={() => setHighlightedField(null)}
                        className="w-full text-start flex items-center justify-between px-2.5 py-1.5 rounded-md text-body-sm cursor-pointer transition-colors duration-150 motion-reduce:transition-none hover:bg-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                      >
                        <span className="text-fg-secondary">{tLanding('heroReason3Label')}</span>
                        <span className="ltr-iso font-semibold tabular-nums text-fg-brand">+14</span>
                      </button>

                      {/* Reason 4: Verified recent data +5 */}
                      <button
                        type="button"
                        id="hero-reason-quality"
                        aria-describedby="hero-field-quality"
                        onMouseEnter={() => setHighlightedField('quality')}
                        onMouseLeave={() => setHighlightedField(null)}
                        onFocus={() => setHighlightedField('quality')}
                        onBlur={() => setHighlightedField(null)}
                        className="w-full text-start flex items-center justify-between px-2.5 py-1.5 rounded-md text-body-sm cursor-pointer transition-colors duration-150 motion-reduce:transition-none hover:bg-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                      >
                        <span className="text-fg-secondary">{tLanding('heroReason4Label')}</span>
                        <span className="ltr-iso font-semibold tabular-nums text-fg-brand">+5</span>
                      </button>
                    </div>
                  </div>

                  {/* Footer: Price & CTA Button */}
                  <div className="pt-3 border-t border-line flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 text-fg-primary">
                      <Coins className="h-4 w-4 text-fg-brand shrink-0" aria-hidden="true" />
                      <span className="font-semibold text-body tabular-nums">
                        {tLanding('heroCardPrice')}
                      </span>
                    </div>

                    <Link href="/register">
                      <Button variant="secondary" size="sm">
                        {tLanding('heroCardCta')}
                      </Button>
                    </Link>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* 2.5 Live Platform Stats Strip (strictly verified data, hides if 0) */}
        {stats && (stats.businessesCount > 0 || stats.citiesCount > 0 || stats.categoriesCount > 0) && (
          <section
            className="border-b border-line bg-surface py-10"
            aria-label={tLanding('statsStripAria')}
          >
            <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
              <div className="flex flex-wrap items-center justify-between gap-4 pb-6 mb-6 border-b border-line">
                <div className="inline-flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full bg-brand shrink-0" aria-hidden="true" />
                  <span className="text-caption font-semibold text-fg-brand">
                    {tLanding('statsLiveBadge')}
                  </span>
                </div>
                {stats.lastRefreshDate && (
                  <div className="text-caption text-fg-muted flex items-center gap-1.5">
                    <span>{tLanding('statsLastRefresh')}</span>
                    <span className="ltr-iso tabular-nums font-medium text-fg-secondary">
                      {fmtDate(stats.lastRefreshDate, locale)}
                    </span>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 md:grid-cols-3 gap-6 text-center">
                {stats.businessesCount > 0 && (
                  <div className="flex flex-col items-center justify-center p-4 rounded-xl bg-subtle border border-line">
                    <span className="ltr-iso text-display font-bold tabular-nums text-fg-primary">
                      {fmtNumber(stats.businessesCount, locale)}
                    </span>
                    <span className="mt-1 text-body-sm text-fg-secondary">
                      {tLanding('statsBusinesses')}
                    </span>
                  </div>
                )}

                {stats.citiesCount > 0 && (
                  <div className="flex flex-col items-center justify-center p-4 rounded-xl bg-subtle border border-line">
                    <span className="ltr-iso text-display font-bold tabular-nums text-fg-primary">
                      {fmtNumber(stats.citiesCount, locale)}
                    </span>
                    <span className="mt-1 text-body-sm text-fg-secondary">
                      {tLanding('statsCities')}
                    </span>
                  </div>
                )}

                {stats.categoriesCount > 0 && (
                  <div className="flex flex-col items-center justify-center p-4 rounded-xl bg-subtle border border-line col-span-2 md:col-span-1">
                    <span className="ltr-iso text-display font-bold tabular-nums text-fg-primary">
                      {fmtNumber(stats.categoriesCount, locale)}
                    </span>
                    <span className="mt-1 text-body-sm text-fg-secondary">
                      {tLanding('statsCategories')}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </section>
        )}

        {/* 3. Problem Strip */}
        <section className="bg-subtle border-b border-line py-16 sm:py-20">
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

        {/* 4. How It Works (3 Clear Stages) */}
        <section id="how-it-works" className="bg-surface border-b border-line py-16 sm:py-24">
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
              {/* 3-Step Sequence List */}
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
                          className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-caption font-bold tabular-nums ${
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

              {/* Dynamic Product Visual Fragment for Selected Step */}
              <div className="lg:col-span-7 rounded-xl border border-line bg-subtle p-6 shadow-sm min-h-80 flex flex-col justify-center">
                {activeStep === 0 && (
                  <div className="space-y-4">
                    <span className="text-caption font-bold text-brand block">
                      {tLanding('howStep1FrameLabel')}
                    </span>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="p-4 rounded-xl border border-line bg-surface text-body-sm space-y-2">
                        <div className="text-caption text-fg-muted">{tLanding('howStep1SourceA')}</div>
                        <div className="font-bold text-fg-primary">{tLanding('howStep1NameA')}</div>
                        <div className="text-fg-secondary tabular-nums ltr-iso">+20 100 987 6543</div>
                        <div className="text-caption text-fg-muted">{tLanding('howStep1LocA')}</div>
                      </div>
                      <div className="p-4 rounded-xl border border-line bg-surface text-body-sm space-y-2">
                        <div className="text-caption text-fg-muted">{tLanding('howStep1SourceB')}</div>
                        <div className="font-bold text-fg-primary">{tLanding('howStep1NameB')}</div>
                        <div className="text-fg-secondary tabular-nums ltr-iso">+20 100 987 6543</div>
                        <div className="text-caption text-fg-muted">{tLanding('howStep1LocB')}</div>
                      </div>
                    </div>
                    <div className="p-3.5 rounded-lg bg-brand-soft border border-line-brand text-caption text-brand font-semibold flex items-center gap-2">
                      <Check className="h-4 w-4 shrink-0 rtl:-scale-x-100" />
                      <span>{tLanding('howStep1MergedNote')}</span>
                    </div>
                  </div>
                )}

                {activeStep === 1 && (
                  <div className="space-y-4">
                    <span className="text-caption font-bold text-brand block">
                      {tLanding('howStep2FrameLabel')}
                    </span>
                    <ScorePair
                      opportunityScore={85}
                      temperature="HOT"
                      qualityScore={95}
                      qualityStatus="FRESH"
                    />
                    <p className="text-caption text-fg-secondary">
                      {tLanding('howStep2FrameNote')}
                    </p>
                  </div>
                )}

                {activeStep === 2 && (
                  <div className="space-y-4">
                    <span className="text-caption font-bold text-brand block">
                      {tLanding('howStep3FrameLabel')}
                    </span>
                    <div className="p-5 rounded-xl border border-line bg-surface space-y-4">
                      <div className="flex items-center justify-between text-body-sm">
                        <span className="text-fg-secondary">{tLanding('howStep3ClaimStatusLabel')}</span>
                        <span className="font-bold text-brand">{tLanding('howStep3ClaimStatusVal')}</span>
                      </div>
                      <div className="flex items-center justify-between text-body-sm border-t border-line pt-3">
                        <span className="text-fg-secondary">{tLanding('howStep3StageLabel')}</span>
                        <StageBadge stage="MEETING" />
                      </div>
                      <div className="flex items-center justify-between text-body-sm border-t border-line pt-3">
                        <span className="text-fg-secondary">{tLanding('howStep3NextActionLabel')}</span>
                        <span className="font-semibold text-fg-primary">{tLanding('howStep3NextActionVal')}</span>
                      </div>
                    </div>
                    <div className="text-caption text-fg-secondary">
                      {tLanding('howStep3Footnote')}
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
                <div className="space-y-2.5 text-body-sm">
                  <div className="flex justify-between gap-2">
                    <span className="text-fg-muted">{tLanding('matchingCity')}</span>
                    <span className="font-semibold text-fg-primary text-end">{tLanding('matchingCityVal')}</span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="text-fg-muted">{tLanding('matchingServices')}</span>
                    <span className="font-semibold text-fg-primary text-end">{tLanding('matchingServicesVal')}</span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="text-fg-muted">{tLanding('matchingMinBudget')}</span>
                    <span className="font-semibold text-fg-primary tabular-nums ltr-iso">{tLanding('matchingMinBudgetVal')}</span>
                  </div>
                </div>
                <div className="pt-2 border-t border-line text-caption text-brand font-semibold">
                  {tLanding('matchingProfileFootnote')}
                </div>
              </div>

              {/* 3 Lead Results matching this profile */}
              <div className="lg:col-span-8 space-y-4">
                {/* Lead 1: Pass */}
                <div className="p-4 rounded-xl border border-line bg-surface flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-bold text-fg-primary">{tLanding('matchingLead1Name')}</span>
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-caption bg-brand-soft text-brand font-semibold">
                        {tLanding('matchingGatePassed')}
                      </span>
                    </div>
                    <p className="text-caption text-fg-secondary mt-1">
                      {tLanding('matchingLead1Meta')}
                    </p>
                  </div>
                  <div className="text-end shrink-0">
                    <span className="text-caption text-fg-muted block">{tLanding('matchingScoreLabel')}</span>
                    <span className="font-bold text-h3 text-brand tabular-nums ltr-iso">94%</span>
                  </div>
                </div>

                {/* Lead 2: Pass */}
                <div className="p-4 rounded-xl border border-line bg-surface flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-bold text-fg-primary">{tLanding('matchingLead2Name')}</span>
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-caption bg-brand-soft text-brand font-semibold">
                        {tLanding('matchingGatePassed')}
                      </span>
                    </div>
                    <p className="text-caption text-fg-secondary mt-1">
                      {tLanding('matchingLead2Meta')}
                    </p>
                  </div>
                  <div className="text-end shrink-0">
                    <span className="text-caption text-fg-muted block">{tLanding('matchingScoreLabel')}</span>
                    <span className="font-bold text-h3 text-brand tabular-nums ltr-iso">86%</span>
                  </div>
                </div>

                {/* Lead 3: Fail Gate */}
                <div className="p-4 rounded-xl border border-line bg-subtle flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-bold text-fg-secondary">{tLanding('matchingLead3Name')}</span>
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-caption bg-danger-bg text-danger-text border border-danger-border font-semibold">
                        {tLanding('matchingGateFailed')}
                      </span>
                    </div>
                    <p className="text-caption text-fg-muted mt-1">
                      {tLanding('matchingLead3Meta')}
                    </p>
                  </div>
                  <div className="text-end shrink-0">
                    <span className="text-caption text-fg-muted block">{tLanding('matchingScoreLabel')}</span>
                    <span className="font-bold text-body text-fg-muted">{'-'}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* 7. Ownership & Points */}
        <section className="bg-subtle border-b border-line py-16 sm:py-24">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="text-center max-w-3xl mx-auto mb-12">
              <h2 className="text-h1 font-bold text-fg-primary">
                {tLanding('ownershipTitle')}
              </h2>
              <p className="mt-3 text-body-lg text-fg-secondary">
                {tLanding('ownershipSubtitle')}
              </p>

              {/* Segmented control */}
              <div className="mt-8 inline-flex p-1.5 rounded-full border border-line-strong bg-surface shadow-xs">
                <button
                  type="button"
                  onClick={() => setOwnershipMode('SHARED')}
                  className={`px-5 py-2 rounded-full text-body-sm font-semibold transition-all ${
                    ownershipMode === 'SHARED'
                      ? 'bg-brand text-fg-on-brand shadow-xs'
                      : 'text-fg-secondary hover:text-fg-primary hover:bg-subtle'
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
                      : 'text-fg-secondary hover:text-fg-primary hover:bg-subtle'
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

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-body-sm">
                <div className="p-4 rounded-xl border border-line bg-subtle">
                  <span className="text-caption text-fg-muted block mb-1">{tLanding('ownershipCost')}</span>
                  <span className="font-bold text-h2 text-brand tabular-nums">
                    {ownershipMode === 'EXCLUSIVE'
                      ? tLanding('ownershipCostExclusive')
                      : tLanding('ownershipCostShared')}
                  </span>
                </div>
                <div className="p-4 rounded-xl border border-line bg-subtle">
                  <span className="text-caption text-fg-muted block mb-1">{tLanding('ownershipSeats')}</span>
                  <span className="font-bold text-h2 text-fg-primary tabular-nums">
                    {ownershipMode === 'EXCLUSIVE'
                      ? tLanding('ownershipSeatsExclusive')
                      : tLanding('ownershipSeatsShared')}
                  </span>
                </div>
              </div>

              <div className="text-caption text-fg-secondary text-center pt-2">
                {tLanding('ownershipBalanceNotice')}
              </div>
            </div>
          </div>
        </section>

        {/* 8. Pricing Section */}
        <section id="pricing" className="bg-surface border-b border-line py-16 sm:py-24">
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
                const localized = localizePlanCatalog(plan, tPlans);
                return (
                  <PackageCard
                    key={plan.slug}
                    id={plan.slug}
                    slug={plan.slug}
                    name={localized.name}
                    points={plan.monthlyCredits}
                    priceEGP={plan.priceEgp}
                    features={localized.features}
                    isRecommended={isRecommended}
                    recommendedReason={isRecommended ? tPricing('recommendedReason') : undefined}
                    reassuranceText={
                      plan.priceEgp === 0
                        ? tPricing('freePlanNotice')
                        : tPricing('paidPlanNotice')
                    }
                  />
                );
              })}
            </div>
          </div>
        </section>

        {/* 9. Commitments Section */}
        <section className="bg-subtle border-b border-line py-16 sm:py-24">
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
        <section id="faq" className="bg-surface border-b border-line py-16 sm:py-24">
          <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-16">
              <h2 className="text-h1 font-bold text-fg-primary">
                {tLanding('faqTitle')}
              </h2>
              <p className="mt-3 text-body-lg text-fg-secondary">
                {tLanding('faqSubtitle')}
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
                    <ChevronDown className="h-4 w-4 shrink-0 text-fg-muted transition-transform duration-200 group-open:rotate-180" />
                  </summary>
                  <div className="mt-3 pt-3 text-body-sm text-fg-secondary leading-relaxed border-t border-line">
                    {item.a}
                  </div>
                </details>
              ))}
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
                  <ArrowRight className="h-4 w-4 shrink-0 rtl:-scale-x-100" />
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
