import React from 'react';
import { AlertCircle, ArrowLeftRight } from 'lucide-react';
import { Button } from '@/components/ui/Button';

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

const FIELDS: Array<{ key: keyof LeadCompareRecord; label: string; isLtr?: boolean }> = [
  { key: 'businessName', label: 'اسم النشاط' },
  { key: 'phone', label: 'رقم الهاتف', isLtr: true },
  { key: 'email', label: 'البريد الإلكتروني', isLtr: true },
  { key: 'category', label: 'النشاط / التخصص' },
  { key: 'city', label: 'المدينة / الحي' },
  { key: 'address', label: 'العنوان' },
  { key: 'source', label: 'المصدر' },
];

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
  if (isMerged) {
    return (
      <div className={`rounded-xl border border-line bg-surface p-6 flex flex-col items-center gap-3 text-center ${className}`}>
        <p className="text-body font-semibold text-fg-primary">
          تم دمج السجلين بنجاح.
        </p>
        <p className="text-body-sm text-fg-secondary">
          تم توحيد السجل التابع لمصدر {recordB.source || 'غير معروف'} مع السجل الأساسي {recordA.businessName}.
        </p>
        {onUndoMerge && (
          <button
            type="button"
            onClick={onUndoMerge}
            className="text-body-sm text-fg-brand hover:underline font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand rounded"
          >
            إلغاء الدمج
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
            تطابق محتمل: {matchLevel}
          </span>
        </div>
        <span className="text-body-sm text-fg-secondary">
          القاعدة المنطبقة: <code className="font-mono bg-surface px-2 py-0.5 rounded border border-line">{ruleMatched}</code>
        </span>
      </div>

      {/* Two Record Columns with aligned rows */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Record A */}
        <div className="rounded-lg border border-line bg-surface p-4 flex flex-col gap-3 shadow-xs">
          <div className="flex items-center justify-between pb-2 border-b border-line">
            <span className="text-label font-bold text-fg-primary">السجل الأول (أ)</span>
            <span className="text-caption text-fg-muted font-mono">{recordA.id}</span>
          </div>

          <div className="flex flex-col gap-2">
            {FIELDS.map(({ key, label, isLtr }) => {
              const valA = recordA[key] || '—';
              const valB = recordB[key] || '—';
              const isDiff = valA !== valB;

              return (
                <div
                  key={key}
                  className={`p-2.5 rounded-md flex flex-col gap-1 transition-colors ${
                    isDiff
                      ? 'bg-warning-bg/40 border border-warning-border/60'
                      : 'bg-subtle/50'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-caption text-fg-secondary">{label}</span>
                    {isDiff && (
                      <span className="flex items-center gap-1 text-caption text-warning-text font-medium">
                        <AlertCircle className="h-3.5 w-3.5" />
                        <span>اختلاف</span>
                      </span>
                    )}
                  </div>
                  <span
                    className={`text-body-sm font-medium text-fg-primary truncate ${
                      isLtr ? 'ltr-iso font-mono text-end' : ''
                    }`}
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
              اعتماد (أ) كسجل أساسي والدمج
            </Button>
          </div>
        </div>

        {/* Record B */}
        <div className="rounded-lg border border-line bg-surface p-4 flex flex-col gap-3 shadow-xs">
          <div className="flex items-center justify-between pb-2 border-b border-line">
            <span className="text-label font-bold text-fg-primary">السجل الثاني (ب)</span>
            <span className="text-caption text-fg-muted font-mono">{recordB.id}</span>
          </div>

          <div className="flex flex-col gap-2">
            {FIELDS.map(({ key, label, isLtr }) => {
              const valA = recordA[key] || '—';
              const valB = recordB[key] || '—';
              const isDiff = valA !== valB;

              return (
                <div
                  key={key}
                  className={`p-2.5 rounded-md flex flex-col gap-1 transition-colors ${
                    isDiff
                      ? 'bg-warning-bg/40 border border-warning-border/60'
                      : 'bg-subtle/50'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-caption text-fg-secondary">{label}</span>
                    {isDiff && (
                      <span className="flex items-center gap-1 text-caption text-warning-text font-medium">
                        <AlertCircle className="h-3.5 w-3.5" />
                        <span>اختلاف</span>
                      </span>
                    )}
                  </div>
                  <span
                    className={`text-body-sm font-medium text-fg-primary truncate ${
                      isLtr ? 'ltr-iso font-mono text-end' : ''
                    }`}
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
              اعتماد (ب) كسجل أساسي والدمج
            </Button>
          </div>
        </div>
      </div>

      {/* Global Actions Bar at the bottom per Spec 7.14 */}
      <div className="flex items-center justify-end gap-3 pt-2 border-t border-line">
        <Button variant="ghost" size="md" onClick={onSkip}>
          تخطي
        </Button>
        <Button variant="secondary" size="md" onClick={onNotDuplicate}>
          ليسا نفس النشاط
        </Button>
        <Button variant="primary" size="md" onClick={() => onMerge('A')}>
          دمج السجلين
        </Button>
      </div>
    </div>
  );
};
