import React from 'react';
import { Check, AlertCircle, HelpCircle, RefreshCw } from 'lucide-react';
import { formatRelativeTime } from '@/lib/format';

export type QualityState =
  | 'FRESH'
  | 'AGING'
  | 'STALE'
  | 'UNVERIFIED'
  | 'VERIFIED'
  | 'REVERIFYING';

export interface QualityIndicatorProps {
  status: QualityState;
  timestamp?: Date | string | null;
  className?: string;
  size?: 'sm' | 'md';
}

const QUALITY_CONFIG: Record<
  QualityState,
  {
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    iconColor: string;
    textColor: string;
    isDot?: boolean;
    isWarning?: boolean;
  }
> = {
  FRESH: {
    label: 'حديث',
    icon: () => null,
    isDot: true,
    iconColor: 'bg-brand-accent',
    textColor: 'text-fg-secondary',
  },
  AGING: {
    label: 'قديم نسبياً',
    icon: () => null,
    isDot: true,
    iconColor: 'bg-sand-400',
    textColor: 'text-fg-secondary',
  },
  STALE: {
    label: 'قديم',
    icon: AlertCircle,
    iconColor: 'text-warning-icon',
    textColor: 'text-warning-text',
    isWarning: true,
  },
  UNVERIFIED: {
    label: 'غير موثّق',
    icon: HelpCircle,
    iconColor: 'text-warning-icon',
    textColor: 'text-warning-text',
    isWarning: true,
  },
  VERIFIED: {
    label: 'موثّق',
    icon: Check,
    iconColor: 'text-fg-brand',
    textColor: 'text-fg-secondary',
  },
  REVERIFYING: {
    label: 'قيد إعادة التحقق',
    icon: RefreshCw,
    iconColor: 'text-sand-400',
    textColor: 'text-fg-secondary',
  },
};

export const QualityIndicator: React.FC<QualityIndicatorProps> = ({
  status,
  timestamp,
  className = '',
  size = 'md',
}) => {
  const config = QUALITY_CONFIG[status] || QUALITY_CONFIG.UNVERIFIED;
  const isSmall = size === 'sm';
  const Icon = config.icon;

  const formattedRelativeTime = React.useMemo(() => {
    if (!timestamp) return null;
    return formatRelativeTime(timestamp);
  }, [timestamp]);

  return (
    <div
      className={`inline-flex items-center gap-1.5 ${
        isSmall ? 'text-caption' : 'text-body-sm'
      } ${config.textColor} ${className}`}
      role="status"
      aria-label={`حالة البيانات: ${config.label}${
        formattedRelativeTime ? ` (${formattedRelativeTime})` : ''
      }`}
    >
      {/* Icon or dot per Spec 6.2 */}
      {config.isDot ? (
        <span
          className={`h-2 w-2 rounded-full shrink-0 ${config.iconColor}`}
          aria-hidden="true"
        />
      ) : (
        <Icon
          className={`h-4 w-4 shrink-0 ${config.iconColor} ${
            status === 'REVERIFYING' ? 'motion-safe:animate-spin' : ''
          }`}
          aria-hidden="true"
        />
      )}

      {/* State Label */}
      <span className="font-medium">{config.label}</span>

      {/* Relative time as a separate caption span */}
      {formattedRelativeTime && (
        <span className="text-caption text-fg-muted">
          ({formattedRelativeTime})
        </span>
      )}
    </div>
  );
};
