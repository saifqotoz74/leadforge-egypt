'use client';

import React, { useState, useMemo } from 'react';
import { ScorePair } from '@/components/domain/ScorePair';
import { ScoreBreakdown } from '@/components/domain/ScoreBreakdown';
import {
  calculateDemoScore,
  DEMO_PRESETS,
  DemoLabInputs,
} from './demoRules';
import { fmtNumber } from '@/lib/format';
import { Building2, Utensils, GraduationCap, Check, Minus, Plus } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';

export function ScoreLab() {
  const tLanding = useTranslations('landing');
  const locale = useLocale();

  const [inputs, setInputs] = useState<DemoLabInputs>(DEMO_PRESETS.dental);

  const result = useMemo(
    () => calculateDemoScore(inputs, (key) => tLanding(key)),
    [inputs, tLanding]
  );

  const rulesList = useMemo(() => {
    return result.breakdown.map((item, idx) => ({
      id: `rule-${idx}`,
      label: item.name,
      points: item.score,
      maxWeight: item.maxScore,
    }));
  }, [result]);

  function handlePreset(key: 'dental' | 'restaurant' | 'training') {
    setInputs(DEMO_PRESETS[key]);
  }

  function adjustReviews(delta: number) {
    setInputs((prev) => ({
      ...prev,
      reviewsCount: Math.max(0, prev.reviewsCount + delta),
      preset: undefined,
    }));
  }

  function adjustBranches(delta: number) {
    setInputs((prev) => ({
      ...prev,
      branchesCount: Math.max(1, prev.branchesCount + delta),
      preset: undefined,
    }));
  }

  return (
    <section
      id="score-lab"
      data-surface="inverse"
      className="bg-inverse text-fg-primary py-16 sm:py-24 border-y border-line"
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Header — no duplicate eyebrow pill */}
        <div className="text-center max-w-3xl mx-auto mb-12">
          <h2 className="text-h1 font-bold text-fg-primary">
            {tLanding('scoreLabTitle')}
          </h2>
          <p className="mt-3 text-body-lg text-fg-secondary">
            {tLanding('scoreLabSubtitle')}
          </p>

          {/* Presets bar */}
          <div className="mt-6 flex flex-wrap items-center justify-center gap-2.5">
            <span className="text-caption text-fg-muted me-1">
              {tLanding('scoreLabPresets')}
            </span>
            <button
              type="button"
              onClick={() => handlePreset('dental')}
              className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-caption font-medium border transition-colors ${
                inputs.preset === 'dental'
                  ? 'border-brand bg-brand text-fg-on-brand font-semibold shadow-xs'
                  : 'border-line-strong bg-surface text-fg-primary hover:bg-subtle'
              }`}
            >
              <Building2 className="h-3.5 w-3.5" />
              <span>{tLanding('scoreLabPresetDental')}</span>
            </button>
            <button
              type="button"
              onClick={() => handlePreset('restaurant')}
              className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-caption font-medium border transition-colors ${
                inputs.preset === 'restaurant'
                  ? 'border-brand bg-brand text-fg-on-brand font-semibold shadow-xs'
                  : 'border-line-strong bg-surface text-fg-primary hover:bg-subtle'
              }`}
            >
              <Utensils className="h-3.5 w-3.5" />
              <span>{tLanding('scoreLabPresetRestaurant')}</span>
            </button>
            <button
              type="button"
              onClick={() => handlePreset('training')}
              className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-caption font-medium border transition-colors ${
                inputs.preset === 'training'
                  ? 'border-brand bg-brand text-fg-on-brand font-semibold shadow-xs'
                  : 'border-line-strong bg-surface text-fg-primary hover:bg-subtle'
              }`}
            >
              <GraduationCap className="h-3.5 w-3.5" />
              <span>{tLanding('scoreLabPresetTraining')}</span>
            </button>
          </div>
        </div>

        {/* Interactive Lab Grid */}
        <div className="grid gap-8 lg:grid-cols-12 items-start">
          {/* Controls Column */}
          <div className="lg:col-span-5 rounded-xl border border-line bg-surface p-6 space-y-6">
            <h3 className="text-h3 font-semibold text-fg-primary border-b border-line pb-3">
              {tLanding('scoreLabControlsTitle')}
            </h3>

            {/* Switch: Has Website */}
            <div className="flex items-center justify-between gap-4">
              <div>
                <label htmlFor="lab-has-website" className="text-body font-medium text-fg-primary block">
                  {tLanding('scoreLabSwitchWebsite')}
                </label>
                <span className="text-caption text-fg-secondary">
                  {inputs.hasWebsite ? tLanding('scoreLabWebsiteYes') : tLanding('scoreLabWebsiteNo')}
                </span>
              </div>
              <button
                id="lab-has-website"
                type="button"
                role="switch"
                aria-checked={inputs.hasWebsite}
                aria-label={tLanding('scoreLabSwitchWebsite')}
                onClick={() =>
                  setInputs((prev) => ({
                    ...prev,
                    hasWebsite: !prev.hasWebsite,
                    preset: undefined,
                  }))
                }
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-brand ${
                  inputs.hasWebsite ? 'bg-brand border-brand' : 'bg-subtle border-line-strong'
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-fg-primary shadow-xs transform transition duration-200 ${
                    inputs.hasWebsite ? 'translate-x-5 rtl:-translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            {/* Stepper: Reviews Count */}
            <div className="flex items-center justify-between gap-4 border-t border-line pt-4">
              <div>
                <label className="text-body font-medium text-fg-primary block">
                  {tLanding('scoreLabReviews')}
                </label>
                <span className="text-caption text-fg-secondary">
                  {tLanding('scoreLabReviewsHint')}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => adjustReviews(-10)}
                  className="h-8 w-8 rounded-lg border border-line-strong bg-subtle flex items-center justify-center hover:bg-surface text-fg-primary transition-colors"
                  aria-label={tLanding('scoreLabDecreaseReviews')}
                >
                  <Minus className="h-3.5 w-3.5" />
                </button>
                <span className="w-12 text-center font-bold text-fg-primary tabular-nums ltr-iso">
                  {fmtNumber(inputs.reviewsCount, locale)}
                </span>
                <button
                  type="button"
                  onClick={() => adjustReviews(10)}
                  className="h-8 w-8 rounded-lg border border-line-strong bg-subtle flex items-center justify-center hover:bg-surface text-fg-primary transition-colors"
                  aria-label={tLanding('scoreLabIncreaseReviews')}
                >
                  <Plus className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            {/* Stepper: Branches Count */}
            <div className="flex items-center justify-between gap-4 border-t border-line pt-4">
              <div>
                <label className="text-body font-medium text-fg-primary block">
                  {tLanding('scoreLabBranches')}
                </label>
                <span className="text-caption text-fg-secondary">
                  {tLanding('scoreLabBranchesHint')}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => adjustBranches(-1)}
                  className="h-8 w-8 rounded-lg border border-line-strong bg-subtle flex items-center justify-center hover:bg-surface text-fg-primary transition-colors"
                  aria-label={tLanding('scoreLabDecreaseBranches')}
                >
                  <Minus className="h-3.5 w-3.5" />
                </button>
                <span className="w-12 text-center font-bold text-fg-primary tabular-nums ltr-iso">
                  {fmtNumber(inputs.branchesCount, locale)}
                </span>
                <button
                  type="button"
                  onClick={() => adjustBranches(1)}
                  className="h-8 w-8 rounded-lg border border-line-strong bg-subtle flex items-center justify-center hover:bg-surface text-fg-primary transition-colors"
                  aria-label={tLanding('scoreLabIncreaseBranches')}
                >
                  <Plus className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            {/* Slider: Days Since Verification */}
            <div className="border-t border-line pt-4 space-y-2">
              <div className="flex items-center justify-between">
                <label htmlFor="lab-days-slider" className="text-body font-medium text-fg-primary">
                  {tLanding('scoreLabVerification')}
                </label>
                <span className="font-bold text-brand tabular-nums ltr-iso">
                  {fmtNumber(inputs.daysSinceVerification, locale)} {tLanding('scoreLabDays')}
                </span>
              </div>
              <input
                id="lab-days-slider"
                type="range"
                min="1"
                max="120"
                value={inputs.daysSinceVerification}
                aria-label={tLanding('scoreLabVerification')}
                onChange={(e) =>
                  setInputs((prev) => ({
                    ...prev,
                    daysSinceVerification: Number(e.target.value),
                    preset: undefined,
                  }))
                }
                className="w-full accent-brand cursor-pointer"
              />
              <div className="flex justify-between text-caption text-fg-secondary tabular-nums">
                <span>{tLanding('scoreLabRangeFresh')}</span>
                <span>{tLanding('scoreLabRangeAging')}</span>
                <span>{tLanding('scoreLabRangeStale')}</span>
              </div>
            </div>
          </div>

          {/* Results Column */}
          <div className="lg:col-span-7 space-y-6" aria-live="polite">
            <div className="rounded-xl border border-line bg-surface p-6 shadow-md space-y-6">
              <ScorePair
                opportunityScore={result.opportunityScore}
                temperature={result.opportunityTier}
                qualityScore={result.qualityScore}
                qualityStatus={result.freshnessStatus}
              />

              <ScoreBreakdown
                title={tLanding('scoreLabBreakdownTitle')}
                rules={rulesList}
                totalScore={result.opportunityScore}
              />
            </div>

            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 text-caption text-fg-secondary px-2">
              <div className="flex items-center gap-1.5 text-brand">
                <Check className="h-4 w-4 rtl:-scale-x-100" />
                <span>{tLanding('scoreLabDeterministicNote')}</span>
              </div>
              <span>{tLanding('scoreLabIllustrativeNote')}</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
