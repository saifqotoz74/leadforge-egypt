import React from 'react';
import { OpportunityBadge, LeadTemperature } from './OpportunityBadge';
import { PipelineStage } from './StageBadge';
import { formatRelativeTime } from '@/lib/format';

export interface PipelineLeadItem {
  id: string;
  businessName: string;
  temperature: LeadTemperature;
  score: number;
  stage: PipelineStage;
  lastActivityDate?: Date | string | null;
}

export interface PipelineCardProps {
  lead: PipelineLeadItem;
  stages: PipelineStage[];
  onStageChange?: (leadId: string, newStage: PipelineStage) => void;
  onClick?: (leadId: string) => void;
  className?: string;
}

const STAGE_LABELS: Record<PipelineStage, string> = {
  NEW: 'جديدة',
  CLAIMED: 'تم الشراء',
  CONTACTED: 'تم التواصل',
  REPLIED: 'تم الرد',
  INTERESTED: 'مهتم',
  MEETING: 'اجتماع مجدول',
  PROPOSAL_SENT: 'تم إرسال العرض',
  NEGOTIATION: 'تفاوض',
  WON: 'تم التعاقد',
  LOST: 'لم تكتمل',
  NOT_INTERESTED: 'غير مهتم',
  INVALID: 'بيانات غير صحيحة',
};

export const PipelineCard: React.FC<PipelineCardProps> = ({
  lead,
  stages,
  onStageChange,
  onClick,
  className = '',
}) => {
  const relativeTime = React.useMemo(() => {
    if (!lead.lastActivityDate) return null;
    return formatRelativeTime(lead.lastActivityDate);
  }, [lead.lastActivityDate]);

  return (
    <div
      onClick={() => onClick && onClick(lead.id)}
      className={`rounded-lg border border-line bg-surface p-3 shadow-xs hover:border-line-strong hover:shadow-sm transition-all cursor-pointer flex flex-col gap-2.5 ${className}`}
    >
      <div className="flex items-start justify-between gap-2">
        <h4 className="text-body font-semibold text-fg-primary truncate max-w-[180px]">
          {lead.businessName}
        </h4>
        <OpportunityBadge
          temperature={lead.temperature}
          score={lead.score}
          size="sm"
        />
      </div>

      <div className="flex items-center justify-between text-caption text-fg-muted pt-1">
        {relativeTime ? (
          <span>نشاط: {relativeTime}</span>
        ) : (
          <span>لا يوجد نشاط مسجل</span>
        )}

        {/* Accessible Keyboard Stage Changer Menu per Spec 7.13 */}
        {onStageChange && (
          <select
            value={lead.stage}
            onChange={(e) => {
              e.stopPropagation();
              onStageChange(lead.id, e.target.value as PipelineStage);
            }}
            onClick={(e) => e.stopPropagation()}
            className="rounded border border-line bg-surface px-1.5 py-0.5 text-caption text-fg-secondary hover:text-fg-primary focus-visible:ring-1 focus-visible:ring-brand focus-visible:outline-none"
            aria-label="نقل إلى مرحلة أخرى"
          >
            {stages.map((st) => (
              <option key={st} value={st}>
                {STAGE_LABELS[st] || st}
              </option>
            ))}
          </select>
        )}
      </div>
    </div>
  );
};
