'use client';

import React from 'react';
import Link from 'next/link';
import { ShieldCheck, Compass, CreditCard, LogIn, UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { LanguageSwitcher } from '@/components/ui/LanguageSwitcher';
import { useTranslations } from 'next-intl';

export function PublicNavbar() {
  const tNav = useTranslations('nav');
  const tCommon = useTranslations('common');

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-surface">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6 lg:px-8">
        {/* Brand Wordmark */}
        <Link href="/" className="flex items-center gap-2.5 group">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand text-fg-on-brand shadow-xs">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <div>
            <span className="font-sans font-bold text-lg text-fg-primary">
              LeadForge <span className="text-brand">Egypt</span>
            </span>
            <p className="text-caption text-fg-muted">{tCommon('tagline')}</p>
          </div>
        </Link>

        {/* Navigation links */}
        <nav className="hidden items-center gap-6 md:flex">
          <Link
            href="/"
            className="text-body-sm font-medium text-fg-secondary hover:text-brand transition-colors"
          >
            {tNav('home')}
          </Link>
          <Link
            href="/pricing"
            className="flex items-center gap-1.5 text-body-sm font-medium text-fg-secondary hover:text-brand transition-colors"
          >
            <CreditCard className="h-4 w-4" />
            {tNav('pricing')}
          </Link>
          <Link
            href="/leads"
            className="flex items-center gap-1.5 text-body-sm font-medium text-fg-secondary hover:text-brand transition-colors"
          >
            <Compass className="h-4 w-4" />
            {tNav('exploreLeads')}
          </Link>
        </nav>

        {/* Action CTAs + Language Switcher */}
        <div className="flex items-center gap-3">
          <LanguageSwitcher size="sm" />
          <Link href="/login">
            <Button variant="secondary" size="sm" className="gap-1.5">
              <LogIn className="h-4 w-4 rtl:-scale-x-100" />
              <span>{tNav('login')}</span>
            </Button>
          </Link>
          <Link href="/register">
            <Button variant="primary" size="sm" className="gap-1.5">
              <UserPlus className="h-4 w-4 rtl:-scale-x-100" />
              <span>{tNav('register')}</span>
            </Button>
          </Link>
        </div>
      </div>
    </header>
  );
}

export function PublicFooter() {
  const tNav = useTranslations('nav');
  const tCommon = useTranslations('common');

  return (
    <footer className="border-t border-line bg-surface py-12 mt-auto">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 flex flex-col md:flex-row items-center justify-between gap-6">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand text-fg-on-brand">
            <ShieldCheck className="h-4 w-4" />
          </div>
          <div>
            <span className="font-sans font-bold text-base text-fg-primary">
              LeadForge <span className="text-brand">Egypt</span>
            </span>
            <p className="text-caption text-fg-muted">{tCommon('tagline')}</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-6 text-body-sm text-fg-secondary">
          <Link href="/pricing" className="hover:text-brand transition-colors">
            {tNav('pricing')}
          </Link>
          <Link href="/leads" className="hover:text-brand transition-colors">
            {tNav('exploreLeads')}
          </Link>
          <Link href="/login" className="hover:text-brand transition-colors">
            {tNav('login')}
          </Link>
          <LanguageSwitcher size="sm" />
        </div>

        <div className="text-caption text-fg-muted text-center md:text-end">
          <p>© {new Date().getFullYear()} LeadForge Egypt. {tCommon('appName')}.</p>
          <p className="mt-0.5 text-fg-muted">{tCommon('deterministicNotice')}</p>
        </div>
      </div>
    </footer>
  );
}
