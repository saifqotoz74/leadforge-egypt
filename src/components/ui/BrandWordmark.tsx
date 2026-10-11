'use client';

import React from 'react';
import Link from 'next/link';

export type BrandWordmarkSize = 'sm' | 'md' | 'lg' | 'xl';

export interface BrandWordmarkProps {
  size?: BrandWordmarkSize;
  href?: string;
  className?: string;
  accentClassName?: string;
  subtitle?: React.ReactNode;
}

const sizeClasses: Record<BrandWordmarkSize, string> = {
  sm: 'text-base tracking-tight',
  md: 'text-xl tracking-tight leading-tight',
  lg: 'text-2xl tracking-tight leading-tight',
  xl: 'text-3xl tracking-tight leading-tight',
};

/**
 * LeadForge — Typographic SaaS Wordmark
 * Directional isolation (dir="ltr" / .ltr-iso) preserves exact character order in both RTL & LTR.
 */
export const BrandWordmark: React.FC<BrandWordmarkProps> = ({
  size = 'md',
  href,
  className = '',
  accentClassName = '',
  subtitle,
}) => {
  const content = (
    <span
      dir="ltr"
      className={`ltr-iso inline-flex items-baseline font-sans font-bold select-none ${sizeClasses[size]} ${className}`}
      aria-label="LeadForge"
    >
      <span className="text-fg-primary transition-colors">Lead</span>
      <span className={`text-brand font-bold transition-colors ${accentClassName}`}>Forge</span>
    </span>
  );

  const wrapper = subtitle ? (
    <div className="flex flex-col">
      {content}
      <span className="text-caption text-fg-muted -mt-0.5">{subtitle}</span>
    </div>
  ) : (
    content
  );

  if (href) {
    return (
      <Link
        href={href}
        className="inline-flex items-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand rounded transition-opacity hover:opacity-90"
        aria-label="LeadForge"
      >
        {wrapper}
      </Link>
    );
  }

  return wrapper;
};
