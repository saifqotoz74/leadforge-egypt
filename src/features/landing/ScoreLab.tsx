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
import { Sliders, Building2, Utensils, GraduationCap, Check, Minus, Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';

export function ScoreLab() {
  const tLanding = useTranslations('landing');

  const [inputs, setInputs] = useState<DemoLabInputs>(DEMO_PRESETS.dental);

  const result = useMemo(() => calculateDemoScore(inputs), [inputs]);

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
    }));
  }

  function adjustBranches(delta: number) {
    setInputs((prev) => ({
      ...prev,
      branchesCount: Math.max(1, prev.branchesCount + delta),
    }));
  }

  return (
    <section id="score-lab" className="bg-inverse text-fg-inverse py-16 sm:py-24 border-y border-line/20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="text-center max-w-3xl mx-auto mb-12">
          <div className="inline-flex items-center gap-2 rounded-full border border-line/30 bg-surface/10 px-3.5 py-1.5 text-caption font-semibold text-brand mb-4">
            <Sliders className="h-4 w-4" />
            <span>{tLanding('scoreLabTitle')}</span>
          </div>
          <h2 className="text-h1 font-bold text-fg-inverse">
            {tLanding('scoreLabTitle')}
          </h2>
          <p className="mt-3 text-body-lg text-fg-muted">
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
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-caption font-medium border transition-colors ${
                inputs.preset === 'dental'
                  ? 'border-brand bg-brand text-fg-on-brand font-semibold shadow-xs'
                  : 'border-line/40 bg-surface/10 text-fg-inverse hover:bg-surface/20'
              }`}
            >
              <Building2 className="h-3.5 w-3.5" />
              <span>{tLanding('scoreLabPresetDental')}</span>
            </button>
            <button
              type="button"
              onClick={() => handlePreset('restaurant')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-caption font-medium border transition-colors ${
                inputs.preset === 'restaurant'
                  ? 'border-brand bg-brand text-fg-on-brand font-semibold shadow-xs'
                  : 'border-line/40 bg-surface/10 text-fg-inverse hover:bg-surface/20'
              }`}
            >
              <Utensils className="h-3.5 w-3.5" />
              <span>{tLanding('scoreLabPresetRestaurant')}</span>
            </button>
            <button
              type="button"
              onClick={() => handlePreset('training')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-caption font-medium border transition-colors ${
                inputs.preset === 'training'
                  ? 'border-brand bg-brand text-fg-on-brand font-semibold shadow-xs'
                  : 'border-line/40 bg-surface/10 text-fg-inverse hover:bg-surface/20'
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
          <div className="lg:col-span-5 rounded-xl border border-line/30 bg-surface/5 p-6 space-y-6">
            <h3 className="text-h3 font-semibold text-fg-inverse border-b border-line/20 pb-3">
              محددات النشاط التجاري
            </h3>

            {/* Switch: Has Website */}
            <div className="flex items-center justify-between gap-4">
              <div>
                <label htmlFor="lab-has-website" className="text-body font-medium text-fg-inverse block">
                  {tLanding('scoreLabSwitchWebsite')}
                </label>
                <span className="text-caption text-fg-muted">
                  {inputs.hasWebsite ? 'يمتلك موقعاً قديماً / بحاجة لتطوير' : 'لا يمتلك موقعاً حالياً (احتياج مرتفع)'}
                </span>
              </div>
              <button
                id="lab-has-website"
                type="button"
                role="switch"
                aria-checked={inputs.hasWebsite}
                onClick={() =>
                  setInputs((prev) => ({
                    ...prev,
                    hasWebsite: !prev.hasWebsite,
                    preset: undefined,
                  }))
                }
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-brand ${
                  inputs.hasWebsite ? 'bg-brand' : 'bg-surface/20'
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-surface shadow-xs transform transition duration-200 ${
                    inputs.hasWebsite ? 'translate-x-5 rtl:-translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            {/* Stepper: Reviews Count */}
            <div className="flex items-center justify-between gap-4 border-t border-line/20 pt-4">
              <div>
                <label className="text-body font-medium text-fg-inverse block">
                  {tLanding('scoreLabReviews')}
                </label>
                <span className="text-caption text-fg-muted">
                  مؤشر الإقبال وثقة المتعاملين
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => adjustReviews(-5)}
                  className="h-8 w-8 rounded-lg border border-line/40 bg-surface/10 flex items-center justify-center hover:bg-surface/20 text-fg-inverse"
                  aria-label="تقليل التقييمات"
                >
                  <Minus className="h-3.5 w-3.5" />
                </button>
                <span className="w-12 text-center font-mono font-bold text-fg-inverse tabular-nums ltr-iso">
                  {fmtNumber(inputs.reviewsCount)}
                </span>
                <button
                  type="button"
                  onClick={() => adjustReviews(5)}
                  className="h-8 w-8 rounded-lg border border-line/40 bg-surface/10 flex items-center justify-center hover:bg-surface/20 text-fg-inverse"
                  aria-label="زيادة التقييمات"
                >
                  <Plus className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            {/* Stepper: Branches Count */}
            <div className="flex items-center justify-between gap-4 border-t border-line/20 pt-4">
              <div>
                <label className="text-body font-medium text-fg-inverse block">
                  {tLanding('scoreLabBranches')}
                </label>
                <span className="text-caption text-fg-muted">
                  مؤشر القدرة المالية وحجم التوسع
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => adjustBranches(-1)}
                  className="h-8 w-8 rounded-lg border border-line/40 bg-surface/10 flex items-center justify-center hover:bg-surface/20 text-fg-inverse"
                  aria-label="تقليل الفروع"
                >
                  <Minus className="h-3.5 w-3.5" />
                </button>
                <span className="w-12 text-center font-mono font-bold text-fg-inverse tabular-nums ltr-iso">
                  {fmtNumber(inputs.branchesCount)}
                </span>
                <button
                  type="button"
                  onClick={() => adjustBranches(1)}
                  className="h-8 w-8 rounded-lg border border-line/40 bg-surface/10 flex items-center justify-center hover:bg-surface/20 text-fg-inverse"
                  aria-label="زيادة الفروع"
                >
                  <Plus className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            {/* Slider: Days Since Verification */}
            <div className="border-t border-line/20 pt-4 space-y-2">
              <div className="flex items-center justify-between">
                <label htmlFor="lab-days-slider" className="text-body font-medium text-fg-inverse">
                  {tLanding('scoreLabVerification')}
                </label>
                <span className="font-mono font-bold text-brand tabular-nums ltr-iso">
                  {fmtNumber(inputs.daysSinceVerification)} {tLanding('scoreLabDays')}
                </span>
              </div>
              <input
                id="lab-days-slider"
                type="range"
                min="1"
                max="120"
                value={inputs.daysSinceVerification}
                onChange={(e) =>
                  setInputs((prev) => ({
                    ...prev,
                    daysSinceVerification: Number(e.target.value),
                    preset: undefined,
                  }))
                }
                className="w-full accent-brand cursor-pointer"
              />
              <div className="flex justify-between text-caption text-fg-muted font-mono">
                <span>حديث (1-7 أيام)</span>
                <span>متوسط (30 يوم)</span>
                <span>قديم (90+ يوم)</span>
              </div>
            </div>
          </div>

          {/* Results Column */}
          <div className="lg:col-span-7 space-y-6" aria-live="polite">
            <div className="rounded-xl border border-line/30 bg-surface/5 p-6 shadow-md space-y-6">
              <ScorePair
                opportunityScore={result.opportunityScore}
                temperature={result.opportunityTier}
                qualityScore={result.qualityScore}
                qualityStatus={result.freshnessStatus}
              />

              <ScoreBreakdown
                title="توزيع أوزان فرصة البيع الحتمية"
                rules={rulesList}
                totalScore={result.opportunityScore}
                footnote={tLanding('scoreLabDeterministicNote')}
              />
            </div>

            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 text-caption text-fg-muted px-2">
              <div className="flex items-center gap-1.5 text-brand">
                <Check className="h-4 w-4 rtl:-scale-x-100" />
                <span>{tLanding('scoreLabDeterministicNote')}</span>
              </div>
              <span className="font-mono">{tLanding('scoreLabIllustrativeNote')}</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
