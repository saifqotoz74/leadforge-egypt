'use client';

import React from 'react';
import { Search, SlidersHorizontal, X } from 'lucide-react';
import { useTranslations, useLocale } from 'next-intl';
import { Button } from './Button';
import { fmtNumber } from '@/lib/format';

export interface QuickFilter {
  id: string;
  label: string;
  isActive: boolean;
}

export interface FilterBarProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  searchPlaceholder?: string;
  quickFilters?: QuickFilter[];
  onToggleQuickFilter?: (id: string) => void;
  onOpenAdvancedFilters?: () => void;
  hasActiveFilters?: boolean;
  onClearAllFilters?: () => void;
  totalResults?: number;
  className?: string;
}

export function FilterBar({
  searchQuery,
  onSearchChange,
  searchPlaceholder,
  quickFilters = [],
  onToggleQuickFilter,
  onOpenAdvancedFilters,
  hasActiveFilters = false,
  onClearAllFilters,
  totalResults,
  className = '',
}: FilterBarProps) {
  const tCommon = useTranslations('common');
  const locale = useLocale();
  const resolvedPlaceholder = searchPlaceholder ?? tCommon('searchPlaceholder');

  return (
    <div
      role="search"
      className={`py-3 bg-page flex flex-wrap items-center justify-between gap-3 text-start select-none ${className}`}
    >
      <div className="flex flex-wrap items-center gap-2.5 flex-1 min-w-search">
        {/* Search input (320px max) */}
        <div className="relative w-full max-w-filter flex items-center">
          <div className="absolute start-3 flex items-center justify-center text-fg-secondary pointer-events-none w-4 h-4">
            <Search className="w-4 h-4" />
          </div>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={resolvedPlaceholder}
            className="w-full h-10 ps-9 pe-4 rounded-md bg-surface text-fg-primary text-body-sm border border-line-strong hover:border-fg-muted focus:border-brand focus:ring-2 focus:ring-brand-accent outline-none placeholder:text-fg-muted transition-colors"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => onSearchChange('')}
              className="absolute end-3 text-fg-secondary hover:text-fg-primary"
              aria-label={tCommon('clearSearch')}
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Quick Filter Chips (up to 4) */}
        {quickFilters.map((qf) => (
          <button
            key={qf.id}
            type="button"
            onClick={() => onToggleQuickFilter?.(qf.id)}
            className={`inline-flex items-center gap-1.5 h-8 px-3 rounded-full text-caption font-medium border transition-colors cursor-pointer ${
              qf.isActive
                ? 'bg-brand-soft-strong text-brand border-line-brand font-semibold'
                : 'bg-surface text-fg-secondary border-line hover:border-line-strong hover:text-fg-primary'
            }`}
          >
            <span>{qf.label}</span>
            {qf.isActive && <X className="w-3 h-3" />}
          </button>
        ))}

        {/* Advanced Filters Button */}
        {onOpenAdvancedFilters && (
          <Button
            size="sm"
            variant="secondary"
            startIcon={<SlidersHorizontal className="w-4 h-4" />}
            onClick={onOpenAdvancedFilters}
          >
            {tCommon('advancedFilters')}
          </Button>
        )}

        {/* Clear All Link */}
        {hasActiveFilters && onClearAllFilters && (
          <button
            type="button"
            onClick={onClearAllFilters}
            className="text-body-sm text-brand font-semibold hover:underline ms-1"
          >
            {tCommon('clearAll')}
          </button>
        )}
      </div>

      {/* Result Count */}
      {typeof totalResults === 'number' && (
        <div className="text-body-sm text-fg-secondary">
          <span className="tabular font-medium text-fg-primary">
            {fmtNumber(totalResults, locale)}
          </span>{' '}
          {tCommon('resultUnit')}
        </div>
      )}
    </div>
  );
}

