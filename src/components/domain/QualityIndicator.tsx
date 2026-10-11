'use client';

import React from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Check, AlertCircle, HelpCircle, RefreshCw, Minus } from 'lucide-react';
import { formatRelativeTime } from '@/lib/format';

export type QualityState =
  | 'FRESH'
  | 'AGING'
  | 'STALE'
  | 'UNVERIFIED'
  | 'VERIFIED'
  | 'REVERIFYING'
  | 'UNKNOWN';

export interface QualityIndicatorProps {
  status?: QualityState | string;
  verificationStatus?: string;
  freshnessStatus?: string;
  timestamp?: Date | string | null;
  className?: string;
  size?: 'sm' | 'md';
}

/**
 * Resolves QualityState following Addendum 3.7 precedence
 */
export function resolveQualityState(props: {
  status?: QualityState | string;
  verificationStatus?: string;
  freshnessStatus?: string;
}): QualityState {
  if (props.status === 'VERY_STALE' || props.freshnessStatus === 'VERY_STALE') return 'STALE';
  if (props.status && ['FRESH', 'AGING', 'STALE', 'UNVERIFIED', 'VERIFIED', 'REVERIFYING', 'UNKNOWN'].includes(props.status)) {
    return props.status as QualityState;
  }

  const vStatus = props.verificationStatus;
  const fStatus = props.freshnessStatus;

  if (vStatus === 'FAILED_VERIFICATION') return 'UNVERIFIED';
  if (fStatus === 'STALE' || fStatus === 'VERY_STALE') return 'STALE';
  if (vStatus === 'UNVERIFIED') return 'UNVERIFIED';
  if (vStatus === 'PARTIALLY_VERIFIED' || vStatus === 'NEEDS_REVERIFICATION') return 'REVERIFYING';
  if (vStatus === 'VERIFIED') return 'VERIFIED';
  if (fStatus === 'FRESH') return 'FRESH';
  if (fStatus === 'RECENT' || fStatus === 'NEEDS_VERIFICATION') return 'AGING';

  return 'UNKNOWN';
}

const QUALITY_CONFIG: Record<
  QualityState,
  {
    icon: React.ComponentType<{ className?: string }>;
    iconColor: string;
    textColor: string;
    isDot?: boolean;
    isDash?: boolean;
    isWarning?: boolean;
  }
> = {
  FRESH: {
    icon: () => null,
    isDot: true,
    iconColor: 'bg-brand-accent',
    textColor: 'text-fg-secondary',
  },
  AGING: {
    icon: () => null,
    isDot: true,
    iconColor: 'bg-warning-icon',
    textColor: 'text-fg-secondary',
  },
  STALE: {
    icon: AlertCircle,
    iconColor: 'text-warning-icon',
    textColor: 'text-warning-text',
    isWarning: true,
  },
  UNVERIFIED: {
    icon: HelpCircle,
    iconColor: 'text-warning-icon',
    textColor: 'text-warning-text',
    isWarning: true,
  },
  VERIFIED: {
    icon: Check,
    iconColor: 'text-fg-brand',
    textColor: 'text-fg-secondary',
  },
  REVERIFYING: {
    icon: RefreshCw,
    iconColor: 'text-fg-secondary',
    textColor: 'text-fg-secondary',
  },
  UNKNOWN: {
    icon: Minus,
    iconColor: 'text-fg-muted',
    textColor: 'text-fg-muted',
    isDash: true,
  },
};

export const QualityIndicator: React.FC<QualityIndicatorProps> = ({
  status,
  verificationStatus,
  freshnessStatus,
  timestamp,
  className = '',
  size = 'md',
}) => {
  const tQuality = useTranslations('quality');
  const locale = useLocale();
  const resolvedState = resolveQualityState({ status, verificationStatus, freshnessStatus });
  const config = QUALITY_CONFIG[resolvedState] || QUALITY_CONFIG.UNKNOWN;
  const isSmall = size === 'sm';
  const Icon = config.icon;

  const label = tQuality(resolvedState);

  const formattedRelativeTime = React.useMemo(() => {
    if (!timestamp) return null;
    return formatRelativeTime(timestamp, locale);
  }, [timestamp, locale]);

  return (
    <div
      className={`inline-flex items-center gap-1.5 ${
        isSmall ? 'text-caption' : 'text-body-sm'
      } ${config.textColor} ${className}`}
      role="status"
      aria-label={label}
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
            resolvedState === 'REVERIFYING' ? 'motion-safe:animate-spin' : ''
          }`}
          aria-hidden="true"
        />
      )}

      {/* State Label */}
      <span className="font-medium">{label}</span>

      {/* Relative time as a separate caption span */}
      {formattedRelativeTime && (
        <span className="text-caption text-fg-muted">
          ({formattedRelativeTime})
        </span>
      )}
    </div>
  );
};
