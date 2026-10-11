'use client';

import React from 'react';
import { useTranslations } from 'next-intl';

export interface PageHeaderProps {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  breadcrumbs?: Array<{ label: string; href?: string }>;
  className?: string;
}

export const PageHeader: React.FC<PageHeaderProps> = ({
  title,
  description,
  actions,
  breadcrumbs,
  className = '',
}) => {
  const tCommon = useTranslations('common');

  return (
    <header className={`flex flex-col gap-2 mb-6 ${className}`}>
      {/* Optional Breadcrumbs */}
      {breadcrumbs && breadcrumbs.length > 0 && (
        <nav aria-label={tCommon('breadcrumb')} className="text-caption text-fg-muted mb-1">
          <ol className="inline-flex items-center gap-1.5 list-none p-0 m-0">
            {breadcrumbs.map((crumb, idx) => (
              <li key={idx} className="inline-flex items-center gap-1.5">
                {idx > 0 && <span aria-hidden="true">/</span>}
                {crumb.href ? (
                  <a
                    href={crumb.href}
                    className="hover:text-fg-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand rounded"
                  >
                    <bdi dir="auto">{crumb.label}</bdi>
                  </a>
                ) : (
                  <span className="text-fg-secondary font-medium" aria-current="page">
                    <bdi dir="auto">{crumb.label}</bdi>
                  </span>
                )}
              </li>
            ))}
          </ol>
        </nav>
      )}

      {/* Main Header Title & Actions Row per Spec 7.16 */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex flex-col gap-1 max-w-[60ch]">
          <h1 className="text-h1 font-semibold text-fg-primary tracking-tight">
            <bdi dir="auto">{title}</bdi>
          </h1>
          {description && (
            <p className="text-body text-fg-secondary leading-relaxed">
              {description}
            </p>
          )}
        </div>

        {actions && (
          <div className="flex items-center gap-3 shrink-0">
            {actions}
          </div>
        )}
      </div>
    </header>
  );
};
