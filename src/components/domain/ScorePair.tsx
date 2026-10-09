import React from 'react';
import { HelpCircle } from 'lucide-react';
import { OpportunityBadge, LeadTemperature } from './OpportunityBadge';
import { QualityIndicator, QualityState } from './QualityIndicator';
import { fmtNumber } from '@/lib/format';

export interface ScorePairProps {
  opportunityScore: number;
  temperature: LeadTemperature;
  qualityScore: number;
  qualityStatus: QualityState;
  freshnessTimestamp?: Date | string | null;
  onWhyClick?: () => void;
  className?: string;
}

export const ScorePair: React.FC<ScorePairProps> = ({
  opportunityScore,
  temperature,
  qualityScore,
  qualityStatus,
  freshnessTimestamp,
  onWhyClick,
  className = '',
}) => {
  return (
    <div
      className={`grid grid-cols-1 md:grid-cols-2 gap-4 ${className}`}
      role="region"
      aria-label="تقييم الفرصة وجودة البيانات"
    >
      {/* Block A: فرصة البيع (Sales Opportunity Score) */}
      <div className="rounded-lg border border-line bg-surface p-5 flex flex-col justify-between gap-3 shadow-xs">
        <div className="flex items-center justify-between">
          <span className="text-label text-fg-secondary">فرصة البيع</span>
          <div className="flex items-center gap-2">
            <OpportunityBadge
              temperature={temperature}
              showScore={false}
              size="sm"
            />
            {onWhyClick && (
              <button
                type="button"
                onClick={onWhyClick}
                className="inline-flex items-center gap-1 rounded-sm p-1 text-fg-muted hover:text-fg-brand hover:bg-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand text-caption transition-colors"
                aria-label="عرض تفاصيل احتساب فرصة البيع"
                title="لماذا هذه الدرجة؟"
              >
                <HelpCircle className="h-4 w-4" />
                <span className="hidden sm:inline">لماذا؟</span>
              </button>
            )}
          </div>
        </div>

        <div className="flex items-baseline gap-1 mt-1">
          <span className="ltr-iso font-mono text-[40px] font-bold leading-none tabular-nums text-fg-primary">
            {fmtNumber(opportunityScore)}
          </span>
          <span className="text-body-sm text-fg-muted">/ ١٠٠</span>
        </div>
      </div>

      {/* Block B: جودة البيانات (Data Quality Score) */}
      <div className="rounded-lg border border-line bg-surface p-5 flex flex-col justify-between gap-3 shadow-xs">
        <div className="flex items-center justify-between">
          <span className="text-label text-fg-secondary">جودة البيانات</span>
          <QualityIndicator
            status={qualityStatus}
            timestamp={freshnessTimestamp}
            size="sm"
          />
        </div>

        <div className="flex items-baseline gap-1 mt-1">
          <span className="ltr-iso font-mono text-[40px] font-bold leading-none tabular-nums text-fg-primary">
            {fmtNumber(qualityScore)}
          </span>
          <span className="text-body-sm text-fg-muted">/ ١٠٠</span>
        </div>
      </div>
    </div>
  );
};
