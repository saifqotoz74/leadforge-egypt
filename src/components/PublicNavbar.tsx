'use client';

import React from 'react';
import Link from 'next/link';
import { ShieldCheck, Compass, CreditCard, LogIn, UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/Button';

export function PublicNavbar() {
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-surface">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3.5 sm:px-6 lg:px-8">
        {/* Brand Wordmark per Spec 7.16 */}
        <Link href="/" className="flex items-center gap-2.5 group">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand text-white shadow-xs">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <div>
            <span className="font-heading font-bold text-lg text-fg-primary">
              LeadForge <span className="text-brand">Egypt</span>
            </span>
            <p className="text-caption text-fg-muted">فرص مبيعات مؤهلة لمطوري المواقع</p>
          </div>
        </Link>

        {/* Navigation links */}
        <nav className="hidden items-center gap-6 md:flex">
          <Link
            href="/"
            className="text-body-sm font-medium text-fg-secondary hover:text-brand transition-colors"
          >
            الرئيسية
          </Link>
          <Link
            href="/pricing"
            className="flex items-center gap-1.5 text-body-sm font-medium text-fg-secondary hover:text-brand transition-colors"
          >
            <CreditCard className="h-4 w-4" />
            الباقات والأسعار
          </Link>
          <Link
            href="/leads"
            className="flex items-center gap-1.5 text-body-sm font-medium text-fg-secondary hover:text-brand transition-colors"
          >
            <Compass className="h-4 w-4" />
            استكشاف الفرص
          </Link>
        </nav>

        {/* Action CTAs */}
        <div className="flex items-center gap-3">
          <Link href="/login">
            <Button variant="secondary" size="sm" className="gap-1.5">
              <LogIn className="h-4 w-4 rtl:-scale-x-100" />
              <span>تسجيل الدخول</span>
            </Button>
          </Link>
          <Link href="/register">
            <Button variant="primary" size="sm" className="gap-1.5">
              <UserPlus className="h-4 w-4" />
              <span>حساب جديد</span>
            </Button>
          </Link>
        </div>
      </div>
    </header>
  );
}

export function PublicFooter() {
  return (
    <footer className="border-t border-line bg-surface py-12 mt-auto">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 flex flex-col md:flex-row items-center justify-between gap-6">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand text-white">
            <ShieldCheck className="h-4 w-4" />
          </div>
          <div>
            <span className="font-heading font-bold text-base text-fg-primary">
              LeadForge <span className="text-brand">Egypt</span>
            </span>
            <p className="text-caption text-fg-muted">
              منظومة الفرص البيعية المؤهلة بقواعد قياسية شفافة 100%
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-6 text-body-sm text-fg-secondary">
          <Link href="/pricing" className="hover:text-brand transition-colors">
            الأسعار والباقات
          </Link>
          <Link href="/leads" className="hover:text-brand transition-colors">
            سوق الفرص
          </Link>
          <Link href="/login" className="hover:text-brand transition-colors">
            دخول الحساب
          </Link>
          <Link href="/design-system" className="hover:text-brand transition-colors">
            دليل التصميم
          </Link>
        </div>

        <div className="text-caption text-fg-muted text-center md:text-end">
          <p>© {new Date().getFullYear()} LeadForge Egypt. جميع الحقوق محفوظة.</p>
          <p className="mt-0.5 text-fg-muted">بيانات دقيقة، تسعير عادل، بدون ذكاء اصطناعي أو تخمين.</p>
        </div>
      </div>
    </footer>
  );
}
