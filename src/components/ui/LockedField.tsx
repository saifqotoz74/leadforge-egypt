'use client';

import React from 'react';
import { Lock } from 'lucide-react';
import { useTranslations } from 'next-intl';

export interface LockedFieldProps {
  type?: 'phone' | 'email' | 'address' | 'text';
  className?: string;
}

const WIDTHS = {
  phone: 'w-32',
  email: 'w-44',
  address: 'w-56',
  text: 'w-36',
};

export function LockedField({ type = 'text', className = '' }: LockedFieldProps) {
  const tCommon = useTranslations('common');

  return (
    <div
      role="img"
      aria-label={tCommon('dataLockedUntilPurchase')}
      className={`inline-flex items-center gap-1.5 h-5 px-2 bg-subtle rounded-full border border-line select-none ${WIDTHS[type]} ${className}`}
    >
      <Lock className="w-3.5 h-3.5 text-fg-secondary shrink-0" aria-hidden="true" />
      <div className="flex-1 h-2 bg-line-strong rounded-full" />
    </div>
  );
}

