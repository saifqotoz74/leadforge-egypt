'use client';

import React from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { OpportunityBadge, LeadTemperature } from './OpportunityBadge';
import { PipelineStage, StageBadge } from './StageBadge';
import { formatRelativeTime } from '@/lib/format';
import { ArrowRight } from 'lucide-react';

export interface PipelineLeadItem {
  id: string;
  businessName: string;
  location?: string;
  category?: string;
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

const NEXT_STAGE_MAP: Partial<Record<PipelineStage, PipelineStage>> = {
  NEW: 'CONTACTED',
  CLAIMED: 'CONTACTED',
  CONTACTED: 'MEETING',
  REPLIED: 'MEETING',
  INTERESTED: 'PROPOSAL_SENT',
  MEETING: 'PROPOSAL_SENT',
  PROPOSAL_SENT: 'NEGOTIATION',
  NEGOTIATION: 'WON',
};

export const PipelineCard: React.FC<PipelineCardProps> = ({
  lead,
  stages,
  onStageChange,
  onClick,
  className = '',
}) => {
  const tCommon = useTranslations('common');
  const tStage = useTranslations('enums.PipelineStatus');
  const tPipeline = useTranslations('pipeline');
  const locale = useLocale();

  const relativeTime = React.useMemo(() => {
    if (!lead.lastActivityDate) return null;
    return formatRelativeTime(lead.lastActivityDate, locale);
  }, [lead.lastActivityDate, locale]);

  const nextStage = NEXT_STAGE_MAP[lead.stage];
  const nextActionKey = `nextAction_${lead.stage}`;
  const nextActionLabel = tPipeline.has(nextActionKey)
    ? tPipeline(nextActionKey)
    : tCommon('details');

  return (
    <div
      onClick={() => onClick && onClick(lead.id)}
      className={`rounded-lg border border-line bg-surface p-3 shadow-xs hover:border-line-strong hover:shadow-sm transition-all cursor-pointer flex flex-col gap-2.5 ${className}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <h4
            title={lead.businessName}
            className="text-body font-semibold text-fg-primary truncate max-w-44" /* design-allow: truncate */
          >
            <bdi dir="auto">{lead.businessName}</bdi>
          </h4>
          {(lead.location || lead.category) && (
            <p
              title={[lead.location, lead.category].filter(Boolean).join(' - ')}
              className="text-caption text-fg-secondary truncate mt-0.5" /* design-allow: truncate */
            >
              {[lead.location, lead.category].filter(Boolean).join(' - ')}
            </p>
          )}
        </div>
        <OpportunityBadge
          temperature={lead.temperature}
          score={lead.score}
          size="sm"
        />
      </div>

      <div className="flex items-center justify-between gap-2 text-caption text-fg-muted pt-1">
        <StageBadge stage={lead.stage} size="sm" />
        {relativeTime ? (
          <span className="tabular-nums">{tCommon('activityPrefix', { time: relativeTime })}</span>
        ) : (
          <span>{tCommon('noActivity')}</span>
        )}
      </div>

      <div className="flex items-center justify-between gap-2 pt-2 border-t border-line">
        {/* Contextual Next Action based on Stage (Block 3.4) */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            if (nextStage && onStageChange) {
              onStageChange(lead.id, nextStage);
            } else if (onClick) {
              onClick(lead.id);
            }
          }}
          className="inline-flex items-center gap-1 text-caption font-semibold text-fg-brand hover:underline focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand rounded"
        >
          <span>{nextActionLabel}</span>
          <ArrowRight className="h-3 w-3 shrink-0 rtl:-scale-x-100" />
        </button>

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
            aria-label={tCommon('moveToStageAria')}
          >
            {stages.map((st) => (
              <option key={st} value={st}>
                {tStage(st)}
              </option>
            ))}
          </select>
        )}
      </div>
    </div>
  );
};
