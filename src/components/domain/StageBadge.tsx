'use client';

import React from 'react';
import { useTranslations } from 'next-intl';
import { Check, X } from 'lucide-react';

export type PipelineStage =
  | 'NEW'
  | 'CLAIMED'
  | 'CONTACTED'
  | 'REPLIED'
  | 'INTERESTED'
  | 'MEETING'
  | 'PROPOSAL_SENT'
  | 'NEGOTIATION'
  | 'WON'
  | 'LOST'
  | 'NOT_INTERESTED'
  | 'INVALID';

export interface StageBadgeProps {
  stage: PipelineStage;
  className?: string;
  size?: 'sm' | 'md';
}

const STAGE_CONFIG: Record<
  PipelineStage,
  {
    fallbackLabel: string;
    variant: 'neutral-outline' | 'brand-soft' | 'brand-strong' | 'subtle';
    icon?: 'check' | 'x';
  }
> = {
  NEW: { fallbackLabel: 'جديدة', variant: 'neutral-outline' },
  CLAIMED: { fallbackLabel: 'تم الشراء', variant: 'neutral-outline' },
  CONTACTED: { fallbackLabel: 'تم التواصل', variant: 'brand-soft' },
  REPLIED: { fallbackLabel: 'تم الرد', variant: 'brand-soft' },
  INTERESTED: { fallbackLabel: 'مهتم', variant: 'brand-soft' },
  MEETING: { fallbackLabel: 'اجتماع', variant: 'brand-soft' },
  PROPOSAL_SENT: { fallbackLabel: 'تم إرسال العرض', variant: 'brand-soft' },
  NEGOTIATION: { fallbackLabel: 'تفاوض', variant: 'brand-soft' },
  WON: { fallbackLabel: 'تمت الصفقة', variant: 'brand-strong', icon: 'check' },
  LOST: { fallbackLabel: 'لم تتم', variant: 'subtle', icon: 'x' },
  NOT_INTERESTED: { fallbackLabel: 'غير مهتم', variant: 'subtle', icon: 'x' },
  INVALID: { fallbackLabel: 'بيانات غير صالحة', variant: 'subtle', icon: 'x' },
};

export const StageBadge: React.FC<StageBadgeProps> = ({
  stage,
  className = '',
  size = 'md',
}) => {
  const tEnums = useTranslations('enums.PipelineStatus');
  const config = STAGE_CONFIG[stage] || STAGE_CONFIG.NEW;
  const isSmall = size === 'sm';

  const label = tEnums ? tEnums(stage) : config.fallbackLabel;

  const variantStyles = {
    'neutral-outline': 'border border-line bg-transparent text-fg-secondary',
    'brand-soft': 'bg-brand-soft text-fg-brand border border-transparent',
    'brand-strong': 'bg-brand-soft-strong text-fg-brand font-semibold border border-transparent',
    'subtle': 'bg-subtle text-fg-secondary border border-transparent',
  }[config.variant];

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full font-medium whitespace-nowrap shrink-0 transition-colors ${variantStyles} ${
        isSmall ? 'px-2 py-0.5 text-caption' : 'px-2.5 py-1 text-label'
      } ${className}`}
      role="status"
      aria-label={label}
    >
      {config.icon === 'check' && (
        <Check className="h-3.5 w-3.5 shrink-0 text-fg-brand" aria-hidden="true" />
      )}
      {config.icon === 'x' && (
        <X className="h-3.5 w-3.5 shrink-0 text-fg-secondary" aria-hidden="true" />
      )}
      <span>{label}</span>
    </span>
  );
};
