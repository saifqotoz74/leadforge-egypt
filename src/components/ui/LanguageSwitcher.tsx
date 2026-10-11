'use client';

import React from 'react';
import { useLocale } from 'next-intl';
import { useRouter } from 'next/navigation';

export interface LanguageSwitcherProps {
  className?: string;
  size?: 'sm' | 'md';
}

export function LanguageSwitcher({ className = '', size = 'sm' }: LanguageSwitcherProps) {
  const currentLocale = useLocale();
  const router = useRouter();

  const handleSwitch = (newLocale: 'ar' | 'en') => {
    if (newLocale === currentLocale) return;
    // Set 1-year persistent cookie with SameSite=Lax per Spec 3.8
    document.cookie = `lf_locale=${newLocale}; path=/; max-age=31536000; SameSite=Lax`;
    router.refresh();
  };

  const isCompact = size === 'sm';

  return (
    <div
      role="group"
      data-component="language-switcher"
      aria-label="Language Switcher / اختيار اللغة"
      className={`inline-flex items-center rounded-md bg-subtle p-0.5 border border-line ${className}`}
    >
      <button
        type="button"
        onClick={() => handleSwitch('ar')}
        aria-pressed={currentLocale === 'ar'}
        className={`rounded font-sans transition-colors ${
          isCompact ? 'px-2 py-0.5 text-caption' : 'px-3 py-1 text-body-sm'
        } ${
          currentLocale === 'ar'
            ? 'bg-surface text-fg-primary font-medium shadow-xs'
            : 'text-fg-muted hover:text-fg-secondary'
        }`}
      >
        <bdi dir="auto">العربية</bdi>
      </button>

      <button
        type="button"
        onClick={() => handleSwitch('en')}
        aria-pressed={currentLocale === 'en'}
        className={`rounded font-sans transition-colors ${
          isCompact ? 'px-2 py-0.5 text-caption' : 'px-3 py-1 text-body-sm'
        } ${
          currentLocale === 'en'
            ? 'bg-surface text-fg-primary font-medium shadow-xs'
            : 'text-fg-muted hover:text-fg-secondary'
        }`}
      >
        <bdi dir="auto">English</bdi>
      </button>
    </div>
  );
}
