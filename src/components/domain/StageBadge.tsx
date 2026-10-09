import React from 'react';
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
    label: string;
    variant: 'neutral-outline' | 'brand-soft' | 'brand-strong' | 'subtle';
    icon?: 'check' | 'x';
  }
> = {
  NEW: { label: 'جديدة', variant: 'neutral-outline' },
  CLAIMED: { label: 'تم الشراء', variant: 'neutral-outline' },
  CONTACTED: { label: 'تم التواصل', variant: 'brand-soft' },
  REPLIED: { label: 'تم الرد', variant: 'brand-soft' },
  INTERESTED: { label: 'مهتم', variant: 'brand-soft' },
  MEETING: { label: 'اجتماع مجدول', variant: 'brand-soft' },
  PROPOSAL_SENT: { label: 'تم إرسال العرض', variant: 'brand-soft' },
  NEGOTIATION: { label: 'تفاوض', variant: 'brand-soft' },
  WON: { label: 'تم التعاقد', variant: 'brand-strong', icon: 'check' },
  LOST: { label: 'لم تكتمل', variant: 'subtle', icon: 'x' },
  NOT_INTERESTED: { label: 'غير مهتم', variant: 'subtle', icon: 'x' },
  INVALID: { label: 'بيانات غير صحيحة', variant: 'subtle', icon: 'x' },
};

export const StageBadge: React.FC<StageBadgeProps> = ({
  stage,
  className = '',
  size = 'md',
}) => {
  const config = STAGE_CONFIG[stage] || STAGE_CONFIG.NEW;
  const isSmall = size === 'sm';

  const variantStyles = {
    'neutral-outline': 'border border-line bg-transparent text-fg-secondary',
    'brand-soft': 'bg-brand-soft text-fg-brand border border-transparent',
    'brand-strong': 'bg-brand-soft-strong text-fg-brand font-semibold border border-transparent',
    'subtle': 'bg-subtle text-fg-secondary border border-transparent',
  }[config.variant];

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full font-medium transition-colors ${variantStyles} ${
        isSmall ? 'px-2 py-0.5 text-caption' : 'px-2.5 py-1 text-label'
      } ${className}`}
      role="status"
      aria-label={`مرحلة الصفقة: ${config.label}`}
    >
      {config.icon === 'check' && (
        <Check className="h-3.5 w-3.5 shrink-0 text-fg-brand" aria-hidden="true" />
      )}
      {config.icon === 'x' && (
        <X className="h-3.5 w-3.5 shrink-0 text-fg-secondary" aria-hidden="true" />
      )}
      <span>{config.label}</span>
    </span>
  );
};
