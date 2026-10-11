'use client';

import React from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { fmtNumber } from '@/lib/format';

export interface ScoreRuleItem {
  id?: string;
  label: string;
  points: number;
  maxWeight?: number;
}

export interface ScoreBreakdownProps {
  title?: string;
  rules: ScoreRuleItem[];
  totalScore: number;
  footnote?: string;
  className?: string;
}

export const ScoreBreakdown: React.FC<ScoreBreakdownProps> = ({
  title,
  rules,
  totalScore,
  footnote,
  className = '',
}) => {
  const tCommon = useTranslations('common');
  const locale = useLocale();

  const resolvedTitle = title ?? tCommon('whyScoreTitle');
  const resolvedFootnote = footnote ?? tCommon('scoreFootnote');

  // Max possible weight for proportional meter display (default 40)
  const maxWeightFound = Math.max(
    ...rules.map((r) => r.maxWeight || Math.abs(r.points)),
    40
  );

  return (
    <div
      className={`rounded-lg border border-line bg-surface p-6 shadow-xs flex flex-col gap-4 ${className}`}
      role="region"
      aria-label={resolvedTitle}
    >
      {/* Title */}
      <h3 className="text-h3 font-semibold text-fg-primary">{resolvedTitle}</h3>

      {/* Rules list */}
      <div className="flex flex-col divide-y divide-line">
        {rules.map((rule, idx) => {
          const isNegative = rule.points < 0;
          const absPoints = Math.abs(rule.points);
          const maxRef = rule.maxWeight || maxWeightFound;
          const percentage = Math.min(100, Math.round((absPoints / maxRef) * 100));

          return (
            <div
              key={rule.id || idx}
              className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
            >
              <div className="flex-1 min-w-0">
                <span className="text-body text-fg-primary block break-words">
                  {rule.label}
                </span>

                {/* Meter track per Spec 7.9: height 6 radius full */}
                <div
                  className="mt-1.5 h-1.5 w-full max-w-xs rounded-full bg-brand-soft overflow-hidden"
                  aria-hidden="true"
                >
                  <div
                    className={`h-full rounded-full transition-all duration-300 ${
                      isNegative ? 'bg-warning-icon' : 'bg-brand-accent'
                    }`}
                    style={{ width: `${percentage}%` /* design-allow: dynamic bar width */ }}
                  />
                </div>
              </div>

              {/* Signed Delta */}
              <div className="shrink-0 text-end">
                <span
                  className={`ltr-iso inline-block font-semibold tabular-nums ${
                    isNegative ? 'text-warning-text' : 'text-fg-brand'
                  }`}
                >
                  {isNegative
                    ? `−${fmtNumber(absPoints, locale)}`
                    : `+${fmtNumber(absPoints, locale)}`}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Footer row: Total */}
      <div className="pt-3 border-t border-line flex items-center justify-between font-semibold">
        <span className="text-body text-fg-primary">{tCommon('totalScore')}</span>
        <span className="ltr-iso text-h4 tabular-nums text-fg-primary">
          {fmtNumber(totalScore, locale)} / 100
        </span>
      </div>

      {/* Footnote */}
      {resolvedFootnote && (
        <p className="text-caption text-fg-secondary mt-1">{resolvedFootnote}</p>
      )}
    </div>
  );
};

