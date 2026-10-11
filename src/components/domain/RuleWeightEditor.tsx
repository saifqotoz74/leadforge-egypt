'use client';

import React, { useState } from 'react';
import { Minus, Plus } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { Button } from '@/components/ui/Button';
import { CodeChip } from '@/components/ui/CodeChip';
import { fmtNumber } from '@/lib/format';

export interface ScoringRule {
  id: string;
  name: string;
  conditionDescription: string;
  expressionCode: string;
  weight: number;
  originalWeight: number;
}

export interface RuleWeightEditorProps {
  initialRules: ScoringRule[];
  onSave: (updatedRules: ScoringRule[]) => Promise<void>;
  className?: string;
}

export const RuleWeightEditor: React.FC<RuleWeightEditorProps> = ({
  initialRules,
  onSave,
  className = '',
}) => {
  const tCommon = useTranslations('common');
  const locale = useLocale();
  const [rules, setRules] = useState<ScoringRule[]>(initialRules);
  const [isSaving, setIsSaving] = useState(false);

  const unsavedCount = rules.filter(
    (r) => r.weight !== r.originalWeight
  ).length;

  const handleWeightChange = (id: string, delta: number) => {
    setRules((prev) =>
      prev.map((r) => {
        if (r.id !== id) return r;
        const newWeight = Math.max(0, Math.min(100, r.weight + delta));
        return { ...r, weight: newWeight };
      })
    );
  };

  const handleReset = () => {
    setRules(initialRules.map((r) => ({ ...r, weight: r.originalWeight })));
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await onSave(rules);
      // Update originalWeight after successful save
      setRules((prev) => prev.map((r) => ({ ...r, originalWeight: r.weight })));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className={`relative flex flex-col gap-4 ${className}`}>
      {/* Rules Table */}
      <div className="overflow-x-auto rounded-lg border border-line bg-surface shadow-xs">
        <table className="w-full text-start border-collapse">
          <thead>
            <tr className="border-b border-line bg-subtle text-caption font-semibold text-fg-secondary">
              <th className="py-3 px-4 text-start">{tCommon('ruleColName')}</th>
              <th className="py-3 px-4 text-start">{tCommon('ruleColCondition')}</th>
              <th className="py-3 px-4 text-center">{tCommon('ruleColWeight')}</th>
              <th className="py-3 px-4 text-end">{tCommon('ruleColDelta')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rules.map((rule) => {
              const isChanged = rule.weight !== rule.originalWeight;

              return (
                <tr key={rule.id} className="hover:bg-brand-soft transition-colors">
                  {/* Name & Plain description */}
                  <td className="py-3 px-4 align-top">
                    <div className="flex flex-col">
                      <span className="text-body font-semibold text-fg-primary">
                        {rule.name}
                      </span>
                      <span className="text-body-sm text-fg-secondary mt-0.5">
                        {rule.conditionDescription}
                      </span>
                    </div>
                  </td>

                  {/* Monospace expression chip per Spec 7.14 */}
                  <td className="py-3 px-4 align-top whitespace-nowrap">
                    <CodeChip>{rule.expressionCode}</CodeChip>
                  </td>

                  {/* Stepper controls */}
                  <td className="py-3 px-4 align-middle text-center whitespace-nowrap">
                    <div className="inline-flex items-center gap-1.5 border border-line rounded-md bg-surface p-1 shadow-xs">
                      <button
                        type="button"
                        onClick={() => handleWeightChange(rule.id, -5)}
                        disabled={rule.weight <= 0}
                        className="h-7 w-7 rounded flex items-center justify-center text-fg-secondary hover:text-fg-primary hover:bg-subtle disabled:opacity-30 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand"
                        title={tCommon('decreaseWeightTitle')}
                        aria-label={tCommon('decreaseWeightAria')}
                      >
                        <Minus className="h-3.5 w-3.5" />
                      </button>

                      <span className="ltr-iso font-bold text-body tabular-nums min-w-9 text-center text-fg-primary">
                        {fmtNumber(rule.weight, locale)}
                      </span>

                      <button
                        type="button"
                        onClick={() => handleWeightChange(rule.id, 5)}
                        disabled={rule.weight >= 100}
                        className="h-7 w-7 rounded flex items-center justify-center text-fg-secondary hover:text-fg-primary hover:bg-subtle disabled:opacity-30 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand"
                        title={tCommon('increaseWeightTitle')}
                        aria-label={tCommon('increaseWeightAria')}
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>

                  {/* Delta Chip */}
                  <td className="py-3 px-4 align-middle text-end whitespace-nowrap">
                    {isChanged ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-warning-bg border border-warning-border text-caption font-medium text-warning-text">
                        <span>{tCommon('deltaFrom')}</span>
                        <span className="ltr-iso tabular-nums">{fmtNumber(rule.originalWeight, locale)}</span>
                        <span>{tCommon('deltaTo')}</span>
                        <span className="ltr-iso tabular-nums font-bold">{fmtNumber(rule.weight, locale)}</span>
                      </span>
                    ) : (
                      <span className="text-caption text-fg-muted">{'-'}</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Sticky Bottom Bar for unsaved changes per Spec 7.14 */}
      {unsavedCount > 0 && (
        <div className="sticky bottom-4 z-30 rounded-xl border border-line bg-surface p-4 shadow-lg flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-warning-icon shrink-0" />
            <span className="text-body font-semibold text-fg-primary">
              {tCommon('unsavedChangesCount', { count: fmtNumber(unsavedCount, locale) })}
            </span>
          </div>

          <div className="flex items-center gap-3">
            <Button variant="ghost" size="md" onClick={handleReset} disabled={isSaving}>
              {tCommon('revertChanges')}
            </Button>
            <Button
              variant="primary"
              size="md"
              isLoading={isSaving}
              onClick={handleSave}
            >
              {tCommon('saveChanges')}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};
