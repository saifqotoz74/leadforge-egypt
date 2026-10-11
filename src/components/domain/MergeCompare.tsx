'use client';

import React from 'react';
import { AlertCircle, ArrowLeftRight } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/Button';
import { CodeChip } from '@/components/ui/CodeChip';
import { IdChip } from '@/components/ui/IdChip';

export interface LeadCompareRecord {
  id: string;
  businessName: string;
  phone?: string;
  email?: string;
  address?: string;
  city?: string;
  category?: string;
  source?: string;
}

export interface MergeCompareProps {
  recordA: LeadCompareRecord;
  recordB: LeadCompareRecord;
  matchLevel: string;
  ruleMatched: string;
  onMerge: (canonicalRecord: 'A' | 'B') => void;
  onNotDuplicate: () => void;
  onSkip: () => void;
  isMerged?: boolean;
  onUndoMerge?: () => void;
  className?: string;
}

export const MergeCompare: React.FC<MergeCompareProps> = ({
  recordA,
  recordB,
  matchLevel,
  ruleMatched,
  onMerge,
  onNotDuplicate,
  onSkip,
  isMerged = false,
  onUndoMerge,
  className = '',
}) => {
  const tCommon = useTranslations('common');

  const fields: Array<{ key: keyof LeadCompareRecord; label: string; isLtr?: boolean }> = [
    { key: 'businessName', label: tCommon('mergeFieldBusinessName') },
    { key: 'phone', label: tCommon('mergeFieldPhone'), isLtr: true },
    { key: 'email', label: tCommon('mergeFieldEmail'), isLtr: true },
    { key: 'category', label: tCommon('mergeFieldCategory') },
    { key: 'city', label: tCommon('mergeFieldCity') },
    { key: 'address', label: tCommon('mergeFieldAddress') },
    { key: 'source', label: tCommon('mergeFieldSource') },
  ];

  if (isMerged) {
    return (
      <div className={`rounded-xl border border-line bg-surface p-6 flex flex-col items-center gap-3 text-center ${className}`}>
        <p className="text-body font-semibold text-fg-primary">
          {tCommon('mergeSuccessTitle')}
        </p>
        <p className="text-body-sm text-fg-secondary">
          {tCommon('mergeSuccessDesc', {
            source: recordB.source || tCommon('mergeUnknownSource'),
            name: recordA.businessName,
          })}
        </p>
        {onUndoMerge && (
          <button
            type="button"
            onClick={onUndoMerge}
            className="text-body-sm text-fg-brand hover:underline font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand rounded"
          >
            {tCommon('undoMerge')}
          </button>
        )}
      </div>
    );
  }

  return (
    <div className={`flex flex-col gap-5 ${className}`}>
      {/* Header: Match level & rule matched per Spec 7.14 */}
      <div className="rounded-lg border border-line bg-subtle p-4 flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <ArrowLeftRight className="h-5 w-5 text-fg-brand shrink-0" aria-hidden="true" />
          <span className="text-body font-semibold text-fg-primary">
            {tCommon('potentialMatch', { level: matchLevel })}
          </span>
        </div>
        <span className="text-body-sm text-fg-secondary flex items-center gap-2">
          <span>{tCommon('matchedRule')}</span>
          <CodeChip>{ruleMatched}</CodeChip>
        </span>
      </div>

      {/* Two Record Columns with aligned rows */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Record A */}
        <div className="rounded-lg border border-line bg-surface p-4 flex flex-col gap-3 shadow-xs">
          <div className="flex items-center justify-between pb-2 border-b border-line">
            <span className="text-label font-bold text-fg-primary">{tCommon('recordA')}</span>
            <IdChip id={recordA.id} />
          </div>

          <div className="flex flex-col gap-2">
            {fields.map(({ key, label, isLtr }) => {
              const valA = recordA[key] || '-';
              const valB = recordB[key] || '-';
              const isDiff = valA !== valB;

              return (
                <div
                  key={key}
                  className={`p-2.5 rounded-md flex flex-col gap-1 transition-colors ${
                    isDiff
                      ? 'bg-warning-bg border border-warning-border'
                      : 'bg-subtle'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-caption text-fg-secondary">{label}</span>
                    {isDiff && (
                      <span className="flex items-center gap-1 text-caption text-warning-text font-medium">
                        <AlertCircle className="h-3.5 w-3.5" />
                        <span>{tCommon('fieldDiff')}</span>
                      </span>
                    )}
                  </div>
                  <span
                    title={String(valA)}
                    className={`text-body-sm font-medium text-fg-primary truncate ${isLtr ? 'ltr-iso tabular-nums text-end' : ''}`} /* design-allow: truncate */
                  >
                    {valA}
                  </span>
                </div>
              );
            })}
          </div>

          <div className="pt-2">
            <Button
              variant="secondary"
              size="sm"
              className="w-full"
              onClick={() => onMerge('A')}
            >
              {tCommon('chooseRecordA')}
            </Button>
          </div>
        </div>

        {/* Record B */}
        <div className="rounded-lg border border-line bg-surface p-4 flex flex-col gap-3 shadow-xs">
          <div className="flex items-center justify-between pb-2 border-b border-line">
            <span className="text-label font-bold text-fg-primary">{tCommon('recordB')}</span>
            <IdChip id={recordB.id} />
          </div>

          <div className="flex flex-col gap-2">
            {fields.map(({ key, label, isLtr }) => {
              const valA = recordA[key] || '-';
              const valB = recordB[key] || '-';
              const isDiff = valA !== valB;

              return (
                <div
                  key={key}
                  className={`p-2.5 rounded-md flex flex-col gap-1 transition-colors ${
                    isDiff
                      ? 'bg-warning-bg border border-warning-border'
                      : 'bg-subtle'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-caption text-fg-secondary">{label}</span>
                    {isDiff && (
                      <span className="flex items-center gap-1 text-caption text-warning-text font-medium">
                        <AlertCircle className="h-3.5 w-3.5" />
                        <span>{tCommon('fieldDiff')}</span>
                      </span>
                    )}
                  </div>
                  <span
                    title={String(valB)}
                    className={`text-body-sm font-medium text-fg-primary truncate ${isLtr ? 'ltr-iso tabular-nums text-end' : ''}`} /* design-allow: truncate */
                  >
                    {valB}
                  </span>
                </div>
              );
            })}
          </div>

          <div className="pt-2">
            <Button
              variant="secondary"
              size="sm"
              className="w-full"
              onClick={() => onMerge('B')}
            >
              {tCommon('chooseRecordB')}
            </Button>
          </div>
        </div>
      </div>

      {/* Global Actions Bar at the bottom per Spec 7.14 */}
      <div className="flex items-center justify-end gap-3 pt-2 border-t border-line">
        <Button variant="ghost" size="md" onClick={onSkip}>
          {tCommon('skip')}
        </Button>
        <Button variant="secondary" size="md" onClick={onNotDuplicate}>
          {tCommon('notDuplicate')}
        </Button>
        <Button variant="primary" size="md" onClick={() => onMerge('A')}>
          {tCommon('mergeRecords')}
        </Button>
      </div>
    </div>
  );
};
