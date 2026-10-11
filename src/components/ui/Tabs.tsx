'use client';

import React from 'react';
import { useLocale } from 'next-intl';
import { fmtNumber } from '@/lib/format';

export interface TabItem {
  id: string;
  label: React.ReactNode;
  count?: number;
  icon?: React.ReactNode;
}

export interface TabsProps {
  tabs: TabItem[];
  activeTab: string;
  onChange: (id: string) => void;
  variant?: 'underline' | 'segmented';
  className?: string;
}

export function Tabs({
  tabs,
  activeTab,
  onChange,
  variant = 'underline',
  className = '',
}: TabsProps) {
  const locale = useLocale();

  if (variant === 'segmented') {
    return (
      <div
        role="tablist"
        className={`inline-flex items-center p-1 bg-subtle rounded-full border border-line gap-1 select-none ${className}`}
      >
        {tabs.map((tab) => {
          const isActive = tab.id === activeTab;
          return (
            <button
              key={tab.id}
              role="tab"
              type="button"
              aria-selected={isActive}
              onClick={() => onChange(tab.id)}
              className={`h-9 px-4 rounded-full text-body-sm font-medium transition-all flex items-center gap-2 cursor-pointer focus-visible:outline-2 focus-visible:outline-brand-accent ${
                isActive
                  ? 'bg-surface text-fg-primary shadow-xs font-semibold'
                  : 'text-fg-secondary hover:text-fg-primary'
              }`}
            >
              {tab.icon && <span className="w-4 h-4 shrink-0">{tab.icon}</span>}
              <span>{tab.label}</span>
              {typeof tab.count === 'number' && (
                <span
                  className={`text-caption px-1.5 py-0.5 rounded-full tabular-nums ${
                    isActive
                      ? 'bg-brand-soft text-brand font-semibold'
                      : 'bg-line text-fg-muted'
                  }`}
                >
                  {fmtNumber(tab.count, locale)}
                </span>
              )}
            </button>
          );
        })}
      </div>
    );
  }

  // Underline variant
  return (
    <div
      role="tablist"
      className={`flex items-center border-b border-line gap-4 sm:gap-6 overflow-x-auto select-none ${className}`}
    >
      {tabs.map((tab) => {
        const isActive = tab.id === activeTab;
        return (
          <button
            key={tab.id}
            role="tab"
            type="button"
            aria-selected={isActive}
            onClick={() => onChange(tab.id)}
            className={`relative py-3 px-1 text-body-sm font-medium transition-colors flex items-center gap-2 whitespace-nowrap cursor-pointer focus-visible:outline-2 focus-visible:outline-brand-accent ${
              isActive
                ? 'text-brand font-semibold'
                : 'text-fg-secondary hover:text-fg-primary'
            }`}
          >
            {tab.icon && <span className="w-4 h-4 shrink-0">{tab.icon}</span>}
            <span>{tab.label}</span>
            {typeof tab.count === 'number' && (
              <span
                className={`text-caption px-1.5 py-0.5 rounded-full tabular-nums ${
                  isActive
                    ? 'bg-brand-soft text-brand font-semibold'
                    : 'bg-subtle text-fg-muted'
                }`}
              >
                {fmtNumber(tab.count, locale)}
              </span>
            )}
            {/* Active bottom bar */}
            {isActive && (
              <span className="absolute bottom-0 inset-x-0 h-0.5 bg-brand rounded-t-full" />
            )}
          </button>
        );
      })}
    </div>
  );
}
